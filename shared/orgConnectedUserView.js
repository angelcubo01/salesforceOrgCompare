/**
 * Helpers puros de presentación del usuario Salesforce conectado en el selector de org.
 * Sin dependencias del DOM ni de chrome.* para poder testearlos aisladamente.
 */

/**
 * @typedef {object} ConnectedUser
 * @property {string} [username]
 * @property {string} [name]
 * @property {string} [companyName]
 * @property {string} [apiVersion]
 */

/**
 * ¿Hay usuario conectado con datos útiles?
 * @param {ConnectedUser | null | undefined} user
 * @returns {boolean}
 */
export function hasConnectedUser(user) {
  if (!user || typeof user !== 'object') return false;
  return !!(String(user.username || '').trim() || String(user.name || '').trim());
}

/**
 * Texto corto para la insignia de la barra del selector (prioriza el nombre).
 * @param {ConnectedUser | null | undefined} user
 * @returns {string}
 */
export function buildConnectedUserBadge(user) {
  if (!hasConnectedUser(user)) return '';
  const name = String(user.name || '').trim();
  const username = String(user.username || '').trim();
  return name || username;
}

/**
 * Líneas "Etiqueta: valor" para el tooltip (Usuario, Nombre, Empresa, Versión API).
 * @param {ConnectedUser | null | undefined} user
 * @param {(key: string) => string} t
 * @returns {{ label: string, value: string }[]}
 */
export function buildConnectedUserTooltipLines(user, t) {
  if (!hasConnectedUser(user)) return [];
  const tr = typeof t === 'function' ? t : (k) => k;
  const rows = [
    { label: tr('orgUser.user'), value: String(user.username || '').trim() },
    { label: tr('orgUser.name'), value: String(user.name || '').trim() },
    { label: tr('orgUser.company'), value: String(user.companyName || '').trim() },
    { label: tr('orgUser.apiVersion'), value: String(user.apiVersion || '').trim() }
  ];
  return rows.filter((r) => r.value);
}

/**
 * Tooltip en texto plano (una línea por campo). Útil para el atributo `title`.
 * @param {ConnectedUser | null | undefined} user
 * @param {(key: string) => string} t
 * @returns {string}
 */
export function buildConnectedUserTooltipText(user, t) {
  return buildConnectedUserTooltipLines(user, t)
    .map((r) => `${r.label}: ${r.value}`)
    .join('\n');
}
