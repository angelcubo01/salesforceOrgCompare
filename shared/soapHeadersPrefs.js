export const SOAP_HEADERS_STORAGE_KEY = 'sfocSoapHeadersByOrgId';

/**
 * @param {unknown} raw
 * @returns {Record<string, Record<string, string>>}
 */
export function normalizeSoapHeadersMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  /** @type {Record<string, Record<string, string>>} */
  const out = {};
  for (const [orgId, headers] of Object.entries(raw)) {
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) continue;
    /** @type {Record<string, string>} */
    const row = {};
    for (const [k, v] of Object.entries(headers)) {
      if (v == null) continue;
      row[String(k)] = String(v);
    }
    out[String(orgId)] = row;
  }
  return out;
}

/**
 * @param {Record<string, Record<string, string>>} map
 * @param {string} orgId
 */
export function getSoapHeadersForOrg(map, orgId) {
  const id = String(orgId || '');
  if (!id || !map || typeof map !== 'object') return {};
  const row = map[id];
  return row && typeof row === 'object' ? { ...row } : {};
}

/**
 * @param {string} rawJson
 * @returns {{ ok: true, headers: Record<string, string> } | { ok: false, error: string }}
 */
export function parseSoapHeadersJson(rawJson) {
  const text = String(rawJson || '').trim();
  if (!text) return { ok: true, headers: {} };
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Headers must be a JSON object' };
    }
    /** @type {Record<string, string>} */
    const headers = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v == null) continue;
      headers[String(k)] = String(v);
    }
    return { ok: true, headers };
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
}
