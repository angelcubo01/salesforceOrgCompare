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

// Simple REST query helper (used for PermissionSet search)
export async function restQuery(instanceUrl, sid, apiVersion, soql) {
  const encoded = encodeURIComponent(soql);
  const res = await restFetchWithSid(instanceUrl, sid, `/services/data/v${apiVersion}/query?q=${encoded}`);
  if (!res.ok) {
    const err = new Error(`REST query failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  return body.records || [];
}

/** Igual que {@link restQuery} pero sigue todas las páginas (`nextRecordsUrl`). */
export async function restQueryAll(instanceUrl, sid, apiVersion, soql) {
  const encoded = encodeURIComponent(soql);
  let path = `/services/data/v${apiVersion}/query?q=${encoded}`;
  const all = [];
  for (let page = 0; page < 500; page++) {
    const res = await restFetchWithSid(instanceUrl, sid, path);
    if (!res.ok) {
      const err = new Error(`REST query failed: ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const body = await res.json();
    all.push(...(body.records || []));
    if (body.done || !body.nextRecordsUrl) break;
    const next = String(body.nextRecordsUrl);
    path = next.startsWith('http') ? new URL(next).pathname + new URL(next).search : next;
  }
  return all;
}

export async function toolingQuery(instanceUrl, sid, apiVersion, soql) {
  const encoded = encodeURIComponent(soql);
  const res = await restFetchWithSid(instanceUrl, sid, `/services/data/v${apiVersion}/tooling/query?q=${encoded}`);
  if (!res.ok) {
    const err = new Error(`Tooling query failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  return body.records || [];
}

/** Igual que {@link toolingQuery} pero pagina con `nextRecordsUrl`. */
export async function toolingQueryAll(instanceUrl, sid, apiVersion, soql) {
  const encoded = encodeURIComponent(soql);
  let path = `/services/data/v${apiVersion}/tooling/query?q=${encoded}`;
  const all = [];
  for (let page = 0; page < 500; page++) {
    const res = await restFetchWithSid(instanceUrl, sid, path);
    if (!res.ok) {
      const err = new Error(`Tooling query failed: ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const body = await res.json();
    all.push(...(body.records || []));
    if (body.done || !body.nextRecordsUrl) break;
    const next = String(body.nextRecordsUrl);
    path = next.startsWith('http') ? new URL(next).pathname + new URL(next).search : next;
  }
  return all;
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
 * @param {{ logUserId?: string, limit?: number }} [opts]
 */
export async function queryApexLogsInWindow(instanceUrl, sid, apiVersion, sinceIso, untilIso, opts = {}) {
  const a = toSoqlUtcDateTimeLiteral(sinceIso);
  const b = toSoqlUtcDateTimeLiteral(untilIso);
  if (!a || !b) return [];
  const limit = Math.min(200, Math.max(10, Number(opts.limit) || 80));
  const uid = String(opts.logUserId || '').replace(/[^a-zA-Z0-9]/g, '');
  const userClause = uid ? ` AND LogUserId = '${escapeSoqlLiteral(uid)}'` : '';
  const soql = `SELECT Id, StartTime, Operation, LogLength, LogUserId, DurationMilliseconds FROM ApexLog WHERE StartTime >= ${a} AND StartTime <= ${b}${userClause} ORDER BY StartTime ASC LIMIT ${limit}`;
  try {
    return (await toolingQuery(instanceUrl, sid, apiVersion, soql)) || [];
  } catch {
    try {
      return (await restQuery(instanceUrl, sid, apiVersion, soql)) || [];
    } catch {
      return [];
    }
  }
}

function parseLogTimeMs(d) {
  if (d == null) return null;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Elige el ApexLog más probable para una ejecución AsyncApexJob (tests).
 * Evita tomar el log más grande de la ventana (puede ser otra actividad del mismo usuario).
 */
export function pickBestApexLogForTestRun(logs, { createdById, createdMs, completedMs }) {
  if (!Array.isArray(logs) || !logs.length) return null;
  const id15 = (x) => (x == null ? '' : String(x).slice(0, 15));
  const cb = createdById ? id15(createdById) : '';

  const scoreOne = (l) => {
    let score = 0;
    const st = parseLogTimeMs(l.StartTime);
    const op = String(l.Operation || '');
    const len = Number(l.LogLength) || 0;

    if (cb && id15(l.LogUserId) === cb) score += 200;

    if (op === 'Batch Apex' || op === 'Api') score += 90;
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

  let best = logs[0];
  let bestS = scoreOne(best);
  for (let i = 1; i < logs.length; i++) {
    const s = scoreOne(logs[i]);
    if (s > bestS) {
      bestS = s;
      best = logs[i];
    }
  }
  return best;
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

