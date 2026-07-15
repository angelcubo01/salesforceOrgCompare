/** Whitelist for $exception context properties (no PII/secrets). */

const ALLOWED_KEYS = new Set([
  'error_handled',
  'error_category',
  'sfoc_reason_code',
  'reason',
  'sfoc_action',
  'handler',
  'tool_id',
  'kind',
  'sfoc_source',
  'ok',
  'success'
]);

const FORBIDDEN_SUBSTRINGS = ['token', 'password', 'secret', 'apikey', 'api_key', 'authorization', 'sid'];

/**
 * @param {Record<string, unknown>} [context]
 * @returns {Record<string, string | number | boolean>}
 */
export function sanitizeExceptionContext(context = {}) {
  /** @type {Record<string, string | number | boolean>} */
  const out = {};
  for (const [key, raw] of Object.entries(context || {})) {
    if (raw == null || raw === '') continue;
    const lower = key.toLowerCase();
    if (FORBIDDEN_SUBSTRINGS.some((s) => lower.includes(s))) continue;
    if (!ALLOWED_KEYS.has(key) && !key.startsWith('sfoc_')) continue;
    if (typeof raw === 'boolean') out[key] = raw;
    else if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = raw;
    else if (typeof raw === 'string') out[key] = raw.slice(0, 256);
  }
  return out;
}
