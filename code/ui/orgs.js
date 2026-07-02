import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { option } from '../core/persistence.js';
import { t } from '../../shared/i18n.js';
import { buildOrgPicklistLabel } from '../../shared/orgPrefs.js';
import { getFileKey } from '../lib/itemLabels.js';
import { saveScrollPosition } from './scrollRestore.js';
import { syncCompareUrlFromState } from '../lib/compareDeepLink.js';
import { showToast } from './toast.js';
import { syncPosthogSfUserContext } from '../../shared/posthogClient.js';

/** Evita sincronizaciones duplicadas al abrir el desplegable (focus + mousedown). */
let syncOrgsInFlight = null;

/** Tras el primer relleno de desplegables, no reasignar org por defecto si el usuario eligió None. */
let orgSelectDefaultsApplied = false;

/** Org derecha guardada al ocultar el selector en herramientas mono-org; se restaura al volver al comparador. */
let pausedRightOrgId = null;

/** @param {(className: string) => boolean} hasClass */
export function isSingleOrgToolActiveFromBody(hasClass) {
  if (hasClass('artifact-environment-status')) return true;
  if (hasClass('artifact-deploy-status')) return true;
  if (hasClass('artifact-apex-tests')) return true;
  if (hasClass('artifact-quick-edit')) return true;
  if (hasClass('artifact-lightning-quick-edit')) return true;
  if (hasClass('artifact-debug-log-browser')) return true;
  if (hasClass('artifact-setup-audit-trail')) return true;
  if (hasClass('artifact-field-history')) return true;
  if (hasClass('artifact-generate-package-xml') && !hasClass('artifact-generate-package-xml-compare')) {
    return true;
  }
  if (hasClass('artifact-org-limits') && !hasClass('artifact-org-limits-compare')) return true;
  if (hasClass('artifact-permission-diff') && !hasClass('artifact-permission-diff-compare')) {
    return true;
  }
  if (hasClass('artifact-anonymous-apex') && !hasClass('artifact-anonymous-apex-compare')) return true;
  if (hasClass('artifact-query-explorer') && !hasClass('artifact-query-explorer-compare')) return true;
  if (hasClass('artifact-dependency-explorer') && !hasClass('artifact-dependency-explorer-compare')) {
    return true;
  }
  if (hasClass('artifact-record-compare') && !hasClass('artifact-record-compare-compare')) return true;
  return false;
}

/** Herramientas que solo usan la org izquierda (sin intercambio). */
export function isSingleOrgToolActive() {
  return isSingleOrgToolActiveFromBody((className) => document.body.classList.contains(className));
}

/** @param {(className: string) => boolean} hasClass */
export function isDualOrgUiActiveFromBody(hasClass) {
  if (isSingleOrgToolActiveFromBody(hasClass)) return false;
  if (hasClass('artifact-field-dependency')) return true;
  if (hasClass('artifact-apex-coverage-compare')) return true;
  if (hasClass('artifact-custom-settings-compare')) return true;
  if (hasClass('artifact-custom-metadata-compare')) return true;
  if (hasClass('artifact-metadata-type-compare')) return true;
  if (hasClass('artifact-generate-package-xml-compare')) return true;
  if (hasClass('artifact-anonymous-apex-compare')) return true;
  if (hasClass('artifact-query-explorer-compare')) return true;
  if (hasClass('artifact-org-limits-compare')) return true;
  if (hasClass('artifact-permission-diff-compare')) return true;
  if (hasClass('artifact-dependency-explorer-compare')) return true;
  if (hasClass('artifact-record-compare-compare')) return true;
  return false;
}

/** Herramientas / modos que usan org izquierda y derecha a la vez. */
export function isDualOrgUiActive() {
  const dualFromBody = isDualOrgUiActiveFromBody((className) =>
    document.body.classList.contains(className)
  );
  if (dualFromBody) return true;
  return state.appNavMode === 'comparator';
}

/**
 * Resuelve la org derecha tras refrescar la lista (exportado para tests).
 * @param {string | null | undefined} prevRight
 * @param {{ id: string }[]} orgs
 * @param {boolean} defaultsApplied
 * @returns {string | null}
 */
export function pickRightOrgSelection(prevRight, orgs, defaultsApplied) {
  const rightValid = prevRight && orgs.some((o) => o.id === prevRight);
  if (rightValid) return prevRight;
  if (!prevRight && orgs.length >= 2 && !defaultsApplied) return orgs[1].id;
  return prevRight || null;
}

/**
 * @param {string | null | undefined} prevLeft
 * @param {{ id: string }[]} orgs
 * @param {boolean} defaultsApplied
 * @returns {string | null}
 */
export function pickLeftOrgSelection(prevLeft, orgs, defaultsApplied) {
  const leftValid = prevLeft && orgs.some((o) => o.id === prevLeft);
  if (leftValid) return prevLeft;
  if (!prevLeft && orgs.length > 0 && !defaultsApplied) return orgs[0].id;
  return prevLeft || null;
}

/**
 * Rellena los desplegables de org conservando la selección actual si sigue existiendo.
 * @param {import('../core/state.js').state.orgsList} orgs
 * @param {Record<string, string>} aliases
 * @param {Record<string, string>} groups
 */
function populateOrgSelects(orgs, aliases, groups) {
  state.orgsList = orgs;
  const left = document.getElementById('leftOrg');
  const right = document.getElementById('rightOrg');
  if (!left || !right) return;

  const prevLeft = state.leftOrgId;
  const prevRight = state.rightOrgId;

  left.innerHTML = '';
  right.innerHTML = '';
  left.appendChild(option('', t('orgs.none')));
  right.appendChild(option('', t('orgs.none')));

  const extrasForLabel = { aliases, groups };
  for (const o of orgs) {
    const label = buildOrgPicklistLabel(o, extrasForLabel);
    left.appendChild(option(o.id, label));
    right.appendChild(option(o.id, label));
  }

  state.leftOrgId = pickLeftOrgSelection(prevLeft, orgs, orgSelectDefaultsApplied);
  left.value = state.leftOrgId || '';

  state.rightOrgId = pickRightOrgSelection(prevRight, orgs, orgSelectDefaultsApplied);
  right.value = state.rightOrgId || '';

  if (!isDualOrgUiActive()) {
    stashAndClearRightOrg();
  }

  orgSelectDefaultsApplied = true;

  ensureRightOrgDistinctFromLeft();
  syncTelemetryUserFromOrgState();
}

/**
 * Guarda la org derecha actual y la limpia (herramientas que solo usan org izquierda).
 */
export function stashAndClearRightOrg() {
  if (state.rightOrgId) {
    pausedRightOrgId = state.rightOrgId;
  }
  state.rightOrgId = null;
  const right = document.getElementById('rightOrg');
  if (right) right.value = '';
}

/**
 * Restaura la org derecha guardada si el comparador vuelve a modo dual.
 * @returns {boolean} true si se restauró la selección
 */
export function restorePausedRightOrgIfDualMode() {
  if (state.rightOrgId || !pausedRightOrgId) {
    pausedRightOrgId = null;
    return false;
  }
  if (!isDualOrgUiActive()) {
    return false;
  }

  const orgs = state.orgsList || [];
  if (!orgs.some((o) => o.id === pausedRightOrgId)) {
    pausedRightOrgId = null;
    return false;
  }

  state.rightOrgId = pausedRightOrgId;
  pausedRightOrgId = null;
  const right = document.getElementById('rightOrg');
  if (right) right.value = state.rightOrgId;
  ensureRightOrgDistinctFromLeft();
  return true;
}

/** Sincroniza usuario Salesforce en PostHog al cambiar orgs (telemetría activa). */
export function syncTelemetryUserFromOrgState() {
  void syncPosthogSfUserContext({
    rightOrgId: state.rightOrgId,
    leftOrgId: state.leftOrgId
  });
}

export async function loadSavedOrgs() {
  const [res, auth, extras] = await Promise.all([
    bg({ type: 'listSavedOrgs' }),
    bg({ type: 'auth:getStatuses' }),
    chrome.storage.sync.get(['orgAliases', 'orgGroups'])
  ]);
  state.authStatuses = auth.ok ? (auth.statuses || {}) : {};
  lastAuthStatusesSnapshot = { ...state.authStatuses };
  const orgs = res.ok ? (res.orgs || []) : [];
  populateOrgSelects(orgs, extras.orgAliases || {}, extras.orgGroups || {});
  updateAuthIndicators();
  updateOrgSwapButtonState();
}

/**
 * Al abrir un desplegable de org: detecta la pestaña Salesforce activa, añade la org si es nueva
 * y actualiza la lista sin recargar la aplicación.
 */
export async function syncOrgsWhenOpeningSelector() {
  if (syncOrgsInFlight) return syncOrgsInFlight;
  syncOrgsInFlight = (async () => {
    try {
      const [res, extras] = await Promise.all([
        bg({ type: 'syncOrgsFromActiveTab' }),
        chrome.storage.sync.get(['orgAliases', 'orgGroups'])
      ]);
      if (!res?.ok) return;
      state.authStatuses = res.statuses || {};
      const orgs = res.orgs || [];
      const aliases = extras.orgAliases || {};
      const groups = extras.orgGroups || {};
      populateOrgSelects(orgs, aliases, groups);
      updateAuthIndicators();
      updateOrgSwapButtonState();
      if (res.addedOrg) {
        const name = buildOrgPicklistLabel(res.addedOrg, { aliases, groups });
        showToast(t('orgs.autoAdded', { name }), 'info', { bypassCooldown: true });
      }
    } catch {
      /* ignore */
    } finally {
      syncOrgsInFlight = null;
    }
  })();
  return syncOrgsInFlight;
}

/** focus/mousedown en desplegables de org → sincronizar lista y org detectada en pestaña activa. */
export function setupOrgSelectorAutoSync() {
  for (const id of ['leftOrg', 'rightOrg']) {
    const select = document.getElementById(id);
    if (!select) continue;
    const run = () => {
      void syncOrgsWhenOpeningSelector();
    };
    select.addEventListener('focus', run);
    select.addEventListener('mousedown', run);
  }
}

/** Si izquierda y derecha son la misma org con ≥2 guardadas, asigna a la derecha otra distinta (p. ej. tras ?orgId=). */
export function ensureRightOrgDistinctFromLeft() {
  const orgs = state.orgsList || [];
  const right = document.getElementById('rightOrg');
  if (orgs.length < 2 || !state.leftOrgId || !state.rightOrgId) return;
  if (String(state.leftOrgId) !== String(state.rightOrgId)) return;
  const other = orgs.find((o) => String(o.id) !== String(state.leftOrgId));
  if (!other) return;
  state.rightOrgId = other.id;
  if (right) right.value = state.rightOrgId;
  updateAuthIndicators();
}

export function updateOrgDropdownLayout() {
  const leftDropdown = document.querySelector('.org-dropdown-left');
  const rightDropdown = document.querySelector('.org-dropdown-right');
  if (!leftDropdown || !rightDropdown) return;

  if (document.body.classList.contains('artifact-environment-status')) {
    leftDropdown.classList.add('hidden');
    rightDropdown.classList.add('hidden');
    updateOrgSwapButtonState();
    return;
  }

  leftDropdown.classList.remove('hidden');

  if (
    (document.body.classList.contains('artifact-generate-package-xml') &&
      !document.body.classList.contains('artifact-generate-package-xml-compare')) ||
    document.body.classList.contains('artifact-apex-tests') ||
    document.body.classList.contains('artifact-quick-edit') ||
    document.body.classList.contains('artifact-lightning-quick-edit') ||
    document.body.classList.contains('artifact-debug-log-browser') ||
    document.body.classList.contains('artifact-setup-audit-trail') ||
    document.body.classList.contains('artifact-field-history')
  ) {
    rightDropdown.classList.add('hidden');
    leftDropdown.classList.add('single-mode');
    updateOrgSwapButtonState();
    return;
  }
  if (
    document.body.classList.contains('artifact-org-limits') &&
    !document.body.classList.contains('artifact-org-limits-compare')
  ) {
    rightDropdown.classList.add('hidden');
    leftDropdown.classList.add('single-mode');
    updateOrgSwapButtonState();
    return;
  }
  if (document.body.classList.contains('artifact-deploy-status')) {
    rightDropdown.classList.add('hidden');
    leftDropdown.classList.add('single-mode');
    updateOrgSwapButtonState();
    return;
  }
  if (
    document.body.classList.contains('artifact-permission-diff') &&
    !document.body.classList.contains('artifact-permission-diff-compare')
  ) {
    rightDropdown.classList.add('hidden');
    leftDropdown.classList.add('single-mode');
    updateOrgSwapButtonState();
    return;
  }
  if (
    document.body.classList.contains('artifact-anonymous-apex') &&
    !document.body.classList.contains('artifact-anonymous-apex-compare')
  ) {
    rightDropdown.classList.add('hidden');
    leftDropdown.classList.add('single-mode');
    updateOrgSwapButtonState();
    return;
  }
  if (
    document.body.classList.contains('artifact-query-explorer') &&
    !document.body.classList.contains('artifact-query-explorer-compare')
  ) {
    rightDropdown.classList.add('hidden');
    leftDropdown.classList.add('single-mode');
    updateOrgSwapButtonState();
    return;
  }
  if (document.body.classList.contains('artifact-field-dependency')) {
    rightDropdown.classList.remove('hidden');
    leftDropdown.classList.remove('single-mode');
    updateOrgSwapButtonState();
    return;
  }
  if (
    document.body.classList.contains('artifact-dependency-explorer') &&
    !document.body.classList.contains('artifact-dependency-explorer-compare')
  ) {
    rightDropdown.classList.add('hidden');
    leftDropdown.classList.add('single-mode');
    updateOrgSwapButtonState();
    return;
  }
  if (document.body.classList.contains('artifact-apex-coverage-compare')) {
    rightDropdown.classList.remove('hidden');
    leftDropdown.classList.remove('single-mode');
    updateOrgSwapButtonState();
    return;
  }
  if (
    document.body.classList.contains('artifact-record-compare') &&
    document.body.classList.contains('artifact-record-compare-compare')
  ) {
    rightDropdown.classList.remove('hidden');
    leftDropdown.classList.remove('single-mode');
    updateOrgSwapButtonState();
    return;
  }
  if (
    document.body.classList.contains('artifact-record-compare') &&
    !document.body.classList.contains('artifact-record-compare-compare')
  ) {
    rightDropdown.classList.add('hidden');
    leftDropdown.classList.add('single-mode');
    updateOrgSwapButtonState();
    return;
  }
  rightDropdown.classList.remove('hidden');

  if (!state.rightOrgId) {
    // Single org mode - left dropdown takes 2/3 width; right dropdown stays visible
    leftDropdown.classList.add('single-mode');
    rightDropdown.classList.remove('hidden');
  } else {
    // Dual org mode - both dropdowns visible with 50-50 split
    leftDropdown.classList.remove('single-mode');
    rightDropdown.classList.remove('hidden');
  }
  updateOrgSwapButtonState();
}

function migrateScrollPositionsOnSwap(item, prevLeftOrgId, prevRightOrgId) {
  if (!item || !prevLeftOrgId || !prevRightOrgId) return;
  const oldKey = getFileKey(item, prevLeftOrgId, prevRightOrgId);
  const newKey = getFileKey(item, prevRightOrgId, prevLeftOrgId);
  const pos = state.scrollPositions[oldKey];
  if (!pos) return;
  if (pos.original !== undefined && pos.modified !== undefined) {
    state.scrollPositions[newKey] = { original: pos.modified, modified: pos.original };
  } else if (pos.single !== undefined) {
    state.scrollPositions[newKey] = { single: pos.single };
  }
  delete state.scrollPositions[oldKey];
}

/** Intercambia org izquierda/derecha y el contenido del diff Monaco. */
export async function swapOrgs() {
  if (!state.leftOrgId || !state.rightOrgId) return;

  const leftSelect = document.getElementById('leftOrg');
  const rightSelect = document.getElementById('rightOrg');
  if (!leftSelect || !rightSelect) return;

  const prevLeft = state.leftOrgId;
  const prevRight = state.rightOrgId;

  if (state.selectedItem) {
    saveScrollPosition(state.selectedItem, prevLeft, prevRight);
    migrateScrollPositionsOnSwap(state.selectedItem, prevLeft, prevRight);
  }

  state.leftOrgId = prevRight;
  state.rightOrgId = prevLeft;
  leftSelect.value = state.leftOrgId || '';
  rightSelect.value = state.rightOrgId || '';

  const tmpCache = state.cachedLeft;
  state.cachedLeft = state.cachedRight;
  state.cachedRight = tmpCache;

  const tmpLeftContent = state.lastLeftContent;
  state.lastLeftContent = state.lastRightContent;
  state.lastRightContent = tmpLeftContent;

  for (const pk of Object.keys(state.packageRetrieveZipCache)) {
    const c = state.packageRetrieveZipCache[pk];
    if (c && c.leftByPath && c.rightByPath) {
      const tmpPaths = c.leftByPath;
      c.leftByPath = c.rightByPath;
      c.rightByPath = tmpPaths;
    }
  }

  updateOrgDropdownLayout();
  updateAuthIndicators();
  syncTelemetryUserFromOrgState();
  syncCompareUrlFromState(state, { method: 'push' });

  const { hideSidebarSearchResults } = await import('./searchSetup.js');
  hideSidebarSearchResults();

  swapViewerChunkState();

  const { renderEditor } = await import('../editor/editorRender.js');
  await renderEditor({
    orgSwap: true,
    prevLeftOrgId: prevLeft,
    prevRightOrgId: prevRight
  });
}

/** Intercambia textos completos en el estado de fragmentos del visor (sin nuevo retrieve). */
function swapViewerChunkState() {
  const vc = state.viewerChunk;
  if (!vc) return;
  if (vc.mode === 'diffAligned') {
    const tmpFull = vc.leftFull;
    vc.leftFull = vc.rightFull;
    vc.rightFull = tmpFull;
    const tmpName = vc.lFileName;
    vc.lFileName = vc.rFileName;
    vc.rFileName = tmpName;
  } else if (vc.mode === 'diffParallel') {
    const tmpFull = vc.fullLeft;
    vc.fullLeft = vc.fullRight;
    vc.fullRight = tmpFull;
    const tmpName = vc.lFileName;
    vc.lFileName = vc.rFileName;
    vc.rFileName = tmpName;
  }
}

export function updateOrgSwapButtonState() {
  const btn = document.getElementById('swapOrgsBtn');
  if (!btn) return;
  const rightDropdown = document.querySelector('.org-dropdown-right');
  const rightHidden =
    rightDropdown?.classList.contains('hidden') || isSingleOrgToolActive();
  const editor = document.getElementById('editorContainer');
  const locked = editor?.classList.contains('org-selectors-locked');
  const canSwap =
    isDualOrgUiActive() &&
    !!state.leftOrgId &&
    !!state.rightOrgId &&
    !rightHidden &&
    !locked;
  btn.classList.toggle('hidden', !canSwap);
  btn.disabled = !canSwap;
}

/** @type {Record<string, string>} */
let lastAuthStatusesSnapshot = {};

/**
 * @param {Record<string, string>} prev
 * @param {Record<string, string>} next
 */
function didAuthStatusRecover(prev, next) {
  if (!Object.keys(prev).length) return false;
  for (const [orgId, status] of Object.entries(next)) {
    if (status === 'active' && prev[orgId] !== 'active') return true;
  }
  return false;
}

export function updateAuthIndicators() {
  const leftReauth = document.getElementById('leftReauthBtn');
  const rightReauth = document.getElementById('rightReauthBtn');
  const leftSelect = document.getElementById('leftOrg');
  const rightSelect = document.getElementById('rightOrg');

  const leftStatus = state.leftOrgId ? (state.authStatuses[state.leftOrgId] || 'expired') : null;
  const rightStatus = state.rightOrgId ? (state.authStatuses[state.rightOrgId] || 'expired') : null;
  const prevAuthSnapshot = { ...lastAuthStatusesSnapshot };
  const authRecovered = didAuthStatusRecover(prevAuthSnapshot, state.authStatuses);
  lastAuthStatusesSnapshot = { ...state.authStatuses };

  // Left
  if (leftStatus) {
    leftSelect.classList.remove('auth-active', 'auth-expired');
    leftSelect.classList.add(leftStatus === 'active' ? 'auth-active' : 'auth-expired');
    if (leftStatus === 'expired') leftReauth.classList.remove('hidden');
    else leftReauth.classList.add('hidden');
  } else {
    leftSelect.classList.remove('auth-active', 'auth-expired');
    leftReauth.classList.add('hidden');
  }

  // Right
  if (rightStatus) {
    rightSelect.classList.remove('auth-active', 'auth-expired');
    rightSelect.classList.add(rightStatus === 'active' ? 'auth-active' : 'auth-expired');
    if (rightStatus === 'expired') rightReauth.classList.remove('hidden');
    else rightReauth.classList.add('hidden');
  } else {
    rightSelect.classList.remove('auth-active', 'auth-expired');
    rightReauth.classList.add('hidden');
  }
  updateOrgSwapButtonState();
  if (authRecovered) {
    void import('../lib/codeEditorOrgAuth.js').then((m) =>
      m.retryCodeEditorAuthPendingLoads(prevAuthSnapshot)
    );
  }
}

export async function refreshAuthStatuses(force = false) {
  const auth = await bg({ type: 'auth:getStatuses', force });
  state.authStatuses = auth.ok ? (auth.statuses || {}) : {};
  updateAuthIndicators();
}

/** Tras abrir login de Salesforce, sondea hasta detectar sesión activa. */
export async function pollAuthAfterReauth(orgId) {
  if (!orgId) return;
  const prevBeforePoll = { ...lastAuthStatusesSnapshot };
  for (let attempt = 0; attempt < 12; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 2000 : 3000));
    await refreshAuthStatuses(true);
    if (state.authStatuses[orgId] === 'active') {
      await import('../lib/codeEditorOrgAuth.js').then((m) =>
        m.retryCodeEditorAuthPendingLoads(prevBeforePoll)
      );
      return;
    }
  }
}
