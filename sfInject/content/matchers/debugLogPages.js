/**
 * Matchers de URL y IDs para Debug Logs (Setup).
 */

/** Setup → Debug Logs → home (Lightning / salesforce-setup.com). */
export const APEX_DEBUG_LOGS_HOME_RE = /\/lightning\/setup\/ApexDebugLogs\/home\/?$/i;

/**
 * Shell Lightning de Debug Logs: /home, /page (vistas filtradas) o la raíz del nodo.
 * Ej.: .../ApexDebugLogs/page?address=%2Fsetup%2Fui%2FlistApexTraces.apexp%3F...
 */
export const APEX_DEBUG_LOGS_SETUP_RE =
  /\/lightning\/setup\/ApexDebugLogs(?:\/(?:home|page)?)?\/?$/i;

/** Iframe Classic VF embebido en Debug Logs. */
export const APEX_DEBUG_LOGS_CLASSIC_FRAME_RE = /\/setup\/ui\/listApexTraces\.apexp$/i;

/**
 * @param {string | URL | undefined | null} url
 * @returns {URL | null}
 */
function toUrl(url) {
  if (!url) return null;
  try {
    return typeof url === 'string' ? new URL(url, 'https://example.com') : url;
  } catch {
    return null;
  }
}

/**
 * @param {string | URL | undefined | null} url
 * @returns {boolean}
 */
export function isApexDebugLogsHomePage(url) {
  const u = toUrl(url);
  return !!(u && APEX_DEBUG_LOGS_HOME_RE.test(u.pathname));
}

/**
 * Shell Lightning Setup de Debug Logs (home, page filtrada, etc.).
 * @param {string | URL | undefined | null} url
 * @returns {boolean}
 */
export function isApexDebugLogsSetupPage(url) {
  const u = toUrl(url);
  return !!(u && APEX_DEBUG_LOGS_SETUP_RE.test(u.pathname));
}

/**
 * Frame Classic de la lista de Debug Logs (Previous/Next + tabla).
 * @param {string | URL | undefined | null} url
 * @returns {boolean}
 */
export function isApexDebugLogsClassicFrame(url) {
  const u = toUrl(url);
  return !!(u && APEX_DEBUG_LOGS_CLASSIC_FRAME_RE.test(u.pathname));
}

/**
 * Página o frame donde las integraciones Debug Logs pueden actuar.
 * @param {string | URL | undefined | null} url
 * @returns {boolean}
 */
export function isApexDebugLogsInjectPage(url) {
  return isApexDebugLogsSetupPage(url) || isApexDebugLogsClassicFrame(url);
}

/**
 * Extrae Id de ApexLog (prefijo 07L) de texto o href.
 * @param {string} text
 * @returns {string | null}
 */
export function extractApexLogId(text) {
  const s = String(text || '');
  const q = s.match(/[?&](?:apexLogId|id|file)=(07L[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?)/i);
  if (q) return q[1];
  const m = s.match(/\b(07L[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?)\b/);
  return m ? m[1] : null;
}

/**
 * Valida un Id ApexLog (15 o 18 chars, prefijo 07L).
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeApexLogId(value) {
  return extractApexLogId(String(value || ''));
}
