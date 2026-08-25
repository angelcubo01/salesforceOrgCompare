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
import { confirmSfocOrgAction, confirmSfocToolAction } from './sfocModal.js';
import { handleToolError, handleToolResponseFailure } from '../../shared/reportToolError.js';
import { guardToolAction } from './featureControlsUi.js';
import { getCodeEditorPersistenceEnabled } from '../../shared/extensionSettings.js';
import {
  saveLightningDraft,
  clearReturnContext,
  getReturnContext,
  navigateToDeployStatus
} from '../lib/quickEditDeployContext.js';
import { setupCodeEditorSearch } from './codeEditorSearch.js';
import { renderVscodeTabBar } from './vscodeTabs.js';
import { pickNewestSourceMetadata, updateCodeEditorToolbarDisplay, findCodeEditorTabByArtifact, formatCodeEditorTabLabel, getOrgDisplayLabel, applyQuickEditLocalEditActionsVisibility, resolveCodeEditorLocalSavedAt } from './codeEditorToolbar.js';
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
  hasBundleTabLocalSave,
  isBundleTabContentEmpty
} from '../lib/codeEditorSession.js';

const lightningWorkbench = new MonacoWorkbench({
  uriScheme: 'sfoc-lightning',
  onContentChange: () => {
    persistActiveEditorContent();
    syncActiveTabFromBundleState();
    scheduleCodeEditorSessionPersist('LightningQuickEdit', persistSession);
    updateEditorActionButtons();
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
 * @property {{ fileName: string, content: string, originalContent: string, language: string, lastModifiedDate?: string, lastModifiedByName?: string, lastModifiedByUsername?: string, localSavedAt?: string | null }[]} files
 */

/** @type {{ orgId: string | null, activeTabId: string | null, activeTabIndex: number | null, tabs: LightningBundleTab[] }} */
let editorSession = { orgId: null, activeTabId: null, activeTabIndex: null, tabs: [] };

/**
 * @type {{
 *   artifactType: 'LWC' | 'Aura',
 *   metadataType: string,
 *   bundleName: string,
 *   bundleId: string,
 *   activeFileName: string,
 *   lastModifiedDate: string,
 *   sourceOrgId: string,
 *   files: Map<string, { content: string, originalContent: string, language: string, lastModifiedDate?: string, lastModifiedByName?: string, lastModifiedByUsername?: string, localSavedAt?: string | null }>
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

function bundleFileRecord(f, fileName) {
  return {
    content: f?.content ?? '',
    originalContent: f?.originalContent ?? '',
    language: f?.language || languageForFileName(fileName),
    lastModifiedDate: String(f?.lastModifiedDate || ''),
    lastModifiedByName: String(f?.lastModifiedByName || ''),
    lastModifiedByUsername: String(f?.lastModifiedByUsername || ''),
    localSavedAt: f?.localSavedAt ? String(f.localSavedAt) : null
  };
}

function getActiveBundleFileMeta() {
  if (!bundleState?.activeFileName) {
    return {
      lastModifiedDate: bundleState?.lastModifiedDate || '',
      lastModifiedByName: '',
      lastModifiedByUsername: '',
      localSavedAt: null
    };
  }
  const file = bundleState.files.get(bundleState.activeFileName);
  return {
    lastModifiedDate: file?.lastModifiedDate || bundleState.lastModifiedDate || '',
    lastModifiedByName: file?.lastModifiedByName || '',
    lastModifiedByUsername: file?.lastModifiedByUsername || '',
    localSavedAt: file?.localSavedAt || null
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
        lastModifiedByUsername: file?.lastModifiedByUsername || '',
        localSavedAt: file?.localSavedAt || null
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
  if (
    tab.bundleName !== bundleState.bundleName ||
    String(tab.sourceOrgId || '') !== String(bundleState.sourceOrgId || tab.sourceOrgId || '')
  ) {
    return;
  }
  const updated = tabFromBundleState(tab.id);
  if (!updated) return;
  editorSession.tabs = editorSession.tabs.map((t) => (t.id === tab.id ? updated : t));
}

function isOrgSandbox(orgId) {
  if (!orgId) return false;
  const org = (state.orgsList || []).find((o) => o.id === orgId);
  return org?.isSandbox === true;
}

function getBundleSourceOrgId() {
  const tab = getActiveTab();
  return bundleState?.sourceOrgId || tab?.sourceOrgId || null;
}

function getDeployTargetOrgId() {
  return state.leftOrgId || null;
}

async function confirmDeployOrgMismatch() {
  const tabOrgId = getBundleSourceOrgId();
  const selectorOrgId = getDeployTargetOrgId();
  if (!selectorOrgId) return true;
  if (!tabOrgId || String(tabOrgId) === String(selectorOrgId)) return true;
  const tabOrg = getOrgDisplayLabel(tabOrgId);
  const selectorOrg = getOrgDisplayLabel(selectorOrgId);
  return confirmSfocToolAction(
    t('quickEdit.deployOrgMismatchConfirm', { tabOrg, selectorOrg }),
    t('modal.action.deploySelectedOrg'),
    { variant: 'production' }
  );
}

function flushPersistSession() {
  flushCodeEditorSessionPersist('LightningQuickEdit', persistSession);
}

function isBundleFileDirtyInTab(tab, file) {
  const docId = fileDocumentId(tab.id, file.fileName);
  if (lightningWorkbench.hasTab(docId)) {
    return lightningWorkbench.isDirty(docId, file.originalContent);
  }
  return isTabContentDirty(file.content, file.originalContent);
}

function isBundleTabDirtyForClose(tab) {
  if (isTabContentBlockedByAuth(tab, 'bundle')) return false;
  return (tab.files || []).some((f) => isBundleFileDirtyInTab(tab, f));
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

function syncModelFromFile(bundleTabId, fileName, file, opts = {}) {
  const tab = editorSession.tabs.find((t) => t.id === bundleTabId);
  const contentBlocked = tab ? isTabContentBlockedByAuth(tab, 'bundle') : false;
  const docId = fileDocumentId(bundleTabId, fileName);
  const content = contentBlocked ? '' : (file?.content ?? '');
  const isActiveFile =
    bundleTabId === editorSession.activeTabId && bundleState?.activeFileName === fileName;
  const dirty = !contentBlocked && file && isTabContentDirty(file.content, file.originalContent);
  const forceReload =
    opts.forceReload === true ||
    !isActiveFile ||
    (!dirty && lightningWorkbench.getValue(docId) !== content);
  lightningWorkbench.ensureTab({
    tabId: docId,
    content,
    language: file?.language || languageForFileName(fileName),
    forceReload
  });
  if (!contentBlocked && file) {
    file.content = lightningWorkbench.getValue(docId);
    if (!isTabContentDirty(file.content, file.originalContent)) {
      const loaded = lightningWorkbench.markLoadedAsClean(docId);
      file.content = loaded;
      file.originalContent = loaded;
    }
  }
}

function syncEditorReadOnly() {
  const editor = lightningWorkbench.getEditor();
  if (!editor) return;
  const tab = getActiveTab();
  editor.updateOptions({ readOnly: tab ? isTabContentBlockedByAuth(tab, 'bundle') : false });
}

function showTabAuthExpiredStatus(tab) {
  if (!tab?.sourceOrgId) return;
  const orgLabel = getOrgDisplayLabel(tab.sourceOrgId);
  setStatus(t('codeEditor.tabAuthExpired', { org: orgLabel }), 'warning');
}

/** Muestra aviso de auth solo en la pestaña activa; lo quita al cambiar a otra con sesión válida. */
function syncTabAuthStatus(tab, contentBlocked = tab ? isTabContentBlockedByAuth(tab, 'bundle') : false) {
  if (contentBlocked && tab) {
    showTabAuthExpiredStatus(tab);
  } else {
    setStatus('');
  }
}

/**
 * Prioridad: guardado local (SFOC) → org conectada → aviso de sesión.
 * @param {LightningBundleTab} tab
 * @param {{ silent?: boolean }} [opts]
 * @returns {Promise<'local' | 'org' | 'session' | 'auth-expired'>}
 */
async function ensureBundleContentReady(tab, opts = {}) {
  if (hasBundleTabLocalSave(tab)) {
    if (tabNeedsRemoteReload(tab)) setTabPendingRemoteLoad(tab, false);
    return 'local';
  }

  const orgId = tab.sourceOrgId;
  if (!orgId) return 'session';

  const connected = isOrgAuthActive(orgId);
  const needsRemote = tabNeedsRemoteReload(tab) || isTabOrgAuthExpired(tab);
  const empty = isBundleTabContentEmpty(tab);

  if (connected && (needsRemote || empty)) {
    const ok = await reloadBundleFromOrg(tab, { silent: opts.silent !== false, force: true });
    return ok ? 'org' : 'auth-expired';
  }

  if (!connected && (needsRemote || empty)) {
    return 'auth-expired';
  }

  return 'session';
}

/**
 * @param {LightningBundleTab} tab
 * @param {{ silent?: boolean, force?: boolean }} [opts]
 */
async function reloadBundleFromOrg(tab, opts = {}) {
  const orgId = tab.sourceOrgId;
  if (!orgId) return false;

  if (!opts.force && isBundleTabModified(tab)) {
    setTabPendingRemoteLoad(tab, false);
    return false;
  }

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
      const fn = normalizeBundleFileName(f.fileName || f.path || 'unknown');
      fileMap.set(fn, {
        content: f.content || '',
        originalContent: f.content || '',
        language: languageForFileName(fn),
        lastModifiedDate: String(f.lastModifiedDate || ''),
        lastModifiedByName: String(f.lastModifiedByName || ''),
        lastModifiedByUsername: String(f.lastModifiedByUsername || ''),
        localSavedAt: null
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
        lastModifiedByUsername: file.lastModifiedByUsername,
        localSavedAt: null
      };
    });
    tab.activeFileName = tab.activeFileName || tab.files[0]?.fileName || '';
    setTabPendingRemoteLoad(tab, false);
    state.authStatuses[String(orgId)] = 'active';

    if (isSessionTabActive(tab)) {
      if (opts.force) {
        lightningWorkbench.closeTabsWithPrefix(tab.id);
      }
      applyTabToBundleState(tab);
      await ensureEditor();
      if (bundleState?.activeFileName) {
        await switchToFile(bundleState.activeFileName, { forceReload: true });
      }
      markBundleTabFilesClean(tab);
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
    if (tabNeedsRemoteReload(tab) && !hasBundleTabLocalSave(tab)) {
      await reloadBundleFromOrg(tab, { silent: true });
    }
  }

  if (editorSession.activeTabId) {
    await switchToBundleTab(editorSession.activeTabId, { forceReload: true });
  } else {
    renderBundleDocTabs();
  }
}

/** @param {Record<string, string>} prevAuth @param {Record<string, string>} nextAuth */
export function markLightningTabsPendingForRecoveredOrgs(prevAuth, nextAuth) {
  markTabsPendingForRecoveredOrgs(prevAuth, nextAuth, editorSession.tabs);
}

function isSessionTabActive(tab) {
  const tabIndex = editorSession.tabs.indexOf(tab);
  if (tabIndex < 0) return false;
  if (editorSession.activeTabIndex != null) return tabIndex === editorSession.activeTabIndex;
  return tab.id === editorSession.activeTabId;
}

/** Alinea baseline local y Monaco tras recuperar contenido del org. */
function markBundleTabFilesClean(tab) {
  for (const f of tab.files || []) {
    const saved = commitTabContentAsSaved(f.content);
    f.content = saved.content;
    f.originalContent = saved.originalContent;
    const docId = fileDocumentId(tab.id, f.fileName);
    if (lightningWorkbench.hasTab(docId)) {
      const loaded = lightningWorkbench.markLoadedAsClean(docId);
      f.content = loaded;
      f.originalContent = loaded;
    }
  }
  if (isSessionTabActive(tab) && bundleState) {
    syncActiveTabFromBundleState();
  }
}

function isBundleTabModified(tab) {
  if (isTabContentBlockedByAuth(tab, 'bundle')) return false;
  const isActive = isSessionTabActive(tab);
  for (const f of tab.files || []) {
    const docId = fileDocumentId(tab.id, f.fileName);
    if (isActive && lightningWorkbench.hasTab(docId)) {
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
  if (tab && isTabContentBlockedByAuth(tab, 'bundle')) return;
  const docId = fileDocumentId(editorSession.activeTabId, bundleState.activeFileName);
  if (!lightningWorkbench.hasTab(docId)) return;
  const file = bundleState.files.get(bundleState.activeFileName);
  if (!file) return;
  file.content = lightningWorkbench.getValue(docId);
}

/** Persiste ficheros Monaco del bundle activo en la sesión de pestañas. */
function persistAllBundleTabsFromWorkbench() {
  syncActiveTabFromBundleState();
  for (const tab of editorSession.tabs) {
    persistBundleTabFilesFromWorkbench(tab);
  }
}

/** @param {{ id: string, files?: Array<{ fileName: string, content?: string }> }} tab */
function persistBundleTabFilesFromWorkbench(tab) {
  if (!tab || isTabContentBlockedByAuth(tab, 'bundle')) return;
  for (const f of tab.files || []) {
    const docId = fileDocumentId(tab.id, f.fileName);
    if (!lightningWorkbench.hasTab(docId)) continue;
    f.content = lightningWorkbench.getValue(docId);
  }
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

function updateEditorActionButtons() {
  const deployBtn = document.getElementById('lightningQuickEditDeployBtn');
  const validateBtn = document.getElementById('lightningQuickEditValidateBtn');
  const saveBtn = document.getElementById('lightningQuickEditSaveBtn');
  const revertBtn = document.getElementById('lightningQuickEditRevertBtn');
  if (!deployBtn || !validateBtn) return;

  const tab = getActiveTab();
  const hasBundle = !!bundleState && bundleState.files.size > 0 && !isTabContentBlockedByAuth(tab, 'bundle');
  const isModified = hasBundle && hasActiveBundleUnsavedChanges();
  const deployOrgId = getDeployTargetOrgId();
  const isSandbox = isOrgSandbox(deployOrgId);
  const canValidate = hasBundle && !isDeploying;
  const canDeploy = canValidate && isSandbox;

  deployBtn.disabled = !canDeploy;
  validateBtn.disabled = !canValidate;
  deployBtn.title = hasBundle && !isSandbox ? t('quickEdit.productionBlocked') : '';

  if (saveBtn) saveBtn.disabled = !isModified;
  if (revertBtn) revertBtn.disabled = !isModified;

  const retrieveBtn = document.getElementById('lightningQuickEditRetrieveBtn');
  if (retrieveBtn) {
    retrieveBtn.disabled = !hasBundle || isDeploying;
  }
}

function updateDeployButtonState() {
  updateEditorActionButtons();
}

async function saveActiveBundleLocally() {
  if (!getCodeEditorPersistenceEnabled()) return;
  const tab = getActiveTab();
  if (!tab || !bundleState || isTabContentBlockedByAuth(tab, 'bundle')) {
    showToast(t('quickEdit.nothingToSave'), 'warn');
    return;
  }
  if (!hasActiveBundleUnsavedChanges()) {
    showToast(t('quickEdit.nothingToSave'), 'info');
    return;
  }

  persistAllBundleTabsFromWorkbench();

  for (const f of tab.files || []) {
    const docId = fileDocumentId(tab.id, f.fileName);
    const current = lightningWorkbench.hasTab(docId)
      ? lightningWorkbench.getValue(docId)
      : f.content;
    const wasDirty = isTabContentDirty(current, f.originalContent);
    const saved = commitTabContentAsSaved(current);
    f.content = saved.content;
    f.originalContent = saved.originalContent;
    if (wasDirty) {
      f.localSavedAt = createLocalSaveTimestamp();
    }
    if (lightningWorkbench.hasTab(docId)) {
      lightningWorkbench.markLoadedAsClean(docId);
    }
  }

  applyTabToBundleState(tab);
  syncActiveTabFromBundleState();
  renderBundleDocTabs();
  renderFileTabs();
  updateEditorActionButtons();
  updateCurrentFileDisplay();
  flushPersistSession();
  showToast(t('quickEdit.savedLocal'), 'success');
}

async function revertActiveBundleLocally() {
  if (!getCodeEditorPersistenceEnabled()) return;
  const tab = getActiveTab();
  if (!tab || !bundleState || isTabContentBlockedByAuth(tab, 'bundle')) {
    showToast(t('quickEdit.nothingToRevert'), 'warn');
    return;
  }
  if (!hasActiveBundleUnsavedChanges()) {
    showToast(t('quickEdit.nothingToRevert'), 'info');
    return;
  }
  if (!await confirmSfocToolAction(t('quickEdit.revertLocalConfirm'), t('modal.action.discardChanges'))) return;

  for (const fileName of bundleState.files.keys()) {
    const file = bundleState.files.get(fileName);
    if (!file || !isFileModified(fileName)) continue;
    const reverted = revertContentToBaseline(file.originalContent);
    file.content = reverted.content;
    file.originalContent = reverted.originalContent;
    const docId = fileDocumentId(tab.id, fileName);
    lightningWorkbench.ensureTab({
      tabId: docId,
      content: file.content,
      language: file.language || languageForFileName(fileName),
      forceReload: true
    });
    lightningWorkbench.markLoadedAsClean(docId);
  }

  syncActiveTabFromBundleState();
  await ensureEditor();
  if (bundleState.activeFileName) {
    lightningWorkbench.switchTab(fileDocumentId(tab.id, bundleState.activeFileName));
  }

  renderBundleDocTabs();
  renderFileTabs();
  updateEditorActionButtons();
  flushPersistSession();
  showToast(t('quickEdit.revertedLocal'), 'success');
}

async function retrieveActiveBundleFromOrg() {
  persistAllBundleTabsFromWorkbench();
  const tab = getActiveTab();
  if (!tab?.sourceOrgId || !bundleState) {
    showToast(t('quickEdit.nothingToRetrieve'), 'warn');
    return;
  }
  if (isTabOrgAuthExpired(tab)) {
    showTabAuthExpiredStatus(tab);
    return;
  }
  if (isBundleTabModified(tab) && !await confirmSfocToolAction(
    t('quickEdit.retrieveFromOrgConfirm'),
    t('modal.action.retrieveDiscard')
  )) {
    return;
  }

  const ok = await reloadBundleFromOrg(tab, { force: true });
  if (!ok) return;

  await switchToBundleTab(tab.id, { forceReload: true });
  updateEditorActionButtons();
  flushPersistSession();
  showToast(
    t('quickEdit.retrievedFromOrg', { org: getOrgDisplayLabel(tab.sourceOrgId) }),
    'success'
  );
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
  const fileMeta = getActiveBundleFileMeta();
  updateCodeEditorToolbarDisplay({
    titleEl: display,
    metaEl,
    title: t('lightningQuickEdit.bundleLoaded', {
      type: bundleState.artifactType,
      name: bundleState.bundleName
    }),
    meta: fileMeta,
    localSavedAt: resolveCodeEditorLocalSavedAt(fileMeta.localSavedAt),
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
    tabs: editorSession.tabs.map((tab, index) => ({
      id: tab.id,
      label: formatCodeEditorTabLabel(tab.bundleName, tab.sourceOrgId),
      prefix: tab.artType,
      iconKind: tab.artType.toLowerCase(),
      sourceOrgId: tab.sourceOrgId || null,
      isActive:
        editorSession.activeTabIndex != null
          ? index === editorSession.activeTabIndex
          : tab.id === editorSession.activeTabId,
      isModified: !isTabContentBlockedByAuth(tab, 'bundle') && isBundleTabModified(tab),
      isAuthExpired: isTabContentBlockedByAuth(tab, 'bundle'),
      title: isTabContentBlockedByAuth(tab, 'bundle') ? t('codeEditor.tabAuthExpiredHint') : undefined
    })),
    hidden: editorSession.tabs.length === 0,
    onSelect: (id, _e, meta) => void switchToBundleTab(meta?.tabIndex ?? id),
    onClose: (id, _e, meta) => void closeBundleTab(id, _e, meta),
    getFilePicker: (tabId) => {
      const active = getActiveTab();
      return tabId === active?.id ? buildBundleFilePicker() : null;
    }
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

async function switchToFile(fileName, options = {}) {
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
  syncModelFromFile(editorSession.activeTabId, fileName, file, {
    forceReload: options.forceReload === true
  });
  lightningWorkbench.switchTab(docId);
  syncEditorReadOnly();

  const tab = getActiveTab();
  syncTabAuthStatus(tab, tab ? isTabContentBlockedByAuth(tab, 'bundle') : false);

  renderFileTabs();
  updateCurrentFileDisplay();
  void persistSession();
}

async function switchToBundleTab(tabIdOrIndex, options = {}) {
  const forceReload = options.forceReload === true;
  const tabIndex =
    typeof tabIdOrIndex === 'number'
      ? tabIdOrIndex
      : editorSession.tabs.findIndex((t) => t.id === tabIdOrIndex);
  if (tabIndex < 0) return;

  const activeIndex =
    editorSession.activeTabIndex != null
      ? editorSession.activeTabIndex
      : editorSession.tabs.findIndex((t) => t.id === editorSession.activeTabId);
  if (activeIndex === tabIndex && !forceReload) return;

  if (!forceReload) {
    syncActiveTabFromBundleState();
  }

  const tab = editorSession.tabs[tabIndex];
  if (!tab) return;

  editorSession.activeTabId = tab.id;
  editorSession.activeTabIndex = tabIndex;

  const loadSource = await ensureBundleContentReady(tab, { silent: true });
  applyTabToBundleState(tab);
  await ensureEditor();

  const contentBlocked = loadSource === 'auth-expired' || isTabContentBlockedByAuth(tab, 'bundle');

  if (bundleState.activeFileName) {
    await switchToFile(bundleState.activeFileName, { forceReload });
  }

  if (forceReload) {
    markBundleTabFilesClean(tab);
  }

  renderBundleDocTabs();
  updateCurrentFileDisplay();
  updateDeployButtonState();
  syncTabAuthStatus(tab, contentBlocked);
  void persistSession();
}

async function closeBundleTab(tabId, _event, meta = {}) {
  syncActiveTabPointers();

  const tabIndex = resolveSessionTabIndex(tabId, meta.tabIndex, meta.sourceOrgId);
  if (tabIndex < 0) return;

  const tab = editorSession.tabs[tabIndex];
  if (!tab) return;

  const isClosingActive =
    editorSession.activeTabIndex === tabIndex ||
    (editorSession.activeTabIndex == null && editorSession.activeTabId === tab.id);

  if (isClosingActive) {
    persistActiveEditorContent();
    syncActiveTabFromBundleState();
  } else {
    persistBundleTabFilesFromWorkbench(tab);
  }

  const dirty = isBundleTabDirtyForClose(tab);
  if (dirty && !await confirmSfocToolAction(t('codeEditor.unsavedTab'), t('modal.action.discardChanges'))) return;

  const wasActive = isClosingActive;
  const nextIndex = wasActive
    ? tabIndex + 1 < editorSession.tabs.length
      ? tabIndex + 1
      : tabIndex - 1
    : -1;
  const nextActiveId = nextIndex >= 0 ? editorSession.tabs[nextIndex]?.id ?? null : null;

  editorSession.tabs.splice(tabIndex, 1);
  lightningWorkbench.closeTabsWithPrefix(tab.id);

  if (!wasActive && editorSession.activeTabIndex != null && editorSession.activeTabIndex > tabIndex) {
    editorSession.activeTabIndex -= 1;
  }
  if (wasActive) {
    editorSession.activeTabId = nextActiveId;
    editorSession.activeTabIndex = nextIndex >= 0 ? nextIndex : null;
  }

  syncActiveTabPointers();

  if (editorSession.tabs.length > 0) {
    await switchToBundleTab(editorSession.activeTabIndex ?? 0, { forceReload: true });
  } else {
    editorSession.activeTabId = null;
    editorSession.activeTabIndex = null;
    bundleState = null;
    lightningWorkbench.getEditor()?.setModel(null);
    renderBundleDocTabs();
    renderFileTabs();
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

function removeLightningSessionTab(tabId) {
  const tabIndex = editorSession.tabs.findIndex((t) => t.id === tabId);
  if (tabIndex < 0) return;
  const wasActive = editorSession.activeTabId === tabId;
  editorSession.tabs.splice(tabIndex, 1);
  lightningWorkbench.closeTabsWithPrefix(tabId);
  if (wasActive) {
    const nextIndex = Math.min(tabIndex, editorSession.tabs.length - 1);
    editorSession.activeTabIndex = nextIndex >= 0 ? nextIndex : null;
    editorSession.activeTabId = nextIndex >= 0 ? editorSession.tabs[nextIndex]?.id ?? null : null;
    if (nextIndex >= 0) {
      applyTabToBundleState(editorSession.tabs[nextIndex]);
    } else {
      bundleState = null;
      lightningWorkbench.getEditor()?.setModel(null);
    }
  } else if (editorSession.activeTabIndex != null && editorSession.activeTabIndex > tabIndex) {
    editorSession.activeTabIndex -= 1;
  }
  renderBundleDocTabs();
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
    if (!hasBundleTabLocalSave(existing)) {
      if (isOrgAuthActive(targetOrgId)) {
        await reloadBundleFromOrg(existing, { force: true });
      } else {
        setTabPendingRemoteLoad(existing, true);
      }
    }
    await switchToBundleTab(existing.id, { forceReload: true });
    if (!isTabOrgAuthExpired(existing)) {
      setStatus(
        t('lightningQuickEdit.loaded', { name: existing.bundleName, count: existing.files.length }),
        'success'
      );
    }
    return;
  }
  if (editorSession.tabs.length >= getMaxCodeEditorTabs()) {
    showToast(t('codeEditor.maxTabs'), 'warn');
    return;
  }
  await loadBundle(entry);
}

async function loadBundle(entry) {
  persistAllBundleTabsFromWorkbench();
  clearReturnContext();
  setDeployStatus('');

  const targetOrgId = state.leftOrgId;
  if (!targetOrgId) {
    showToast(t('quickEdit.selectOrgFirst'), 'warn');
    return;
  }

  const artifactType = /** @type {'LWC' | 'Aura'} */ (entry.artType);
  const tabId = createTabId('bundle');
  const tab = {
    id: tabId,
    artType: artifactType,
    metadataType: metadataTypeForArtifact(artifactType),
    bundleName: entry.name,
    bundleId: entry.id || '',
    activeFileName: '',
    lastModifiedDate: String(entry.lastModifiedDate || ''),
    lastModifiedByName: '',
    lastModifiedByUsername: '',
    sourceOrgId: targetOrgId,
    pendingRemoteLoad: false,
    files: []
  };

  editorSession.tabs = trimTabsToLimit([...editorSession.tabs, tab]);
  editorSession.activeTabId = tabId;
  editorSession.activeTabIndex = editorSession.tabs.length - 1;
  editorSession.orgId = targetOrgId;

  const ok = await reloadBundleFromOrg(tab, { force: true });
  if (!ok) {
    setTabPendingRemoteLoad(tab, true);
    await switchToBundleTab(tabId, { forceReload: true });
    void persistSession();
    return;
  }

  await switchToBundleTab(tabId, { skipPersist: true, forceReload: true });
  updateCurrentFileDisplay();
  updateDeployButtonState();
  void persistSession();
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

  const deployOrgId = getDeployTargetOrgId();
  if (!deployOrgId) {
    showToast(t('quickEdit.selectOrgFirst'), 'warn');
    return;
  }

  if (!await confirmDeployOrgMismatch()) return;

  if (!checkOnly && !isOrgSandbox(deployOrgId)) {
    showToast(t('quickEdit.productionBlocked'), 'error');
    return;
  }

  const files = collectBundleFilesForDeploy();
  if (files.some((f) => !f.content.trim())) {
    showToast(t('lightningQuickEdit.emptyFileWarning'), 'warn');
  }

  if (!checkOnly && !await confirmSfocOrgAction({
    orgId: deployOrgId,
    description: t('modal.confirmMetadataDeploy', { component: bundleState.bundleName }),
    confirmLabel: t('modal.action.deploy'),
    risk: 'write',
    variant: 'standard'
  })) return;

  persistActiveEditorContent();
  syncActiveTabFromBundleState();
  const activeTab = getActiveTab();

  saveLightningDraft({
    orgId: deployOrgId,
    checkOnly,
    tabId: activeTab?.id,
    selectedComponentType: bundleState.artifactType,
    bundleState
  });

  isDeploying = true;
  updateEditorActionButtons();
  const actionType = checkOnly ? 'validate' : 'deploy';

  try {
    const res = await bg({
      type: 'metadata:deployBundle',
      orgId: deployOrgId,
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
    updateEditorActionButtons();
  }
}

function clearAllTabs() {
  lightningWorkbench.disposeAll();
  lightningWorkbench.getEditor()?.setModel(null);
  bundleState = null;
  editorSession = { orgId: null, activeTabId: null, activeTabIndex: null, tabs: [] };
  sessionRestored = true;
  clearReturnContext();
  setStatus('');
  setDeployStatus('');
  renderBundleDocTabs();
  renderFileTabs();
  updateCurrentFileDisplay();
  updateDeployButtonState();
}

async function clearAllEditorTabs() {
  if (!await confirmSfocToolAction(t('codeEditor.clearAllConfirm'), t('modal.action.closeTabs'))) return;
  clearAllTabs();
  await clearCodeEditorSession('LightningQuickEdit');
}

export async function refreshLightningQuickEditPanel() {
  if (getSelectedArtifactType() === 'LightningQuickEdit') {
    persistAllBundleTabsFromWorkbench();
    await refreshAuthStatuses(true);
    await restoreSessionFromStorage();
    syncTabsPendingAfterAuthRefresh(editorSession.tabs);
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
  const stored = await loadCodeEditorSession('LightningQuickEdit');
  if (sessionRestored && editorSession.tabs.length > 0) return;
  if (sessionRestored && !hasStoredCodeEditorTabs(stored)) return;
  sessionRestored = true;
  if (!hasStoredCodeEditorTabs(stored)) return;

  const storedOrgId = stored.orgId ? String(stored.orgId) : null;

  const mappedTabs = stored.tabs.map((tab) => {
    const sourceOrgId = resolveStoredTabSourceOrgId(tab.sourceOrgId, storedOrgId);
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
            lastModifiedByUsername: String(f.lastModifiedByUsername || ''),
            localSavedAt: f.localSavedAt ? String(f.localSavedAt) : null
          }))
        : []
    };
    if (isTabOrgAuthExpired(mapped) && !hasBundleTabLocalSave(mapped)) {
      setTabPendingRemoteLoad(mapped, true);
    }
    return mapped;
  });

  const unique = ensureUniqueEditorTabIds(
    mappedTabs,
    'bundle',
    stored.activeTabId ? String(stored.activeTabId) : null
  );

  editorSession = {
    orgId: storedOrgId,
    activeTabId: unique.activeTabId,
    activeTabIndex: null,
    tabs: unique.tabs
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
  editorSession.activeTabIndex = editorSession.tabs.findIndex((t) => t.id === tab.id);
  editorSession.orgId = state.leftOrgId || editorSession.orgId;
  applyTabToBundleState(tab);

  lightningWorkbench.closeTabsWithPrefix(tab.id);

  await ensureEditor();
  if (bundleState?.activeFileName) {
    await switchToFile(bundleState.activeFileName);
  }

  renderBundleDocTabs();
  updateDeployButtonState();
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
  const saveBtn = document.getElementById('lightningQuickEditSaveBtn');
  const revertBtn = document.getElementById('lightningQuickEditRevertBtn');
  const retrieveBtn = document.getElementById('lightningQuickEditRetrieveBtn');
  const clearBtn = document.getElementById('lightningQuickEditClearBtn');
  const editorMount = document.getElementById('lightningQuickEditEditorMount');

  if (searchInput && resultsList) {
    setupCodeEditorSearch({
      inputEl: searchInput,
      resultsEl: resultsList,
      artTypes: ['LWC', 'Aura'],
      onSelect: (entry) => void openTabFromEntry(entry)
    });
  }

  setupCodeEditorSessionPersistence('LightningQuickEdit', persistSession);

  applyQuickEditLocalEditActionsVisibility();

  if (deployBtn) deployBtn.addEventListener('click', () => deployBundle(false));
  if (validateBtn) validateBtn.addEventListener('click', () => deployBundle(true));
  if (saveBtn) saveBtn.addEventListener('click', () => void saveActiveBundleLocally());
  if (revertBtn) revertBtn.addEventListener('click', () => void revertActiveBundleLocally());
  if (retrieveBtn) retrieveBtn.addEventListener('click', () => void retrieveActiveBundleFromOrg());

  if (clearBtn) {
    clearBtn.addEventListener('click', () => void clearAllEditorTabs());
  }

  editorMount?.addEventListener('keydown', (e) => {
    if (getSelectedArtifactType() !== 'LightningQuickEdit') return;
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (getCodeEditorPersistenceEnabled()) void saveActiveBundleLocally();
    }
  });

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

export function refreshLightningQuickEditPersistenceUi() {
  applyQuickEditLocalEditActionsVisibility();
  updateEditorActionButtons();
  updateCurrentFileDisplay();
}
