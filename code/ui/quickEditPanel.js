import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { loadMonaco, resolveMonacoThemeId, createStandaloneEditorSafe } from '../editor/monaco.js';
import { MonacoWorkbench } from '../editor/monacoWorkbench.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { t } from '../../shared/i18n.js';
import { showToast } from './toast.js';
import { handleToolError, handleToolResponseFailure } from '../../shared/reportToolError.js';
import { guardToolAction } from './featureControlsUi.js';
import {
  formatMetadataApiVersion,
  buildDeployApiVersionWindow,
  clampApiVersion,
  isApiVersionInRange
} from '../../shared/metadataApiVersion.js';
import {
  saveApexDraft,
  clearReturnContext,
  getReturnContext,
  navigateToDeployStatus
} from '../lib/quickEditDeployContext.js';
import { setupCodeEditorSearch } from './codeEditorSearch.js';
import { renderVscodeTabBar } from './vscodeTabs.js';
import { updateCodeEditorToolbarDisplay, findCodeEditorTabByArtifact, formatCodeEditorTabLabel, getOrgDisplayLabel, applyQuickEditLocalEditActionsVisibility, resolveCodeEditorLocalSavedAt } from './codeEditorToolbar.js';
import {
  isTabOrgAuthExpired,
  isOrgAuthActive,
  isTabContentBlockedByAuth,
  setTabPendingRemoteLoad,
  tabNeedsRemoteReload,
  markTabsPendingForRecoveredOrgs,
  syncTabsPendingAfterAuthRefresh
} from '../lib/codeEditorOrgAuth.js';
import { refreshAuthStatuses } from './orgs.js';
import {
  createTabId,
  isTabContentDirty,
  loadCodeEditorSession,
  saveCodeEditorSession,
  setupCodeEditorSessionPersistence,
  scheduleCodeEditorSessionPersist,
  flushCodeEditorSessionPersist,
  clearCodeEditorSession,
  hasStoredCodeEditorTabs,
  getMaxCodeEditorTabs,
  trimTabsToLimit,
  resolveStoredTabSourceOrgId,
  commitTabContentAsSaved,
  revertContentToBaseline,
  codeEditorSessionOrgMismatch,
  ensureUniqueEditorTabIds,
  createLocalSaveTimestamp,
  hasTabLocalSave
} from '../lib/codeEditorSession.js';

const quickEditWorkbench = new MonacoWorkbench({
  uriScheme: 'sfoc-quickedit',
  onContentChange: () => {
    scheduleCodeEditorSessionPersist('QuickEdit', persistSession);
    updateEditorActionButtons();
    renderDocTabs();
  }
});
let isDeploying = false;
let sessionRestored = false;

/**
 * @typedef {object} QuickEditTab
 * @property {string} id
 * @property {string} artType
 * @property {string} name
 * @property {string} fileName
 * @property {string} content
 * @property {string} originalContent
 * @property {string} lastModifiedDate
 * @property {string} [lastModifiedByName]
 * @property {string} [lastModifiedByUsername]
 * @property {string} [sourceOrgId]
 * @property {string} [bundleId]
 * @property {boolean} [pendingRemoteLoad]
 * @property {string | null} [localSavedAt]
 */

/** @type {{ orgId: string | null, activeTabId: string | null, activeTabIndex: number | null, tabs: QuickEditTab[], deployApiVersion?: string | null }} */
let editorSession = { orgId: null, activeTabId: null, activeTabIndex: null, tabs: [] };
/** @type {ReturnType<typeof buildDeployApiVersionWindow> | null} */
let deployApiVersionWindow = null;

function syncActiveTabPointers() {
  if (!editorSession.tabs.length) {
    editorSession.activeTabIndex = null;
    editorSession.activeTabId = null;
    return;
  }
  if (
    editorSession.activeTabIndex != null &&
    editorSession.activeTabIndex >= 0 &&
    editorSession.activeTabIndex < editorSession.tabs.length
  ) {
    editorSession.activeTabId = editorSession.tabs[editorSession.activeTabIndex].id;
    return;
  }
  const idx = editorSession.tabs.findIndex((t) => t.id === editorSession.activeTabId);
  if (idx >= 0) {
    editorSession.activeTabIndex = idx;
    return;
  }
  editorSession.activeTabIndex = 0;
  editorSession.activeTabId = editorSession.tabs[0].id;
}

function getActiveTab() {
  syncActiveTabPointers();
  if (
    editorSession.activeTabIndex != null &&
    editorSession.tabs[editorSession.activeTabIndex]
  ) {
    return editorSession.tabs[editorSession.activeTabIndex];
  }
  return editorSession.tabs.find((tab) => tab.id === editorSession.activeTabId) || null;
}

/**
 * @param {string} tabId
 * @param {number | undefined} tabIndex
 * @param {string | undefined} sourceOrgId
 */
function resolveSessionTabIndex(tabId, tabIndex, sourceOrgId) {
  if (typeof tabIndex === 'number' && tabIndex >= 0 && tabIndex < editorSession.tabs.length) {
    const at = editorSession.tabs[tabIndex];
    if (at && String(at.id) === String(tabId)) {
      if (
        sourceOrgId &&
        at.sourceOrgId &&
        String(at.sourceOrgId) !== String(sourceOrgId)
      ) {
        /* índice no coincide con org; buscar abajo */
      } else {
        return tabIndex;
      }
    }
  }
  if (sourceOrgId) {
    const byOrg = editorSession.tabs.findIndex(
      (t) => String(t.id) === String(tabId) && String(t.sourceOrgId) === String(sourceOrgId)
    );
    if (byOrg >= 0) return byOrg;
  }
  return editorSession.tabs.findIndex((t) => t.id === tabId);
}

function isOrgSandbox(orgId) {
  if (!orgId) return false;
  const org = (state.orgsList || []).find((o) => o.id === orgId);
  return org?.isSandbox === true;
}

function getTabSourceOrgId(tab) {
  return tab?.sourceOrgId || null;
}

function getDeployTargetOrgId() {
  return state.leftOrgId || null;
}

function getDeployApiVersionInput() {
  return /** @type {HTMLInputElement | null} */ (document.getElementById('quickEditDeployApiVersion'));
}

function getDeployApiVersionDatalist() {
  return document.getElementById('quickEditDeployApiVersionList');
}

function clampToDeployApiWindow(version) {
  const win = deployApiVersionWindow;
  if (!win) return formatMetadataApiVersion(version);
  return clampApiVersion(version, win.minVersion, win.maxVersion);
}

function getSelectedDeployApiVersion() {
  const input = getDeployApiVersionInput();
  const raw = input?.value?.trim() || editorSession.deployApiVersion || '';
  if (!deployApiVersionWindow) {
    return formatMetadataApiVersion(raw);
  }
  if (!deployApiVersionWindow.editable) {
    return deployApiVersionWindow.maxVersion;
  }
  return clampToDeployApiWindow(raw || deployApiVersionWindow.defaultVersion);
}

function setDeployApiVersion(version, opts = {}) {
  const win = deployApiVersionWindow;
  const formatted = win
    ? clampToDeployApiWindow(version || win.defaultVersion)
    : formatMetadataApiVersion(version);
  editorSession.deployApiVersion = formatted;
  const input = getDeployApiVersionInput();
  if (input) input.value = formatted;
  if (!opts.skipPersist) void persistSession();
}

function renderDeployApiVersionInput() {
  const input = getDeployApiVersionInput();
  const datalist = getDeployApiVersionDatalist();
  const win = deployApiVersionWindow;
  if (!input || !win) return;

  if (datalist) {
    datalist.innerHTML = win.options.map((v) => `<option value="${v}"></option>`).join('');
  }

  const preferred = editorSession.deployApiVersion || win.defaultVersion;
  const next = win.editable ? clampToDeployApiWindow(preferred) : win.maxVersion;
  input.value = next;
  editorSession.deployApiVersion = next;
  input.disabled = !win.editable || isDeploying;
  input.readOnly = !win.editable;
  input.title = win.editable
    ? t('quickEdit.deployApiVersionRange', { min: win.minVersion, max: win.maxVersion })
    : t('quickEdit.deployApiVersionLocked', { version: win.maxVersion, min: win.minVersion });
}

function commitDeployApiVersionFromInput() {
  const win = deployApiVersionWindow;
  const input = getDeployApiVersionInput();
  if (!input || !win || !win.editable) return;
  const before = input.value.trim();
  const after = clampToDeployApiWindow(before || win.defaultVersion);
  if (before && !isApiVersionInRange(before, win.minVersion, win.maxVersion)) {
    showToast(
      t('quickEdit.deployApiVersionClamped', { version: after, min: win.minVersion, max: win.maxVersion }),
      'warn'
    );
  }
  setDeployApiVersion(after, { skipPersist: false });
}

async function refreshDeployApiVersionOptions() {
  const orgId = getDeployTargetOrgId();
  if (!orgId) {
    deployApiVersionWindow = buildDeployApiVersionWindow([]);
    renderDeployApiVersionInput();
    return;
  }
  try {
    const res = await bg({ type: 'api:listVersions', orgId });
    if (res?.ok && Array.isArray(res.versions) && res.versions.length) {
      deployApiVersionWindow = buildDeployApiVersionWindow(res.versions);
    } else {
      const org = (state.orgsList || []).find((o) => o.id === orgId);
      deployApiVersionWindow = buildDeployApiVersionWindow(
        org?.apiVersion ? [org.apiVersion] : []
      );
    }
  } catch {
    const org = (state.orgsList || []).find((o) => o.id === orgId);
    deployApiVersionWindow = buildDeployApiVersionWindow(org?.apiVersion ? [org.apiVersion] : []);
  }
  renderDeployApiVersionInput();
}

async function syncDeployApiVersionFromClass(tab) {
  const orgId = tab?.sourceOrgId || getDeployTargetOrgId();
  const className = tab?.name;
  if (!orgId || !className || !deployApiVersionWindow) return;
  try {
    const res = await bg({ type: 'apexClass:getApiVersion', orgId, className });
    if (res?.ok && res.apiVersion) {
      setDeployApiVersion(res.apiVersion, { skipPersist: true });
    }
  } catch {
    /* optional enrichment */
  }
}

function confirmDeployOrgMismatch(tab) {
  const tabOrgId = getTabSourceOrgId(tab);
  const selectorOrgId = getDeployTargetOrgId();
  if (!selectorOrgId) return true;
  if (!tabOrgId || String(tabOrgId) === String(selectorOrgId)) return true;
  const tabOrg = getOrgDisplayLabel(tabOrgId);
  const selectorOrg = getOrgDisplayLabel(selectorOrgId);
  return window.confirm(
    t('quickEdit.deployOrgMismatchConfirm', { tabOrg, selectorOrg })
  );
}

function flushPersistSession() {
  flushCodeEditorSessionPersist('QuickEdit', persistSession);
}

async function logQuickEditUsage(action, success, errorMessage = '') {
  const tab = getActiveTab();
  try {
    await bg({
      type: 'usage:log',
      entry: {
        kind: 'codeComparison',
        action,
        artifactType: 'ApexClassQuickEdit',
        descriptor: { name: tab?.name || '' },
        leftOrgId: state.leftOrgId,
        success,
        errorMessage: errorMessage.slice(0, 500)
      }
    });
  } catch {
    /* ignore */
  }
}

function setStatus(text, tone = '') {
  const el = document.getElementById('quickEditStatus');
  if (!el) return;
  el.textContent = text || '';
  el.classList.remove('is-error', 'is-success', 'is-warning');
  if (tone === 'error') el.classList.add('is-error');
  if (tone === 'success') el.classList.add('is-success');
  if (tone === 'warning') el.classList.add('is-warning');
}

function setDeployStatus(text, tone = '') {
  const el = document.getElementById('quickEditDeployStatus');
  if (!el) return;
  el.textContent = text || '';
  el.classList.remove('is-error', 'is-success', 'is-warning');
  if (tone === 'error') el.classList.add('is-error');
  if (tone === 'success') el.classList.add('is-success');
  if (tone === 'warning') el.classList.add('is-warning');
}

function persistActiveTabContent() {
  const tab = getActiveTab();
  if (!tab || !quickEditWorkbench.hasTab(tab.id)) return;
  if (isTabContentBlockedByAuth(tab)) return;
  tab.content = quickEditWorkbench.getValue(tab.id);
}

/** Persiste el contenido Monaco de todas las pestañas abiertas en la sesión. */
function persistAllTabsContentFromWorkbench() {
  for (const tab of editorSession.tabs) {
    persistTabContentFromWorkbench(tab);
  }
}

/** @param {import('../lib/codeEditorSession.js').QuickEditTab} tab */
function persistTabContentFromWorkbench(tab) {
  if (!tab || !quickEditWorkbench.hasTab(tab.id) || isTabContentBlockedByAuth(tab)) return;
  tab.content = quickEditWorkbench.getValue(tab.id);
}

function syncEditorReadOnly() {
  const editor = quickEditWorkbench.getEditor();
  if (!editor) return;
  const tab = getActiveTab();
  editor.updateOptions({ readOnly: tab ? isTabContentBlockedByAuth(tab) : false });
}

function showTabAuthExpiredStatus(tab) {
  if (!tab?.sourceOrgId) return;
  const orgLabel = getOrgDisplayLabel(tab.sourceOrgId);
  setStatus(t('codeEditor.tabAuthExpired', { org: orgLabel }), 'warning');
}

/** Muestra aviso de auth solo en la pestaña activa; lo quita al cambiar a otra con sesión válida. */
function syncTabAuthStatus(tab, contentBlocked = tab ? isTabContentBlockedByAuth(tab) : false) {
  if (contentBlocked && tab) {
    showTabAuthExpiredStatus(tab);
  } else {
    setStatus('');
  }
}

/**
 * @param {QuickEditTab} tab
 * @param {{ silent?: boolean, force?: boolean }} [opts]
 */
/**
 * Prioridad: guardado local (SFOC) → org conectada → aviso de sesión.
 * @param {QuickEditTab} tab
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<'local' | 'org' | 'session' | 'auth-expired'>}
 */
async function ensureTabContentReady(tab, opts = {}) {
  if (hasTabLocalSave(tab)) {
    if (tabNeedsRemoteReload(tab)) setTabPendingRemoteLoad(tab, false);
    return 'local';
  }

  const orgId = tab.sourceOrgId;
  if (!orgId) return 'session';

  const connected = isOrgAuthActive(orgId);
  const needsRemote = tabNeedsRemoteReload(tab) || isTabOrgAuthExpired(tab);
  const empty = !String(tab.content ?? '').trim();

  if (connected && (needsRemote || empty)) {
    const ok = await reloadTabFromOrg(tab, { silent: opts.silent !== false, force: true });
    return ok ? 'org' : 'auth-expired';
  }

  if (!connected && (needsRemote || empty)) {
    return 'auth-expired';
  }

  return 'session';
}

async function reloadTabFromOrg(tab, opts = {}) {
  const orgId = tab.sourceOrgId;
  if (!orgId) return false;

  if (!opts.force && isQuickEditTabModified(tab)) {
    setTabPendingRemoteLoad(tab, false);
    return false;
  }

  if (!opts.silent) setStatus(t('quickEdit.loading'), 'warning');

  try {
    const res = await bg({
      type: 'fetchSource',
      orgId,
      artifactType: tab.artType || 'ApexClass',
      descriptor: {
        name: tab.name,
        bundleId: tab.bundleId,
        bundleDeveloperName: tab.name
      }
    });

    if (!res?.ok) {
      if (!opts.silent) {
        setStatus(res?.reason === 'NO_SID' ? t('toast.noSession') : t('quickEdit.loadError'), 'error');
      }
      setTabPendingRemoteLoad(tab, true);
      return false;
    }

    const files = res.files || [];
    if (!files.length) return false;

    const mainFile = files[0];
    const content = mainFile.content || '';
    tab.content = content;
    tab.originalContent = content;
    tab.fileName = mainFile.fileName || tab.fileName;
    tab.lastModifiedDate = String(mainFile.lastModifiedDate || tab.lastModifiedDate || '');
    tab.lastModifiedByName = String(mainFile.lastModifiedByName || '');
    tab.lastModifiedByUsername = String(mainFile.lastModifiedByUsername || '');
    tab.localSavedAt = null;
    setTabPendingRemoteLoad(tab, false);
    state.authStatuses[String(orgId)] = 'active';

    if (isSessionTabActive(tab)) {
      quickEditWorkbench.ensureTab({
        tabId: tab.id,
        content,
        language: 'apex',
        forceReload: true
      });
      const loaded = quickEditWorkbench.markLoadedAsClean(tab.id);
      tab.content = loaded;
      tab.originalContent = loaded;
      syncEditorReadOnly();
      if (!opts.silent) setStatus(t('quickEdit.loaded', { name: tab.name }), 'success');
    }

    renderDocTabs();
    void persistSession();
    void syncDeployApiVersionFromClass(tab);
    return true;
  } catch (e) {
    if (!opts.silent) {
      void handleToolError(e, { artifact_type: 'ApexClassQuickEdit', phase: 'load' });
    }
    setTabPendingRemoteLoad(tab, true);
    return false;
  }
}

export async function retryQuickEditAuthPendingLoads() {
  if (getSelectedArtifactType() !== 'QuickEdit') return;
  if (!editorSession.tabs.length) return;

  for (const tab of editorSession.tabs) {
    if (tabNeedsRemoteReload(tab) && !hasTabLocalSave(tab)) {
      await reloadTabFromOrg(tab, { silent: true });
    }
  }

  if (editorSession.activeTabId) {
    await switchToTab(editorSession.activeTabId, { skipPersist: true, forceReload: true });
  } else {
    renderDocTabs();
  }
}

/** @param {Record<string, string>} prevAuth @param {Record<string, string>} nextAuth */
export function markQuickEditTabsPendingForRecoveredOrgs(prevAuth, nextAuth) {
  markTabsPendingForRecoveredOrgs(prevAuth, nextAuth, editorSession.tabs);
}

function isSessionTabActive(tab) {
  const tabIndex = editorSession.tabs.indexOf(tab);
  if (tabIndex < 0) return false;
  if (editorSession.activeTabIndex != null) return tabIndex === editorSession.activeTabIndex;
  return tab.id === editorSession.activeTabId;
}

function isQuickEditTabModified(tab) {
  if (isTabContentBlockedByAuth(tab)) return false;
  if (isSessionTabActive(tab) && quickEditWorkbench.hasTab(tab.id)) {
    return quickEditWorkbench.isDirty(tab.id, tab.originalContent);
  }
  return isTabContentDirty(tab.content, tab.originalContent);
}

async function persistSession() {
  persistActiveTabContent();
  if (!editorSession.orgId && editorSession.tabs.length > 0) {
    const first = editorSession.tabs[0];
    editorSession.orgId = first?.sourceOrgId || state.leftOrgId || null;
  }
  await saveCodeEditorSession(
    'QuickEdit',
    editorSession.tabs.length
      ? {
          activeTabId: editorSession.activeTabId,
          orgId: editorSession.orgId,
          deployApiVersion: editorSession.deployApiVersion || null,
          tabs: editorSession.tabs
        }
      : null
  );
}

async function clearAllEditorTabs() {
  if (!window.confirm(t('codeEditor.clearAllConfirm'))) return;

  editorSession = { orgId: null, activeTabId: null, activeTabIndex: null, tabs: [], deployApiVersion: null };
  sessionRestored = true;
  quickEditWorkbench.disposeAll();
  quickEditWorkbench.getEditor()?.setModel(null);
  clearReturnContext();
  setStatus('');
  setDeployStatus('');
  renderDocTabs();
  updateCurrentFileDisplay();
  updateDeployButtonState();
  await clearCodeEditorSession('QuickEdit');
}

function hasUnsavedChanges() {
  persistActiveTabContent();
  return editorSession.tabs.some((tab) => isTabContentDirty(tab.content, tab.originalContent));
}

function hasActiveTabUnsavedChanges() {
  const tab = getActiveTab();
  if (!tab) return false;
  return quickEditWorkbench.isDirty(tab.id, tab.originalContent);
}

function updateEditorActionButtons() {
  const deployBtn = document.getElementById('quickEditDeployBtn');
  const validateBtn = document.getElementById('quickEditValidateBtn');
  const saveBtn = document.getElementById('quickEditSaveBtn');
  const revertBtn = document.getElementById('quickEditRevertBtn');
  if (!deployBtn || !validateBtn) return;

  const tab = getActiveTab();
  const authExpired = tab ? isTabOrgAuthExpired(tab) : false;
  const hasContent = quickEditWorkbench.getActiveValue().trim().length > 0;
  const hasItem = !!tab && !isTabContentBlockedByAuth(tab);
  const isModified = hasItem && hasActiveTabUnsavedChanges();
  const deployOrgId = getDeployTargetOrgId();
  const isSandbox = isOrgSandbox(deployOrgId);
  const canValidate = hasContent && hasItem && !isDeploying;
  const canDeploy = canValidate && isSandbox;

  deployBtn.disabled = !canDeploy;
  validateBtn.disabled = !canValidate;

  if (hasItem && !isSandbox) {
    deployBtn.title = t('quickEdit.productionBlocked');
  } else {
    deployBtn.title = '';
  }

  if (saveBtn) saveBtn.disabled = !isModified;
  if (revertBtn) revertBtn.disabled = !isModified;

  const retrieveBtn = document.getElementById('quickEditRetrieveBtn');
  if (retrieveBtn) {
    retrieveBtn.disabled = !hasItem || isDeploying;
  }

  const apiVersionInput = getDeployApiVersionInput();
  if (apiVersionInput) {
    apiVersionInput.disabled = isDeploying || !deployApiVersionWindow?.editable;
  }
}

/** @deprecated alias */
function updateDeployButtonState() {
  updateEditorActionButtons();
}

async function saveActiveTabLocally() {
  if (!getCodeEditorPersistenceEnabled()) return;
  const tab = getActiveTab();
  if (!tab || isTabContentBlockedByAuth(tab)) {
    showToast(t('quickEdit.nothingToSave'), 'warn');
    return;
  }
  if (!hasActiveTabUnsavedChanges()) {
    showToast(t('quickEdit.nothingToSave'), 'info');
    return;
  }

  persistActiveTabContent();
  const saved = commitTabContentAsSaved(quickEditWorkbench.getValue(tab.id));
  tab.content = saved.content;
  tab.originalContent = saved.originalContent;
  tab.localSavedAt = createLocalSaveTimestamp();
  quickEditWorkbench.markLoadedAsClean(tab.id);

  renderDocTabs();
  updateEditorActionButtons();
  updateCurrentFileDisplay();
  flushPersistSession();
  showToast(t('quickEdit.savedLocal'), 'success');
}

async function revertActiveTabLocally() {
  if (!getCodeEditorPersistenceEnabled()) return;
  const tab = getActiveTab();
  if (!tab || isTabContentBlockedByAuth(tab)) {
    showToast(t('quickEdit.nothingToRevert'), 'warn');
    return;
  }
  if (!hasActiveTabUnsavedChanges()) {
    showToast(t('quickEdit.nothingToRevert'), 'info');
    return;
  }
  if (!window.confirm(t('quickEdit.revertLocalConfirm'))) return;

  const reverted = revertContentToBaseline(tab.originalContent);
  tab.content = reverted.content;
  tab.originalContent = reverted.originalContent;

  await ensureEditor();
  quickEditWorkbench.ensureTab({
    tabId: tab.id,
    content: tab.content,
    language: 'apex',
    forceReload: true
  });
  quickEditWorkbench.markLoadedAsClean(tab.id);
  quickEditWorkbench.switchTab(tab.id);

  renderDocTabs();
  updateEditorActionButtons();
  flushPersistSession();
  showToast(t('quickEdit.revertedLocal'), 'success');
}

async function retrieveActiveTabFromOrg() {
  persistActiveTabContent();
  const tab = getActiveTab();
  if (!tab?.sourceOrgId) {
    showToast(t('quickEdit.nothingToRetrieve'), 'warn');
    return;
  }
  if (isTabOrgAuthExpired(tab)) {
    showTabAuthExpiredStatus(tab);
    return;
  }
  if (isQuickEditTabModified(tab) && !window.confirm(t('quickEdit.retrieveFromOrgConfirm'))) {
    return;
  }

  const ok = await reloadTabFromOrg(tab, { force: true });
  if (!ok) return;

  await switchToTab(tab.id, { forceReload: true });
  updateEditorActionButtons();
  flushPersistSession();
  showToast(t('quickEdit.retrievedFromOrg', { org: getOrgDisplayLabel(tab.sourceOrgId) }), 'success');
}

async function ensureEditor() {
  const mount = document.getElementById('quickEditEditorMount');
  if (!mount) return null;

  const editor = await quickEditWorkbench.ensureEditor(
    mount,
    {
      language: 'apex',
      readOnly: false,
      automaticLayout: true,
      minimap: { enabled: true },
      wordWrap: state.wordWrapEnabled ? 'on' : 'off',
      theme: resolveMonacoThemeId(),
      fontSize: 13,
      lineHeight: 20,
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
      scrollbar: { useShadows: false, vertical: 'auto', horizontal: 'auto' }
    },
    createStandaloneEditorSafe,
    async () => {
      const monaco = state.monaco || (await loadMonaco());
      state.monaco = monaco;
      return monaco;
    },
    quickEditWorkbench.getEditor()
  );

  for (const tab of editorSession.tabs) {
    const authExpired = isTabOrgAuthExpired(tab);
    const isActive = tab.id === editorSession.activeTabId;
    const dirty = !authExpired && isTabContentDirty(tab.content, tab.originalContent);
    if (authExpired) {
      quickEditWorkbench.ensureTab({ tabId: tab.id, content: '', language: 'apex', forceReload: true });
      continue;
    }
    quickEditWorkbench.ensureTab({
      tabId: tab.id,
      content: tab.content ?? '',
      language: 'apex',
      forceReload: !isActive || (!dirty && quickEditWorkbench.getValue(tab.id) !== tab.content)
    });
    if (!dirty && quickEditWorkbench.hasTab(tab.id)) {
      quickEditWorkbench.markLoadedAsClean(tab.id);
    }
  }

  syncEditorReadOnly();

  if (editorSession.activeTabId && quickEditWorkbench.hasTab(editorSession.activeTabId)) {
    if (quickEditWorkbench.activeTabId !== editorSession.activeTabId) {
      quickEditWorkbench.switchTab(editorSession.activeTabId);
    }
  } else if (editorSession.tabs.length === 0) {
    editor?.setModel(null);
  }

  return editor;
}

function updateCurrentFileDisplay() {
  const display = document.getElementById('quickEditCurrentFile');
  const metaEl = document.getElementById('quickEditLastModified');
  const tab = getActiveTab();
  if (!display) return;

  if (!tab) {
    updateCodeEditorToolbarDisplay({
      titleEl: display,
      metaEl,
      title: '',
      meta: null,
      sourceOrgId: null
    });
    display.textContent = t('quickEdit.noFileLoaded');
    return;
  }

  updateCodeEditorToolbarDisplay({
    titleEl: display,
    metaEl,
    title: `${tab.artType}: ${tab.name}`,
    meta: {
      lastModifiedDate: tab.lastModifiedDate,
      lastModifiedByName: tab.lastModifiedByName,
      lastModifiedByUsername: tab.lastModifiedByUsername
    },
    localSavedAt: resolveCodeEditorLocalSavedAt(tab.localSavedAt),
    sourceOrgId: tab.sourceOrgId || editorSession.orgId
  });
}

function renderDocTabs() {
  const tabsEl = document.getElementById('quickEditDocTabs');
  renderVscodeTabBar(tabsEl, {
    tabs: editorSession.tabs.map((tab, index) => ({
      id: tab.id,
      label: formatCodeEditorTabLabel(tab.name, tab.sourceOrgId),
      sourceOrgId: tab.sourceOrgId || null,
      isActive:
        editorSession.activeTabIndex != null
          ? index === editorSession.activeTabIndex
          : tab.id === editorSession.activeTabId,
      isModified: !isTabContentBlockedByAuth(tab) && isQuickEditTabModified(tab),
      isAuthExpired: isTabContentBlockedByAuth(tab),
      iconKind: 'apex',
      title: isTabOrgAuthExpired(tab) ? t('codeEditor.tabAuthExpiredHint') : undefined
    })),
    onSelect: (id, _e, meta) => void switchToTab(meta?.tabIndex ?? id),
    onClose: (id, _e, meta) => void closeTab(id, _e, meta)
  });
}

async function switchToTab(tabIdOrIndex, options = {}) {
  const skipPersist = options.skipPersist === true;
  const forceReload = options.forceReload === true;
  if (!skipPersist) persistActiveTabContent();

  const tabIndex =
    typeof tabIdOrIndex === 'number'
      ? tabIdOrIndex
      : editorSession.tabs.findIndex((t) => t.id === tabIdOrIndex);
  if (tabIndex < 0) return;

  const tab = editorSession.tabs[tabIndex];
  if (!tab) return;

  const activeIndex =
    editorSession.activeTabIndex != null
      ? editorSession.activeTabIndex
      : editorSession.tabs.findIndex((t) => t.id === editorSession.activeTabId);
  if (activeIndex === tabIndex && !forceReload) return;

  editorSession.activeTabId = tab.id;
  editorSession.activeTabIndex = tabIndex;

  const loadSource = await ensureTabContentReady(tab, { silent: true });
  await ensureEditor();

  const contentBlocked = loadSource === 'auth-expired' || isTabContentBlockedByAuth(tab);
  quickEditWorkbench.ensureTab({
    tabId: tab.id,
    content: contentBlocked ? '' : (tab.content ?? ''),
    language: 'apex',
    forceReload
  });
  if (!contentBlocked && quickEditWorkbench.hasTab(tab.id)) {
    tab.content = quickEditWorkbench.getValue(tab.id);
    if (!isTabContentDirty(tab.content, tab.originalContent)) {
      const loaded = quickEditWorkbench.markLoadedAsClean(tab.id);
      tab.content = loaded;
      tab.originalContent = loaded;
    }
  }
  quickEditWorkbench.switchTab(tab.id);
  syncEditorReadOnly();

  renderDocTabs();
  updateCurrentFileDisplay();
  updateDeployButtonState();
  syncTabAuthStatus(tab, contentBlocked);
  void persistSession();
}

async function closeTab(tabId, _event, meta = {}) {
  syncActiveTabPointers();

  const tabIndex = resolveSessionTabIndex(tabId, meta.tabIndex, meta.sourceOrgId);
  if (tabIndex < 0) return;

  const tab = editorSession.tabs[tabIndex];
  if (!tab) return;

  const isClosingActive =
    editorSession.activeTabIndex === tabIndex ||
    (editorSession.activeTabIndex == null && editorSession.activeTabId === tab.id);

  if (isClosingActive) {
    persistActiveTabContent();
  } else {
    persistTabContentFromWorkbench(tab);
  }

  const dirtyContent = quickEditWorkbench.hasTab(tab.id)
    ? quickEditWorkbench.getValue(tab.id)
    : tab.content;
  if (isTabContentDirty(dirtyContent, tab.originalContent)) {
    if (!window.confirm(t('codeEditor.unsavedTab'))) return;
  }

  const wasActive = isClosingActive;
  const nextIndex = wasActive
    ? tabIndex + 1 < editorSession.tabs.length
      ? tabIndex + 1
      : tabIndex - 1
    : -1;
  const nextActiveId = nextIndex >= 0 ? editorSession.tabs[nextIndex]?.id ?? null : null;

  editorSession.tabs.splice(tabIndex, 1);
  quickEditWorkbench.closeTab(tab.id);

  if (!wasActive && editorSession.activeTabIndex != null && editorSession.activeTabIndex > tabIndex) {
    editorSession.activeTabIndex -= 1;
  }
  if (wasActive) {
    editorSession.activeTabId = nextActiveId;
    editorSession.activeTabIndex = nextIndex >= 0 ? nextIndex : null;
  }

  syncActiveTabPointers();

  if (editorSession.tabs.length > 0) {
    await switchToTab(editorSession.activeTabIndex ?? 0, { skipPersist: true, forceReload: true });
  } else {
    editorSession.activeTabId = null;
    editorSession.activeTabIndex = null;
    quickEditWorkbench.getEditor()?.setModel(null);
    renderDocTabs();
    updateCurrentFileDisplay();
    setStatus('');
  }

  updateDeployButtonState();
  void persistSession();
}

function findTabByEntry(entry) {
  return findCodeEditorTabByArtifact(editorSession.tabs, {
    artType: entry.artType,
    artifactName: entry.name,
    orgId: state.leftOrgId
  });
}

function removeQuickEditSessionTab(tabId) {
  const tabIndex = editorSession.tabs.findIndex((t) => t.id === tabId);
  if (tabIndex < 0) return;
  editorSession.tabs.splice(tabIndex, 1);
  quickEditWorkbench.closeTab(tabId);
  if (editorSession.activeTabId === tabId) {
    const nextIndex = Math.min(tabIndex, editorSession.tabs.length - 1);
    editorSession.activeTabIndex = nextIndex >= 0 ? nextIndex : null;
    editorSession.activeTabId = nextIndex >= 0 ? editorSession.tabs[nextIndex]?.id ?? null : null;
  } else if (editorSession.activeTabIndex != null && editorSession.activeTabIndex > tabIndex) {
    editorSession.activeTabIndex -= 1;
  }
  renderDocTabs();
}

async function openTabFromEntry(entry) {
  const targetOrgId = state.leftOrgId;
  if (!targetOrgId) {
    showToast(t('quickEdit.selectOrgFirst'), 'warn');
    return;
  }

  const existing = findTabByEntry(entry);
  if (existing) {
    existing.sourceOrgId = targetOrgId;
    if (!hasTabLocalSave(existing)) {
      if (isOrgAuthActive(targetOrgId)) {
        await reloadTabFromOrg(existing, { force: true });
      } else {
        setTabPendingRemoteLoad(existing, true);
      }
    }
    await switchToTab(existing.id, { skipPersist: true, forceReload: true });
    if (!isTabOrgAuthExpired(existing)) {
      setStatus(t('quickEdit.loaded', { name: existing.name }), 'success');
    }
    return;
  }

  if (editorSession.tabs.length >= getMaxCodeEditorTabs()) {
    showToast(t('codeEditor.maxTabs'), 'warn');
    return;
  }

  await loadComponent(entry);
}

async function loadComponent(entry) {
  persistAllTabsContentFromWorkbench();
  clearReturnContext();
  setDeployStatus('');

  const targetOrgId = state.leftOrgId;
  if (!targetOrgId) {
    showToast(t('quickEdit.selectOrgFirst'), 'warn');
    return;
  }

  const tab = {
    id: createTabId('apex'),
    artType: 'ApexClass',
    name: entry.name,
    fileName: '',
    content: '',
    originalContent: '',
    lastModifiedDate: String(entry.lastModifiedDate || ''),
    lastModifiedByName: '',
    lastModifiedByUsername: '',
    sourceOrgId: targetOrgId,
    bundleId: entry.id || '',
    pendingRemoteLoad: false
  };

  editorSession.tabs = trimTabsToLimit([...editorSession.tabs, tab]);
  editorSession.activeTabId = tab.id;
  editorSession.activeTabIndex = editorSession.tabs.length - 1;
  editorSession.orgId = targetOrgId;

  const ok = await reloadTabFromOrg(tab, { force: true });
  if (!ok) {
    setTabPendingRemoteLoad(tab, true);
    await switchToTab(tab.id, { skipPersist: true, forceReload: true });
    void persistSession();
    return;
  }

  await switchToTab(tab.id, { skipPersist: true, forceReload: true });
  updateCurrentFileDisplay();
  updateDeployButtonState();
  void persistSession();
}

async function deployComponent(checkOnly = false) {
  if (guardToolAction(checkOnly ? 'quick_edit_save' : 'deploy')) return;
  persistActiveTabContent();
  const tab = getActiveTab();
  if (!tab || !quickEditWorkbench.getEditor()) {
    showToast(t('quickEdit.nothingToDeploy'), 'warn');
    return;
  }

  const deployOrgId = getDeployTargetOrgId();
  if (!deployOrgId) {
    showToast(t('quickEdit.selectOrgFirst'), 'warn');
    return;
  }

  if (!confirmDeployOrgMismatch(tab)) return;

  if (!checkOnly && !isOrgSandbox(deployOrgId)) {
    showToast(t('quickEdit.productionBlocked'), 'error');
    return;
  }

  commitDeployApiVersionFromInput();

  const content = quickEditWorkbench.getValue(tab.id);
  if (!content.trim()) {
    showToast(t('quickEdit.emptyContent'), 'warn');
    return;
  }

  saveApexDraft({
    orgId: deployOrgId,
    checkOnly,
    tabId: tab.id,
    item: { type: tab.artType, name: tab.name, fileName: tab.fileName },
    content,
    originalContent: tab.originalContent
  });

  isDeploying = true;
  updateEditorActionButtons();
  const actionType = checkOnly ? 'validate' : 'deploy';

  try {
    const res = await bg({
      type: 'metadata:deploy',
      orgId: deployOrgId,
      metadataType: tab.artType,
      memberName: tab.name,
      content,
      fileName: tab.fileName,
      checkOnly,
      async: true,
      deployApiVersion: getSelectedDeployApiVersion()
    });

    if (res?.ok && res.asyncId) {
      const startedMsg = t('quickEdit.deployStarted');
      setDeployStatus(startedMsg, 'success');
      showToast(startedMsg, 'info');
      void logQuickEditUsage(actionType, true);
      await navigateToDeployStatus(res.asyncId);
    } else {
      let errorMsg = res?.errorMessage || t('quickEdit.deployError');
      if (res?.reason === 'NO_SID') errorMsg = t('toast.noSession');
      setDeployStatus(errorMsg, 'error');
      showToast(errorMsg, 'error');
      void logQuickEditUsage(actionType, false, errorMsg);
    }
  } catch (e) {
    void handleToolError(e, { artifact_type: 'ApexClassQuickEdit', phase: checkOnly ? 'validate' : 'deploy' });
    const errorMsg = `${t('quickEdit.deployError')}: ${e.message}`;
    setDeployStatus(errorMsg, 'error');
    showToast(errorMsg, 'error');
    void logQuickEditUsage(checkOnly ? 'validate' : 'deploy', false, errorMsg);
  } finally {
    isDeploying = false;
    updateEditorActionButtons();
  }
}

/**
 * @param {{ type: string, name: string, fileName: string, content: string, originalContent: string, tabId?: string, lastModifiedDate?: string }} draft
 */
export async function restoreQuickEditDraft(draft) {
  if (!draft) return;

  let tab = draft.tabId ? editorSession.tabs.find((t) => t.id === draft.tabId) : null;
  if (!tab) {
    tab = {
      id: draft.tabId || createTabId('apex'),
      artType: draft.type,
      name: draft.name,
      fileName: draft.fileName,
      content: draft.content,
      originalContent: draft.originalContent,
      lastModifiedDate: draft.lastModifiedDate || '',
      lastModifiedByName: draft.lastModifiedByName || '',
      lastModifiedByUsername: draft.lastModifiedByUsername || '',
      sourceOrgId: draft.sourceOrgId || state.leftOrgId || null
    };
    editorSession.tabs = trimTabsToLimit([...editorSession.tabs.filter((t) => t.id !== tab.id), tab]);
  } else {
    tab.content = draft.content;
    tab.originalContent = draft.originalContent;
  }

  editorSession.activeTabId = tab.id;
  editorSession.activeTabIndex = editorSession.tabs.findIndex((t) => t.id === tab.id);
  editorSession.orgId = state.leftOrgId || editorSession.orgId;

  await ensureEditor();
  quickEditWorkbench.ensureTab({
    tabId: tab.id,
    content: draft.content,
    language: 'apex',
    forceReload: true
  });
  const loaded = quickEditWorkbench.markLoadedAsClean(tab.id);
  tab.content = loaded;
  tab.originalContent = loaded;
  quickEditWorkbench.switchTab(tab.id);

  renderDocTabs();
  updateDeployButtonState();
  updateCurrentFileDisplay();
  setStatus(t('quickEdit.loaded', { name: draft.name }), 'success');
  setDeployStatus('');
  void persistSession();
}

async function restoreSessionFromStorage() {
  const stored = await loadCodeEditorSession('QuickEdit');
  if (sessionRestored && editorSession.tabs.length > 0) return;
  if (sessionRestored && !hasStoredCodeEditorTabs(stored)) return;
  sessionRestored = true;
  if (!hasStoredCodeEditorTabs(stored)) return;

  const storedOrgId = stored.orgId ? String(stored.orgId) : null;

  const mappedTabs = stored.tabs.map((tab) => {
    const sourceOrgId = resolveStoredTabSourceOrgId(tab.sourceOrgId, storedOrgId);
    const mapped = {
      id: String(tab.id),
      artType: String(tab.artType || 'ApexClass'),
      name: String(tab.name || ''),
      fileName: String(tab.fileName || ''),
      content: String(tab.content ?? ''),
      originalContent: String(tab.originalContent ?? ''),
      lastModifiedDate: String(tab.lastModifiedDate || ''),
      lastModifiedByName: String(tab.lastModifiedByName || ''),
      lastModifiedByUsername: String(tab.lastModifiedByUsername || ''),
      sourceOrgId,
      bundleId: tab.bundleId ? String(tab.bundleId) : '',
      pendingRemoteLoad: tab.pendingRemoteLoad === true,
      localSavedAt: tab.localSavedAt ? String(tab.localSavedAt) : null
    };
    if (isTabOrgAuthExpired(mapped) && !hasTabLocalSave(mapped)) {
      setTabPendingRemoteLoad(mapped, true);
    }
    return mapped;
  });

  const unique = ensureUniqueEditorTabIds(mappedTabs, 'apex', stored.activeTabId ? String(stored.activeTabId) : null);

  editorSession = {
    orgId: storedOrgId,
    activeTabId: unique.activeTabId,
    activeTabIndex: null,
    tabs: unique.tabs,
    deployApiVersion: stored.deployApiVersion ? formatMetadataApiVersion(String(stored.deployApiVersion)) : null
  };

  if (!editorSession.activeTabId || !editorSession.tabs.some((t) => t.id === editorSession.activeTabId)) {
    editorSession.activeTabId = editorSession.tabs[0]?.id || null;
  }
  editorSession.activeTabIndex = editorSession.activeTabId
    ? editorSession.tabs.findIndex((t) => t.id === editorSession.activeTabId)
    : null;
  if (editorSession.activeTabIndex != null && editorSession.activeTabIndex < 0) {
    editorSession.activeTabIndex = editorSession.tabs.length ? 0 : null;
    editorSession.activeTabId = editorSession.tabs[0]?.id || null;
  }

  if (codeEditorSessionOrgMismatch(storedOrgId, state.leftOrgId)) {
    showToast(t('codeEditor.orgChanged'), 'info');
  }

  if (editorSession.activeTabId) {
    await switchToTab(editorSession.activeTabId);
  }
  renderDocTabs();
}

export async function refreshQuickEditPanel() {
  if (getSelectedArtifactType() === 'QuickEdit') {
    persistAllTabsContentFromWorkbench();
    await refreshAuthStatuses(true);
    await restoreSessionFromStorage();
    await refreshDeployApiVersionOptions();
    syncTabsPendingAfterAuthRefresh(editorSession.tabs);
    await ensureEditor();
    const ctx = getReturnContext();
    if (ctx?.tool === 'QuickEdit' && ctx.draft) {
      await restoreQuickEditDraft({
        ...ctx.draft,
        sourceOrgId: ctx.draft.sourceOrgId || ctx.orgId
      });
    }
    await retryQuickEditAuthPendingLoads();
  }
  updateCurrentFileDisplay();
  updateDeployButtonState();
  renderDocTabs();
}

export function setupQuickEditPanel() {
  const searchInput = /** @type {HTMLInputElement | null} */ (document.getElementById('quickEditSearchInput'));
  const resultsList = document.getElementById('quickEditResultsList');
  const deployBtn = document.getElementById('quickEditDeployBtn');
  const validateBtn = document.getElementById('quickEditValidateBtn');
  const saveBtn = document.getElementById('quickEditSaveBtn');
  const revertBtn = document.getElementById('quickEditRevertBtn');
  const retrieveBtn = document.getElementById('quickEditRetrieveBtn');
  const clearBtn = document.getElementById('quickEditClearBtn');
  const newTabBtn = document.getElementById('quickEditNewTabBtn');
  const editorMount = document.getElementById('quickEditEditorMount');

  if (searchInput && resultsList) {
    setupCodeEditorSearch({
      inputEl: searchInput,
      resultsEl: resultsList,
      artTypes: ['ApexClass'],
      onSelect: (entry) => void openTabFromEntry(entry)
    });
  }

  setupCodeEditorSessionPersistence('QuickEdit', persistSession);

  applyQuickEditLocalEditActionsVisibility();

  if (deployBtn) deployBtn.addEventListener('click', () => deployComponent(false));
  if (validateBtn) validateBtn.addEventListener('click', () => deployComponent(true));
  if (saveBtn) saveBtn.addEventListener('click', () => void saveActiveTabLocally());
  if (revertBtn) revertBtn.addEventListener('click', () => void revertActiveTabLocally());
  document.getElementById('quickEditDeployApiVersion')?.addEventListener('change', () => {
    commitDeployApiVersionFromInput();
  });
  document.getElementById('quickEditDeployApiVersion')?.addEventListener('blur', () => {
    commitDeployApiVersionFromInput();
  });
  if (retrieveBtn) retrieveBtn.addEventListener('click', () => void retrieveActiveTabFromOrg());

  if (newTabBtn) {
    newTabBtn.addEventListener('click', () => searchInput?.focus());
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => void clearAllEditorTabs());
  }

  editorMount?.addEventListener('keydown', (e) => {
    if (getSelectedArtifactType() !== 'QuickEdit') return;
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (getCodeEditorPersistenceEnabled()) void saveActiveTabLocally();
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (getSelectedArtifactType() === 'QuickEdit' && hasUnsavedChanges()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

export function refreshQuickEditEditorTheme() {
  const editor = quickEditWorkbench.getEditor();
  if (!editor) return;
  try {
    editor.updateOptions({ theme: resolveMonacoThemeId() });
  } catch {
    /* ignore */
  }
}

export function refreshQuickEditPersistenceUi() {
  applyQuickEditLocalEditActionsVisibility();
  updateEditorActionButtons();
  updateCurrentFileDisplay();
}
