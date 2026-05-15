import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { loadMonaco, resolveMonacoThemeId, createStandaloneEditorSafe } from '../editor/monaco.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { t } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';

const QUICK_EDIT_SEARCH_MIN_PX = 288;

/** Si no hay `field-sizing: content`, ajusta el ancho del input al texto (Chrome antiguo / fallback). */
function syncQuickEditSearchInputWidth() {
  const input = document.getElementById('quickEditSearchInput');
  if (!input) return;
  if (typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content')) {
    input.style.removeProperty('width');
    scheduleSyncQuickEditResultsListWidth();
    return;
  }
  const zone = input.closest('.quick-edit-search-zone');
  const maxW =
    zone?.getBoundingClientRect().width || input.closest('.quick-edit-panel-inner')?.clientWidth || 1200;

  window.requestAnimationFrame(() => {
    if (!input.value.trim()) {
      input.style.width = `${Math.min(maxW, QUICK_EDIT_SEARCH_MIN_PX)}px`;
      syncQuickEditResultsListWidth();
      return;
    }
    input.style.width = '0';
    const needed = Math.max(QUICK_EDIT_SEARCH_MIN_PX, input.scrollWidth + 20);
    input.style.width = `${Math.min(maxW, needed)}px`;
    syncQuickEditResultsListWidth();
  });
}

const QUICK_EDIT_RESULTS_WIDTH_CAP_PX = 1400;

/** Ancho lista = max(ancho input, contenido más ancho); tope viewport (complementa CSS #quickEditResultsList). */
function syncQuickEditResultsListWidth() {
  const list = document.getElementById('quickEditResultsList');
  const input = document.getElementById('quickEditSearchInput');
  if (!list || !input || list.childElementCount === 0) {
    list?.style.removeProperty('width');
    return;
  }

  const cap = Math.min(window.innerWidth - 40, QUICK_EDIT_RESULTS_WIDTH_CAP_PX);

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

function scheduleSyncQuickEditResultsListWidth() {
  window.requestAnimationFrame(() => syncQuickEditResultsListWidth());
}

let quickEditEditor = null;
/** @type {Promise<import('monaco-editor').editor.IStandaloneCodeEditor | null> | null} */
let quickEditEditorInit = null;
let currentEditItem = null;
let originalContent = '';
let isDeploying = false;

function isCurrentOrgSandbox() {
  if (!state.leftOrgId) return false;
  const org = (state.orgsList || []).find((o) => o.id === state.leftOrgId);
  return org?.isSandbox === true;
}

async function logQuickEditUsage(action, success, errorMessage = '') {
  try {
    await bg({
      type: 'usage:log',
      entry: {
        kind: 'codeComparison',
        action,
        artifactType:  'ApexClassQuickEdit',
        descriptor: { name: currentEditItem?.name || '' },
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


function updateDeployButtonState() {
  const deployBtn = document.getElementById('quickEditDeployBtn');
  const validateBtn = document.getElementById('quickEditValidateBtn');
  if (!deployBtn || !validateBtn) return;

  const hasContent = quickEditEditor && quickEditEditor.getValue().trim().length > 0;
  const hasItem = !!currentEditItem;
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

function hasUnsavedChanges() {
  if (!quickEditEditor || !currentEditItem) return false;
  return quickEditEditor.getValue() !== originalContent;
}

async function ensureEditor() {
  const mount = document.getElementById('quickEditEditorMount');
  if (!mount) return null;
  if (quickEditEditor) {
    try {
      if (quickEditEditor.getContainerDomNode() === mount) return quickEditEditor;
    } catch {
      quickEditEditor = null;
    }
  }
  if (quickEditEditorInit) return quickEditEditorInit;

  quickEditEditorInit = (async () => {
    const monaco = state.monaco || (await loadMonaco());
    state.monaco = monaco;

    quickEditEditor = createStandaloneEditorSafe(
      monaco,
      mount,
      {
        value: '',
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
      quickEditEditor
    );

    quickEditEditor.onDidChangeModelContent(() => {
      updateDeployButtonState();
      updateModifiedIndicator();
    });

    return quickEditEditor;
  })();

  try {
    return await quickEditEditorInit;
  } finally {
    quickEditEditorInit = null;
  }
}

function updateModifiedIndicator() {
  const indicator = document.getElementById('quickEditModifiedIndicator');
  if (!indicator) return;
  if (hasUnsavedChanges()) {
    indicator.classList.remove('hidden');
  } else {
    indicator.classList.add('hidden');
  }
}


async function searchComponents() {
  const searchInput = document.getElementById('quickEditSearchInput');
  const resultsList = document.getElementById('quickEditResultsList');
  const bumpListWidth = () => scheduleSyncQuickEditResultsListWidth();

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
      artifactType: 'ApexClass',
      prefix: searchTerm
    });

    if (!res?.ok) {
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
      btn.textContent = item.name || item.developerName || '(sin nombre)';
      btn.addEventListener('click', () => loadComponent('ApexClass', item));
      resultsList.appendChild(btn);
    }
    bumpListWidth();
  } catch (e) {
    resultsList.innerHTML = `<div class="quick-edit-results-empty">${t('quickEdit.searchError')}</div>`;
    bumpListWidth();
  }
}

async function loadComponent(type, item) {
  if (hasUnsavedChanges()) {
    const confirm = window.confirm(t('quickEdit.unsavedChanges'));
    if (!confirm) return;
  }

  setStatus(t('quickEdit.loading'), 'warning');
  setDeployStatus('');

  try {
    const descriptor = {
      name: item.name || item.developerName,
      bundleId: item.id,
      bundleDeveloperName: item.developerName
    };

    const res = await bg({
      type: 'fetchSource',
      orgId: state.leftOrgId,
      artifactType: 'ApexClass',
      descriptor
    });

    if (!res?.ok) {
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

    const mainFile = files[0];
    const content = mainFile.content || '';

    await ensureEditor();
    
    const monaco = state.monaco;
    if (monaco) {
      monaco.editor.setModelLanguage(quickEditEditor.getModel(), 'apex');
    }

    quickEditEditor.setValue(content);
    originalContent = content;
    currentEditItem = {
      type: 'ApexClass',
      name: item.name || item.developerName,
      fileName: mainFile.fileName
    };

    updateDeployButtonState();
    updateModifiedIndicator();
    updateCurrentFileDisplay();
    
    setStatus(t('quickEdit.loaded', { name: currentEditItem.name }), 'success');

    const resultsList = document.getElementById('quickEditResultsList');
    if (resultsList) {
      resultsList.innerHTML = '';
    }
    const searchInput = document.getElementById('quickEditSearchInput');
    if (searchInput) {
      searchInput.value = '';
    }
  } catch (e) {
    setStatus(`${t('quickEdit.loadError')}: ${e.message}`, 'error');
  }
}

function updateCurrentFileDisplay() {
  const display = document.getElementById('quickEditCurrentFile');
  if (!display) return;
  if (currentEditItem) {
    display.textContent = `${currentEditItem.type}: ${currentEditItem.name}`;
  } else {
    display.textContent = t('quickEdit.noFileLoaded');
  }
}

async function deployComponent(checkOnly = false) {
  if (!currentEditItem || !quickEditEditor) {
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

  const content = quickEditEditor.getValue();
  if (!content.trim()) {
    showToast(t('quickEdit.emptyContent'), 'warn');
    return;
  }

  const action = checkOnly ? t('quickEdit.validating') : t('quickEdit.deploying');
  showToastWithSpinner(action);
  isDeploying = true;
  updateDeployButtonState();

  try {
    const res = await bg({
      type: 'metadata:deploy',
      orgId: state.leftOrgId,
      metadataType: currentEditItem.type,
      memberName: currentEditItem.name,
      content,
      fileName: currentEditItem.fileName,
      checkOnly
    });

    const actionType = checkOnly ? 'validate' : 'deploy';
    
    if (res?.ok) {
      const successMsg = checkOnly ? t('quickEdit.validationSuccess') : t('quickEdit.deploySuccess');
      setDeployStatus(successMsg, 'success');
      showToast(successMsg, 'info');
      
      if (!checkOnly) {
        originalContent = content;
        updateModifiedIndicator();
      }
      
      void logQuickEditUsage(actionType, true);
    } else {
      let errorMsg = res?.errorMessage || t('quickEdit.deployError');
      
      if (res?.componentFailures && res.componentFailures.length > 0) {
        const failure = res.componentFailures[0];
        const line = failure.lineNumber ? ` (${t('quickEdit.line')} ${failure.lineNumber})` : '';
        errorMsg = `${failure.problem}${line}`;
        
        if (failure.lineNumber && quickEditEditor) {
          const lineNum = parseInt(failure.lineNumber, 10);
          if (lineNum > 0) {
            quickEditEditor.revealLineInCenter(lineNum);
            quickEditEditor.setPosition({ lineNumber: lineNum, column: 1 });
          }
        }
      }
      
      setDeployStatus(errorMsg, 'error');
      showToast(errorMsg, 'error');
      void logQuickEditUsage(actionType, false, errorMsg);
    }
  } catch (e) {
    const errorMsg = `${t('quickEdit.deployError')}: ${e.message}`;
    setDeployStatus(errorMsg, 'error');
    showToast(errorMsg, 'error');
    void logQuickEditUsage(checkOnly ? 'validate' : 'deploy', false, errorMsg);
  } finally {
    dismissSpinnerToast();
    isDeploying = false;
    updateDeployButtonState();
  }
}

export async function refreshQuickEditPanel() {
  if (!state.leftOrgId) {
    return;
  }

  if (getSelectedArtifactType() === 'QuickEdit') {
    await ensureEditor();
  }
  updateCurrentFileDisplay();
  updateDeployButtonState();
}

export function setupQuickEditPanel() {
  const searchInput = document.getElementById('quickEditSearchInput');
  const resultsList = document.getElementById('quickEditResultsList');
  const deployBtn = document.getElementById('quickEditDeployBtn');
  const validateBtn = document.getElementById('quickEditValidateBtn');
  const clearBtn = document.getElementById('quickEditClearBtn');

  if (searchInput) {
    let searchTimeout = null;
    searchInput.addEventListener('input', () => {
      syncQuickEditSearchInputWidth();
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
          scheduleSyncQuickEditResultsListWidth();
        }
      }
    });
    searchInput.addEventListener('focus', () => {
      syncQuickEditSearchInputWidth();
      if (searchInput.value.trim().length >= 2) {
        searchComponents();
      }
    });
    syncQuickEditSearchInputWidth();
    window.addEventListener('resize', () => {
      syncQuickEditSearchInputWidth();
      scheduleSyncQuickEditResultsListWidth();
    });
  }

  document.addEventListener('click', (e) => {
    const searchContainer = searchInput?.closest('.quick-edit-search-zone');
    if (resultsList && searchContainer && !searchContainer.contains(e.target)) {
      resultsList.innerHTML = '';
      scheduleSyncQuickEditResultsListWidth();
    }
  });

  if (deployBtn) {
    deployBtn.addEventListener('click', () => deployComponent(false));
  }

  if (validateBtn) {
    validateBtn.addEventListener('click', () => deployComponent(true));
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (hasUnsavedChanges()) {
        const confirm = window.confirm(t('quickEdit.unsavedChanges'));
        if (!confirm) return;
      }
      if (quickEditEditor) {
        quickEditEditor.setValue('');
      }
      currentEditItem = null;
      originalContent = '';
      setStatus('');
      setDeployStatus('');
      updateCurrentFileDisplay();
      updateDeployButtonState();
      updateModifiedIndicator();
    });
  }

  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

export function refreshQuickEditEditorTheme() {
  if (!quickEditEditor) return;
  try {
    quickEditEditor.updateOptions({ theme: resolveMonacoThemeId() });
  } catch {
    /* ignore */
  }
}
