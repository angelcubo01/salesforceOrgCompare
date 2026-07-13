/**
 * Cliente REST mínimo para Tooling / REST de Salesforce (sesión = sid en cabecera Bearer).
 * Limitador de concurrencia para no saturar la API en búsquedas rápidas.
 */

import {
  normalizeSalesforceRestErrorBodyText,
  salesforceRestErrorMessagesOnly,
  salesforceRestErrorStructuredFromText
} from './salesforceRestErrors.js';

function createWindowLimiter(maxPerWindow, windowMs) {
  const stamps = [];
  async function acquire() {
    const now = Date.now();
    const stillValid = stamps.filter((ts) => now - ts < windowMs);
    stamps.length = 0;
    stamps.push(...stillValid);
    if (stamps.length < maxPerWindow) {
      stamps.push(now);
      return;
    }
    const oldest = Math.min(...stamps);
    const sleep = windowMs - (now - oldest) + 12;
    if (sleep > 0) await new Promise((r) => setTimeout(r, sleep));
    return acquire();
  }
  return { acquire };
}

const restGate = createWindowLimiter(5, 1000);

function escapeSoqlLiteral(value) {
  const s = String(value == null ? '' : value);
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function sanitizeSearchPrefix(prefix) {
  const s = String(prefix == null ? '' : prefix).slice(0, 64);
  return s.replace(/'/g, "\\'");
}

async function restFetchWithSid(instanceUrl, sid, path, init = {}) {
  await restGate.acquire();
  const url = `${String(instanceUrl).replace(/\/$/, '')}${path}`;
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${sid}`);
  headers.set('Accept', 'application/json');
  return fetch(url, { ...init, headers });
}

/**
 * Petición REST genérica (Rest Explorer).
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} method
 * @param {string} path path absoluto o relativo (/services/data/...)
 * @param {{ headers?: Record<string, string>, body?: string }} [options]
 */
export async function restRequestWithSid(instanceUrl, sid, method, path, options = {}) {
  const p = String(path || '').trim();
  const rel = p.startsWith('http') ? new URL(p).pathname + new URL(p).search : p.startsWith('/') ? p : `/${p}`;
  const init = { method: String(method || 'GET').toUpperCase() };
  const hdrs = { ...(options.headers || {}) };
  if (options.body != null && options.body !== '') {
    init.body = String(options.body);
    if (!hdrs['Content-Type'] && !hdrs['content-type']) hdrs['Content-Type'] = 'application/json';
  }
  init.headers = hdrs;
  const res = await restFetchWithSid(instanceUrl, sid, rel, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    text,
    json,
    headers: Object.fromEntries(res.headers.entries())
  };
}

/** Convierte `nextRecordsUrl` de la API en path relativo para `restFetchWithSid`. */
function nextPathFromRecordsUrl(nextRecordsUrl) {
  if (nextRecordsUrl == null || nextRecordsUrl === '') return null;
  const next = String(nextRecordsUrl);
  return next.startsWith('http') ? new URL(next).pathname + new URL(next).search : next;
}

/**
 * @param {string} label p. ej. "REST query"
 * @param {Response} res
 */
async function throwWithSalesforceRestError(label, res) {
  let text = '';
  try {
    text = await res.text();
  } catch {
    text = '';
  }
  const structured = salesforceRestErrorStructuredFromText(text);
  const detail = (structured.message || salesforceRestErrorMessagesOnly(text)).trim();
  const msg = detail || `${label} failed: ${res.status}`;
  const err = new Error(msg);
  err.status = res.status;
  if (structured.errorCode) err.salesforceErrorCode = structured.errorCode;
  throw err;
}

/**
 * Una página de SOQL vía REST (`/query` o continuación `nextRecordsUrl`).
 * @param {string} soqlOrRelativePath consulta SOQL o path que empiece por `/services/data/...`
 * @returns {{ records: any[], totalSize?: number, done: boolean, nextPath: string | null }}
 */
export async function restSoqlQueryPage(instanceUrl, sid, apiVersion, soqlOrRelativePath) {
  const path =
    soqlOrRelativePath && String(soqlOrRelativePath).startsWith('/')
      ? String(soqlOrRelativePath)
      : `/services/data/v${apiVersion}/query?q=${encodeURIComponent(String(soqlOrRelativePath))}`;
  const res = await restFetchWithSid(instanceUrl, sid, path);
  if (!res.ok) {
    await throwWithSalesforceRestError('REST query', res);
  }
  const body = await res.json();
  const done = !!body.done;
  const nextPath = done || !body.nextRecordsUrl ? null : nextPathFromRecordsUrl(body.nextRecordsUrl);
  return {
    records: body.records || [],
    totalSize: typeof body.totalSize === 'number' ? body.totalSize : undefined,
    done,
    nextPath
  };
}

/**
 * Una página de SOQL vía Tooling (`/tooling/query` o continuación).
 */
export async function toolingSoqlQueryPage(instanceUrl, sid, apiVersion, soqlOrRelativePath) {
  const path =
    soqlOrRelativePath && String(soqlOrRelativePath).startsWith('/')
      ? String(soqlOrRelativePath)
      : `/services/data/v${apiVersion}/tooling/query?q=${encodeURIComponent(String(soqlOrRelativePath))}`;
  const res = await restFetchWithSid(instanceUrl, sid, path);
  if (!res.ok) {
    await throwWithSalesforceRestError('Tooling query', res);
  }
  const body = await res.json();
  const done = !!body.done;
  const nextPath = done || !body.nextRecordsUrl ? null : nextPathFromRecordsUrl(body.nextRecordsUrl);
  return {
    records: body.records || [],
    totalSize: typeof body.totalSize === 'number' ? body.totalSize : undefined,
    done,
    nextPath
  };
}

function normalizeSoslSearchRow(rec) {
  if (!rec || typeof rec !== 'object') return {};
  /** @type {Record<string, unknown>} */
  const row = {};
  const attr = rec.attributes;
  if (attr && typeof attr === 'object') {
    row.SObjectType = attr.type != null ? String(attr.type) : '';
    row.RecordUrl = attr.url != null ? String(attr.url) : '';
  }
  for (const [k, v] of Object.entries(rec)) {
    if (k === 'attributes') continue;
    row[k] = v;
  }
  return row;
}

/**
 * Una petición SOSL vía REST (`/search` o continuación).
 */
export async function restSoslSearchPage(instanceUrl, sid, apiVersion, soslOrRelativePath) {
  const path =
    soslOrRelativePath && String(soslOrRelativePath).startsWith('/')
      ? String(soslOrRelativePath)
      : `/services/data/v${apiVersion}/search?q=${encodeURIComponent(String(soslOrRelativePath))}`;
  const res = await restFetchWithSid(instanceUrl, sid, path);
  if (!res.ok) {
    await throwWithSalesforceRestError('REST search (SOSL)', res);
  }
  const body = await res.json();
  const raw = Array.isArray(body.searchRecords) ? body.searchRecords : [];
  const records = raw.map(normalizeSoslSearchRow);
  const nextPath = body.nextRecordsUrl ? nextPathFromRecordsUrl(body.nextRecordsUrl) : null;
  const done = !nextPath;
  return {
    records,
    totalSize: typeof body.totalSize === 'number' ? body.totalSize : records.length,
    done,
    nextPath
  };
}

export async function probeApiVersion(instanceUrl, sid) {
  const versions = await listRestApiVersions(instanceUrl, sid);
  return versions[versions.length - 1];
}

/**
 * @returns {Promise<string[]>} versiones ordenadas ascendente (p. ej. ["59.0", …, "67.0"])
 */
export async function listRestApiVersions(instanceUrl, sid) {
  const res = await restFetchWithSid(instanceUrl, sid, `/services/data`);
  if (!res.ok) {
    const err = new Error(`API /services/data: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const versions = await res.json();
  if (!Array.isArray(versions) || versions.length === 0) throw new Error('No API versions');
  return versions
    .map((v) => String(v?.version || '').trim())
    .filter(Boolean);
}

/**
 * Lista global de sObjects (`/sobjects`) para autocompletado y herramientas.
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function restDescribeGlobal(instanceUrl, sid, apiVersion) {
  const res = await restFetchWithSid(instanceUrl, sid, `/services/data/v${apiVersion}/sobjects`);
  if (!res.ok) {
    const err = new Error(`Describe global failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  return Array.isArray(body.sobjects) ? body.sobjects : [];
}

/**
 * Describe de un sObject (campos, tipos, relaciones).
 * @returns {Promise<Record<string, unknown>>}
 */
export async function restDescribeSobject(instanceUrl, sid, apiVersion, objectApiName) {
  const name = String(objectApiName || '').trim();
  if (!name) {
    const err = new Error('Missing object API name');
    err.status = 400;
    throw err;
  }
  const path = `/services/data/v${apiVersion}/sobjects/${encodeURIComponent(name)}/describe`;
  const res = await restFetchWithSid(instanceUrl, sid, path);
  if (!res.ok) {
    const err = new Error(`Describe ${name} failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Obtiene un registro por Id vía REST sin listar campos en SOQL (devuelve todos los legibles).
 * @returns {Promise<Record<string, unknown>>}
 */
export async function restGetSobject(instanceUrl, sid, apiVersion, sobjectApiName, recordId) {
  const obj = String(sobjectApiName || '').trim();
  const id = String(recordId || '').trim();
  if (!obj || !id) {
    const err = new Error('Missing object or record Id');
    err.status = 400;
    throw err;
  }
  const path = `/services/data/v${apiVersion}/sobjects/${encodeURIComponent(obj)}/${encodeURIComponent(id)}`;
  const res = await restFetchWithSid(instanceUrl, sid, path);
  if (res.status === 404) {
    const err = new Error(`Record not found: ${id}`);
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  }
  if (!res.ok) {
    await throwWithSalesforceRestError(`GET ${obj}`, res);
  }
  const body = await res.json();
  if (!body || typeof body !== 'object') {
    const err = new Error('Empty record response');
    err.code = 'FETCH_ERROR';
    throw err;
  }
  return body;
}

// Simple REST query helper (used for PermissionSet search)
export async function restQuery(instanceUrl, sid, apiVersion, soql) {
  const { records } = await restSoqlQueryPage(instanceUrl, sid, apiVersion, soql);
  return records;
}

/**
 * PATCH sobre un registro REST estándar (objetos actualizables vía `/sobjects/`).
 * @param {string} sobjectApiName p. ej. `AsyncApexJob`
 * @param {string} recordId Id de 15 o 18 caracteres
 * @param {Record<string, unknown>} fields cuerpo JSON (p. ej. `{ Status: 'Aborted' }`)
 */
export async function restPatchSobject(instanceUrl, sid, apiVersion, sobjectApiName, recordId, fields) {
  const path = `/services/data/v${apiVersion}/sobjects/${encodeURIComponent(String(sobjectApiName))}/${encodeURIComponent(String(recordId))}`;
  const res = await restFetchWithSid(instanceUrl, sid, path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields && typeof fields === 'object' ? fields : {})
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    const err = new Error(`PATCH ${sobjectApiName}: ${res.status} ${detail}`);
    err.status = res.status;
    throw err;
  }
  return true;
}

/**
 * DELETE REST estándar (`/sobjects/{type}/{id}`).
 */
export async function restDeleteSobject(instanceUrl, sid, apiVersion, sobjectApiName, recordId) {
  const path = `/services/data/v${apiVersion}/sobjects/${encodeURIComponent(String(sobjectApiName))}/${encodeURIComponent(String(recordId))}`;
  const res = await restFetchWithSid(instanceUrl, sid, path, { method: 'DELETE' });
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    const err = new Error(`DELETE ${sobjectApiName}: ${res.status} ${detail}`);
    err.status = res.status;
    throw err;
  }
  return true;
}

/** Máximo de registros por DELETE en sObject Collections (límite de la plataforma). */
const SOBJECT_COLLECTION_DELETE_LIMIT = 200;

/**
 * Borra hasta 200 registros en una sola petición REST (`/composite/sobjects`).
 * @returns {Array<{ id: string, success: boolean, errors?: unknown[] }>}
 */
async function restDeleteSobjectsCollection(instanceUrl, sid, apiVersion, ids) {
  if (!ids.length) return [];
  const idsParam = ids.map((id) => encodeURIComponent(String(id))).join(',');
  const path = `/services/data/v${apiVersion}/composite/sobjects?ids=${idsParam}&allOrNone=false`;
  const res = await restFetchWithSid(instanceUrl, sid, path, { method: 'DELETE' });
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    const err = new Error(`DELETE composite/sobjects: ${res.status} ${detail}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  return Array.isArray(body) ? body : [];
}

/**
 * PATCH Tooling API (p. ej. `ApexTestQueueItem` con `Status: Aborted` para cancelar tests en cola).
 */
export async function toolingPatchSobject(instanceUrl, sid, apiVersion, sobjectApiName, recordId, fields) {
  const path = `/services/data/v${apiVersion}/tooling/sobjects/${encodeURIComponent(String(sobjectApiName))}/${encodeURIComponent(String(recordId))}`;
  const res = await restFetchWithSid(instanceUrl, sid, path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields && typeof fields === 'object' ? fields : {})
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    const err = new Error(`Tooling PATCH ${sobjectApiName}: ${res.status} ${detail}`);
    err.status = res.status;
    throw err;
  }
  return true;
}

/** Igual que {@link restQuery} pero sigue todas las páginas (`nextRecordsUrl`). */
export async function restQueryAll(instanceUrl, sid, apiVersion, soql) {
  let pathOrSoql = soql;
  const all = [];
  for (let page = 0; page < 500; page++) {
    const { records, done, nextPath } = await restSoqlQueryPage(instanceUrl, sid, apiVersion, pathOrSoql);
    all.push(...records);
    if (done || !nextPath) break;
    pathOrSoql = nextPath;
  }
  return all;
}

export async function toolingQuery(instanceUrl, sid, apiVersion, soql) {
  const { records } = await toolingSoqlQueryPage(instanceUrl, sid, apiVersion, soql);
  return records;
}

/** Igual que {@link toolingQuery} pero pagina con `nextRecordsUrl`. */
export async function toolingQueryAll(instanceUrl, sid, apiVersion, soql) {
  let pathOrSoql = soql;
  const all = [];
  for (let page = 0; page < 500; page++) {
    const { records, done, nextPath } = await toolingSoqlQueryPage(instanceUrl, sid, apiVersion, pathOrSoql);
    all.push(...records);
    if (done || !nextPath) break;
    pathOrSoql = nextPath;
  }
  return all;
}

/** Todas las filas devueltas por SOSL (pagina si la API envía `nextRecordsUrl`). */
export async function restSoslSearchAll(instanceUrl, sid, apiVersion, sosl) {
  let pathOrSosl = sosl;
  const all = [];
  for (let page = 0; page < 500; page++) {
    const { records, done, nextPath } = await restSoslSearchPage(instanceUrl, sid, apiVersion, pathOrSosl);
    all.push(...records);
    if (done || !nextPath) break;
    pathOrSosl = nextPath;
  }
  return all;
}

function chunkArray(arr, size) {
  const list = Array.isArray(arr) ? arr : [];
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function mapNameByApexId(nameById, apexId) {
  const id = String(apexId == null ? '' : apexId).trim();
  if (!id) return '';
  const direct = nameById.get(id);
  if (direct) return direct;
  if (id.length >= 15) {
    const short = id.slice(0, 15);
    const fromShort = nameById.get(short);
    if (fromShort) return fromShort;
  }
  return '';
}

/**
 * Resuelve nombres de clase/trigger para ids devueltos por ApexCodeCoverageAggregate.
 * La relación SOQL `ApexClassOrTrigger.Name` falla o viene vacía en algunas orgs/versions;
 * Tooling `ApexClass` / `ApexTrigger` por Id es fiable.
 */
async function enrichAggregateRowsWithNames(instanceUrl, sid, apiVersion, rows) {
  const ids = [
    ...new Set(
      (rows || [])
        .map((r) => String(r?.ApexClassOrTriggerId || '').trim())
        .filter(Boolean)
    )
  ];
  if (!ids.length) return;
  const nameById = new Map();
  for (const part of chunkArray(ids, 100)) {
    const inList = part.map((x) => `'${escapeSoqlLiteral(x)}'`).join(',');
    const [clsRows, trgRows] = await Promise.all([
      toolingQueryAll(instanceUrl, sid, apiVersion, `SELECT Id, Name FROM ApexClass WHERE Id IN (${inList})`),
      toolingQueryAll(instanceUrl, sid, apiVersion, `SELECT Id, Name FROM ApexTrigger WHERE Id IN (${inList})`)
    ]);
    for (const r of clsRows || []) {
      const rid = String(r?.Id || '').trim();
      if (!rid || r.Name == null) continue;
      const nm = String(r.Name);
      nameById.set(rid, nm);
      if (rid.length >= 15) nameById.set(rid.slice(0, 15), nm);
    }
    for (const r of trgRows || []) {
      const rid = String(r?.Id || '').trim();
      if (!rid || r.Name == null) continue;
      const nm = String(r.Name);
      nameById.set(rid, nm);
      if (rid.length >= 15) nameById.set(rid.slice(0, 15), nm);
    }
  }
  for (const row of rows || []) {
    const id = String(row?.ApexClassOrTriggerId || '').trim();
    const fromMap = mapNameByApexId(nameById, id);
    const fromRel = String(row?.ApexClassOrTrigger?.Name || '').trim();
    const name = fromMap || fromRel || id;
    if (!row.ApexClassOrTrigger || typeof row.ApexClassOrTrigger !== 'object') row.ApexClassOrTrigger = {};
    row.ApexClassOrTrigger.Name = name;
  }
}

/**
 * Cobertura acumulada por clase/trigger (`ApexCodeCoverageAggregate` en Tooling).
 * No ejecuta tests; refleja el último cálculo almacenado en la org.
 */
export async function queryApexCodeCoverageAggregate(instanceUrl, sid, apiVersion) {
  const soql =
    'SELECT ApexClassOrTriggerId, NumLinesCovered, NumLinesUncovered FROM ApexCodeCoverageAggregate';
  const rows = (await toolingQueryAll(instanceUrl, sid, apiVersion, soql)) || [];
  if (!rows.length) return [];
  await enrichAggregateRowsWithNames(instanceUrl, sid, apiVersion, rows);
  return rows;
}

export async function getOrganizationInfo(instanceUrl, sid, apiVersion) {
  const res = await restFetchWithSid(instanceUrl, sid, `/services/data/v${apiVersion}/query?q=${encodeURIComponent('SELECT Id, Name, IsSandbox FROM Organization LIMIT 1')}`);
  if (!res.ok) {
    const err = new Error(`Org query failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  const rows = body.records || [];
  if (!rows.length) throw new Error('Organization not found');
  const org = rows[0];
  return { id: org.Id, name: org.Name, isSandbox: !!org.IsSandbox };
}

const ORG_STATUS_SOQL_FULL =
  'SELECT Id, Name, IsSandbox, OrganizationType, InstanceName, NamespacePrefix, LanguageLocaleKey, TimeZoneSidKey, TrialExpirationDate FROM Organization LIMIT 1';
const ORG_STATUS_SOQL_MIN = 'SELECT Id, Name, IsSandbox, OrganizationType, InstanceName FROM Organization LIMIT 1';

async function queryOrganizationRow(instanceUrl, sid, apiVersion, soql) {
  const res = await restFetchWithSid(
    instanceUrl,
    sid,
    `/services/data/v${apiVersion}/query?q=${encodeURIComponent(soql)}`
  );
  if (!res.ok) {
    const err = new Error(`Org query failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  const rows = body.records || [];
  if (!rows.length) throw new Error('Organization not found');
  return rows[0];
}

/**
 * Metadatos ampliados de Organization para el panel de estado de entornos.
 * @returns {Promise<{
 *   id: string,
 *   name: string,
 *   isSandbox: boolean,
 *   organizationType: string,
 *   instanceName: string,
 *   namespacePrefix: string,
 *   languageLocaleKey: string,
 *   timeZoneSidKey: string,
 *   trialExpirationDate: string | null
 * }>}
 */
export async function fetchOrganizationStatus(instanceUrl, sid, apiVersion) {
  let org;
  try {
    org = await queryOrganizationRow(instanceUrl, sid, apiVersion, ORG_STATUS_SOQL_FULL);
  } catch {
    org = await queryOrganizationRow(instanceUrl, sid, apiVersion, ORG_STATUS_SOQL_MIN);
  }
  return {
    id: String(org.Id || ''),
    name: String(org.Name || ''),
    isSandbox: !!org.IsSandbox,
    organizationType: String(org.OrganizationType || ''),
    instanceName: String(org.InstanceName || ''),
    namespacePrefix: String(org.NamespacePrefix || ''),
    languageLocaleKey: String(org.LanguageLocaleKey || ''),
    timeZoneSidKey: String(org.TimeZoneSidKey || ''),
    trialExpirationDate: org.TrialExpirationDate || null
  };
}

/** Límites de la org (`/limits`). */
export async function fetchOrgLimits(instanceUrl, sid, apiVersion) {
  const res = await restFetchWithSid(instanceUrl, sid, `/services/data/v${apiVersion}/limits`);
  if (!res.ok) {
    const err = new Error(`Limits query failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return await res.json();
}

export async function searchIndex(instanceUrl, sid, apiVersion, type, prefix) {
  const like = sanitizeSearchPrefix(prefix || '');
  switch (type) {
    case 'ApexClass': {
      const q = prefix ? `WHERE Name LIKE '%${like}%'` : '';
      const rows = await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Name, LastModifiedDate FROM ApexClass ${q} ORDER BY Name LIMIT 50`
      );
      return rows.map(r => ({ type, name: r.Name, lastModifiedDate: r.LastModifiedDate || '' }));
    }
    case 'ApexTrigger': {
      const q = prefix ? `WHERE Name LIKE '%${like}%'` : '';
      const rows = await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Name FROM ApexTrigger ${q} ORDER BY Name LIMIT 50`
      );
      return rows.map(r => ({ type, name: r.Name }));
    }
    case 'ApexPage': {
      const q = prefix ? `WHERE Name LIKE '%${like}%'` : '';
      const rows = await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Name FROM ApexPage ${q} ORDER BY Name LIMIT 50`
      );
      return rows.map(r => ({ type, name: r.Name }));
    }
    case 'ApexComponent': {
      const q = prefix ? `WHERE Name LIKE '%${like}%'` : '';
      const rows = await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Name FROM ApexComponent ${q} ORDER BY Name LIMIT 50`
      );
      return rows.map(r => ({ type, name: r.Name }));
    }
    case 'LWC': {
      const q = prefix ? `WHERE DeveloperName LIKE '%${like}%'` : '';
      const rows = await toolingQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Id, DeveloperName, LastModifiedDate FROM LightningComponentBundle ${q} ORDER BY DeveloperName LIMIT 50`
      );
      return rows.map(r => ({
        type,
        id: r.Id,
        developerName: r.DeveloperName,
        lastModifiedDate: r.LastModifiedDate || ''
      }));
    }
    case 'Aura': {
      const q = prefix ? `WHERE DeveloperName LIKE '%${like}%'` : '';
      const rows = await toolingQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Id, DeveloperName, LastModifiedDate FROM AuraDefinitionBundle ${q} ORDER BY DeveloperName LIMIT 50`
      );
      return rows.map(r => ({
        type,
        id: r.Id,
        developerName: r.DeveloperName,
        lastModifiedDate: r.LastModifiedDate || ''
      }));
    }
    case 'PermissionSet': {
      const q = prefix ? `WHERE Name LIKE '%${like}%'` : '';
      const rows = await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Name, NamespacePrefix FROM PermissionSet ${q} ORDER BY Name LIMIT 50`
      );
      return rows.map(r => {
        const ns = (r.NamespacePrefix || '').trim();
        const name = (r.Name || '').trim();
        return { type, name: ns ? `${ns}__${name}` : name };
      });
    }
    case 'Profile': {
      const q = prefix ? `WHERE Name LIKE '%${like}%'` : '';
      const rows = await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Name FROM Profile ${q} ORDER BY Name LIMIT 50`
      );
      return rows.map(r => ({ type, name: r.Name }));
    }
    case 'FlexiPage': {
      const q = prefix ? `WHERE DeveloperName LIKE '%${like}%'` : '';
      const rows = await toolingQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT DeveloperName FROM FlexiPage ${q} ORDER BY DeveloperName LIMIT 50`
      );
      return rows.map(r => ({ type, name: r.DeveloperName }));
    }
    default:
      return [];
  }
}

/**
 * Lista todos los nombres indexables de un tipo (pagina hasta agotar resultados).
 * Para Quick Open y búsqueda local sin depender del límite de 50 con prefijo vacío.
 */
export async function listIndexAll(instanceUrl, sid, apiVersion, type) {
  switch (type) {
    case 'ApexClass': {
      const rows = await restQueryAll(
        instanceUrl,
        sid,
        apiVersion,
        'SELECT Name FROM ApexClass ORDER BY Name'
      );
      return rows.map((r) => ({ type, name: r.Name }));
    }
    case 'ApexTrigger': {
      const rows = await restQueryAll(
        instanceUrl,
        sid,
        apiVersion,
        'SELECT Name FROM ApexTrigger ORDER BY Name'
      );
      return rows.map((r) => ({ type, name: r.Name }));
    }
    case 'ApexPage': {
      const rows = await restQueryAll(
        instanceUrl,
        sid,
        apiVersion,
        'SELECT Name FROM ApexPage ORDER BY Name'
      );
      return rows.map((r) => ({ type, name: r.Name }));
    }
    case 'ApexComponent': {
      const rows = await restQueryAll(
        instanceUrl,
        sid,
        apiVersion,
        'SELECT Name FROM ApexComponent ORDER BY Name'
      );
      return rows.map((r) => ({ type, name: r.Name }));
    }
    case 'LWC': {
      const rows = await toolingQueryAll(
        instanceUrl,
        sid,
        apiVersion,
        'SELECT Id, DeveloperName FROM LightningComponentBundle ORDER BY DeveloperName'
      );
      return rows.map((r) => ({ type, id: r.Id, developerName: r.DeveloperName }));
    }
    case 'Aura': {
      const rows = await toolingQueryAll(
        instanceUrl,
        sid,
        apiVersion,
        'SELECT Id, DeveloperName FROM AuraDefinitionBundle ORDER BY DeveloperName'
      );
      return rows.map((r) => ({ type, id: r.Id, developerName: r.DeveloperName }));
    }
    case 'PermissionSet': {
      const rows = await restQueryAll(
        instanceUrl,
        sid,
        apiVersion,
        'SELECT Name, NamespacePrefix FROM PermissionSet ORDER BY Name'
      );
      return rows.map((r) => {
        const ns = (r.NamespacePrefix || '').trim();
        const name = (r.Name || '').trim();
        return { type, name: ns ? `${ns}__${name}` : name };
      });
    }
    case 'Profile': {
      const rows = await restQueryAll(
        instanceUrl,
        sid,
        apiVersion,
        'SELECT Name FROM Profile ORDER BY Name'
      );
      return rows.map((r) => ({ type, name: r.Name }));
    }
    case 'FlexiPage': {
      const rows = await toolingQueryAll(
        instanceUrl,
        sid,
        apiVersion,
        'SELECT DeveloperName FROM FlexiPage ORDER BY DeveloperName'
      );
      return rows.map((r) => ({ type, name: r.DeveloperName }));
    }
    default:
      return [];
  }
}

async function resolveLwcBundleId(instanceUrl, sid, apiVersion, descriptor) {
  const devName = String(descriptor.bundleDeveloperName || '').trim();
  if (devName) {
    const name = escapeSoqlLiteral(devName);
    const rows = await toolingQuery(
      instanceUrl,
      sid,
      apiVersion,
      `SELECT Id FROM LightningComponentBundle WHERE DeveloperName = '${name}' LIMIT 1`
    );
    const resolved = String(rows[0]?.Id || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 18);
    if (resolved) return resolved;
  }
  return (
    String(descriptor.bundleId || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 18) || ''
  );
}

async function resolveAuraBundleId(instanceUrl, sid, apiVersion, descriptor) {
  const devName = String(descriptor.bundleDeveloperName || '').trim();
  if (devName) {
    const name = escapeSoqlLiteral(devName);
    const rows = await toolingQuery(
      instanceUrl,
      sid,
      apiVersion,
      `SELECT Id FROM AuraDefinitionBundle WHERE DeveloperName = '${name}' LIMIT 1`
    );
    const resolved = String(rows[0]?.Id || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 18);
    if (resolved) return resolved;
  }
  return (
    String(descriptor.bundleId || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 18) || ''
  );
}

function auraFileNameToDefType(fileName, bundleDeveloperName) {
  const base = bundleDeveloperName || 'component';
  const fn = String(fileName || '');
  if (fn === 'controller.js') return 'CONTROLLER';
  if (fn === 'helper.js') return 'HELPER';
  if (fn === 'renderer.js') return 'RENDERER';
  if (fn === 'style.css') return 'STYLE';
  if (fn === 'design.design') return 'DESIGN';
  if (fn === 'tokens.tok') return 'TOKENS';
  if (fn === 'documentation.auradoc') return 'DOCUMENTATION';
  if (fn === 'svg.svg') return 'SVG';
  if (fn === `${base}.cmp`) return 'COMPONENT';
  if (fn === `${base}.app`) return 'APPLICATION';
  return null;
}

/**
 * Lista metadatos de origen sin contenido (lazy load de bundles; comprobación de versión para caché).
 */
export async function fetchSourceListOnly(instanceUrl, sid, apiVersion, type, descriptor) {
  switch (type) {
    case 'ApexClass': {
      const rows = await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT LastModifiedDate FROM ApexClass WHERE Name = '${escapeSoqlLiteral(descriptor.name)}' LIMIT 1`
      );
      const row = rows[0] || {};
      return [{
        fileName: `${descriptor.name}.cls`,
        language: 'plaintext',
        content: '',
        lastModifiedByName: '',
        lastModifiedByUsername: '',
        lastModifiedDate: row.LastModifiedDate || ''
      }];
    }
    case 'ApexTrigger': {
      const rows = await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT LastModifiedDate FROM ApexTrigger WHERE Name = '${escapeSoqlLiteral(descriptor.name)}' LIMIT 1`
      );
      const row = rows[0] || {};
      return [{
        fileName: `${descriptor.name}.trigger`,
        language: 'plaintext',
        content: '',
        lastModifiedByName: '',
        lastModifiedByUsername: '',
        lastModifiedDate: row.LastModifiedDate || ''
      }];
    }
    case 'ApexPage': {
      const rows = await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT LastModifiedDate FROM ApexPage WHERE Name = '${escapeSoqlLiteral(descriptor.name)}' LIMIT 1`
      );
      const row = rows[0] || {};
      return [{
        fileName: `${descriptor.name}.page`,
        language: 'html',
        content: '',
        lastModifiedByName: '',
        lastModifiedByUsername: '',
        lastModifiedDate: row.LastModifiedDate || ''
      }];
    }
    case 'ApexComponent': {
      const rows = await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT LastModifiedDate FROM ApexComponent WHERE Name = '${escapeSoqlLiteral(descriptor.name)}' LIMIT 1`
      );
      const row = rows[0] || {};
      return [{
        fileName: `${descriptor.name}.component`,
        language: 'html',
        content: '',
        lastModifiedByName: '',
        lastModifiedByUsername: '',
        lastModifiedDate: row.LastModifiedDate || ''
      }];
    }
    case 'LWC': {
      const bundleId = await resolveLwcBundleId(instanceUrl, sid, apiVersion, descriptor);
      if (!bundleId) return [];
      const fp = descriptor.fileName ? escapeSoqlLiteral(String(descriptor.fileName)) : '';
      const fileWhere = fp ? ` AND FilePath = '${fp}'` : '';
      const rows = await toolingQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Format, FilePath, LastModifiedDate FROM LightningComponentResource WHERE LightningComponentBundleId = '${bundleId}'${fileWhere}`
      );
      return rows.map((r) => ({
        fileName: r.FilePath || `${descriptor.bundleId}.${(r.Format || '').toLowerCase()}`,
        language: lwcFormatToLanguage(r.Format),
        content: '',
        lastModifiedByName: '',
        lastModifiedByUsername: '',
        lastModifiedDate: r.LastModifiedDate || ''
      }));
    }
    case 'Aura': {
      const bundleId = await resolveAuraBundleId(instanceUrl, sid, apiVersion, descriptor);
      if (!bundleId) return [];
      let defWhere = '';
      if (descriptor.fileName) {
        const dt = auraFileNameToDefType(descriptor.fileName, descriptor.bundleDeveloperName);
        if (dt) defWhere = ` AND DefType = '${dt}'`;
      }
      const rows = await toolingQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT DefType, LastModifiedDate FROM AuraDefinition WHERE AuraDefinitionBundleId = '${bundleId}'${defWhere}`
      );
      return rows.map((r) => ({
        fileName: auraDefTypeToFileName(r.DefType, descriptor.bundleDeveloperName),
        language: auraDefTypeToLanguage(r.DefType),
        content: '',
        lastModifiedByName: '',
        lastModifiedByUsername: '',
        lastModifiedDate: r.LastModifiedDate || ''
      }));
    }
    default:
      return [];
  }
}

export function sourceSignatureFromFiles(files) {
  return (files || [])
    .map((f) => `${String(f.fileName || '')}\t${String(f.lastModifiedDate || '')}`)
    .sort()
    .join('\n');
}

export async function fetchSourceVersionSignature(instanceUrl, sid, apiVersion, type, descriptor) {
  const list = await fetchSourceListOnly(instanceUrl, sid, apiVersion, type, descriptor);
  return sourceSignatureFromFiles(list);
}

export async function fetchSource(instanceUrl, sid, apiVersion, type, descriptor) {
  switch (type) {
    case 'ApexClass': {
      const rows = await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Body, LastModifiedBy.Name, LastModifiedBy.Username, LastModifiedDate FROM ApexClass WHERE Name = '${escapeSoqlLiteral(descriptor.name)}' LIMIT 1`
      );
      const row = rows[0] || {};
      return [{
        fileName: `${descriptor.name}.cls`,
        language: 'plaintext',
        content: row.Body || '',
        lastModifiedByName: row.LastModifiedBy?.Name || '',
        lastModifiedByUsername: row.LastModifiedBy?.Username || '',
        lastModifiedDate: row.LastModifiedDate || ''
      }];
    }
    case 'ApexTrigger': {
      const rows = await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Body, LastModifiedBy.Name, LastModifiedBy.Username, LastModifiedDate FROM ApexTrigger WHERE Name = '${escapeSoqlLiteral(descriptor.name)}' LIMIT 1`
      );
      const row = rows[0] || {};
      return [{
        fileName: `${descriptor.name}.trigger`,
        language: 'plaintext',
        content: row.Body || '',
        lastModifiedByName: row.LastModifiedBy?.Name || '',
        lastModifiedByUsername: row.LastModifiedBy?.Username || '',
        lastModifiedDate: row.LastModifiedDate || ''
      }];
    }
    case 'ApexPage': {
      const rows = await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Markup, LastModifiedBy.Name, LastModifiedBy.Username, LastModifiedDate FROM ApexPage WHERE Name = '${escapeSoqlLiteral(descriptor.name)}' LIMIT 1`
      );
      const row = rows[0] || {};
      return [{
        fileName: `${descriptor.name}.page`,
        language: 'html',
        content: row.Markup || '',
        lastModifiedByName: row.LastModifiedBy?.Name || '',
        lastModifiedByUsername: row.LastModifiedBy?.Username || '',
        lastModifiedDate: row.LastModifiedDate || ''
      }];
    }
    case 'ApexComponent': {
      const rows = await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Markup, LastModifiedBy.Name, LastModifiedBy.Username, LastModifiedDate FROM ApexComponent WHERE Name = '${escapeSoqlLiteral(descriptor.name)}' LIMIT 1`
      );
      const row = rows[0] || {};
      return [{
        fileName: `${descriptor.name}.component`,
        language: 'html',
        content: row.Markup || '',
        lastModifiedByName: row.LastModifiedBy?.Name || '',
        lastModifiedByUsername: row.LastModifiedBy?.Username || '',
        lastModifiedDate: row.LastModifiedDate || ''
      }];
    }
    case 'LWC': {
      const bundleId = await resolveLwcBundleId(instanceUrl, sid, apiVersion, descriptor);
      if (!bundleId) return [];
      const fp = descriptor.fileName ? escapeSoqlLiteral(String(descriptor.fileName)) : '';
      const fileWhere = fp ? ` AND FilePath = '${fp}'` : '';
      const rows = await toolingQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Format, FilePath, Source, LastModifiedBy.Name, LastModifiedBy.Username, LastModifiedDate FROM LightningComponentResource WHERE LightningComponentBundleId = '${bundleId}'${fileWhere}`
      );
      return rows.map((r) => ({
        fileName: r.FilePath || `${descriptor.bundleId}.${(r.Format || '').toLowerCase()}`,
        language: lwcFormatToLanguage(r.Format),
        content: r.Source || '',
        lastModifiedByName: r.LastModifiedBy?.Name || '',
        lastModifiedByUsername: r.LastModifiedBy?.Username || '',
        lastModifiedDate: r.LastModifiedDate || ''
      }));
    }
    case 'Aura': {
      const bundleId = await resolveAuraBundleId(instanceUrl, sid, apiVersion, descriptor);
      if (!bundleId) return [];
      let defWhere = '';
      if (descriptor.fileName) {
        const dt = auraFileNameToDefType(descriptor.fileName, descriptor.bundleDeveloperName);
        if (dt) defWhere = ` AND DefType = '${dt}'`;
      }
      const rows = await toolingQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT DefType, Source, LastModifiedBy.Name, LastModifiedBy.Username, LastModifiedDate FROM AuraDefinition WHERE AuraDefinitionBundleId = '${bundleId}'${defWhere}`
      );
      return rows.map((r) => ({
        fileName: auraDefTypeToFileName(r.DefType, descriptor.bundleDeveloperName),
        language: auraDefTypeToLanguage(r.DefType),
        content: r.Source || '',
        lastModifiedByName: r.LastModifiedBy?.Name || '',
        lastModifiedByUsername: r.LastModifiedBy?.Username || '',
        lastModifiedDate: r.LastModifiedDate || ''
      }));
    }
    default:
      return [];
  }
}

function lwcFormatToLanguage(format) {
  const f = String(format || '').toLowerCase();
  if (f === 'js') return 'javascript';
  if (f === 'html') return 'html';
  if (f === 'css') return 'css';
  if (f === 'svg') return 'xml';
  return 'plaintext';
}

function auraDefTypeToFileName(defType, baseName = 'component') {
  const t = String(defType || '').toUpperCase();
  switch (t) {
    case 'COMPONENT': return `${baseName}.cmp`;
    case 'APPLICATION': return `${baseName}.app`;
    case 'CONTROLLER': return `controller.js`;
    case 'HELPER': return `helper.js`;
    case 'RENDERER': return `renderer.js`;
    case 'STYLE': return `style.css`;
    case 'DESIGN': return `design.design`;
    case 'TOKENS': return `tokens.tok`;
    case 'DOCUMENTATION': return `documentation.auradoc`;
    case 'SVG': return `svg.svg`;
    default: return `${baseName}.${t.toLowerCase()}`;
  }
}

function auraDefTypeToLanguage(defType) {
  const t = String(defType || '').toUpperCase();
  if (t === 'CONTROLLER' || t === 'HELPER' || t === 'RENDERER') return 'javascript';
  if (t === 'STYLE') return 'css';
  if (t === 'SVG') return 'xml';
  // COMPONENT, APPLICATION, DESIGN, TOKENS, DOCUMENTATION → XML-like
  return 'xml';
}

/**
 * Nombres de métodos que parecen pruebas Apex a partir de SymbolTable (Tooling).
 */
export function parseApexTestMethodNames(symbolTable) {
  if (symbolTable == null) return [];
  let st = symbolTable;
  if (typeof st === 'string') {
    try {
      st = JSON.parse(st);
    } catch {
      return [];
    }
  }
  const methods = st.methods || [];
  const out = [];
  for (const m of methods) {
    const name = m && m.name;
    if (!name || typeof name !== 'string') continue;
    const annotations = (m.annotations || []).map((a) =>
      String(a && a.name != null ? a.name : '').toLowerCase()
    );
    const modifiers = (m.modifiers || []).map((x) => String(x).toLowerCase());
    if (annotations.includes('istest') || modifiers.includes('testmethod') || /^test/i.test(name)) {
      out.push(name);
    }
  }
  return [...new Set(out)].sort((a, b) => a.localeCompare(b));
}

/** Respuesta vacía cuando ApexTestQueueServlet no está disponible o devuelve HTML/no-JSON. */
const APEX_TEST_QUEUE_SERVLET_EMPTY = Object.freeze({ success: false, apexTestJobs: [] });

/** Respuestas JSON de algunos servlets UI (p. ej. ApexTestQueueServlet) con anti-hijacking. */
export function stripLeadingWhileOneJson(text) {
  return String(text || '').replace(/^\s*while\s*\(\s*1\s*\)\s*;\s*/i, '').trim();
}

/**
 * Igual que la Developer Console: GET `ApexTestQueueServlet?action=STATUS`
 * (lista `apexTestJobs`: cola de pruebas con parentid = AsyncApexJob).
 * Fallos HTTP, de red o JSON no válido devuelven lista vacía (sin lanzar).
 */
export async function fetchApexTestQueueServletStatus(instanceUrl, sid) {
  try {
    await restGate.acquire();
    const base = String(instanceUrl).replace(/\/$/, '');
    const url = `${base}/_ui/common/apex/test/ApexTestQueueServlet?action=STATUS&_=${Date.now()}`;
    const headers = new Headers();
    headers.set('Authorization', `Bearer ${sid}`);
    headers.set('Accept', 'application/json');
    headers.set('X-Requested-With', 'XMLHttpRequest');
    headers.set('sforce-call-options', 'client=devconsole');
    const res = await fetch(url, { method: 'GET', headers });
    const text = await res.text();
    if (!res.ok) return APEX_TEST_QUEUE_SERVLET_EMPTY;
    let json;
    try {
      json = JSON.parse(stripLeadingWhileOneJson(text) || '{}');
    } catch {
      return APEX_TEST_QUEUE_SERVLET_EMPTY;
    }
    return json && typeof json === 'object' ? json : APEX_TEST_QUEUE_SERVLET_EMPTY;
  } catch {
    return APEX_TEST_QUEUE_SERVLET_EMPTY;
  }
}

const APEX_LOG_BODY_PREFIX_BYTES = 196_608;

/** Normaliza texto devuelto por ApexLog/Body (plain, JSON o anti-hijacking). */
export function normalizeApexLogBodyText(raw) {
  let text = stripLeadingWhileOneJson(String(raw || ''));
  if (!text) return '';
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(trimmed);
      if (typeof json === 'string') return json;
      if (json && typeof json.Body === 'string') return json.Body;
      if (Array.isArray(json) && json[0] && typeof json[0].Body === 'string') return json[0].Body;
    } catch {
      /* texto plano con llaves */
    }
  }
  return text;
}

async function readFetchResponseTextPrefix(res, maxBytes) {
  const limit = Math.max(8_192, Number(maxBytes) || APEX_LOG_BODY_PREFIX_BYTES);
  if (!res.body || typeof res.body.getReader !== 'function') {
    const full = await res.text();
    return full.length > limit ? full.slice(0, limit) : full;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  let total = 0;
  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done || !value?.length) break;
      const chunk = decoder.decode(value, { stream: true });
      out += chunk;
      total += value.length;
      if (total >= limit) break;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }
  return out;
}

async function fetchApexLogBodyResponse(instanceUrl, sid, apiVersion, logId) {
  const id = String(logId || '').replace(/[^a-zA-Z0-9]/g, '');
  if (!id) throw new Error('ApexLog Id inválido');
  const base = String(instanceUrl).replace(/\/$/, '');
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${sid}`);
  headers.set('Accept', 'text/plain,application/json,*/*');
  const urls = [
    `${base}/services/data/v${apiVersion}/tooling/sobjects/ApexLog/${id}/Body`,
    `${base}/services/data/v${apiVersion}/sobjects/ApexLog/${id}/Body`
  ];
  let lastStatus = 0;
  for (const url of urls) {
    await restGate.acquire();
    const res = await fetch(url, { headers });
    if (res.ok) return res;
    lastStatus = res.status;
  }
  const err = new Error(`ApexLog Body: HTTP ${lastStatus || 404}`);
  err.status = lastStatus || 404;
  throw err;
}

/**
 * Cuerpo de un ApexLog (texto plano) vía Tooling/REST API.
 * @param {{ maxBytes?: number }} [opts] Si `maxBytes` está definido, solo lee ese prefijo (suficiente para Type/Name/Method).
 */
export async function fetchApexLogBody(instanceUrl, sid, apiVersion, logId, opts = {}) {
  const res = await fetchApexLogBodyResponse(instanceUrl, sid, apiVersion, logId);
  const maxBytes = opts.maxBytes;
  const raw =
    maxBytes != null && Number.isFinite(Number(maxBytes))
      ? await readFetchResponseTextPrefix(res, Number(maxBytes))
      : await res.text();
  return normalizeApexLogBodyText(raw);
}

/**
 * Consulta `SELECT Id FROM ApexLog` (REST o Tooling) y borra los registros en lotes
 * vía sObject Collections (hasta 200 DELETE por petición HTTP). Si un lote falla,
 * se reintenta con DELETE individuales.
 * @returns {{ total: number, deleted: number, failed: number }}
 */
export async function deleteAllApexLogs(instanceUrl, sid, apiVersion) {
  let rows = [];
  try {
    rows = (await restQueryAll(instanceUrl, sid, apiVersion, 'SELECT Id FROM ApexLog')) || [];
  } catch {
    rows = (await toolingQueryAll(instanceUrl, sid, apiVersion, 'SELECT Id FROM ApexLog')) || [];
  }
  const ids = rows.map((r) => String(r?.Id || '').trim()).filter(Boolean);
  let deleted = 0;
  let failed = 0;
  async function deleteChunkWithFallback(chunk) {
    try {
      const results = await restDeleteSobjectsCollection(instanceUrl, sid, apiVersion, chunk);
      for (const row of results) {
        if (row?.success) deleted += 1;
        else failed += 1;
      }
      if (results.length < chunk.length) {
        failed += chunk.length - results.length;
      }
    } catch {
      for (const id of chunk) {
        try {
          await restDeleteSobject(instanceUrl, sid, apiVersion, 'ApexLog', id);
          deleted += 1;
        } catch {
          failed += 1;
        }
      }
    }
  }
  for (let i = 0; i < ids.length; i += SOBJECT_COLLECTION_DELETE_LIMIT) {
    const chunk = ids.slice(i, i + SOBJECT_COLLECTION_DELETE_LIMIT);
    await deleteChunkWithFallback(chunk);
  }
  return { total: ids.length, deleted, failed };
}

/**
 * Literal SOQL DateTime en UTC (sin comillas; Salesforce rechaza comillas en StartTime).
 */
function toSoqlUtcDateTimeLiteral(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const y = d.getUTCFullYear();
  const mo = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const h = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());
  const ms = pad(d.getUTCMilliseconds(), 3);
  return `${y}-${mo}-${day}T${h}:${mi}:${s}.${ms}+0000`;
}

/**
 * Logs de depuración en una ventana temporal (p. ej. ejecución de tests).
 * Incluye campos para elegir el log asociado al job (usuario, duración, operación).
 * @param {{ logUserId?: string, limit?: number, operationEquals?: string, locationLikeContains?: string }} [opts]
 *   `operationEquals` p. ej. `ApexTestHandler` para acotar a logs de ejecución de tests.
 *   `locationLikeContains` texto literal a buscar en `Location` (se escapan `%`, `_` y `\\` para LIKE).
 */
/** Alineado con `EXTENSION_FIELD_BOUNDS.debugLogsListMaxRows` en extensionSettings.js */
const APEX_LOGS_IN_WINDOW_MAX_LIMIT = 50_000;

/**
 * @param {{ limit?: number }} [opts]
 * @returns {number}
 */
export function resolveApexLogsInWindowLimit(opts = {}) {
  const raw = Number(opts.limit);
  if (!Number.isFinite(raw) || raw <= 0) return 80;
  return Math.min(APEX_LOGS_IN_WINDOW_MAX_LIMIT, Math.max(10, Math.floor(raw)));
}

export async function queryApexLogsInWindow(instanceUrl, sid, apiVersion, sinceIso, untilIso, opts = {}) {
  const a = toSoqlUtcDateTimeLiteral(sinceIso);
  const b = toSoqlUtcDateTimeLiteral(untilIso);
  if (!a || !b) return [];
  const limit = resolveApexLogsInWindowLimit(opts);
  const uid = String(opts.logUserId || '').replace(/[^a-zA-Z0-9]/g, '');
  const userClause = uid ? ` AND LogUserId = '${escapeSoqlLiteral(uid)}'` : '';
  const opEq = String(opts.operationEquals || '').trim();
  const opClause = opEq ? ` AND Operation = '${escapeSoqlLiteral(opEq)}'` : '';
  const locNeedle = String(opts.locationLikeContains || '').trim();
  /** Solo nombres API seguros para LIKE (evita comillas y comodines mal escapados). */
  const safeLoc =
    locNeedle && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(locNeedle) ? locNeedle : '';
  let likeClause = '';
  if (safeLoc) {
    const pat = soqlLikeEscapeMetacharacters(safeLoc);
    likeClause = ` AND Location LIKE '%${pat}%' ESCAPE '\\'`;
  }
  const baseFields =
    'Id, StartTime, Operation, LogLength, LogUserId, LogUser.Name, DurationMilliseconds, Location, Status';
  const whereCore = `StartTime >= ${a} AND StartTime <= ${b}${userClause}${opClause}`;
  const orderLimit = ` ORDER BY StartTime ASC LIMIT ${limit}`;
  const soqlLocNoLike = `SELECT ${baseFields} FROM ApexLog WHERE ${whereCore}${orderLimit}`;
  const soqlWithLoc = `SELECT ${baseFields} FROM ApexLog WHERE ${whereCore}${likeClause}${orderLimit}`;
  const soqlNoLoc =
    'SELECT Id, StartTime, Operation, LogLength, LogUserId, LogUser.Name, DurationMilliseconds, Status FROM ApexLog WHERE ' +
    `${whereCore}${orderLimit}`;
  try {
    if (likeClause) {
      const withLike = (await toolingQueryAll(instanceUrl, sid, apiVersion, soqlWithLoc)) || [];
      if (withLike.length) return withLike;
    }
    return (await toolingQueryAll(instanceUrl, sid, apiVersion, soqlLocNoLike)) || [];
  } catch {
    try {
      return (await toolingQueryAll(instanceUrl, sid, apiVersion, soqlLocNoLike)) || [];
    } catch {
      try {
        return (await restQueryAll(instanceUrl, sid, apiVersion, soqlNoLoc)) || [];
      } catch {
        return [];
      }
    }
  }
}

function parseLogTimeMs(d) {
  if (d == null) return null;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Patrón LIKE (sin comillas): escapa `\\`, `%` y `_` para usar con `ESCAPE '\\'`. */
function soqlLikeEscapeMetacharacters(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * `Location` en ApexLog suele ser el contexto (p. ej. clase de test) en ejecuciones de test.
 * Puede ser `Clase`, `ns.Clase`, `Clase.metodo`, etc. (misma fila que el Id del log en Setup).
 */
export function apexLogLocationMatchesTestClass(location, className) {
  const cn = String(className || '').trim();
  if (!cn) return true;
  const loc = location == null ? '' : String(location).trim();
  if (!loc) return false;
  const a = loc.toLowerCase();
  const b = cn.toLowerCase();
  if (a === b) return true;
  if (b.length >= 4 && a.includes(b)) return true;
  const seg = a.split(/[.\s]+/).filter(Boolean);
  if (seg.includes(b)) return true;
  return a.endsWith('.' + b) || a.includes('.' + b + '.');
}

/**
 * ¿El texto del cuerpo del log parece corresponder a la clase de test indicada?
 * Busca el nombre de clase y líneas típicas de ejecución de tests (barato: solo prefijo).
 */
export function apexLogBodyLooksLikeTestClass(body, className) {
  const cn = String(className || '').trim();
  if (!cn || body == null) return false;
  const text = String(body);
  const head = text.length > 180_000 ? text.slice(0, 180_000) : text;
  const lo = head.toLowerCase();
  const b = cn.toLowerCase();
  if (lo.includes(b)) return true;
  const compact = cn.replace(/[^a-zA-Z0-9_]/g, '');
  if (compact.length >= 4 && head.includes(compact)) return true;
  return /\bEXECUTION_STARTED\b/i.test(head) && lo.includes(b);
}

function normalizeLogNameWithNamespace(fullName) {
  const s = String(fullName || '').trim();
  if (!s) return '';
  const parts = s.split('.');
  if (parts.length <= 1) return s;
  const namespace = parts[0];
  const name = parts.slice(1).join('.');
  return namespace ? `${namespace}.${name}` : name;
}

function apexLogContextIsEmpty(meta) {
  return !meta || (meta.logType === 'N/A' && meta.logName === 'N/A' && meta.logMethod === 'N/A');
}

/** Combina contexto del body con metadatos SOQL (Location/Operation). */
export function mergeApexLogExecutionContext(primary, fallback) {
  const a = primary || { logType: 'N/A', logName: 'N/A', logMethod: 'N/A' };
  const b = fallback || { logType: 'N/A', logName: 'N/A', logMethod: 'N/A' };
  if (apexLogContextIsEmpty(a)) return b;
  if (apexLogContextIsEmpty(b)) return a;
  return {
    logType: a.logType !== 'N/A' ? a.logType : b.logType,
    logName: a.logName !== 'N/A' ? a.logName : b.logName,
    logMethod: a.logMethod !== 'N/A' ? a.logMethod : b.logMethod
  };
}

/**
 * Fallback cuando no se puede parsear el body: usa `Location` y `Operation` del ApexLog.
 */
export function inferApexLogExecutionFromMetadata(row) {
  const loc = String(row?.Location || '').trim();
  const op = String(row?.Operation || '').trim();
  if (!loc && !op) {
    return { logType: 'N/A', logName: 'N/A', logMethod: 'N/A' };
  }
  if (!loc) {
    return { logType: op || 'N/A', logName: 'N/A', logMethod: 'N/A' };
  }
  const triggerMatch = loc.match(/^(.+?)\s+on\s+.+\s+trigger event\s+([A-Za-z]+)$/i);
  if (triggerMatch) {
    return {
      logType: 'Trigger',
      logName: normalizeLogNameWithNamespace(triggerMatch[1]),
      logMethod: triggerMatch[2] || 'N/A'
    };
  }
  const segments = loc.split('.').filter(Boolean);
  const last = segments[segments.length - 1] || '';
  if (segments.length >= 2 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(last)) {
    return {
      logType: op === 'ApexTestHandler' ? 'Apex' : op || 'Apex',
      logName: normalizeLogNameWithNamespace(segments.slice(0, -1).join('.')),
      logMethod: last
    };
  }
  return {
    logType: op || 'N/A',
    logName: loc,
    logMethod: 'N/A'
  };
}

/**
 * Extrae contexto legible de un ApexLog para identificar ejecución.
 * Devuelve siempre strings seguras para UI (`N/A` cuando no aplica).
 */
export function parseApexLogExecutionContext(logBody) {
  const text = normalizeApexLogBodyText(logBody);
  if (!text) {
    return { logType: 'N/A', logName: 'N/A', logMethod: 'N/A' };
  }
  const head = text.length > APEX_LOG_BODY_PREFIX_BYTES ? text.slice(0, APEX_LOG_BODY_PREFIX_BYTES) : text;
  const lines = head.split(/\r?\n/);
  let match;

  if ((match = head.match(/apex:\/\/([a-zA-Z0-9_.]+)\/ACTION\$([a-zA-Z0-9_]+)/))) {
    return {
      logType: 'Apex',
      logName: normalizeLogNameWithNamespace(match[1]),
      logMethod: match[2] || 'N/A'
    };
  }

  if ((match = head.match(/CODE_UNIT_STARTED\|\[EXTERNAL\]\|\w+\|([a-zA-Z0-9_.]+)\.([a-zA-Z0-9_]+)\s*\(/))) {
    return {
      logType: 'Apex',
      logName: normalizeLogNameWithNamespace(match[1]),
      logMethod: match[2] || 'N/A'
    };
  }

  if (head.includes('CODE_UNIT_STARTED|[EXTERNAL]|execute_anonymous_apex')) {
    for (const line of lines) {
      const m = line.match(/METHOD_ENTRY\|.*\|(?:\w+\|)?(?:(\w+)\.)?([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\(/);
      if (!m) continue;
      const namespace = m[1] ? `${m[1]}.` : '';
      const className = m[2] || '';
      const methodName = m[3] || '';
      if (className && methodName && className !== methodName) {
        return {
          logType: 'Execute Anonymous',
          logName: `${namespace}${className}`,
          logMethod: methodName
        };
      }
    }
    return { logType: 'Execute Anonymous', logName: 'N/A', logMethod: 'N/A' };
  }

  if ((match = head.match(/CODE_UNIT_STARTED\|\[EXTERNAL\]\|\w+\|([a-zA-Z0-9_.]+) on .* trigger event ([a-zA-Z]+)/))) {
    return {
      logType: 'Trigger',
      logName: normalizeLogNameWithNamespace(match[1]),
      logMethod: match[2] || 'N/A'
    };
  }

  if ((match = head.match(/FLOW_START_INTERVIEW_BEGIN\|[^|]*\|(.+)/))) {
    const flowFullName = String(match[1] || '').trim();
    const [namespace, flowName] = flowFullName.includes('/') ? flowFullName.split('/') : ['', flowFullName];
    const normalized = namespace ? `${namespace}.${flowName}` : flowName;
    return { logType: 'Flow', logName: normalized || 'N/A', logMethod: 'N/A' };
  }

  for (const line of lines) {
    if ((match = line.match(/CODE_UNIT_STARTED\|\[EXTERNAL\]\|\w+\|VF: \/apex\/([a-zA-Z0-9_.]+)/))) {
      return {
        logType: 'Visualforce',
        logName: normalizeLogNameWithNamespace(match[1]),
        logMethod: 'N/A'
      };
    }

    if ((match = line.match(/ENTERING_MANAGED_PKG\|([a-zA-Z0-9_.]+)/))) {
      return {
        logType: 'Managed Package',
        logName: normalizeLogNameWithNamespace(match[1]),
        logMethod: 'N/A'
      };
    }

    if ((match = line.match(/CODE_UNIT_STARTED\|\[EXTERNAL\]\|Validation:([a-zA-Z0-9_]+)(?::([a-zA-Z0-9_]+))?/))) {
      const objectName = match[1] || '';
      const context = match[2] || '';
      return {
        logType: 'Validation',
        logName: context ? `${objectName}:${context}` : objectName || 'N/A',
        logMethod: 'N/A'
      };
    }

    if ((match = line.match(/CODE_UNIT_STARTED\|\[EXTERNAL\]\|Workflow:([a-zA-Z0-9_]+)/))) {
      return { logType: 'Workflow', logName: match[1] || 'N/A', logMethod: 'N/A' };
    }

    if ((match = line.match(/CODE_UNIT_STARTED\|\[EXTERNAL\]\|Flow:([a-zA-Z0-9_]+)/))) {
      return { logType: 'Flow', logName: match[1] || 'N/A', logMethod: 'N/A' };
    }

    if ((match = line.match(/CODE_UNIT_STARTED\|\[EXTERNAL\]\|(.+)/))) {
      return { logType: 'N/A', logName: String(match[1] || '').trim() || 'N/A', logMethod: 'N/A' };
    }
  }

  return { logType: 'N/A', logName: 'N/A', logMethod: 'N/A' };
}

const LOCAL_LOG_EXECUTION_STARTED_RE =
  /^(\d{2}:\d{2}:\d{2}\.\d+)\s*(?:\(\d+\))?\|EXECUTION_STARTED(?:\||$)/m;

/**
 * Vista previa ligera de un Apex debug log local (sin parseo completo).
 * @param {string} logBody
 * @returns {{
 *   user: { id: string, name: string } | null,
 *   executionStartTime: string | null,
 *   logType: string,
 *   logName: string,
 *   logMethod: string,
 *   isValid: boolean
 * }}
 */
export function parseLocalApexLogPreview(logBody) {
  const text = normalizeApexLogBodyText(logBody);
  const invalid = {
    user: null,
    executionStartTime: null,
    logType: 'N/A',
    logName: 'N/A',
    logMethod: 'N/A',
    isValid: false
  };
  if (!text) return invalid;

  const ctx = parseApexLogExecutionContext(text);
  const execMatch = text.match(LOCAL_LOG_EXECUTION_STARTED_RE);
  const executionStartTime = execMatch ? execMatch[1] : null;
  if (!executionStartTime) {
    return { ...invalid, logType: ctx.logType, logName: ctx.logName, logMethod: ctx.logMethod };
  }

  let user = null;
  const preludeEnd = text.search(/^.*EXECUTION_STARTED.*$/m);
  const prelude = preludeEnd > 0 ? text.slice(0, preludeEnd) : text.slice(0, 50_000);
  for (const lineText of prelude.split(/\r?\n/)) {
    const trimmed = lineText.trim();
    if (!trimmed || !trimmed.includes('|USER_INFO|')) continue;
    const pipeIdx = trimmed.indexOf('|');
    if (pipeIdx < 0) continue;
    const fields = trimmed.slice(pipeIdx + 1).split('|');
    const eventIdx = fields.indexOf('USER_INFO');
    if (eventIdx < 0) continue;
    const parts = fields.slice(eventIdx + 1);
    const off = parts[0] === '[EXTERNAL]' ? 1 : 0;
    const id = String(parts[off] || '').trim();
    const name = String(parts[1 + off] || '').trim();
    if (id || name) user = { id, name };
    break;
  }

  return {
    user,
    executionStartTime,
    logType: ctx.logType,
    logName: ctx.logName,
    logMethod: ctx.logMethod,
    isValid: true
  };
}

/** Body parseado + fallback con Location/Operation del registro ApexLog. */
export function resolveApexLogExecutionContext(logBody, row) {
  return mergeApexLogExecutionContext(
    parseApexLogExecutionContext(logBody),
    inferApexLogExecutionFromMetadata(row)
  );
}

/**
 * ApexLogs candidatos a un test run: no anteriores al inicio del AsyncApexJob.
 */
export function filterApexTestRunCandidateLogs(logs, jobCreatedMs) {
  const startMs =
    jobCreatedMs != null && Number.isFinite(Number(jobCreatedMs)) ? Number(jobCreatedMs) : null;
  if (startMs == null) return Array.isArray(logs) ? [...logs] : [];
  return (Array.isArray(logs) ? logs : []).filter((l) => {
    const st = parseLogTimeMs(l?.StartTime);
    if (st != null && st < startMs) return false;
    return true;
  });
}

/** Tras parsear el body, conserva solo logs del tipo indicado (p. ej. `Apex`). */
export function filterApexTestRunLogsByExecutionType(logs, executionType = 'Apex') {
  const want = String(executionType || '').trim();
  if (!want) return Array.isArray(logs) ? [...logs] : [];
  return (Array.isArray(logs) ? logs : []).filter((l) => String(l?.Type || '').trim() === want);
}

/**
 * Elige el ApexLog más probable para una ejecución AsyncApexJob (tests).
 * Evita tomar el log más grande de la ventana (puede ser otra actividad del mismo usuario).
 * Con `apexTestClassName`, se priorizan filas cuyo `Location` encaja; si ninguna encaja, se usa el resto con puntuación (no devuelve null si hay logs).
 */
export function pickBestApexLogForTestRun(
  logs,
  { createdById, createdMs, completedMs, apexTestClassName }
) {
  if (!Array.isArray(logs) || !logs.length) return null;
  const id15 = (x) => (x == null ? '' : String(x).slice(0, 15));
  const cb = createdById ? id15(createdById) : '';

  const wantClass = String(apexTestClassName || '').trim();
  const locationMatched = wantClass
    ? logs.filter((l) => apexLogLocationMatchesTestClass(l.Location, wantClass))
    : [];
  const pool = locationMatched.length ? locationMatched : logs;

  const scoreOne = (l) => {
    let score = 0;
    const st = parseLogTimeMs(l.StartTime);
    const op = String(l.Operation || '');
    const len = Number(l.LogLength) || 0;

    if (wantClass && apexLogLocationMatchesTestClass(l.Location, wantClass)) score += 450;

    if (cb && id15(l.LogUserId) === cb) score += 200;

    if (op === 'ApexTestHandler') score += 110;
    else if (op === 'Batch Apex' || op === 'Api') score += 90;
    else if (op === 'Developer Console') score -= 60;

    if (createdMs != null && completedMs != null && st != null) {
      if (st >= createdMs - 120_000 && st <= completedMs + 180_000) score += 120;
      if (st < createdMs - 300_000) score -= 50;
      if (st > completedMs + 600_000) score -= 80;
      const mid = (createdMs + completedMs) / 2;
      const dist = Math.abs(st - mid);
      score += Math.max(0, 40 - dist / 120_000);
    }

    if (len > 200) score += Math.min(25, len / 400_000);

    return score;
  };

  let best = pool[0];
  let bestS = scoreOne(best);
  for (let i = 1; i < pool.length; i++) {
    const s = scoreOne(pool[i]);
    if (s > bestS) {
      bestS = s;
      best = pool[i];
    }
  }
  return best;
}

const SNIFF_MAX_LOG_BYTES = 900_000;
const SNIFF_MAX_CANDIDATES = 6;

/**
 * Si `Location` no basta, descarga solo logs pequeños y busca el nombre de clase en el prefijo del cuerpo.
 * @returns {Promise<{ row: object, body: string } | null>}
 */
export async function pickApexTestLogByBodySnippet(
  instanceUrl,
  sid,
  apiVersion,
  logs,
  className,
  fetchBodyFn
) {
  const want = String(className || '').trim();
  if (!want || !Array.isArray(logs) || !logs.length) return null;
  const fetchBody = fetchBodyFn || fetchApexLogBody;
  const candidates = [...logs]
    .filter((l) => String(l.Operation || '') === 'ApexTestHandler')
    .filter((l) => {
      const n = Number(l.LogLength);
      return Number.isFinite(n) && n > 0 && n <= SNIFF_MAX_LOG_BYTES;
    })
    .sort((x, y) => {
      const ax = Number(x.LogLength) || 0;
      const ay = Number(y.LogLength) || 0;
      if (ax !== ay) return ax - ay;
      return String(x.StartTime || '').localeCompare(String(y.StartTime || ''));
    })
    .slice(0, SNIFF_MAX_CANDIDATES);

  for (const l of candidates) {
    if (!l?.Id) continue;
    try {
      const body = await fetchBody(instanceUrl, sid, apiVersion, l.Id);
      if (apexLogBodyLooksLikeTestClass(body, want)) return { row: l, body };
    } catch {
      /* siguiente candidato */
    }
  }
  return null;
}

function toSfJsonUtcDateTime(exp) {
  const d = exp instanceof Date ? exp : new Date(exp);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(
    d.getUTCHours()
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.000+0000`;
}

/**
 * Usuario de la sesión actual (Bearer) vía `/services/oauth2/userinfo`.
 * @returns {Promise<{ userId: string, username: string, name: string }>}
 */
export async function fetchSessionUserInfo(instanceUrl, sid) {
  await restGate.acquire();
  const base = String(instanceUrl).replace(/\/$/, '');
  const url = `${base}/services/oauth2/userinfo`;
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${sid}`);
  headers.set('Accept', 'application/json');
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = new Error(`userinfo: HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();

  let userId = '';
  if (json.user_id) userId = String(json.user_id).replace(/[^a-zA-Z0-9]/g, '');
  else {
    const sub = json.sub;
    if (typeof sub === 'string' && sub.includes('/')) {
      const last = sub.split('/').pop();
      userId = String(last || '').replace(/[^a-zA-Z0-9]/g, '');
    }
  }
  if (!userId) throw new Error('userinfo: no user id');

  const username = String(json.preferred_username || json.username || '').trim().slice(0, 120);
  const name = String(json.name || '').trim().slice(0, 120);

  return { userId, username, name };
}

/** Id de usuario de la sesión actual (Bearer) vía `/services/oauth2/userinfo`. */
export async function fetchSessionUserId(instanceUrl, sid) {
  const info = await fetchSessionUserInfo(instanceUrl, sid);
  return info.userId;
}

async function queryDebugLevelIdForTraces(instanceUrl, sid, apiVersion, developerName) {
  const name = String(developerName || 'SFDC_DevConsole').trim() || 'SFDC_DevConsole';
  const esc = escapeSoqlLiteral(name);
  const soql = `SELECT Id FROM DebugLevel WHERE DeveloperName = '${esc}' LIMIT 1`;
  let rows = [];
  try {
    rows = (await toolingQuery(instanceUrl, sid, apiVersion, soql)) || [];
  } catch {
    rows = [];
  }
  if (!rows.length) {
    try {
      rows = (await restQuery(instanceUrl, sid, apiVersion, soql)) || [];
    } catch {
      rows = [];
    }
  }
  if (!rows.length) {
    const wide = `SELECT Id FROM DebugLevel LIMIT 1`;
    try {
      rows = (await toolingQuery(instanceUrl, sid, apiVersion, wide)) || [];
    } catch {
      try {
        rows = (await restQuery(instanceUrl, sid, apiVersion, wide)) || [];
      } catch {
        rows = [];
      }
    }
  }
  const id = rows[0]?.Id;
  return id ? String(id).replace(/[^a-zA-Z0-9]/g, '') : null;
}

export async function deleteTraceFlagById(instanceUrl, sid, apiVersion, traceFlagId) {
  const id = String(traceFlagId || '').replace(/[^a-zA-Z0-9]/g, '');
  if (!id) return;
  await restGate.acquire();
  const base = String(instanceUrl).replace(/\/$/, '');
  const url = `${base}/services/data/v${apiVersion}/tooling/sobjects/TraceFlag/${id}`;
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${sid}`);
  const res = await fetch(url, { method: 'DELETE', headers });
  if (!res.ok && res.status !== 404) {
    const err = new Error(`TraceFlag DELETE: HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
}

async function deleteExistingUserDebugTraceFlags(instanceUrl, sid, apiVersion, userId) {
  const esc = escapeSoqlLiteral(userId);
  const soql = `SELECT Id FROM TraceFlag WHERE TracedEntityId = '${esc}' AND LogType = 'USER_DEBUG'`;
  let rows = [];
  try {
    rows = (await toolingQuery(instanceUrl, sid, apiVersion, soql)) || [];
  } catch {
    try {
      rows = (await restQuery(instanceUrl, sid, apiVersion, soql)) || [];
    } catch {
      return;
    }
  }
  for (const r of rows) {
    if (r?.Id) {
      try {
        await deleteTraceFlagById(instanceUrl, sid, apiVersion, r.Id);
      } catch {
        /* siguiente */
      }
    }
  }
}

async function toolingCreateTraceFlag(instanceUrl, sid, apiVersion, body) {
  await restGate.acquire();
  const base = String(instanceUrl).replace(/\/$/, '');
  const url = `${base}/services/data/v${apiVersion}/tooling/sobjects/TraceFlag/`;
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${sid}`);
  headers.set('Accept', 'application/json');
  headers.set('Content-Type', 'application/json; charset=UTF-8');
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    const msg =
      (Array.isArray(json) && json[0] && json[0].message) ||
      json.message ||
      json.error ||
      text ||
      `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return String(json.id || json.Id || '').replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Activa trazas USER_DEBUG para el usuario de la sesión.
 * @param {string} [debugLevelDeveloperName] DeveloperName del registro DebugLevel (p. ej. SFDC_DevConsole).
 * Elimina TraceFlags USER_DEBUG previos del mismo usuario y crea uno nuevo con caducidad larga (red de seguridad).
 * @returns {Promise<string|null>} Id del TraceFlag o null si no se pudo crear.
 */
export async function enableUserDebugTraceForSessionUser(
  instanceUrl,
  sid,
  apiVersion,
  debugLevelDeveloperName
) {
  const userId = await fetchSessionUserId(instanceUrl, sid);
  const debugLevelId = await queryDebugLevelIdForTraces(
    instanceUrl,
    sid,
    apiVersion,
    debugLevelDeveloperName
  );
  if (!debugLevelId) return null;
  await deleteExistingUserDebugTraceFlags(instanceUrl, sid, apiVersion, userId);
  const exp = new Date(Date.now() + 23 * 60 * 60 * 1000);
  const expStr = toSfJsonUtcDateTime(exp);
  if (!expStr) return null;
  const body = {
    TracedEntityId: userId,
    LogType: 'USER_DEBUG',
    DebugLevelId: debugLevelId,
    ExpirationDate: expStr
  };
  return await toolingCreateTraceFlag(instanceUrl, sid, apiVersion, body);
}

/**
 * SOQL de búsqueda de usuarios activos por un campo (Name o Username).
 * SOQL REST no admite `ESCAPE` en LIKE: se eliminan comodines del término.
 * @returns {string|null}
 */
export function buildActiveUserSearchSoql(field, query, limit = 15) {
  const f = field === 'Username' ? 'Username' : 'Name';
  const q = String(query || '')
    .trim()
    .replace(/[%_\\]/g, '');
  if (q.length < 2) return null;
  const cap = Math.min(50, Math.max(5, Number(limit) || 15));
  const like = `%${escapeSoqlLiteral(q)}%`;
  return `SELECT Id, Name, Username FROM User WHERE IsActive = true AND ${f} LIKE '${like}' ORDER BY Name LIMIT ${cap}`;
}

/**
 * Busca usuarios activos por nombre o username (LIKE parcial).
 * @returns {Promise<Array<{ id: string, name: string, username: string }>>}
 */
export async function searchUsersByNameOrUsername(instanceUrl, sid, apiVersion, query, limit = 15) {
  const cap = Math.min(50, Math.max(5, Number(limit) || 15));
  const soqlByName = buildActiveUserSearchSoql('Name', query, cap);
  const soqlByUsername = buildActiveUserSearchSoql('Username', query, cap);
  if (!soqlByName || !soqlByUsername) return [];

  async function runUserSoql(soql) {
    try {
      return (await restQuery(instanceUrl, sid, apiVersion, soql)) || [];
    } catch {
      return [];
    }
  }

  const [byName, byUsername] = await Promise.all([runUserSoql(soqlByName), runUserSoql(soqlByUsername)]);
  const seen = new Set();
  const merged = [];
  for (const r of [...byName, ...byUsername]) {
    const id = String(r?.Id || '').replace(/[^a-zA-Z0-9]/g, '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(r);
    if (merged.length >= cap) break;
  }
  merged.sort((a, b) => String(a?.Name || '').localeCompare(String(b?.Name || ''), undefined, { sensitivity: 'base' }));

  return merged
    .map((r) => ({
      id: String(r?.Id || '').replace(/[^a-zA-Z0-9]/g, ''),
      name: String(r?.Name || '').trim(),
      username: String(r?.Username || '').trim()
    }))
    .filter((r) => r.id);
}

/**
 * Lista DebugLevels disponibles en el entorno.
 * @returns {Promise<Array<{ id: string, developerName: string, label: string }>>}
 */
export async function queryDebugLevels(instanceUrl, sid, apiVersion) {
  const soql = 'SELECT Id, DeveloperName, MasterLabel FROM DebugLevel ORDER BY MasterLabel LIMIT 200';
  let rows = [];
  try {
    rows = (await toolingQuery(instanceUrl, sid, apiVersion, soql)) || [];
  } catch {
    try {
      rows = (await restQuery(instanceUrl, sid, apiVersion, soql)) || [];
    } catch {
      rows = [];
    }
  }
  return rows
    .map((r) => ({
      id: String(r?.Id || '').replace(/[^a-zA-Z0-9]/g, ''),
      developerName: String(r?.DeveloperName || '').trim(),
      label: String(r?.MasterLabel || r?.DeveloperName || '').trim()
    }))
    .filter((r) => r.id);
}

/**
 * Crea TraceFlag USER_DEBUG para un usuario con ventana temporal personalizada.
 * Elimina trazas USER_DEBUG previas del mismo usuario.
 * @returns {Promise<{ traceFlagId: string }>}
 */
export async function createUserDebugTraceFlag(
  instanceUrl,
  sid,
  apiVersion,
  { userId, debugLevelId, startIso, expirationIso }
) {
  const uid = String(userId || '').replace(/[^a-zA-Z0-9]/g, '');
  const dlId = String(debugLevelId || '').replace(/[^a-zA-Z0-9]/g, '');
  if (!uid) throw new Error('Missing user id');
  if (!dlId) throw new Error('Missing debug level id');
  const startStr = toSfJsonUtcDateTime(startIso);
  const expStr = toSfJsonUtcDateTime(expirationIso);
  if (!startStr || !expStr) throw new Error('Invalid date range');
  const startMs = new Date(startIso).getTime();
  const expMs = new Date(expirationIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(expMs) || expMs <= startMs) {
    throw new Error('End date must be after start date');
  }
  const maxWindowMs = 24 * 60 * 60 * 1000;
  if (expMs - startMs > maxWindowMs) {
    throw new Error('Trace window cannot exceed 24 hours');
  }
  await deleteExistingUserDebugTraceFlags(instanceUrl, sid, apiVersion, uid);
  const body = {
    TracedEntityId: uid,
    LogType: 'USER_DEBUG',
    DebugLevelId: dlId,
    StartDate: startStr,
    ExpirationDate: expStr
  };
  const traceFlagId = await toolingCreateTraceFlag(instanceUrl, sid, apiVersion, body);
  if (!traceFlagId) throw new Error('Could not create trace flag');
  return { traceFlagId };
}

/** Ventana máxima de una traza USER_DEBUG (24 h). */
export const USER_DEBUG_TRACE_MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Trazas caducadas hace menos de este tiempo siguen visibles y se pueden reactivar. */
export const USER_DEBUG_TRACE_RECENTLY_INACTIVE_MS = 30 * 60 * 1000;

/**
 * @param {unknown} value
 * @returns {number}
 */
export function parseSalesforceDateTimeMs(value) {
  if (value == null || value === '') return NaN;
  if (value instanceof Date) return value.getTime();
  const raw = String(value).trim();
  if (!raw) return NaN;
  const normalized = raw.replace(/(\.\d{3})\+(\d{2})(\d{2})$/, '$1+$2:$3');
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : NaN;
}

/**
 * @param {{ startIso?: string, expirationIso?: string, StartDate?: string, ExpirationDate?: string }} row
 */
export function resolveUserDebugTraceDates(row) {
  const startMs = parseSalesforceDateTimeMs(row?.startIso ?? row?.StartDate);
  const expMs = parseSalesforceDateTimeMs(row?.expirationIso ?? row?.ExpirationDate);
  return {
    startMs,
    expMs,
    startIso: Number.isFinite(startMs) ? new Date(startMs).toISOString() : '',
    expirationIso: Number.isFinite(expMs) ? new Date(expMs).toISOString() : ''
  };
}

/**
 * @param {{ startIso?: string, expirationIso?: string, StartDate?: string, ExpirationDate?: string }} row
 * @param {number} [nowMs]
 */
export function isUserDebugTraceActive(row, nowMs = Date.now()) {
  const { startMs, expMs } = resolveUserDebugTraceDates(row);
  if (!Number.isFinite(startMs) || !Number.isFinite(expMs)) return false;
  return startMs <= nowMs && nowMs < expMs;
}

/**
 * Traza caducada recientemente (últimos 30 min), ya iniciada.
 * @param {{ startIso?: string, expirationIso?: string, StartDate?: string, ExpirationDate?: string }} row
 * @param {number} [nowMs]
 */
export function isUserDebugTraceRecentlyInactive(row, nowMs = Date.now()) {
  if (isUserDebugTraceActive(row, nowMs)) return false;
  const { startMs, expMs } = resolveUserDebugTraceDates(row);
  if (!Number.isFinite(startMs) || !Number.isFinite(expMs)) return false;
  if (startMs > nowMs) return false;
  if (expMs > nowMs) return false;
  return nowMs - expMs <= USER_DEBUG_TRACE_RECENTLY_INACTIVE_MS;
}

/**
 * @param {{ startIso?: string, expirationIso?: string, StartDate?: string, ExpirationDate?: string }} row
 * @param {number} [nowMs]
 */
export function isUserDebugTraceVisibleByDefault(row, nowMs = Date.now()) {
  return isUserDebugTraceActive(row, nowMs) || isUserDebugTraceRecentlyInactive(row, nowMs);
}

/**
 * Calcula nueva caducidad sumando `addMs` a la actual (activa) o desde ahora (reactivación).
 * @returns {{ expirationIso: string, cappedAtMax: boolean }}
 */
export function computeTraceExtension({ startIso, expirationIso, addMs, nowMs = Date.now() }) {
  const startMs = parseSalesforceDateTimeMs(startIso);
  const expMs = parseSalesforceDateTimeMs(expirationIso);
  const add = Math.max(0, Number(addMs) || 0);
  if (!Number.isFinite(startMs) || !Number.isFinite(expMs)) {
    throw new Error('Invalid date range');
  }
  const maxExpMs = startMs + USER_DEBUG_TRACE_MAX_WINDOW_MS;
  const active = startMs <= nowMs && nowMs < expMs;
  const requestedMs = active ? expMs + add : nowMs + add;
  const nextMs = Math.min(requestedMs, maxExpMs);
  if (active && nextMs <= expMs) {
    throw new Error('Trace window cannot exceed 24 hours');
  }
  if (!active && nextMs <= nowMs) {
    throw new Error('Cannot reactivate trace');
  }
  return {
    expirationIso: new Date(nextMs).toISOString(),
    cappedAtMax: requestedMs > maxExpMs
  };
}

/**
 * @param {{ startIso?: string, expirationIso?: string, StartDate?: string, ExpirationDate?: string }} row
 * @param {number} [nowMs]
 */
export function buildTraceExtensionPlan(row, addMs = 15 * 60 * 1000, nowMs = Date.now()) {
  const { startIso, expirationIso } = resolveUserDebugTraceDates(row);
  if (!startIso || !expirationIso) {
    throw new Error('Invalid trace dates');
  }
  const active = isUserDebugTraceActive(row, nowMs);
  const recentlyInactive = isUserDebugTraceRecentlyInactive(row, nowMs);
  if (!active && !recentlyInactive) {
    throw new Error('Trace is not active');
  }
  if (active) {
    const result = computeTraceExtension({ startIso, expirationIso, addMs, nowMs });
    return { ...result, startIso: null, reactivated: false };
  }
  const nowIso = new Date(nowMs).toISOString();
  const result = computeTraceExtension({
    startIso: nowIso,
    expirationIso: nowIso,
    addMs,
    nowMs
  });
  return { ...result, startIso: nowIso, reactivated: true };
}

/**
 * @param {{ startIso?: string, expirationIso?: string, StartDate?: string, ExpirationDate?: string }} row
 * @param {number} [nowMs]
 */
export function canExtendOrReactivateUserDebugTrace(row, nowMs = Date.now()) {
  if (!isUserDebugTraceActive(row, nowMs) && !isUserDebugTraceRecentlyInactive(row, nowMs)) {
    return false;
  }
  const { startIso, expirationIso, startMs, expMs } = resolveUserDebugTraceDates(row);
  if (!Number.isFinite(startMs) || !Number.isFinite(expMs)) return false;
  if (isUserDebugTraceActive(row, nowMs) && expMs >= startMs + USER_DEBUG_TRACE_MAX_WINDOW_MS) {
    return false;
  }
  try {
    buildTraceExtensionPlan(row, 15 * 60 * 1000, nowMs);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lista TraceFlags USER_DEBUG recientes del entorno.
 * @returns {Promise<Array<{ id: string, tracedEntityId: string, debugLevelId: string, debugLevelLabel: string, debugLevelDeveloperName: string, startIso: string, expirationIso: string, logType: string }>>}
 */
export async function queryUserDebugTraceFlags(instanceUrl, sid, apiVersion) {
  const soql =
    'SELECT Id, TracedEntityId, DebugLevelId, StartDate, ExpirationDate, LogType FROM TraceFlag WHERE LogType = \'USER_DEBUG\' ORDER BY ExpirationDate DESC LIMIT 200';
  let rows = [];
  try {
    rows = (await toolingQuery(instanceUrl, sid, apiVersion, soql)) || [];
  } catch {
    try {
      rows = (await restQuery(instanceUrl, sid, apiVersion, soql)) || [];
    } catch {
      rows = [];
    }
  }
  const levels = await queryDebugLevels(instanceUrl, sid, apiVersion);
  const levelById = new Map(levels.map((l) => [l.id, l]));
  return rows
    .map((r) => {
      const id = String(r?.Id || '').replace(/[^a-zA-Z0-9]/g, '');
      const tracedEntityId = String(r?.TracedEntityId || '').replace(/[^a-zA-Z0-9]/g, '');
      const debugLevelId = String(r?.DebugLevelId || '').replace(/[^a-zA-Z0-9]/g, '');
      const lvl = levelById.get(debugLevelId);
      const startMs = parseSalesforceDateTimeMs(r?.StartDate);
      const expMs = parseSalesforceDateTimeMs(r?.ExpirationDate);
      const startIso = Number.isFinite(startMs) ? new Date(startMs).toISOString() : '';
      const expirationIso = Number.isFinite(expMs) ? new Date(expMs).toISOString() : '';
      return {
        id,
        tracedEntityId,
        debugLevelId,
        debugLevelLabel: lvl?.label || debugLevelId || '',
        debugLevelDeveloperName: lvl?.developerName || '',
        startIso,
        expirationIso,
        logType: String(r?.LogType || 'USER_DEBUG')
      };
    })
    .filter((r) => r.id);
}

/**
 * Amplía la caducidad de un TraceFlag USER_DEBUG.
 * @returns {Promise<{ expirationIso: string, cappedAtMax: boolean }>}
 */
export async function extendUserDebugTraceFlag(
  instanceUrl,
  sid,
  apiVersion,
  { traceFlagId, addMs = 15 * 60 * 1000, allowReactivate = false }
) {
  const id = String(traceFlagId || '').replace(/[^a-zA-Z0-9]/g, '');
  if (!id) throw new Error('Missing trace flag id');
  const esc = escapeSoqlLiteral(id);
  const soql = `SELECT Id, StartDate, ExpirationDate, LogType FROM TraceFlag WHERE Id = '${esc}' LIMIT 1`;
  let rows = [];
  try {
    rows = (await toolingQuery(instanceUrl, sid, apiVersion, soql)) || [];
  } catch {
    rows = (await restQuery(instanceUrl, sid, apiVersion, soql)) || [];
  }
  const row = rows[0];
  if (!row?.Id) throw new Error('Trace flag not found');
  if (String(row.LogType || '') !== 'USER_DEBUG') throw new Error('Not a USER_DEBUG trace');

  let plan;
  try {
    plan = buildTraceExtensionPlan(row, addMs);
  } catch (err) {
    if (allowReactivate && err instanceof Error && err.message === 'Trace is not active') {
      const { startIso, expirationIso } = resolveUserDebugTraceDates(row);
      if (!startIso || !expirationIso) throw err;
      const nowIso = new Date().toISOString();
      const result = computeTraceExtension({
        startIso: nowIso,
        expirationIso: nowIso,
        addMs
      });
      plan = { ...result, startIso: nowIso, reactivated: true };
    } else {
      throw err;
    }
  }

  const expStr = toSfJsonUtcDateTime(plan.expirationIso);
  if (!expStr) throw new Error('Invalid expiration date');
  const patch = { ExpirationDate: expStr };
  if (plan.reactivated && plan.startIso) {
    const startStr = toSfJsonUtcDateTime(plan.startIso);
    if (!startStr) throw new Error('Invalid start date');
    patch.StartDate = startStr;
  }
  await toolingPatchSobject(instanceUrl, sid, apiVersion, 'TraceFlag', id, patch);
  return {
    expirationIso: plan.expirationIso,
    startIso: plan.startIso || undefined,
    reactivated: !!plan.reactivated,
    cappedAtMax: plan.cappedAtMax
  };
}

/**
 * Valida ventana temporal de una traza USER_DEBUG.
 * @returns {'INVALID_RANGE'|'MAX_WINDOW'|null}
 */
export function validateUserDebugTraceDates({ startIso, expirationIso }) {
  if (!startIso || !expirationIso) return 'INVALID_RANGE';
  const startMs = new Date(startIso).getTime();
  const expMs = new Date(expirationIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(expMs) || expMs <= startMs) {
    return 'INVALID_RANGE';
  }
  if (expMs - startMs > USER_DEBUG_TRACE_MAX_WINDOW_MS) {
    return 'MAX_WINDOW';
  }
  return null;
}

/**
 * Actualiza DebugLevelId y fechas de un TraceFlag USER_DEBUG.
 * @returns {Promise<{ startIso: string, expirationIso: string, debugLevelId: string }>}
 */
export async function updateUserDebugTraceFlag(
  instanceUrl,
  sid,
  apiVersion,
  { traceFlagId, debugLevelId, startIso, expirationIso }
) {
  const id = String(traceFlagId || '').replace(/[^a-zA-Z0-9]/g, '');
  const dlId = String(debugLevelId || '').replace(/[^a-zA-Z0-9]/g, '');
  if (!id) throw new Error('Missing trace flag id');
  if (!dlId) throw new Error('Missing debug level id');
  const dateErr = validateUserDebugTraceDates({ startIso, expirationIso });
  if (dateErr === 'INVALID_RANGE') throw new Error('End date must be after start date');
  if (dateErr === 'MAX_WINDOW') throw new Error('Trace window cannot exceed 24 hours');
  const esc = escapeSoqlLiteral(id);
  const soql = `SELECT Id, LogType FROM TraceFlag WHERE Id = '${esc}' LIMIT 1`;
  let rows = [];
  try {
    rows = (await toolingQuery(instanceUrl, sid, apiVersion, soql)) || [];
  } catch {
    rows = (await restQuery(instanceUrl, sid, apiVersion, soql)) || [];
  }
  const row = rows[0];
  if (!row?.Id) throw new Error('Trace flag not found');
  if (String(row.LogType || '') !== 'USER_DEBUG') throw new Error('Not a USER_DEBUG trace');
  const startStr = toSfJsonUtcDateTime(startIso);
  const expStr = toSfJsonUtcDateTime(expirationIso);
  if (!startStr || !expStr) throw new Error('Invalid date range');
  await toolingPatchSobject(instanceUrl, sid, apiVersion, 'TraceFlag', id, {
    DebugLevelId: dlId,
    StartDate: startStr,
    ExpirationDate: expStr
  });
  return {
    startIso: new Date(startIso).toISOString(),
    expirationIso: new Date(expirationIso).toISOString(),
    debugLevelId: dlId
  };
}

export async function runTestsAsynchronous(instanceUrl, sid, apiVersion, body) {
  await restGate.acquire();
  const base = String(instanceUrl).replace(/\/$/, '');
  const url = `${base}/services/data/v${apiVersion}/tooling/runTestsAsynchronous`;
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${sid}`);
  headers.set('Accept', 'application/json');
  headers.set('Content-Type', 'application/json; charset=UTF-8');
  headers.set('sforce-call-options', 'client=devconsole');
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { message: text };
  }
  if (!res.ok) {
    const msg =
      (Array.isArray(json) && json[0] && json[0].message) ||
      json.message ||
      json.error ||
      text ||
      `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

/** Umbral conservador: REST GET pone el script en la query string (límite ~414). */
const ANONYMOUS_BODY_SOAP_CHAR_THRESHOLD = 4000;
const ANONYMOUS_BODY_SOAP_ENCODED_THRESHOLD = 6000;

function escapeXmlText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractSoapTagValue(xml, tagName) {
  try {
    const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const m = re.exec(xml || '');
    if (!m) return null;
    const openTag = (m[0].match(new RegExp(`<${tagName}[^>]*>`, 'i')) || [''])[0];
    if (/xsi:nil\s*=\s*["']true["']/i.test(openTag)) return null;
    return m[1] != null ? m[1].trim() : '';
  } catch {
    return null;
  }
}

function parseSoapBool(val) {
  if (val == null || val === '') return false;
  return String(val).toLowerCase() === 'true';
}

function parseSoapInt(val, fallback = -1) {
  if (val == null || val === '') return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Indica si el script debe enviarse por SOAP (POST) en lugar de REST GET.
 * @param {unknown} anonymousBody
 */
export function shouldUseSoapForAnonymousBody(anonymousBody) {
  const body = String(anonymousBody == null ? '' : anonymousBody);
  if (body.length >= ANONYMOUS_BODY_SOAP_CHAR_THRESHOLD) return true;
  if (encodeURIComponent(body).length >= ANONYMOUS_BODY_SOAP_ENCODED_THRESHOLD) return true;
  return false;
}

/**
 * Parsea la respuesta SOAP de executeAnonymous al shape REST de Tooling API.
 * @param {string} responseXml
 */
export function parseExecuteAnonymousSoapResponse(responseXml) {
  const xml = String(responseXml || '');
  if (/<faultcode/i.test(xml) || /<soapenv:Fault/i.test(xml) || /<Fault[\s>]/i.test(xml)) {
    const msg = extractSoapTagValue(xml, 'faultstring') || 'executeAnonymous SOAP fault';
    const err = new Error(msg);
    err.soapFault = true;
    throw err;
  }
  const resultBlock =
    extractSoapTagValue(xml, 'result') != null
      ? (() => {
          const re = /<result[^>]*>([\s\S]*?)<\/result>/i;
          const m = re.exec(xml);
          return m ? m[1] : xml;
        })()
      : xml;
  const compileProblem = extractSoapTagValue(resultBlock, 'compileProblem');
  const exceptionMessage = extractSoapTagValue(resultBlock, 'exceptionMessage');
  const exceptionStackTrace = extractSoapTagValue(resultBlock, 'exceptionStackTrace');
  return {
    line: parseSoapInt(extractSoapTagValue(resultBlock, 'line')),
    column: parseSoapInt(extractSoapTagValue(resultBlock, 'column')),
    compiled: parseSoapBool(extractSoapTagValue(resultBlock, 'compiled')),
    success: parseSoapBool(extractSoapTagValue(resultBlock, 'success')),
    compileProblem: compileProblem || null,
    exceptionMessage: exceptionMessage || null,
    exceptionStackTrace: exceptionStackTrace || null
  };
}

const APEX_SOAP_NS = 'http://soap.sforce.com/2006/08/apex';

/**
 * Construye el envelope SOAP para executeAnonymous (Apex API).
 * @param {string} sid
 * @param {string} body
 */
export function buildExecuteAnonymousSoapEnvelope(sid, body) {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `xmlns:xsd="http://www.w3.org/2001/XMLSchema" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xmlns="${APEX_SOAP_NS}">` +
    `<env:Header>` +
    `<SessionHeader>` +
    `<sessionId>${escapeXmlText(sid)}</sessionId>` +
    `</SessionHeader>` +
    `</env:Header>` +
    `<env:Body>` +
    `<executeAnonymous>` +
    `<String>${escapeXmlText(body)}</String>` +
    `</executeAnonymous>` +
    `</env:Body>` +
    `</env:Envelope>`
  );
}

function buildApexSoapEndpoint(instanceUrl, apiVersion, salesforceOrgId) {
  const base = String(instanceUrl).replace(/\/$/, '');
  const apiVer = Number(apiVersion) || 60;
  const orgId = String(salesforceOrgId || '')
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '');
  const orgSuffix = orgId ? `/${orgId}` : '';
  return `${base}/services/Soap/s/${apiVer.toFixed(1)}${orgSuffix}`;
}

async function executeAnonymousViaRest(instanceUrl, sid, apiVersion, body) {
  await restGate.acquire();
  const base = String(instanceUrl).replace(/\/$/, '');
  const url = `${base}/services/data/v${apiVersion}/tooling/executeAnonymous/?anonymousBody=${encodeURIComponent(body)}`;
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${sid}`);
  headers.set('Accept', 'application/json');
  const res = await fetch(url, { method: 'GET', headers });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { message: text };
  }
  if (!res.ok) {
    const msg =
      (Array.isArray(json) && json[0] && json[0].message) ||
      json.message ||
      json.error ||
      text ||
      `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function executeAnonymousViaSoap(instanceUrl, sid, apiVersion, body, salesforceOrgId) {
  await restGate.acquire();
  const url = buildApexSoapEndpoint(instanceUrl, apiVersion, salesforceOrgId);
  const envelope = buildExecuteAnonymousSoapEnvelope(sid, body);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=UTF-8',
      SOAPAction: '""'
    },
    body: envelope
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`executeAnonymous SOAP failed: HTTP ${res.status}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return parseExecuteAnonymousSoapResponse(text);
}

/**
 * Ejecuta Apex anónimo vía Tooling REST (scripts pequeños) o SOAP API (scripts grandes).
 * Devuelve el JSON de Salesforce (`compiled`, `success`, `compileProblem`, `exceptionMessage`, `exceptionStackTrace`, `logs`, etc).
 */
export async function executeAnonymous(
  instanceUrl,
  sid,
  apiVersion,
  anonymousBody,
  salesforceOrgId
) {
  const body = String(anonymousBody == null ? '' : anonymousBody);
  if (shouldUseSoapForAnonymousBody(body)) {
    return executeAnonymousViaSoap(instanceUrl, sid, apiVersion, body, salesforceOrgId);
  }
  return executeAnonymousViaRest(instanceUrl, sid, apiVersion, body);
}

