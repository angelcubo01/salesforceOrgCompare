/**
 * Ids TraceFlag (USER_DEBUG) en páginas Setup.
 * Los href Classic van URL-encoded (p.ej. delTraceFlag%3D7tf...), sin word-boundary.
 */

const TRACE_FLAG_ID_RE = /7tf[a-zA-Z0-9]{12,15}/i;

/**
 * Decodifica %XX / entidades HTML típicas de href Classic.
 * @param {string} raw
 * @returns {string}
 */
export function decodeSalesforceHref(raw) {
  let s = String(raw || '');
  if (!s) return '';
  s = s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  for (let i = 0; i < 4; i += 1) {
    if (!/%[0-9a-fA-F]{2}/.test(s)) break;
    try {
      const next = decodeURIComponent(s.replace(/\+/g, ' '));
      if (next === s) break;
      s = next;
    } catch {
      break;
    }
  }
  return s;
}

/**
 * @param {string} raw
 * @returns {string | null} Id de 15 chars o null
 */
export function normalizeTraceFlagId(raw) {
  const decoded = decodeSalesforceHref(raw);
  const m = decoded.match(TRACE_FLAG_ID_RE) || String(raw || '').match(TRACE_FLAG_ID_RE);
  if (!m) return null;
  return m[0].slice(0, 15);
}
