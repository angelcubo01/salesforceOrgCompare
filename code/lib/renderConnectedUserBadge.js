/**
 * Pinta en `el` la insignia del usuario Salesforce conectado a una org (visores independientes).
 * El tooltip (atributo title) muestra Usuario / Nombre / Empresa / versión API.
 */
import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import {
  buildConnectedUserTooltipText,
  hasConnectedUser
} from '../../shared/orgConnectedUserView.js';

/**
 * @param {HTMLElement | null} el
 * @param {string} orgId
 */
export async function renderConnectedUserBadge(el, orgId) {
  if (!el) return;
  const id = String(orgId || '').trim();
  if (!id) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  try {
    const res = await bg({ type: 'getOrgConnectedUser', orgId: id });
    const user = res?.ok ? res.user : null;
    if (!hasConnectedUser(user)) {
      el.hidden = true;
      el.textContent = '';
      el.removeAttribute('title');
      return;
    }
    el.textContent = 'i';
    el.setAttribute('aria-label', 'info');
    el.title = buildConnectedUserTooltipText(user, t);
    el.hidden = false;
  } catch {
    el.hidden = true;
    el.textContent = '';
  }
}

/**
 * Solo actualiza el atributo `title` (tooltip nativo) de `el` con la info del usuario
 * conectado, sin cambiar su texto. Útil para badges que ya muestran otra etiqueta.
 * @param {HTMLElement | null} el
 * @param {string} orgId
 */
export async function applyConnectedUserTitle(el, orgId) {
  if (!el) return;
  const id = String(orgId || '').trim();
  if (!id) return;
  try {
    const res = await bg({ type: 'getOrgConnectedUser', orgId: id });
    const user = res?.ok ? res.user : null;
    const text = buildConnectedUserTooltipText(user, t);
    if (text) el.title = text;
  } catch {
    /* ignore */
  }
}
