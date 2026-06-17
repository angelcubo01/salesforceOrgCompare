import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import {
  loadMonaco,
  resolveMonacoThemeId,
  createStandaloneEditorSafe,
  languageForFileName
} from '../editor/monaco.js';
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

const SEARCH_MIN_PX = 288;
const RESULTS_WIDTH_CAP_PX = 1400;

/** @type {'LWC' | 'Aura'} */
let selectedComponentType = 'LWC';

/** @type {import('monaco-editor').editor.IStandaloneCodeEditor | null} */
let lightningQuickEditEditor = null;
/** @type {Promise<import('monaco-editor').editor.IStandaloneCodeEditor | null> | null} */
let lightningQuickEditEditorInit = null;

/**
 * @type {{
 *   artifactType: 'LWC' | 'Aura',
 *   metadataType: string,
 *   bundleName: string,
 *   bundleId: string,
 *   activeFileName: string,
 *   files: Map<string, { content: string, originalContent: string, language: string }>
 * } | null}
 */
let bundleState = null;

let isDeploying = false;

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

/** LWC Tooling API devuelve FilePath completo (`lwc/bundle/file.js`); usamos solo el nombre. */
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

function syncSearchInputWidth() {
  const input = document.getElementById('lightningQuickEditSearchInput');
  if (!input) return;
  if (typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content')) {
    input.style.removeProperty('width');
    scheduleSyncResultsListWidth();
    return;
  }
  const zone = input.closest('.quick-edit-search-zone');
  const maxW =
    zone?.getBoundingClientRect().width || input.closest('.quick-edit-panel-inner')?.clientWidth || 1200;

  window.requestAnimationFrame(() => {
    if (!input.value.trim()) {
      input.style.width = `${Math.min(maxW, SEARCH_MIN_PX)}px`;
      syncResultsListWidth();
      return;
    }
    input.style.width = '0';
    const needed = Math.max(SEARCH_MIN_PX, input.scrollWidth + 20);
    input.style.width = `${Math.min(maxW, needed)}px`;
    syncResultsListWidth();
  });
}

function syncResultsListWidth() {
  const list = document.getElementById('lightningQuickEditResultsList');
  const input = document.getElementById('lightningQuickEditSearchInput');
  if (!list || !input || list.childElementCount === 0) {
    list?.style.removeProperty('width');
    return;
  }

  const cap = Math.min(window.innerWidth - 40, RESULTS_WIDTH_CAP_PX);

  window.requestAnimationFrame(() => {
    list.style.width = `${cap}px`;
    let maxChild = 0;
    for (const el of list.children) {
      maxChild = Math.max(maxChild, el.scrollWidth);
    }
    const cs = getComputedStyle(list);
    const chromeW =
      (parseFloat(cs.borderLeftWidth) || 0) +
      (parseFloat(cs.borderRightWidth) || 0) +
      (parseFloat(cs.paddingLeft) || 0) +
      (parseFloat(cs.paddingRight) || 0);
    const inputW = Math.ceil(input.getBoundingClientRect().width);
    const w = Math.min(cap, Math.max(inputW, Math.ceil(maxChild + chromeW)));
    list.style.width = `${w}px`;
  });
}

function scheduleSyncResultsListWidth() {
  window.requestAnimationFrame(() => syncResultsListWidth());
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
          componentType: bundleState?.artifactType || selectedComponentType
        },
        leftOrgId: state.leftOrgId,
        success,
        errorMessage: errorMessage.slice(0, 500)
      }
    });
  } catch {
    // ignoramos errores de logging
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

function persistActiveEditorContent() {
  if (!bundleState || !lightningQuickEditEditor || !bundleState.activeFileName) return;
  const file = bundleState.files.get(bundleState.activeFileName);
  if (!file) return;
  file.content = lightningQuickEditEditor.getValue();
}

function isFileModified(fileName) {
  if (!bundleState) return false;
  const file = bundleState.files.get(fileName);
  if (!file) return false;
  return file.content !== file.originalContent;
}

function hasUnsavedChanges() {
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
  if (hasUnsavedChanges()) {
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

  if (hasBundle && !isSandbox) {
    deployBtn.title = t('quickEdit.productionBlocked');
  } else {
    deployBtn.title = '';
  }
}

function updateCurrentFileDisplay() {
  const display = document.getElementById('lightningQuickEditCurrentFile');
  if (!display) return;
  if (bundleState) {
    display.textContent = t('lightningQuickEdit.bundleLoaded', {
      type: bundleState.artifactType,
      name: bundleState.bundleName
    });
  } else {
    display.textContent = t('lightningQuickEdit.noBundleLoaded');
  }
}

function updateSearchPlaceholder() {
  const input = document.getElementById('lightningQuickEditSearchInput');
  if (!input) return;
  input.placeholder =
    selectedComponentType === 'LWC'
      ? t('lightningQuickEdit.searchPlaceholderLwc')
      : t('lightningQuickEdit.searchPlaceholderAura');
}

function updateTypeToggleUi() {
  const lwcBtn = document.getElementById('lightningQuickEditTypeLwc');
  const auraBtn = document.getElementById('lightningQuickEditTypeAura');
  lwcBtn?.classList.toggle('is-active', selectedComponentType === 'LWC');
  auraBtn?.classList.toggle('is-active', selectedComponentType === 'Aura');
  updateSearchPlaceholder();
}

function renderFileTabs() {
  const tabsEl = document.getElementById('lightningQuickEditFileTabs');
  if (!tabsEl) return;

  if (!bundleState || bundleState.files.size === 0) {
    tabsEl.innerHTML = '';
    tabsEl.hidden = true;
    return;
  }

  tabsEl.hidden = false;
  tabsEl.innerHTML = '';

  for (const fileName of sortFileNames([...bundleState.files.keys()])) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const kind = fileTabKind(fileName);
    btn.className = `lightning-quick-edit-file-tab lightning-quick-edit-file-tab--${kind}`;
    btn.setAttribute('role', 'tab');
    const badge = document.createElement('span');
    badge.className = 'lightning-quick-edit-file-tab-badge';
    badge.textContent = fileTabBadgeLabel(kind);
    const label = document.createElement('span');
    label.className = 'lightning-quick-edit-file-tab-name';
    label.textContent = normalizeBundleFileName(fileName);
    btn.append(badge, label);
    btn.title = fileName;
    if (fileName === bundleState.activeFileName) {
      btn.classList.add('is-active');
      btn.setAttribute('aria-selected', 'true');
    } else {
      btn.setAttribute('aria-selected', 'false');
    }
    if (isFileModified(fileName)) {
      btn.classList.add('is-modified');
    }
    btn.addEventListener('click', () => {
      void switchToFile(fileName);
    });
    tabsEl.appendChild(btn);
  }
}

async function ensureEditor() {
  const mount = document.getElementById('lightningQuickEditEditorMount');
  if (!mount) return null;
  if (lightningQuickEditEditor) {
    try {
      if (lightningQuickEditEditor.getContainerDomNode() === mount) return lightningQuickEditEditor;
    } catch {
      lightningQuickEditEditor = null;
    }
  }
  if (lightningQuickEditEditorInit) return lightningQuickEditEditorInit;

  lightningQuickEditEditorInit = (async () => {
    const monaco = state.monaco || (await loadMonaco());
    state.monaco = monaco;

    lightningQuickEditEditor = createStandaloneEditorSafe(
      monaco,
      mount,
      {
        value: '',
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
      lightningQuickEditEditor
    );

    lightningQuickEditEditor.onDidChangeModelContent(() => {
      persistActiveEditorContent();
      updateDeployButtonState();
      updateModifiedIndicator();
      renderFileTabs();
    });

    return lightningQuickEditEditor;
  })();

  try {
    return await lightningQuickEditEditorInit;
  } finally {
    lightningQuickEditEditorInit = null;
  }
}

async function switchToFile(fileName) {
  if (!bundleState) return;

  const file = bundleState.files.get(fileName);
  if (!file) return;

  if (bundleState.activeFileName && bundleState.activeFileName !== fileName) {
    persistActiveEditorContent();
  }

  bundleState.activeFileName = fileName;
  await ensureEditor();

  const monaco = state.monaco;
  const lang = file.language || languageForFileName(fileName);
  if (monaco && lightningQuickEditEditor) {
    monaco.editor.setModelLanguage(lightningQuickEditEditor.getModel(), lang);
    lightningQuickEditEditor.setValue(file.content);
  }

  renderFileTabs();
  updateModifiedIndicator();
}

async function searchComponents() {
  const searchInput = document.getElementById('lightningQuickEditSearchInput');
  const resultsList = document.getElementById('lightningQuickEditResultsList');
  const bumpListWidth = () => scheduleSyncResultsListWidth();

  if (!searchInput || !resultsList) return;

  const searchTerm = searchInput.value.trim();

  if (!state.leftOrgId) {
    resultsList.innerHTML = `<div class="quick-edit-results-empty">${t('quickEdit.selectOrgFirst')}</div>`;
    bumpListWidth();
    return;
  }

  if (searchTerm.length < 2) {
    resultsList.innerHTML = `<div class="quick-edit-results-empty">${t('quickEdit.minChars')}</div>`;
    bumpListWidth();
    return;
  }

  resultsList.innerHTML = `<div class="quick-edit-results-loading">${t('quickEdit.searching')}</div>`;
  bumpListWidth();

  try {
    const res = await bg({
      type: 'searchIndex',
      orgId: state.leftOrgId,
      artifactType: selectedComponentType,
      prefix: searchTerm
    });

    if (!res?.ok) {
      void handleToolResponseFailure(res, { artifact_type: 'LightningQuickEdit', phase: 'search' });
      if (res?.reason === 'NO_SID') {
        resultsList.innerHTML = `<div class="quick-edit-results-empty">${t('toast.noSession')}</div>`;
      } else {
        resultsList.innerHTML = `<div class="quick-edit-results-empty">${t('quickEdit.searchError')}</div>`;
      }
      bumpListWidth();
      return;
    }

    const items = res.items || [];
    if (items.length === 0) {
      resultsList.innerHTML = `<div class="quick-edit-results-empty">${t('quickEdit.noResults')}</div>`;
      bumpListWidth();
      return;
    }

    resultsList.innerHTML = '';
    for (const item of items.slice(0, 50)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quick-edit-result-item';
      btn.textContent = item.developerName || item.name || '(sin nombre)';
      btn.addEventListener('click', () => loadBundle(item));
      resultsList.appendChild(btn);
    }
    bumpListWidth();
  } catch (e) {
    void handleToolError(e, { artifact_type: 'LightningQuickEdit', phase: 'search' });
    resultsList.innerHTML = `<div class="quick-edit-results-empty">${t('quickEdit.searchError')}</div>`;
    bumpListWidth();
  }
}

async function loadBundle(item) {
  if (hasUnsavedChanges()) {
    const confirm = window.confirm(t('quickEdit.unsavedChanges'));
    if (!confirm) return;
  }

  clearReturnContext();
  setStatus(t('quickEdit.loading'), 'warning');
  setDeployStatus('');

  const bundleName = item.developerName || item.name;
  const artifactType = selectedComponentType;

  try {
    const descriptor = {
      name: bundleName,
      bundleId: item.id,
      bundleDeveloperName: item.developerName || bundleName
    };

    const res = await bg({
      type: 'fetchSource',
      orgId: state.leftOrgId,
      artifactType,
      descriptor
    });

    if (!res?.ok) {
      void handleToolResponseFailure(res, { artifact_type: 'LightningQuickEdit', phase: 'load' });
      if (res?.reason === 'NO_SID') {
        setStatus(t('toast.noSession'), 'error');
      } else {
        setStatus(t('quickEdit.loadError'), 'error');
      }
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
        language: f.language || languageForFileName(fileName)
      });
    }

    const sorted = sortFileNames([...fileMap.keys()]);

    bundleState = {
      artifactType,
      metadataType: metadataTypeForArtifact(artifactType),
      bundleName,
      bundleId: item.id,
      activeFileName: '',
      files: fileMap
    };

    await ensureEditor();
    await switchToFile(sorted[0]);

    updateDeployButtonState();
    updateModifiedIndicator();
    updateCurrentFileDisplay();
    renderFileTabs();

    setStatus(t('lightningQuickEdit.loaded', { name: bundleName, count: fileMap.size }), 'success');

    const resultsList = document.getElementById('lightningQuickEditResultsList');
    if (resultsList) resultsList.innerHTML = '';
    const searchInput = document.getElementById('lightningQuickEditSearchInput');
    if (searchInput) searchInput.value = '';
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
  saveLightningDraft({
    orgId: state.leftOrgId,
    checkOnly,
    selectedComponentType,
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
      if (res?.reason === 'NO_SID') {
        errorMsg = t('toast.noSession');
      }
      setDeployStatus(errorMsg, 'error');
      showToast(errorMsg, 'error');
      void logUsage(actionType, false, errorMsg);
    }
  } catch (e) {
    void handleToolError(e, {
      artifact_type: 'LightningQuickEdit',
      phase: checkOnly ? 'validate' : 'deploy'
    });
    const errorMsg = `${t('quickEdit.deployError')}: ${e.message}`;
    setDeployStatus(errorMsg, 'error');
    showToast(errorMsg, 'error');
    void logUsage(checkOnly ? 'validate' : 'deploy', false, errorMsg);
  } finally {
    isDeploying = false;
    updateDeployButtonState();
  }
}

function clearBundle() {
  if (lightningQuickEditEditor) {
    lightningQuickEditEditor.setValue('');
  }
  bundleState = null;
  clearReturnContext();
  setStatus('');
  setDeployStatus('');
  updateCurrentFileDisplay();
  updateDeployButtonState();
  updateModifiedIndicator();
  renderFileTabs();
}

function setComponentType(type) {
  if (type !== 'LWC' && type !== 'Aura') return;
  if (type === selectedComponentType) return;

  if (hasUnsavedChanges()) {
    const confirm = window.confirm(t('quickEdit.unsavedChanges'));
    if (!confirm) return;
  }

  selectedComponentType = type;
  updateTypeToggleUi();
  clearBundle();

  const resultsList = document.getElementById('lightningQuickEditResultsList');
  if (resultsList) resultsList.innerHTML = '';
  const searchInput = document.getElementById('lightningQuickEditSearchInput');
  if (searchInput) {
    searchInput.value = '';
    syncSearchInputWidth();
  }
}

export async function refreshLightningQuickEditPanel() {
  if (!state.leftOrgId) return;

  if (getSelectedArtifactType() === 'LightningQuickEdit') {
    await ensureEditor();
    const ctx = getReturnContext();
    if (ctx?.tool === 'LightningQuickEdit' && !bundleState && ctx.draft) {
      await restoreLightningQuickEditDraft(ctx.draft);
    }
  }
  updateCurrentFileDisplay();
  updateDeployButtonState();
  updateTypeToggleUi();
}

/**
 * @param {{
 *   artifactType: 'LWC' | 'Aura',
 *   metadataType: string,
 *   bundleName: string,
 *   bundleId: string,
 *   activeFileName: string,
 *   selectedComponentType: 'LWC' | 'Aura',
 *   files: { fileName: string, content: string, originalContent: string, language: string }[]
 * }} draft
 */
export async function restoreLightningQuickEditDraft(draft) {
  if (!draft) return;

  selectedComponentType = draft.selectedComponentType || draft.artifactType;
  updateTypeToggleUi();

  const fileMap = new Map();
  for (const f of draft.files || []) {
    fileMap.set(f.fileName, {
      content: f.content,
      originalContent: f.originalContent,
      language: f.language || languageForFileName(f.fileName)
    });
  }

  bundleState = {
    artifactType: draft.artifactType,
    metadataType: draft.metadataType,
    bundleName: draft.bundleName,
    bundleId: draft.bundleId,
    activeFileName: draft.activeFileName || draft.files?.[0]?.fileName || '',
    files: fileMap
  };

  await ensureEditor();
  if (bundleState.activeFileName) {
    await switchToFile(bundleState.activeFileName);
  }

  updateDeployButtonState();
  updateModifiedIndicator();
  updateCurrentFileDisplay();
  renderFileTabs();
  setStatus(t('lightningQuickEdit.loaded', { name: draft.bundleName, count: fileMap.size }), 'success');
  setDeployStatus('');
}

export function setupLightningQuickEditPanel() {
  const searchInput = document.getElementById('lightningQuickEditSearchInput');
  const resultsList = document.getElementById('lightningQuickEditResultsList');
  const deployBtn = document.getElementById('lightningQuickEditDeployBtn');
  const validateBtn = document.getElementById('lightningQuickEditValidateBtn');
  const clearBtn = document.getElementById('lightningQuickEditClearBtn');
  const lwcBtn = document.getElementById('lightningQuickEditTypeLwc');
  const auraBtn = document.getElementById('lightningQuickEditTypeAura');

  updateTypeToggleUi();

  if (lwcBtn) {
    lwcBtn.addEventListener('click', () => setComponentType('LWC'));
  }
  if (auraBtn) {
    auraBtn.addEventListener('click', () => setComponentType('Aura'));
  }

  if (searchInput) {
    let searchTimeout = null;
    searchInput.addEventListener('input', () => {
      syncSearchInputWidth();
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => searchComponents(), 400);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(searchTimeout);
        searchComponents();
      }
      if (e.key === 'Escape') {
        if (resultsList) {
          resultsList.innerHTML = '';
          scheduleSyncResultsListWidth();
        }
      }
    });
    searchInput.addEventListener('focus', () => {
      syncSearchInputWidth();
      if (searchInput.value.trim().length >= 2) {
        searchComponents();
      }
    });
    syncSearchInputWidth();
    window.addEventListener('resize', () => {
      syncSearchInputWidth();
      scheduleSyncResultsListWidth();
    });
  }

  document.addEventListener('click', (e) => {
    const searchContainer = searchInput?.closest('.quick-edit-search-zone');
    if (resultsList && searchContainer && !searchContainer.contains(e.target)) {
      resultsList.innerHTML = '';
      scheduleSyncResultsListWidth();
    }
  });

  if (deployBtn) {
    deployBtn.addEventListener('click', () => deployBundle(false));
  }

  if (validateBtn) {
    validateBtn.addEventListener('click', () => deployBundle(true));
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (hasUnsavedChanges()) {
        const confirm = window.confirm(t('quickEdit.unsavedChanges'));
        if (!confirm) return;
      }
      clearBundle();
    });
  }

  window.addEventListener('beforeunload', (e) => {
    if (getSelectedArtifactType() === 'LightningQuickEdit' && hasUnsavedChanges()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

export function refreshLightningQuickEditEditorTheme() {
  if (!lightningQuickEditEditor) return;
  try {
    lightningQuickEditEditor.updateOptions({ theme: resolveMonacoThemeId() });
  } catch {
    /* ignore */
  }
}
