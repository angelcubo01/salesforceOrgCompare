import { state } from '../core/state.js';
import { hasBundleTabLocalSave, hasTabLocalSave } from './codeEditorSession.js';

/**
 * @param {string | null | undefined} orgId
 * @returns {boolean}
 */
export function isOrgAuthActive(orgId) {
  if (!orgId) return false;
  return state.authStatuses[String(orgId)] === 'active';
}

/**
 * @param {{ sourceOrgId?: string | null, pendingRemoteLoad?: boolean }} tab
 * @returns {boolean}
 */
export function isTabOrgAuthExpired(tab) {
  const orgId = tab?.sourceOrgId;
  if (!orgId) return false;
  return !isOrgAuthActive(orgId);
}

/**
 * @param {{ sourceOrgId?: string | null, localSavedAt?: string | null, files?: Array<{ localSavedAt?: string | null }> }} tab
 * @param {'apex' | 'bundle'} [kind]
 * @returns {boolean}
 */
export function tabHasSfocLocalSave(tab, kind = 'apex') {
  if (!tab) return false;
  if (kind === 'bundle') return hasBundleTabLocalSave(tab);
  return hasTabLocalSave(tab);
}

/**
 * Sin sesión en la org y sin copia guardada en SFOC → no hay contenido que mostrar.
 * @param {{ sourceOrgId?: string | null, localSavedAt?: string | null, files?: Array<{ localSavedAt?: string | null }> }} tab
 * @param {'apex' | 'bundle'} [kind]
 * @returns {boolean}
 */
export function isTabContentBlockedByAuth(tab, kind = 'apex') {
  if (!isTabOrgAuthExpired(tab)) return false;
  return !tabHasSfocLocalSave(tab, kind);
}

/**
 * @param {{ sourceOrgId?: string | null, pendingRemoteLoad?: boolean }} tab
 * @returns {boolean}
 */
export function tabNeedsRemoteReload(tab) {
  return !!tab?.pendingRemoteLoad;
}

/**
 * @param {{ pendingRemoteLoad?: boolean }} tab
 * @param {boolean} pending
 */
export function setTabPendingRemoteLoad(tab, pending) {
  if (tab) tab.pendingRemoteLoad = pending;
}

/**
 * Marca pestañas como pendientes de carga remota cuando su org pasa a sesión activa.
 * @param {Record<string, string>} prevAuth
 * @param {Record<string, string>} nextAuth
 * @param {Array<{ sourceOrgId?: string | null, pendingRemoteLoad?: boolean }>} tabs
 */
export function markTabsPendingForRecoveredOrgs(prevAuth, nextAuth, tabs) {
  if (!Array.isArray(tabs) || !tabs.length) return;
  for (const [orgId, status] of Object.entries(nextAuth)) {
    if (status !== 'active' || prevAuth[orgId] === 'active') continue;
    for (const tab of tabs) {
      if (String(tab.sourceOrgId) === String(orgId)) {
        setTabPendingRemoteLoad(tab, true);
      }
    }
  }
}

/**
 * Tras refrescar auth de orgs conectadas, mantiene pendingRemoteLoad en pestañas sin sesión.
 * @param {Array<{ sourceOrgId?: string | null, pendingRemoteLoad?: boolean }>} tabs
 */
export function syncTabsPendingAfterAuthRefresh(tabs) {
  if (!Array.isArray(tabs)) return;
  for (const tab of tabs) {
    if (!tab?.sourceOrgId) continue;
    if (!isOrgAuthActive(tab.sourceOrgId) && !tabHasSfocLocalSave(tab, 'apex') && !tabHasSfocLocalSave(tab, 'bundle')) {
      setTabPendingRemoteLoad(tab, true);
    }
  }
}

/**
 * Tras cambio de sesión en orgs, recarga pestañas de editores que esperaban autenticación.
 * @param {Record<string, string>} [prevAuth] snapshot de auth antes del cambio (p. ej. reautenticación)
 */
export async function retryCodeEditorAuthPendingLoads(prevAuth = null) {
  const nextAuth = state.authStatuses;
  const [quickMod, lightningMod] = await Promise.all([
    import('../ui/quickEditPanel.js'),
    import('../ui/lightningQuickEditPanel.js')
  ]);
  if (prevAuth && Object.keys(prevAuth).length) {
    quickMod.markQuickEditTabsPendingForRecoveredOrgs?.(prevAuth, nextAuth);
    lightningMod.markLightningTabsPendingForRecoveredOrgs?.(prevAuth, nextAuth);
  }
  await quickMod.retryQuickEditAuthPendingLoads?.();
  await lightningMod.retryLightningQuickEditAuthPendingLoads?.();
}
