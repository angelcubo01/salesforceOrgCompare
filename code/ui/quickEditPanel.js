import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { loadMonaco } from '../editor/monaco.js';
import { t } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';

let quickEditEditor = null;
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
  if (quickEditEditor) return quickEditEditor;

  const monaco = state.monaco || (await loadMonaco());
  state.monaco = monaco;

  quickEditEditor = monaco.editor.create(mount, {
    value: '',
    language: 'apex',
    readOnly: false,
    automaticLayout: true,
    minimap: { enabled: true },
    wordWrap: state.wordWrapEnabled ? 'on' : 'off',
    theme: 'sfoc-editor-dark',
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
    scrollbar: { useShadows: false, vertical: 'auto', horizontal: 'auto' }
  });

  quickEditEditor.onDidChangeModelContent(() => {
    updateDeployButtonState();
    updateModifiedIndicator();
  });

  return quickEditEditor;
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
  
  if (!searchInput || !resultsList) return;

  const searchTerm = searchInput.value.trim();

  if (!state.leftOrgId) {
    resultsList.innerHTML = `<div class="quick-edit-results-empty">${t('quickEdit.selectOrgFirst')}</div>`;
    return;
  }

  if (searchTerm.length < 2) {
    resultsList.innerHTML = `<div class="quick-edit-results-empty">${t('quickEdit.minChars')}</div>`;
    return;
  }

  resultsList.innerHTML = `<div class="quick-edit-results-loading">${t('quickEdit.searching')}</div>`;

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
      return;
    }

    const items = res.items || [];
    if (items.length === 0) {
      resultsList.innerHTML = `<div class="quick-edit-results-empty">${t('quickEdit.noResults')}</div>`;
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
  } catch (e) {
    resultsList.innerHTML = `<div class="quick-edit-results-empty">${t('quickEdit.searchError')}</div>`;
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

  await ensureEditor();
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
        if (resultsList) resultsList.innerHTML = '';
      }
    });
    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim().length >= 2) {
        searchComponents();
      }
    });
  }

  document.addEventListener('click', (e) => {
    const searchContainer = searchInput?.closest('.quick-edit-search-bar');
    if (resultsList && searchContainer && !searchContainer.contains(e.target)) {
      resultsList.innerHTML = '';
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
