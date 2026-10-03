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
  const entities = { amp: '&', '#39': "'", quot: '"', lt: '<', gt: '>' };
  return s.replace(/&(amp|#39|quot|lt|gt);/gi, (match, name) => {
    return entities[String(name).toLowerCase()] ?? match;
  });
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
