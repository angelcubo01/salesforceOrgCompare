/**
 * Identificador aleatorio para claves de staging / almacenamiento local.
 * @param {string} [prefix]
 */
export function randomStagingId(prefix = '') {
  if (typeof crypto === 'undefined') {
    throw new Error('La Web Crypto API no está disponible para crear el identificador temporal.');
  }
  const uuid =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) => part.toString(16).padStart(8, '0')).join('');
  return `${prefix}${uuid.replace(/-/g, '')}`;
}
