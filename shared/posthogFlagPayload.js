/**
 * Utilidades para payloads de feature flags PostHog (incl. remote config cifrado).
 */

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isEncryptedPosthogPayload(value) {
  if (value == null) return false;
  if (typeof value === 'object' && !Array.isArray(value)) {
    const o = /** @type {Record<string, unknown>} */ (value);
    if (o.encrypted === true) return true;
    if (typeof o.ciphertext === 'string' && o.ciphertext.trim()) return true;
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return false;
    if (/\(encrypted\)/i.test(s)) return true;
    if (/^[\s*]+$/.test(s)) return true;
  }
  return false;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isUsableFeatureFlagPayload(value) {
  if (value == null) return false;
  if (isEncryptedPosthogPayload(value)) return false;
  if (typeof value === 'object' && !Array.isArray(value)) return true;
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s || isEncryptedPosthogPayload(s)) return false;
    try {
      const parsed = JSON.parse(s);
      return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Normaliza payload de flag (objeto o JSON string).
 * @param {unknown} value
 * @returns {unknown}
 */
export function normalizeFeatureFlagPayload(value) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}
