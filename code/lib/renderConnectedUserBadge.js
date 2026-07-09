/**
 * Pinta en `el` la insignia del usuario Salesforce conectado a una org (visores independientes).
 */
import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import {
  buildConnectedUserTooltipText,
  hasConnectedUser
} from '../../shared/orgConnectedUserView.js';

const USER_ICON_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

/**
 * @param {HTMLElement | null} el
 * @param {string} orgId
 */
export async function renderConnectedUserBadge(el, orgId) {
  if (!el) return;
  const id = String(orgId || '').trim();
  if (!id) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  try {
    const res = await bg({ type: 'getOrgConnectedUser', orgId: id });
    const user = res?.ok ? res.user : null;
    if (!hasConnectedUser(user)) {
      el.hidden = true;
      el.innerHTML = '';
      el.removeAttribute('title');
      el.removeAttribute('aria-label');
      return;
    }
    el.innerHTML = USER_ICON_SVG;
    el.setAttribute('aria-label', t('apexLogViewer.connectedUser.badge'));
    el.title = buildConnectedUserTooltipText(user, t);
    el.hidden = false;
  } catch {
    el.hidden = true;
    el.innerHTML = '';
  }
}

/**
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
