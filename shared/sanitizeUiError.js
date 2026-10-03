/** @param {unknown} value */
function stripHtmlTags(value) {
  const input = String(value ?? '');
  let output = '';
  let insideTag = false;
  for (const character of input) {
    if (character === '<') {
      insideTag = true;
      continue;
    }
    if (character === '>' && insideTag) {
      insideTag = false;
      continue;
    }
    if (!insideTag) output += character;
  }
  return output;
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
