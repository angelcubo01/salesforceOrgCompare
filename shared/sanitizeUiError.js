/** @param {unknown} value */
function stripHtmlTags(value) {
  return String(value ?? '').replace(/<[^>]*>/g, '');
}

/**
 * Sanitiza mensajes de error para UI (toasts, innerHTML de errores).
 * Elimina HTML, colapsa espacios y trunca sin perder códigos SF legibles.
 * @param {unknown} value
 * @param {{ maxLength?: number }} [opts]
 * @returns {string}
 */
export function sanitizeUiError(value, opts = {}) {
  const maxLength = opts.maxLength ?? 300;
  let s = stripHtmlTags(value).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length > maxLength) {
    s = `${s.slice(0, maxLength - 1)}…`;
  }
  return s;
}
