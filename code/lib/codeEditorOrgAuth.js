import { state } from '../core/state.js';

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
 * @param {{ sourceOrgId?: string | null, pendingRemoteLoad?: boolean }} tab
 * @returns {boolean}
 */
export function tabNeedsRemoteReload(tab) {
  return !!tab?.pendingRemoteLoad && isOrgAuthActive(tab.sourceOrgId);
}

/**
 * @param {{ pendingRemoteLoad?: boolean }} tab
 * @param {boolean} pending
 */
export function setTabPendingRemoteLoad(tab, pending) {
  if (tab) tab.pendingRemoteLoad = pending;
}

/** Tras cambio de sesión en orgs, recarga pestañas de editores que esperaban autenticación. */
export function retryCodeEditorAuthPendingLoads() {
  void import('../ui/quickEditPanel.js').then((m) => m.retryQuickEditAuthPendingLoads?.());
  void import('../ui/lightningQuickEditPanel.js').then((m) => m.retryLightningQuickEditAuthPendingLoads?.());
}
