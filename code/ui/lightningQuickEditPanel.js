import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import {
  loadMonaco,
  resolveMonacoThemeId,
  createStandaloneEditorSafe,
  languageForFileName
} from '../editor/monaco.js';
import { MonacoWorkbench, compositeDocumentId } from '../editor/monacoWorkbench.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { t } from '../../shared/i18n.js';
import { showToast } from './toast.js';
import { handleToolError, handleToolResponseFailure } from '../../shared/reportToolError.js';
import { guardToolAction } from './featureControlsUi.js';
import {
  saveLightningDraft,
  clearReturnContext,
  getReturnContext,
  navigateToDeployStatus
} from '../lib/quickEditDeployContext.js';
import { setupCodeEditorSearch } from './codeEditorSearch.js';
import { renderVscodeTabBar } from './vscodeTabs.js';
import { pickNewestSourceMetadata, updateCodeEditorToolbarDisplay, findCodeEditorTabByArtifact, formatCodeEditorTabLabel, getOrgDisplayLabel } from './codeEditorToolbar.js';
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

const lightningWorkbench = new MonacoWorkbench({
  uriScheme: 'sfoc-lightning',
  onContentChange: () => {
    persistActiveEditorContent();
    syncActiveTabFromBundleState();
    scheduleCodeEditorSessionPersist('LightningQuickEdit', persistSession);
    updateDeployButtonState();
    updateModifiedIndicator();
    renderFileTabs();
    renderBundleDocTabs();
  }
});

/**
 * @typedef {object} LightningBundleTab
 * @property {string} id
 * @property {'LWC' | 'Aura'} artType
 * @property {string} metadataType
 * @property {string} bundleName
 * @property {string} bundleId
 * @property {string} activeFileName
 * @property {string} lastModifiedDate
 * @property {string} [lastModifiedByName]
 * @property {string} [lastModifiedByUsername]
 * @property {string} [sourceOrgId]
 * @property {boolean} [pendingRemoteLoad]
 * @property {{ fileName: string, content: string, originalContent: string, language: string, lastModifiedDate?: string, lastModifiedByName?: string, lastModifiedByUsername?: string }[]} files
 */

/** @type {{ orgId: string | null, activeTabId: string | null, tabs: LightningBundleTab[] }} */
let editorSession = { orgId: null, activeTabId: null, tabs: [] };

/**
 * @type {{
 *   artifactType: 'LWC' | 'Aura',
 *   metadataType: string,
 *   bundleName: string,
 *   bundleId: string,
 *   activeFileName: string,
 *   lastModifiedDate: string,
 *   sourceOrgId: string,
 *   files: Map<string, { content: string, originalContent: string, language: string, lastModifiedDate?: string, lastModifiedByName?: string, lastModifiedByUsername?: string }>
 * } | null}
 */
let bundleState = null;

let isDeploying = false;
let sessionRestored = false;

function metadataTypeForArtifact(artifactType) {
  return artifactType === 'LWC' ? 'LightningComponentBundle' : 'AuraDefinitionBundle';
}

function getFileTypeOrder(fileName) {
  if (fileName.endsWith('.js') && !fileName.endsWith('.js-meta.xml')) return 1;
  if (fileName.endsWith('.cmp') || fileName.endsWith('.app')) return 1;
  if (fileName.endsWith('.html')) return 2;
  if (fileName.endsWith('.css')) return 3;
  if (
    fileName.endsWith('.xml') ||
    fileName.endsWith('.js-meta.xml') ||
    fileName.endsWith('.html-meta.xml') ||
    fileName.endsWith('.css-meta.xml')
  ) {
    return 4;
  }
  return 5;
}

function sortFileNames(fileNames) {
  return [...fileNames].sort((a, b) => {
    const aOrder = getFileTypeOrder(a);
    const bOrder = getFileTypeOrder(b);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.localeCompare(b);
  });
}

function normalizeBundleFileName(fileName) {
  const raw = String(fileName || '').replace(/\\/g, '/').trim();
  if (!raw) return 'unknown';
  const parts = raw.split('/').filter(Boolean);
  return parts[parts.length - 1] || raw;
}

function fileTabKind(fileName) {
  const base = normalizeBundleFileName(fileName).toLowerCase();
  if (base.endsWith('.js-meta.xml') || base.endsWith('.html-meta.xml') || base.endsWith('.css-meta.xml')) {
    return 'meta';
  }
  if (base.endsWith('.js')) return 'js';
  if (base.endsWith('.html')) return 'html';
  if (base.endsWith('.css')) return 'css';
  if (base.endsWith('.cmp') || base.endsWith('.app')) return 'markup';
  if (base.endsWith('.xml') || base.endsWith('.svg')) return 'xml';
  return 'file';
}

function fileTabBadgeLabel(kind) {
  switch (kind) {
    case 'js':
      return 'JS';
    case 'html':
      return 'HTML';
    case 'css':
      return 'CSS';
    case 'meta':
      return 'META';
    case 'markup':
      return 'CMP';
    case 'xml':
      return 'XML';
    default:
      return 'FILE';
  }
}

function getActiveTab() {
  return editorSession.tabs.find((tab) => tab.id === editorSession.activeTabId) || null;
}

function bundleFileRecord(f, fileName) {
  return {
    content: f?.content ?? '',
    originalContent: f?.originalContent ?? '',
    language: f?.language || languageForFileName(fileName),
    lastModifiedDate: String(f?.lastModifiedDate || ''),
    lastModifiedByName: String(f?.lastModifiedByName || ''),
    lastModifiedByUsername: String(f?.lastModifiedByUsername || '')
  };
}

function getActiveBundleFileMeta() {
  if (!bundleState?.activeFileName) {
    return {
      lastModifiedDate: bundleState?.lastModifiedDate || '',
      lastModifiedByName: '',
      lastModifiedByUsername: ''
    };
  }
  const file = bundleState.files.get(bundleState.activeFileName);
  return {
    lastModifiedDate: file?.lastModifiedDate || bundleState.lastModifiedDate || '',
    lastModifiedByName: file?.lastModifiedByName || '',
    lastModifiedByUsername: file?.lastModifiedByUsername || ''
  };
}

function tabFromBundleState(tabId) {
  if (!bundleState) return null;
  persistActiveEditorContent();
  const newest = pickNewestSourceMetadata(
    [...bundleState.files.values()].map((file) => ({
      lastModifiedDate: file.lastModifiedDate,
      lastModifiedByName: file.lastModifiedByName,
      lastModifiedByUsername: file.lastModifiedByUsername
    }))
  );
  const existing = editorSession.tabs.find((t) => t.id === tabId);
  return {
    id: tabId,
    artType: bundleState.artifactType,
    metadataType: bundleState.metadataType,
    bundleName: bundleState.bundleName,
    bundleId: bundleState.bundleId,
    activeFileName: bundleState.activeFileName,
    lastModifiedDate: bundleState.lastModifiedDate || newest.lastModifiedDate || '',
    lastModifiedByName: newest.lastModifiedByName || '',
    lastModifiedByUsername: newest.lastModifiedByUsername || '',
    sourceOrgId: bundleState.sourceOrgId || editorSession.orgId || null,
    pendingRemoteLoad: existing?.pendingRemoteLoad === true,
    files: sortFileNames([...bundleState.files.keys()]).map((fileName) => {
      const file = bundleState.files.get(fileName);
      return {
        fileName,
        content: file?.content ?? '',
        originalContent: file?.originalContent ?? '',
        language: file?.language || languageForFileName(fileName),
        lastModifiedDate: file?.lastModifiedDate || '',
        lastModifiedByName: file?.lastModifiedByName || '',
        lastModifiedByUsername: file?.lastModifiedByUsername || ''
      };
    })
  };
}

function applyTabToBundleState(tab) {
  const fileMap = new Map();
  for (const f of tab.files || []) {
    fileMap.set(f.fileName, bundleFileRecord(f, f.fileName));
  }
  bundleState = {
    artifactType: tab.artType,
    metadataType: tab.metadataType,
    bundleName: tab.bundleName,
    bundleId: tab.bundleId,
    activeFileName: tab.activeFileName,
    lastModifiedDate: tab.lastModifiedDate || '',
    sourceOrgId: tab.sourceOrgId || editorSession.orgId || null,
    files: fileMap
  };
}

function syncActiveTabFromBundleState() {
  const tab = getActiveTab();
  if (!tab || !bundleState) return;
  const updated = tabFromBundleState(tab.id);
  if (!updated) return;
  editorSession.tabs = editorSession.tabs.map((t) => (t.id === tab.id ? updated : t));
}

function isCurrentOrgSandbox() {
  if (!state.leftOrgId) return false;
  const org = (state.orgsList || []).find((o) => o.id === state.leftOrgId);
  return org?.isSandbox === true;
}

async function logUsage(action, success, errorMessage = '') {
  try {
    await bg({
      type: 'usage:log',
      entry: {
        kind: 'codeComparison',
        action,
        artifactType: 'LightningQuickEdit',
        descriptor: {
          name: bundleState?.bundleName || '',
          componentType: bundleState?.artifactType || ''
        },
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
  const el = document.getElementById('lightningQuickEditStatus');
  if (!el) return;
  el.textContent = text || '';
  el.classList.remove('is-error', 'is-success', 'is-warning');
  if (tone === 'error') el.classList.add('is-error');
  if (tone === 'success') el.classList.add('is-success');
  if (tone === 'warning') el.classList.add('is-warning');
}

function setDeployStatus(text, tone = '') {
  const el = document.getElementById('lightningQuickEditDeployStatus');
  if (!el) return;
  el.textContent = text || '';
  el.classList.remove('is-error', 'is-success', 'is-warning');
  if (tone === 'error') el.classList.add('is-error');
  if (tone === 'success') el.classList.add('is-success');
  if (tone === 'warning') el.classList.add('is-warning');
}

function fileDocumentId(bundleTabId, fileName) {
  return compositeDocumentId(bundleTabId, fileName);
}

function syncModelFromFile(bundleTabId, fileName, file) {
  const tab = editorSession.tabs.find((t) => t.id === bundleTabId);
  const authExpired = tab ? isTabOrgAuthExpired(tab) : false;
  const docId = fileDocumentId(bundleTabId, fileName);
  const content = authExpired ? '' : (file?.content ?? '');
  lightningWorkbench.ensureTab({
    tabId: docId,
    content,
    language: file?.language || languageForFileName(fileName)
  });
  if (!authExpired) {
    const loaded = lightningWorkbench.markLoadedAsClean(docId);
    if (file) {
      file.content = loaded;
      file.originalContent = loaded;
    }
  }
}

function syncEditorReadOnly() {
  const editor = lightningWorkbench.getEditor();
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
 * @param {LightningBundleTab} tab
 * @param {{ silent?: boolean }} [opts]
 */
async function reloadBundleFromOrg(tab, opts = {}) {
  const orgId = tab.sourceOrgId;
  if (!orgId || !isOrgAuthActive(orgId)) return false;

  if (!opts.silent) setStatus(t('quickEdit.loading'), 'warning');

  try {
    const res = await bg({
      type: 'fetchSource',
      orgId,
      artifactType: tab.artType,
      descriptor: {
        name: tab.bundleName,
        bundleId: tab.bundleId,
        bundleDeveloperName: tab.bundleName
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

    const fileMap = new Map();
    for (const f of files) {
      const fn = f.fileName || f.path || 'unknown';
      fileMap.set(fn, {
        content: f.content || '',
        originalContent: f.content || '',
        language: languageForFileName(fn),
        lastModifiedDate: String(f.lastModifiedDate || ''),
        lastModifiedByName: String(f.lastModifiedByName || ''),
        lastModifiedByUsername: String(f.lastModifiedByUsername || '')
      });
    }

    tab.files = sortFileNames([...fileMap.keys()]).map((fileName) => {
      const file = fileMap.get(fileName);
      return {
        fileName,
        content: file.content,
        originalContent: file.originalContent,
        language: file.language,
        lastModifiedDate: file.lastModifiedDate,
        lastModifiedByName: file.lastModifiedByName,
        lastModifiedByUsername: file.lastModifiedByUsername
      };
    });
    tab.activeFileName = tab.activeFileName || tab.files[0]?.fileName || '';
    setTabPendingRemoteLoad(tab, false);

    if (tab.id === editorSession.activeTabId) {
      applyTabToBundleState(tab);
      await ensureEditor();
      if (bundleState?.activeFileName) {
        await switchToFile(bundleState.activeFileName);
      }
      if (!opts.silent) {
        setStatus(
          t('lightningQuickEdit.loaded', { name: tab.bundleName, count: tab.files.length }),
          'success'
        );
      }
    }

    renderBundleDocTabs();
    void persistSession();
    return true;
  } catch (e) {
    if (!opts.silent) {
      void handleToolError(e, { artifact_type: 'LightningQuickEdit', phase: 'load' });
    }
    setTabPendingRemoteLoad(tab, true);
    return false;
  }
}

export async function retryLightningQuickEditAuthPendingLoads() {
  if (getSelectedArtifactType() !== 'LightningQuickEdit') return;
  if (!editorSession.tabs.length) return;

  for (const tab of editorSession.tabs) {
    if (tabNeedsRemoteReload(tab)) {
      await reloadBundleFromOrg(tab, { silent: true });
    }
  }

  if (editorSession.activeTabId) {
    await switchToBundleTab(editorSession.activeTabId, { forceReload: true });
  } else {
    renderBundleDocTabs();
  }
}

function isBundleTabModified(tab) {
  for (const f of tab.files || []) {
    const docId = fileDocumentId(tab.id, f.fileName);
    if (lightningWorkbench.hasTab(docId)) {
      if (lightningWorkbench.isDirty(docId, f.originalContent)) return true;
    } else if (isTabContentDirty(f.content, f.originalContent)) {
      return true;
    }
  }
  return false;
}

function persistActiveEditorContent() {
  if (!bundleState || !bundleState.activeFileName || !editorSession.activeTabId) return;
  const tab = getActiveTab();
  if (tab && isTabOrgAuthExpired(tab)) return;
  const docId = fileDocumentId(editorSession.activeTabId, bundleState.activeFileName);
  if (!lightningWorkbench.hasTab(docId)) return;
  const file = bundleState.files.get(bundleState.activeFileName);
  if (!file) return;
  file.content = lightningWorkbench.getValue(docId);
}

async function persistSession() {
  syncActiveTabFromBundleState();
  if (!editorSession.orgId && editorSession.tabs.length > 0) {
    const first = editorSession.tabs[0];
    editorSession.orgId = first?.sourceOrgId || state.leftOrgId || null;
  }
  await saveCodeEditorSession(
    'LightningQuickEdit',
    editorSession.tabs.length
      ? {
          activeTabId: editorSession.activeTabId,
          orgId: editorSession.orgId,
          tabs: editorSession.tabs
        }
      : null
  );
}

function isFileModified(fileName) {
  if (!bundleState) return false;
  const file = bundleState.files.get(fileName);
  if (!file) return false;
  const bundleTabId = editorSession.activeTabId;
  if (bundleTabId) {
    const docId = fileDocumentId(bundleTabId, fileName);
    if (lightningWorkbench.hasTab(docId)) {
      return lightningWorkbench.isDirty(docId, file.originalContent);
    }
  }
  return isTabContentDirty(file.content, file.originalContent);
}

function hasUnsavedChanges() {
  persistActiveEditorContent();
  for (const tab of editorSession.tabs) {
    for (const f of tab.files || []) {
      if (isTabContentDirty(f.content, f.originalContent)) return true;
    }
  }
  return false;
}

function hasActiveBundleUnsavedChanges() {
  if (!bundleState) return false;
  persistActiveEditorContent();
  for (const fileName of bundleState.files.keys()) {
    if (isFileModified(fileName)) return true;
  }
  return false;
}

function updateModifiedIndicator() {
  const indicator = document.getElementById('lightningQuickEditModifiedIndicator');
  if (!indicator) return;
  if (hasActiveBundleUnsavedChanges()) {
    indicator.classList.remove('hidden');
  } else {
    indicator.classList.add('hidden');
  }
}

function updateDeployButtonState() {
  const deployBtn = document.getElementById('lightningQuickEditDeployBtn');
  const validateBtn = document.getElementById('lightningQuickEditValidateBtn');
  if (!deployBtn || !validateBtn) return;

  const hasBundle = !!bundleState && bundleState.files.size > 0;
  const isSandbox = isCurrentOrgSandbox();
  const canValidate = hasBundle && !isDeploying;
  const canDeploy = canValidate && isSandbox;

  deployBtn.disabled = !canDeploy;
  validateBtn.disabled = !canValidate;
  deployBtn.title = hasBundle && !isSandbox ? t('quickEdit.productionBlocked') : '';
}

function updateCurrentFileDisplay() {
  const display = document.getElementById('lightningQuickEditCurrentFile');
  const metaEl = document.getElementById('lightningQuickEditLastModified');
  const tab = getActiveTab();
  if (!display) return;

  if (!bundleState) {
    updateCodeEditorToolbarDisplay({
      titleEl: display,
      metaEl,
      title: '',
      meta: null,
      sourceOrgId: null
    });
    display.textContent = t('lightningQuickEdit.noBundleLoaded');
    return;
  }

  const sourceOrgId = bundleState.sourceOrgId || tab?.sourceOrgId || editorSession.orgId;
  updateCodeEditorToolbarDisplay({
    titleEl: display,
    metaEl,
    title: t('lightningQuickEdit.bundleLoaded', {
      type: bundleState.artifactType,
      name: bundleState.bundleName
    }),
    meta: getActiveBundleFileMeta(),
    sourceOrgId
  });
}

function buildBundleFilePicker() {
  if (!bundleState || bundleState.files.size === 0) return null;
  return {
    activeFileId: bundleState.activeFileName,
    files: sortFileNames([...bundleState.files.keys()]).map((fileName) => {
      const kind = fileTabKind(fileName);
      return {
        id: fileName,
        label: normalizeBundleFileName(fileName),
        prefix: fileTabBadgeLabel(kind),
        iconKind: kind,
        isModified: isFileModified(fileName),
        title: fileName
      };
    }),
    onSelect: (id) => void switchToFile(id)
  };
}

function renderBundleDocTabs() {
  const tabsEl = document.getElementById('lightningQuickEditBundleTabs');
  renderVscodeTabBar(tabsEl, {
    tabs: editorSession.tabs.map((tab) => ({
      id: tab.id,
      label: formatCodeEditorTabLabel(tab.bundleName, tab.sourceOrgId),
      prefix: tab.artType,
      iconKind: tab.artType.toLowerCase(),
      isActive: tab.id === editorSession.activeTabId,
      isModified: !isTabOrgAuthExpired(tab) && isBundleTabModified(tab),
      isAuthExpired: isTabOrgAuthExpired(tab),
      title: isTabOrgAuthExpired(tab) ? t('codeEditor.tabAuthExpiredHint') : undefined
    })),
    hidden: editorSession.tabs.length === 0,
    onSelect: (id) => void switchToBundleTab(id),
    onClose: (id) => void closeBundleTab(id),
    getFilePicker: (tabId) => (tabId === editorSession.activeTabId ? buildBundleFilePicker() : null)
  });
}

function renderFileTabs() {
  renderBundleDocTabs();
}

async function ensureEditor() {
  const mount = document.getElementById('lightningQuickEditEditorMount');
  if (!mount) return null;

  const editor = await lightningWorkbench.ensureEditor(
    mount,
    {
      language: 'javascript',
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
    lightningWorkbench.getEditor()
  );

  if (editorSession.activeTabId && bundleState?.activeFileName) {
    const file = bundleState.files.get(bundleState.activeFileName);
    if (file) {
      const docId = fileDocumentId(editorSession.activeTabId, bundleState.activeFileName);
      syncModelFromFile(editorSession.activeTabId, bundleState.activeFileName, file);
      if (lightningWorkbench.activeTabId !== docId) {
        lightningWorkbench.switchTab(docId);
      }
    }
  } else if (!bundleState) {
    editor?.setModel(null);
  }

  syncEditorReadOnly();

  return editor;
}

async function switchToFile(fileName) {
  if (!bundleState || !editorSession.activeTabId) return;
  const file = bundleState.files.get(fileName);
  if (!file) return;

  if (bundleState.activeFileName && bundleState.activeFileName !== fileName) {
    persistActiveEditorContent();
  }

  bundleState.activeFileName = fileName;
  syncActiveTabFromBundleState();
  await ensureEditor();

  const docId = fileDocumentId(editorSession.activeTabId, fileName);
  syncModelFromFile(editorSession.activeTabId, fileName, file);
  lightningWorkbench.switchTab(docId);
  syncEditorReadOnly();

  const tab = getActiveTab();
  if (tab && isTabOrgAuthExpired(tab)) {
    showTabAuthExpiredStatus(tab);
  }

  renderFileTabs();
  updateModifiedIndicator();
  updateCurrentFileDisplay();
  void persistSession();
}

async function switchToBundleTab(tabId, options = {}) {
  const forceReload = options.forceReload === true;
  if (editorSession.activeTabId === tabId && !forceReload) return;
  syncActiveTabFromBundleState();

  const tab = editorSession.tabs.find((t) => t.id === tabId);
  if (!tab) return;

  editorSession.activeTabId = tabId;
  applyTabToBundleState(tab);
  await ensureEditor();

  if (bundleState.activeFileName) {
    await switchToFile(bundleState.activeFileName);
  } else if (isTabOrgAuthExpired(tab)) {
    showTabAuthExpiredStatus(tab);
  }

  renderBundleDocTabs();
  updateCurrentFileDisplay();
  updateDeployButtonState();
  updateModifiedIndicator();
  void persistSession();
}

async function closeBundleTab(tabId) {
  const tab = editorSession.tabs.find((t) => t.id === tabId);
  if (!tab) return;

  const dirty = (tab.files || []).some((f) => isTabContentDirty(f.content, f.originalContent));
  if (dirty && !window.confirm(t('codeEditor.unsavedTab'))) return;

  const wasActive = editorSession.activeTabId === tabId;
  editorSession.tabs = editorSession.tabs.filter((t) => t.id !== tabId);

  if (wasActive) {
    editorSession.activeTabId = editorSession.tabs[0]?.id || null;
    if (editorSession.activeTabId) {
      await switchToBundleTab(editorSession.activeTabId);
    } else {
      bundleState = null;
      lightningWorkbench.getEditor()?.setModel(null);
    }
  }

  lightningWorkbench.closeTabsWithPrefix(tabId);

  renderBundleDocTabs();
  renderFileTabs();
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
    await switchToBundleTab(existing.id);
    setStatus(t('lightningQuickEdit.loaded', { name: existing.bundleName, count: existing.files.length }), 'success');
    return;
  }
  if (editorSession.tabs.length >= MAX_CODE_EDITOR_TABS) {
    showToast(t('codeEditor.maxTabs'), 'warn');
    return;
  }
  await loadBundle(entry);
}

async function loadBundle(entry) {
  if (hasActiveBundleUnsavedChanges()) {
    if (!window.confirm(t('quickEdit.unsavedChanges'))) return;
  }

  persistActiveEditorContent();
  syncActiveTabFromBundleState();
  clearReturnContext();
  setStatus(t('quickEdit.loading'), 'warning');
  setDeployStatus('');

  const bundleName = entry.name;
  const artifactType = /** @type {'LWC' | 'Aura'} */ (entry.artType);

  try {
    const res = await bg({
      type: 'fetchSource',
      orgId: state.leftOrgId,
      artifactType,
      descriptor: {
        name: bundleName,
        bundleId: entry.id,
        bundleDeveloperName: bundleName
      }
    });

    if (!res?.ok) {
      void handleToolResponseFailure(res, { artifact_type: 'LightningQuickEdit', phase: 'load' });
      setStatus(res?.reason === 'NO_SID' ? t('toast.noSession') : t('quickEdit.loadError'), 'error');
      return;
    }

    const files = res.files || [];
    if (files.length === 0) {
      setStatus(t('quickEdit.noContent'), 'error');
      return;
    }

    const fileMap = new Map();
    for (const f of files) {
      const fileName = normalizeBundleFileName(f.fileName || 'unknown');
      const content = f.content || '';
      fileMap.set(fileName, {
        content,
        originalContent: content,
        language: f.language || languageForFileName(fileName),
        lastModifiedDate: String(f.lastModifiedDate || ''),
        lastModifiedByName: String(f.lastModifiedByName || ''),
        lastModifiedByUsername: String(f.lastModifiedByUsername || '')
      });
    }

    const sorted = sortFileNames([...fileMap.keys()]);
    const tabId = createTabId('bundle');
    const newest = pickNewestSourceMetadata(files);

    bundleState = {
      artifactType,
      metadataType: metadataTypeForArtifact(artifactType),
      bundleName,
      bundleId: entry.id || '',
      activeFileName: sorted[0],
      lastModifiedDate: String(entry.lastModifiedDate || newest.lastModifiedDate || ''),
      sourceOrgId: state.leftOrgId || null,
      files: fileMap
    };

    const tab = tabFromBundleState(tabId);
    if (tab) {
      tab.pendingRemoteLoad = false;
      editorSession.tabs = trimTabsToLimit([...editorSession.tabs, tab]);
      editorSession.activeTabId = tabId;
      editorSession.orgId = state.leftOrgId || null;
    }

    await ensureEditor();
    await switchToFile(sorted[0]);
    syncActiveTabFromBundleState();

    renderBundleDocTabs();
    updateDeployButtonState();
    updateModifiedIndicator();
    updateCurrentFileDisplay();
    setStatus(t('lightningQuickEdit.loaded', { name: bundleName, count: fileMap.size }), 'success');
    void persistSession();
  } catch (e) {
    void handleToolError(e, { artifact_type: 'LightningQuickEdit', phase: 'load' });
    setStatus(`${t('quickEdit.loadError')}: ${e.message}`, 'error');
  }
}

function collectBundleFilesForDeploy() {
  if (!bundleState) return [];
  persistActiveEditorContent();
  return sortFileNames([...bundleState.files.keys()]).map((fileName) => {
    const file = bundleState.files.get(fileName);
    return { fileName, content: file?.content ?? '' };
  });
}

async function deployBundle(checkOnly = false) {
  if (guardToolAction(checkOnly ? 'quick_edit_save' : 'deploy')) return;
  if (!bundleState || bundleState.files.size === 0) {
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

  const files = collectBundleFilesForDeploy();
  if (files.some((f) => !f.content.trim())) {
    showToast(t('lightningQuickEdit.emptyFileWarning'), 'warn');
  }

  persistActiveEditorContent();
  syncActiveTabFromBundleState();
  const activeTab = getActiveTab();

  saveLightningDraft({
    orgId: state.leftOrgId,
    checkOnly,
    tabId: activeTab?.id,
    selectedComponentType: bundleState.artifactType,
    bundleState
  });

  isDeploying = true;
  updateDeployButtonState();
  const actionType = checkOnly ? 'validate' : 'deploy';

  try {
    const res = await bg({
      type: 'metadata:deployBundle',
      orgId: state.leftOrgId,
      metadataType: bundleState.metadataType,
      memberName: bundleState.bundleName,
      files,
      checkOnly,
      async: true
    });

    if (res?.ok && res.asyncId) {
      const startedMsg = t('quickEdit.deployStarted');
      setDeployStatus(startedMsg, 'success');
      showToast(startedMsg, 'info');
      void logUsage(actionType, true);
      await navigateToDeployStatus(res.asyncId);
    } else {
      let errorMsg = res?.errorMessage || t('quickEdit.deployError');
      if (res?.reason === 'NO_SID') errorMsg = t('toast.noSession');
      setDeployStatus(errorMsg, 'error');
      showToast(errorMsg, 'error');
      void logUsage(actionType, false, errorMsg);
    }
  } catch (e) {
    void handleToolError(e, { artifact_type: 'LightningQuickEdit', phase: checkOnly ? 'validate' : 'deploy' });
    const errorMsg = `${t('quickEdit.deployError')}: ${e.message}`;
    setDeployStatus(errorMsg, 'error');
    showToast(errorMsg, 'error');
    void logUsage(checkOnly ? 'validate' : 'deploy', false, errorMsg);
  } finally {
    isDeploying = false;
    updateDeployButtonState();
  }
}

function clearAllTabs() {
  lightningWorkbench.disposeAll();
  lightningWorkbench.getEditor()?.setModel(null);
  bundleState = null;
  editorSession = { orgId: null, activeTabId: null, tabs: [] };
  sessionRestored = true;
  clearReturnContext();
  setStatus('');
  setDeployStatus('');
  renderBundleDocTabs();
  renderFileTabs();
  updateCurrentFileDisplay();
  updateDeployButtonState();
  updateModifiedIndicator();
}

async function clearAllEditorTabs() {
  if (!window.confirm(t('codeEditor.clearAllConfirm'))) return;
  clearAllTabs();
  await clearCodeEditorSession('LightningQuickEdit');
}

export async function refreshLightningQuickEditPanel() {
  if (getSelectedArtifactType() === 'LightningQuickEdit') {
    await restoreSessionFromStorage();
    await ensureEditor();
    const ctx = getReturnContext();
    if (ctx?.tool === 'LightningQuickEdit' && ctx.draft) {
      await restoreLightningQuickEditDraft({
        ...ctx.draft,
        sourceOrgId: ctx.draft.sourceOrgId || ctx.orgId
      });
    }
    await retryLightningQuickEditAuthPendingLoads();
  }
  updateCurrentFileDisplay();
  updateDeployButtonState();
  renderBundleDocTabs();
  renderFileTabs();
}

async function restoreSessionFromStorage() {
  if (sessionRestored) return;
  sessionRestored = true;

  const stored = await loadCodeEditorSession('LightningQuickEdit');
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
        artType: tab.artType === 'Aura' ? 'Aura' : 'LWC',
        metadataType: String(tab.metadataType || metadataTypeForArtifact(tab.artType === 'Aura' ? 'Aura' : 'LWC')),
        bundleName: String(tab.bundleName || ''),
        bundleId: String(tab.bundleId || ''),
        activeFileName: String(tab.activeFileName || ''),
        lastModifiedDate: String(tab.lastModifiedDate || ''),
        lastModifiedByName: String(tab.lastModifiedByName || ''),
        lastModifiedByUsername: String(tab.lastModifiedByUsername || ''),
        sourceOrgId,
        pendingRemoteLoad: tab.pendingRemoteLoad === true,
        files: Array.isArray(tab.files)
          ? tab.files.map((f) => ({
              fileName: String(f.fileName || ''),
              content: String(f.content ?? ''),
              originalContent: String(f.originalContent ?? ''),
              language: String(f.language || languageForFileName(f.fileName)),
              lastModifiedDate: String(f.lastModifiedDate || ''),
              lastModifiedByName: String(f.lastModifiedByName || ''),
              lastModifiedByUsername: String(f.lastModifiedByUsername || '')
            }))
          : []
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
    await switchToBundleTab(editorSession.activeTabId);
  }
}

/**
 * @param {import('../lib/quickEditDeployContext.js').LightningQuickEditDraft} draft
 */
export async function restoreLightningQuickEditDraft(draft) {
  if (!draft) return;

  let tab = draft.tabId ? editorSession.tabs.find((t) => t.id === draft.tabId) : null;

  if (!tab) {
    tab = {
      id: draft.tabId || createTabId('bundle'),
      artType: draft.artifactType,
      metadataType: draft.metadataType,
      bundleName: draft.bundleName,
      bundleId: draft.bundleId,
      activeFileName: draft.activeFileName || draft.files?.[0]?.fileName || '',
      lastModifiedDate: draft.lastModifiedDate || '',
      sourceOrgId: draft.sourceOrgId || state.leftOrgId || null,
      files: (draft.files || []).map((f) => ({
        fileName: f.fileName,
        content: f.content,
        originalContent: f.originalContent,
        language: f.language || languageForFileName(f.fileName),
        lastModifiedDate: String(f.lastModifiedDate || ''),
        lastModifiedByName: String(f.lastModifiedByName || ''),
        lastModifiedByUsername: String(f.lastModifiedByUsername || '')
      }))
    };
    editorSession.tabs = trimTabsToLimit([...editorSession.tabs.filter((t) => t.id !== tab.id), tab]);
  } else {
    tab.files = (draft.files || []).map((f) => ({
      fileName: f.fileName,
      content: f.content,
      originalContent: f.originalContent,
      language: f.language || languageForFileName(f.fileName),
      lastModifiedDate: String(f.lastModifiedDate || ''),
      lastModifiedByName: String(f.lastModifiedByName || ''),
      lastModifiedByUsername: String(f.lastModifiedByUsername || '')
    }));
    tab.activeFileName = draft.activeFileName || tab.files[0]?.fileName || '';
    tab.lastModifiedDate = draft.lastModifiedDate || tab.lastModifiedDate;
    tab.sourceOrgId = draft.sourceOrgId || tab.sourceOrgId || state.leftOrgId || null;
  }

  editorSession.activeTabId = tab.id;
  editorSession.orgId = state.leftOrgId || editorSession.orgId;
  applyTabToBundleState(tab);

  lightningWorkbench.closeTabsWithPrefix(tab.id);

  await ensureEditor();
  if (bundleState?.activeFileName) {
    await switchToFile(bundleState.activeFileName);
  }

  renderBundleDocTabs();
  updateDeployButtonState();
  updateModifiedIndicator();
  updateCurrentFileDisplay();
  renderFileTabs();
  setStatus(t('lightningQuickEdit.loaded', { name: draft.bundleName, count: tab.files.length }), 'success');
  setDeployStatus('');
  void persistSession();
}

export function setupLightningQuickEditPanel() {
  const searchInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById('lightningQuickEditSearchInput')
  );
  const resultsList = document.getElementById('lightningQuickEditResultsList');
  const deployBtn = document.getElementById('lightningQuickEditDeployBtn');
  const validateBtn = document.getElementById('lightningQuickEditValidateBtn');
  const clearBtn = document.getElementById('lightningQuickEditClearBtn');

  if (searchInput && resultsList) {
    setupCodeEditorSearch({
      inputEl: searchInput,
      resultsEl: resultsList,
      artTypes: ['LWC', 'Aura'],
      onSelect: (entry) => void openTabFromEntry(entry)
    });
  }

  setupCodeEditorSessionPersistence('LightningQuickEdit', persistSession);

  if (deployBtn) deployBtn.addEventListener('click', () => deployBundle(false));
  if (validateBtn) validateBtn.addEventListener('click', () => deployBundle(true));

  if (clearBtn) {
    clearBtn.addEventListener('click', () => void clearAllEditorTabs());
  }

  window.addEventListener('beforeunload', (e) => {
    if (getSelectedArtifactType() === 'LightningQuickEdit' && hasUnsavedChanges()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

export function refreshLightningQuickEditEditorTheme() {
  const editor = lightningWorkbench.getEditor();
  if (!editor) return;
  try {
    editor.updateOptions({ theme: resolveMonacoThemeId() });
  } catch {
    /* ignore */
  }
}
