/**
 * Cliente REST mínimo para Tooling / REST de Salesforce (sesión = sid en cabecera Bearer).
 * Limitador de concurrencia para no saturar la API en búsquedas rápidas.
 */

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

/** Convierte `nextRecordsUrl` de la API en path relativo para `restFetchWithSid`. */
function nextPathFromRecordsUrl(nextRecordsUrl) {
  if (nextRecordsUrl == null || nextRecordsUrl === '') return null;
  const next = String(nextRecordsUrl);
  return next.startsWith('http') ? new URL(next).pathname + new URL(next).search : next;
}

/**
 * Quita BOM y prefijos anti–JSON hijacking que a veces devuelve la API REST/Tooling.
 * @param {string} raw
 * @returns {string}
 */
function normalizeSalesforceRestErrorBodyText(raw) {
  let t = String(raw || '').trim();
  if (!t) return '';
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1).trim();
  // Prefijo típico en respuestas GET de Salesforce (array/objeto en JSON).
  if (t.startsWith(")]}'")) {
    const nl = t.indexOf('\n');
    t = (nl >= 0 ? t.slice(nl + 1) : t.slice(4)).trim();
  }
  if (t.startsWith('while(1);')) t = t.slice('while(1);'.length).trim();
  return t;
}

/** @param {unknown} parsed @param {string[]} msgs */
function collectSalesforceRestErrorMessages(parsed, msgs) {
  const pushMsg = (m) => {
    if (m == null) return;
    const s = String(m).trim();
    if (s) msgs.push(s);
  };

  /** @param {unknown} node */
  function walk(node) {
    if (node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== 'object') return;
    const o = /** @type {Record<string, unknown>} */ (node);
    const top =
      o.message != null
        ? o.message
        : o.Message != null
          ? o.Message
          : o.error && typeof o.error === 'object' && /** @type {Record<string, unknown>} */ (o.error).message != null
            ? /** @type {Record<string, unknown>} */ (o.error).message
            : null;
    if (top != null) pushMsg(top);
    if (Array.isArray(o.errors)) {
      for (const item of o.errors) walk(item);
    }
  }

  walk(parsed);
}

/**
 * Último recurso si `JSON.parse` falla: extrae valores de propiedades "message" en texto.
 * @param {string} t
 * @param {string[]} msgs
 */
function salesforceRestErrorMessagesRegexFallback(t, msgs) {
  const re = /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/gi;
  let m;
  while ((m = re.exec(t)) !== null) {
    try {
      msgs.push(JSON.parse(`"${m[1]}"`));
    } catch {
      msgs.push(m[1]);
    }
  }
}

/**
 * Solo textos `message` del cuerpo de error típico de Salesforce (array u objeto).
 * Si no hay JSON reconocible, devuelve el texto en bruto recortado.
 * @param {string} text
 * @returns {string}
 */
function salesforceRestErrorMessagesOnly(text) {
  const original = String(text || '').trim();
  if (!original) return '';
  const t = normalizeSalesforceRestErrorBodyText(original);

  /** @type {string[]} */
  const msgs = [];

  /** @param {string} s */
  function parsePayload(s) {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  let parsed = parsePayload(t);
  if (typeof parsed === 'string') {
    const inner = parsed.trim();
    if (inner.startsWith('[') || inner.startsWith('{')) {
      const again = parsePayload(inner);
      if (again != null) parsed = again;
    }
  }

  if (parsed != null) {
    collectSalesforceRestErrorMessages(parsed, msgs);
    if (msgs.length) return msgs.join('\n');
  }

  salesforceRestErrorMessagesRegexFallback(t, msgs);
  if (msgs.length) return msgs.join('\n');

  return t || original;
}

/**
 * Primer(es) error(es) Salesforce REST: mensaje(s) y código del primer ítem con errorCode.
 * @param {string} raw
 * @returns {{ message: string, errorCode: string }}
 */
function salesforceRestErrorStructuredFromText(raw) {
  const normalized = normalizeSalesforceRestErrorBodyText(String(raw || ''));
  /** @type {{ message: string, errorCode: string }} */
  const out = { message: '', errorCode: '' };
  if (!normalized) return out;
  /** @param {unknown} parsed */
  function fromParsed(parsed) {
    /** @type {{ message: string, code: string }[]} */
    const items = [];
    const pushItem = (msg, code) => {
      const m = String(msg || '').trim();
      if (!m) return;
      items.push({ message: m, code: code != null ? String(code) : '' });
    };
    if (Array.isArray(parsed)) {
      for (const it of parsed) {
        if (it && typeof it === 'object') {
          const o = /** @type {Record<string, unknown>} */ (it);
          if (o.message != null) pushItem(o.message, o.errorCode ?? o.ErrorCode);
        }
      }
    } else if (parsed && typeof parsed === 'object') {
      const o = /** @type {Record<string, unknown>} */ (parsed);
      if (o.message != null) pushItem(o.message, o.errorCode ?? o.ErrorCode);
      const errors = o.errors;
      if (Array.isArray(errors)) {
        for (const it of errors) {
          if (it && typeof it === 'object') {
            const eo = /** @type {Record<string, unknown>} */ (it);
            if (eo.message != null) pushItem(eo.message, eo.errorCode ?? eo.ErrorCode);
          }
        }
      }
    }
    if (!items.length) return;
    out.message = items.map((i) => i.message).join('\n\n');
    out.errorCode = items[0].code || '';
  }
  let parsed = null;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    out.message = normalized;
    return out;
  }
  fromParsed(parsed);
  if (!out.message) out.message = normalized;
  return out;
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
  const res = await restFetchWithSid(instanceUrl, sid, `/services/data`);
  if (!res.ok) {
    const err = new Error(`API /services/data: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const versions = await res.json();
  if (!Array.isArray(versions) || versions.length === 0) throw new Error('No API versions');
  return versions[versions.length - 1].version;
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

/** Máximo de subrequests por llamada a `/composite` (límite de la plataforma). */
const COMPOSITE_SUBREQUEST_LIMIT = 25;

/**
 * Ejecuta una petición Composite (varias operaciones REST en un solo HTTP round-trip).
 * @param {Array<{ method: string, url: string, referenceId: string, body?: unknown }>} compositeRequest
 */
async function restCompositeExecute(instanceUrl, sid, apiVersion, compositeRequest) {
  const path = `/services/data/v${apiVersion}/composite`;
  const res = await restFetchWithSid(instanceUrl, sid, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      allOrNone: false,
      compositeRequest
    })
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    const err = new Error(`REST composite: ${res.status} ${detail}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
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
        `SELECT Name FROM ApexClass ${q} ORDER BY Name LIMIT 50`
      );
      return rows.map(r => ({ type, name: r.Name }));
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
      const rows = await toolingQuery(instanceUrl, sid, apiVersion, `SELECT Id, DeveloperName FROM LightningComponentBundle ${q} ORDER BY DeveloperName LIMIT 50`);
      return rows.map(r => ({ type, id: r.Id, developerName: r.DeveloperName }));
    }
    case 'Aura': {
      const q = prefix ? `WHERE DeveloperName LIKE '%${like}%'` : '';
      const rows = await toolingQuery(instanceUrl, sid, apiVersion, `SELECT Id, DeveloperName FROM AuraDefinitionBundle ${q} ORDER BY DeveloperName LIMIT 50`);
      return rows.map(r => ({ type, id: r.Id, developerName: r.DeveloperName }));
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

async function resolveLwcBundleId(instanceUrl, sid, apiVersion, descriptor) {
  let bundleId = String(descriptor.bundleId || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 18);
  if ((!bundleId || bundleId.length === 0) && descriptor.bundleDeveloperName) {
    const name = escapeSoqlLiteral(descriptor.bundleDeveloperName);
    const rows = await toolingQuery(
      instanceUrl,
      sid,
      apiVersion,
      `SELECT Id FROM LightningComponentBundle WHERE DeveloperName = '${name}' LIMIT 1`
    );
    bundleId = String(rows[0]?.Id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 18);
  }
  return bundleId || '';
}

async function resolveAuraBundleId(instanceUrl, sid, apiVersion, descriptor) {
  let bundleId = String(descriptor.bundleId || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 18);
  if ((!bundleId || bundleId.length === 0) && descriptor.bundleDeveloperName) {
    const name = escapeSoqlLiteral(descriptor.bundleDeveloperName);
    const rows = await toolingQuery(
      instanceUrl,
      sid,
      apiVersion,
      `SELECT Id FROM AuraDefinitionBundle WHERE DeveloperName = '${name}' LIMIT 1`
    );
    bundleId = String(rows[0]?.Id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 18);
  }
  return bundleId || '';
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

/** Respuestas JSON de algunos servlets UI (p. ej. ApexTestQueueServlet) con anti-hijacking. */
export function stripLeadingWhileOneJson(text) {
  return String(text || '').replace(/^\s*while\s*\(\s*1\s*\)\s*;\s*/i, '').trim();
}

/**
 * Igual que la Developer Console: GET `ApexTestQueueServlet?action=STATUS`
 * (lista `apexTestJobs`: cola de pruebas con parentid = AsyncApexJob).
 */
export async function fetchApexTestQueueServletStatus(instanceUrl, sid) {
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
  if (!res.ok) {
    const err = new Error(`ApexTestQueueServlet STATUS: HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  let json;
  try {
    json = JSON.parse(stripLeadingWhileOneJson(text) || '{}');
  } catch (e) {
    const err = new Error('ApexTestQueueServlet: JSON inválido');
    err.cause = e;
    throw err;
  }
  return json;
}

/** Cuerpo de un ApexLog (texto plano) vía Tooling API. */
export async function fetchApexLogBody(instanceUrl, sid, apiVersion, logId) {
  await restGate.acquire();
  const id = String(logId || '').replace(/[^a-zA-Z0-9]/g, '');
  if (!id) throw new Error('ApexLog Id inválido');
  const base = String(instanceUrl).replace(/\/$/, '');
  const url = `${base}/services/data/v${apiVersion}/tooling/sobjects/ApexLog/${id}/Body`;
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${sid}`);
  headers.set('Accept', 'text/plain,*/*');
  let res = await fetch(url, { headers });
  if (!res.ok) {
    const restUrl = `${base}/services/data/v${apiVersion}/sobjects/ApexLog/${id}/Body`;
    res = await fetch(restUrl, { headers });
  }
  if (!res.ok) {
    const err = new Error(`ApexLog Body: HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return await res.text();
}

/**
 * Consulta `SELECT Id FROM ApexLog` (REST o Tooling) y borra los registros en lotes
 * vía Composite API (hasta 25 DELETE por petición HTTP). Si Composite falla en un lote,
 * ese lote se reintenta con DELETE individuales.
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
    const compositeRequest = chunk.map((id, j) => ({
      method: 'DELETE',
      referenceId: `apexlogDel_${j}`,
      url: `/services/data/v${apiVersion}/sobjects/ApexLog/${encodeURIComponent(id)}`
    }));
    try {
      const body = await restCompositeExecute(instanceUrl, sid, apiVersion, compositeRequest);
      const parts = Array.isArray(body?.compositeResponse) ? body.compositeResponse : [];
      for (const sub of parts) {
        const code = Number(sub?.httpStatusCode);
        if (code >= 200 && code < 300) deleted += 1;
        else failed += 1;
      }
      if (parts.length < chunk.length) {
        failed += chunk.length - parts.length;
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
  for (let i = 0; i < ids.length; i += COMPOSITE_SUBREQUEST_LIMIT) {
    const chunk = ids.slice(i, i + COMPOSITE_SUBREQUEST_LIMIT);
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
export async function queryApexLogsInWindow(instanceUrl, sid, apiVersion, sinceIso, untilIso, opts = {}) {
  const a = toSoqlUtcDateTimeLiteral(sinceIso);
  const b = toSoqlUtcDateTimeLiteral(untilIso);
  if (!a || !b) return [];
  const limit = Math.min(200, Math.max(10, Number(opts.limit) || 80));
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
    'Id, StartTime, Operation, LogLength, LogUserId, LogUser.Name, DurationMilliseconds, Location';
  const whereCore = `StartTime >= ${a} AND StartTime <= ${b}${userClause}${opClause}`;
  const orderLimit = ` ORDER BY StartTime ASC LIMIT ${limit}`;
  const soqlLocNoLike = `SELECT ${baseFields} FROM ApexLog WHERE ${whereCore}${orderLimit}`;
  const soqlWithLoc = `SELECT ${baseFields} FROM ApexLog WHERE ${whereCore}${likeClause}${orderLimit}`;
  const soqlNoLoc = `SELECT Id, StartTime, Operation, LogLength, LogUserId, LogUser.Name, DurationMilliseconds FROM ApexLog WHERE ${whereCore}${orderLimit}`;
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
 * Id de usuario de la sesión actual (Bearer) vía `/services/oauth2/userinfo`.
 */
export async function fetchSessionUserId(instanceUrl, sid) {
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
  if (json.user_id) return String(json.user_id).replace(/[^a-zA-Z0-9]/g, '');
  const sub = json.sub;
  if (typeof sub === 'string' && sub.includes('/')) {
    const last = sub.split('/').pop();
    return String(last || '').replace(/[^a-zA-Z0-9]/g, '');
  }
  throw new Error('userinfo: no user id');
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

/**
 * Ejecuta Apex anónimo vía Tooling API.
 * Devuelve el JSON de Salesforce (`compiled`, `success`, `compileProblem`, `exceptionMessage`, `exceptionStackTrace`, `logs`, etc).
 */
export async function executeAnonymous(instanceUrl, sid, apiVersion, anonymousBody) {
  await restGate.acquire();
  const base = String(instanceUrl).replace(/\/$/, '');
  const body = String(anonymousBody == null ? '' : anonymousBody);
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

