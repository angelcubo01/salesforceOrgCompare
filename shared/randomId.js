/**
 * Identificador aleatorio para claves de staging / almacenamiento local.
 * @param {string} [prefix]
 */
export function randomStagingId(prefix = '') {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 16)}`;
  return `${prefix}${uuid.replace(/-/g, '')}`;
}
