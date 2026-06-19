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
  saveApexDraft,
  clearReturnContext,
  getReturnContext,
  navigateToDeployStatus
} from '../lib/quickEditDeployContext.js';
import { setupCodeEditorSearch } from './codeEditorSearch.js';
import { renderVscodeTabBar } from './vscodeTabs.js';
import { updateCodeEditorToolbarDisplay, findCodeEditorTabByArtifact, formatCodeEditorTabLabel, getOrgDisplayLabel } from './codeEditorToolbar.js';
import {
  isOrgAuthActive,
  isTabOrgAuthExpired,
  setTabPendingRemoteLoad,
  tabNeedsRemoteReload
} from '../lib/codeEditorOrgAuth.js';
import {
  createTabId,
  isTabContentDirty,
  loadCodeEditorSession,
  saveCodeEditorSession,
  setupCodeEditorSessionPersistence,
  scheduleCodeEditorSessionPersist,
  clearCodeEditorSession,
  hasStoredCodeEditorTabs,
  MAX_CODE_EDITOR_TABS,
  trimTabsToLimit
} from '../lib/codeEditorSession.js';

const quickEditWorkbench = new MonacoWorkbench({
  uriScheme: 'sfoc-quickedit',
  onContentChange: () => {
    scheduleCodeEditorSessionPersist('QuickEdit', persistSession);
    updateDeployButtonState();
    updateModifiedIndicator();
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
 */

/** @type {{ orgId: string | null, activeTabId: string | null, tabs: QuickEditTab[] }} */
let editorSession = { orgId: null, activeTabId: null, tabs: [] };

function getActiveTab() {
  return editorSession.tabs.find((tab) => tab.id === editorSession.activeTabId) || null;
}

function isCurrentOrgSandbox() {
  if (!state.leftOrgId) return false;
  const org = (state.orgsList || []).find((o) => o.id === state.leftOrgId);
  return org?.isSandbox === true;
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
  if (isTabOrgAuthExpired(tab)) return;
  tab.content = quickEditWorkbench.getValue(tab.id);
}

function syncEditorReadOnly() {
  const editor = quickEditWorkbench.getEditor();
  if (!editor) return;
  const tab = getActiveTab();
  editor.updateOptions({ readOnly: tab ? isTabOrgAuthExpired(tab) : false });
}

function showTabAuthExpiredStatus(tab) {
  if (!tab?.sourceOrgId) return;
  const orgLabel = getOrgDisplayLabel(tab.sourceOrgId);
  setStatus(t('codeEditor.tabAuthExpired', { org: orgLabel }), 'warning');
}

/**
 * @param {QuickEditTab} tab
 * @param {{ silent?: boolean }} [opts]
 */
async function reloadTabFromOrg(tab, opts = {}) {
  const orgId = tab.sourceOrgId;
  if (!orgId || !isOrgAuthActive(orgId)) return false;

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
    setTabPendingRemoteLoad(tab, false);

    if (tab.id === editorSession.activeTabId) {
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
    if (tabNeedsRemoteReload(tab)) {
      await reloadTabFromOrg(tab, { silent: true });
    }
  }

  if (editorSession.activeTabId) {
    await switchToTab(editorSession.activeTabId, { skipPersist: true, forceReload: true });
  } else {
    renderDocTabs();
  }
}

function isQuickEditTabModified(tab) {
  if (quickEditWorkbench.hasTab(tab.id)) {
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
          tabs: editorSession.tabs
        }
      : null
  );
}

async function clearAllEditorTabs() {
  if (!window.confirm(t('codeEditor.clearAllConfirm'))) return;

  editorSession = { orgId: null, activeTabId: null, tabs: [] };
  sessionRestored = true;
  quickEditWorkbench.disposeAll();
  quickEditWorkbench.getEditor()?.setModel(null);
  clearReturnContext();
  setStatus('');
  setDeployStatus('');
  renderDocTabs();
  updateCurrentFileDisplay();
  updateDeployButtonState();
  updateModifiedIndicator();
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

function updateDeployButtonState() {
  const deployBtn = document.getElementById('quickEditDeployBtn');
  const validateBtn = document.getElementById('quickEditValidateBtn');
  if (!deployBtn || !validateBtn) return;

  const tab = getActiveTab();
  const hasContent = quickEditWorkbench.getActiveValue().trim().length > 0;
  const hasItem = !!tab;
  const isSandbox = isCurrentOrgSandbox();
  const canValidate = hasContent && hasItem && !isDeploying;
  const canDeploy = canValidate && isSandbox;

  deployBtn.disabled = !canDeploy;
  validateBtn.disabled = !canValidate;

  if (hasItem && !isSandbox) {
    deployBtn.title = t('quickEdit.productionBlocked');
  } else {
    deployBtn.title = '';
  }
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
    const sessionClean = !authExpired && !isTabContentDirty(tab.content, tab.originalContent);
    quickEditWorkbench.ensureTab({
      tabId: tab.id,
      content: authExpired ? '' : (tab.content ?? ''),
      language: 'apex'
    });
    if (sessionClean && quickEditWorkbench.hasTab(tab.id)) {
      const loaded = quickEditWorkbench.markLoadedAsClean(tab.id);
      tab.content = loaded;
      tab.originalContent = loaded;
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

function updateModifiedIndicator() {
  const indicator = document.getElementById('quickEditModifiedIndicator');
  if (!indicator) return;
  if (hasActiveTabUnsavedChanges()) {
    indicator.classList.remove('hidden');
  } else {
    indicator.classList.add('hidden');
  }
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
    sourceOrgId: tab.sourceOrgId || editorSession.orgId
  });
}

function renderDocTabs() {
  const tabsEl = document.getElementById('quickEditDocTabs');
  renderVscodeTabBar(tabsEl, {
    tabs: editorSession.tabs.map((tab) => ({
      id: tab.id,
      label: formatCodeEditorTabLabel(tab.name, tab.sourceOrgId),
      isActive: tab.id === editorSession.activeTabId,
      isModified: !isTabOrgAuthExpired(tab) && isQuickEditTabModified(tab),
      isAuthExpired: isTabOrgAuthExpired(tab),
      iconKind: 'apex',
      title: isTabOrgAuthExpired(tab) ? t('codeEditor.tabAuthExpiredHint') : undefined
    })),
    onSelect: (id) => void switchToTab(id),
    onClose: (id) => void closeTab(id)
  });
}

async function switchToTab(tabId, options = {}) {
  const skipPersist = options.skipPersist === true;
  const forceReload = options.forceReload === true;
  if (!skipPersist) persistActiveTabContent();
  if (editorSession.activeTabId === tabId && !forceReload) return;

  const tab = editorSession.tabs.find((t) => t.id === tabId);
  if (!tab) return;

  editorSession.activeTabId = tabId;
  await ensureEditor();

  const authExpired = isTabOrgAuthExpired(tab);
  quickEditWorkbench.ensureTab({
    tabId: tab.id,
    content: authExpired ? '' : (tab.content ?? ''),
    language: 'apex',
    forceReload
  });
  if (!authExpired) {
    const loaded = quickEditWorkbench.markLoadedAsClean(tab.id);
    tab.content = loaded;
    tab.originalContent = loaded;
  }
  quickEditWorkbench.switchTab(tab.id);
  syncEditorReadOnly();

  renderDocTabs();
  updateCurrentFileDisplay();
  updateDeployButtonState();
  updateModifiedIndicator();
  if (authExpired) {
    showTabAuthExpiredStatus(tab);
  }
  void persistSession();
}

async function closeTab(tabId) {
  persistActiveTabContent();

  const tab = editorSession.tabs.find((t) => t.id === tabId);
  if (!tab) return;

  const dirtyContent = quickEditWorkbench.hasTab(tab.id)
    ? quickEditWorkbench.getValue(tab.id)
    : tab.content;
  if (isTabContentDirty(dirtyContent, tab.originalContent)) {
    if (!window.confirm(t('codeEditor.unsavedTab'))) return;
  }

  const tabIndex = editorSession.tabs.findIndex((t) => t.id === tabId);
  const wasActive = editorSession.activeTabId === tabId;
  const nextActiveId = wasActive
    ? editorSession.tabs[tabIndex + 1]?.id ?? editorSession.tabs[tabIndex - 1]?.id ?? null
    : editorSession.activeTabId;

  editorSession.tabs = editorSession.tabs.filter((t) => t.id !== tabId);
  quickEditWorkbench.closeTab(tabId);

  if (wasActive) {
    editorSession.activeTabId = nextActiveId;
    if (nextActiveId) {
      await switchToTab(nextActiveId, { skipPersist: true, forceReload: true });
    } else {
      quickEditWorkbench.getEditor()?.setModel(null);
    }
  }

  renderDocTabs();
  updateCurrentFileDisplay();
  updateDeployButtonState();
  updateModifiedIndicator();
  void persistSession();
}

function findTabByEntry(entry) {
  return findCodeEditorTabByArtifact(editorSession.tabs, {
    artType: entry.artType,
    artifactName: entry.name,
    orgId: state.leftOrgId
  });
}

async function openTabFromEntry(entry) {
  const existing = findTabByEntry(entry);
  if (existing) {
    await switchToTab(existing.id);
    setStatus(t('quickEdit.loaded', { name: existing.name }), 'success');
    return;
  }

  if (editorSession.tabs.length >= MAX_CODE_EDITOR_TABS) {
    showToast(t('codeEditor.maxTabs'), 'warn');
    return;
  }

  await loadComponent(entry);
}

async function loadComponent(entry) {
  if (hasActiveTabUnsavedChanges()) {
    if (!window.confirm(t('quickEdit.unsavedChanges'))) return;
  }

  persistActiveTabContent();
  clearReturnContext();
  setStatus(t('quickEdit.loading'), 'warning');
  setDeployStatus('');

  const name = entry.name;
  try {
    const res = await bg({
      type: 'fetchSource',
      orgId: state.leftOrgId,
      artifactType: 'ApexClass',
      descriptor: { name, bundleId: entry.id, bundleDeveloperName: entry.name }
    });

    if (!res?.ok) {
      void handleToolResponseFailure(res, { artifact_type: 'ApexClassQuickEdit', phase: 'load' });
      setStatus(res?.reason === 'NO_SID' ? t('toast.noSession') : t('quickEdit.loadError'), 'error');
      return;
    }

    const files = res.files || [];
    if (files.length === 0) {
      setStatus(t('quickEdit.noContent'), 'error');
      return;
    }

    const mainFile = files[0];
    const content = mainFile.content || '';
    const lastModifiedDate =
      entry.lastModifiedDate || mainFile.lastModifiedDate || files[0]?.lastModifiedDate || '';

    const tab = {
      id: createTabId('apex'),
      artType: 'ApexClass',
      name,
      fileName: mainFile.fileName,
      content,
      originalContent: content,
      lastModifiedDate: String(lastModifiedDate || ''),
      lastModifiedByName: String(mainFile.lastModifiedByName || ''),
      lastModifiedByUsername: String(mainFile.lastModifiedByUsername || ''),
      sourceOrgId: state.leftOrgId || null,
      bundleId: entry.id || '',
      pendingRemoteLoad: false
    };

    editorSession.tabs = trimTabsToLimit([...editorSession.tabs, tab]);
    editorSession.activeTabId = tab.id;
    editorSession.orgId = state.leftOrgId || null;

    await ensureEditor();
    quickEditWorkbench.ensureTab({
      tabId: tab.id,
      content,
      language: 'apex',
      forceReload: true
    });
    const loaded = quickEditWorkbench.markLoadedAsClean(tab.id);
    tab.content = loaded;
    tab.originalContent = loaded;
    quickEditWorkbench.switchTab(tab.id);

    renderDocTabs();
    updateCurrentFileDisplay();
    updateDeployButtonState();
    updateModifiedIndicator();
    setStatus(t('quickEdit.loaded', { name }), 'success');
    void persistSession();
  } catch (e) {
    void handleToolError(e, { artifact_type: 'ApexClassQuickEdit', phase: 'load' });
    setStatus(`${t('quickEdit.loadError')}: ${e.message}`, 'error');
  }
}

async function deployComponent(checkOnly = false) {
  if (guardToolAction(checkOnly ? 'quick_edit_save' : 'deploy')) return;
  persistActiveTabContent();
  const tab = getActiveTab();
  if (!tab || !quickEditWorkbench.getEditor()) {
    showToast(t('quickEdit.nothingToDeploy'), 'warn');
    return;
  }

  if (!state.leftOrgId) {
    showToast(t('quickEdit.selectOrgFirst'), 'warn');
    return;
  }

  if (!checkOnly && !isCurrentOrgSandbox()) {
    showToast(t('quickEdit.productionBlocked'), 'error');
    return;
  }

  const content = quickEditWorkbench.getValue(tab.id);
  if (!content.trim()) {
    showToast(t('quickEdit.emptyContent'), 'warn');
    return;
  }

  saveApexDraft({
    orgId: state.leftOrgId,
    checkOnly,
    tabId: tab.id,
    item: { type: tab.artType, name: tab.name, fileName: tab.fileName },
    content,
    originalContent: tab.originalContent
  });

  isDeploying = true;
  updateDeployButtonState();
  const actionType = checkOnly ? 'validate' : 'deploy';

  try {
    const res = await bg({
      type: 'metadata:deploy',
      orgId: state.leftOrgId,
      metadataType: tab.artType,
      memberName: tab.name,
      content,
      fileName: tab.fileName,
      checkOnly,
      async: true
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
    updateDeployButtonState();
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
  updateModifiedIndicator();
  updateCurrentFileDisplay();
  setStatus(t('quickEdit.loaded', { name: draft.name }), 'success');
  setDeployStatus('');
  void persistSession();
}

async function restoreSessionFromStorage() {
  if (sessionRestored) return;
  sessionRestored = true;

  const stored = await loadCodeEditorSession('QuickEdit');
  if (!hasStoredCodeEditorTabs(stored)) return;

  editorSession = {
    orgId: stored.orgId ? String(stored.orgId) : null,
    activeTabId: stored.activeTabId ? String(stored.activeTabId) : null,
    tabs: stored.tabs.map((tab) => {
      const sourceOrgId = tab.sourceOrgId
        ? String(tab.sourceOrgId)
        : stored.orgId
          ? String(stored.orgId)
          : null;
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
        pendingRemoteLoad: tab.pendingRemoteLoad === true
      };
      if (isTabOrgAuthExpired(mapped)) {
        setTabPendingRemoteLoad(mapped, true);
      }
      return mapped;
    })
  };

  if (!editorSession.activeTabId || !editorSession.tabs.some((t) => t.id === editorSession.activeTabId)) {
    editorSession.activeTabId = editorSession.tabs[0]?.id || null;
  }

  if (editorSession.activeTabId) {
    await switchToTab(editorSession.activeTabId);
  }
  renderDocTabs();
}

export async function refreshQuickEditPanel() {
  if (getSelectedArtifactType() === 'QuickEdit') {
    await restoreSessionFromStorage();
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
  const clearBtn = document.getElementById('quickEditClearBtn');
  const newTabBtn = document.getElementById('quickEditNewTabBtn');

  if (searchInput && resultsList) {
    setupCodeEditorSearch({
      inputEl: searchInput,
      resultsEl: resultsList,
      artTypes: ['ApexClass'],
      onSelect: (entry) => void openTabFromEntry(entry)
    });
  }

  setupCodeEditorSessionPersistence('QuickEdit', persistSession);

  if (deployBtn) deployBtn.addEventListener('click', () => deployComponent(false));
  if (validateBtn) validateBtn.addEventListener('click', () => deployComponent(true));

  if (newTabBtn) {
    newTabBtn.addEventListener('click', () => searchInput?.focus());
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => void clearAllEditorTabs());
  }

  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges()) {
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
