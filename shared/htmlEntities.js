/**
 * Decodifica entidades HTML/XML que han llegado como texto literal desde una API.
 * El consumidor debe seguir escapando el resultado antes de interpolarlo en HTML.
 *
 * @param {unknown} value
 */
export function decodeHtmlEntities(value) {
  const named = { amp: '&', apos: "'", quot: '"', lt: '<', gt: '>', nbsp: '\u00a0' };
  let text = String(value ?? '');
  // Salesforce puede devolver entidades doblemente escapadas (&amp;apos;).
  for (let pass = 0; pass < 3; pass += 1) {
    const decoded = text.replace(/&(#x[\da-f]+|#\d+|amp|apos|quot|lt|gt|nbsp);/gi, (entity, token) => {
      const lower = token.toLowerCase();
      if (lower in named) return named[lower];
      const radix = lower.startsWith('#x') ? 16 : 10;
      const codePoint = Number.parseInt(lower.slice(radix === 16 ? 2 : 1), radix);
      if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return entity;
      try { return String.fromCodePoint(codePoint); } catch { return entity; }
    });
    if (decoded === text) break;
    text = decoded;
  }
  return text;
}
