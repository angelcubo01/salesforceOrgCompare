import { state } from '../core/state.js';
import { updateOrgDropdownLayout, updateAuthIndicators } from './orgs.js';
import { updateOrgSelectorsLockedState } from './viewerChrome.js';
import { updateDocumentTitle } from './documentMeta.js';
import { t } from '../../shared/i18n.js';

export function getSelectedArtifactType() {
  const el = document.getElementById('typeSelect');
  return el ? el.value : '';
}

export function isGeneratePackageXmlMode() {
  return getSelectedArtifactType() === 'GeneratePackageXml';
}

export function isFieldDependencyMode() {
  return getSelectedArtifactType() === 'FieldDependency';
}

export function isApexTestsMode() {
  return getSelectedArtifactType() === 'ApexTests';
}

export function isOperationPlaceholder() {
  return !getSelectedArtifactType();
}

/** Modos de herramienta a pantalla completa sin editor (Monaco). */
export function isFullScreenToolMode() {
  return isGeneratePackageXmlMode() || isApexTestsMode() || isFieldDependencyMode();
}

function syncSearchInputState() {
  const input = document.getElementById('searchInput');
  const panel = document.getElementById('searchPanel');
  if (!input) return;
  const searchHidden = panel?.classList.contains('hidden');
  if (searchHidden) {
    input.disabled = true;
    panel?.classList.remove('search-panel-locked');
    return;
  }
  const op = getSelectedArtifactType();
  const locked = !op;
  if (locked) {
    input.disabled = true;
    input.value = '';
    input.placeholder = t('code.searchSelectOperationFirst');
    panel?.classList.add('search-panel-locked');
  } else {
    input.disabled = false;
    input.placeholder = t('code.searchPlaceholder');
    panel?.classList.remove('search-panel-locked');
  }
}

/**
 * Aplica visibilidad y estado de orgs según el tipo de metadata seleccionado.
 * No llama a `renderEditor` (evita dependencias circulares); hazlo desde el caller.
 */
export function applyArtifactTypeUi() {
  const op = getSelectedArtifactType();
  state.selectedArtifactType = op;
  const isNone = !op;
  const isGen = op === 'GeneratePackageXml';
  const isApexTests = op === 'ApexTests';
  const isFieldDep = op === 'FieldDependency';
  document.body.classList.toggle('artifact-generate-package-xml', isGen);
  document.body.classList.toggle('artifact-apex-tests', isApexTests);
  document.body.classList.toggle('artifact-field-dependency', isFieldDep);
  document.body.classList.toggle('artifact-no-operation', isNone);

  const searchPanel = document.getElementById('searchPanel');
  const packagePanel = document.getElementById('packageXmlPanel');
  const clearBtn = document.getElementById('clearHistoryButton');
  const leftList = document.getElementById('leftList');
  const standardPanel = document.getElementById('standardComparePanel');
  const genPanel = document.getElementById('generatePackageXmlPanel');
  const apexTestsPanel = document.getElementById('apexTestsPanel');
  const fieldDepPanel = document.getElementById('fieldDependencyPanel');
  const results = document.getElementById('searchResults');
  const orgDropdowns = document.getElementById('orgDropdowns');
  const landingPanel = document.getElementById('appLandingPanel');

  if (isNone) {
    orgDropdowns?.classList.add('hidden');
    landingPanel?.classList.remove('hidden');
    searchPanel?.classList.add('hidden');
    packagePanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    leftList?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    if (results) {
      results.style.display = 'none';
      results.innerHTML = '';
    }
    syncSearchInputState();
    updateOrgDropdownLayout();
    updateAuthIndicators();
    updateOrgSelectorsLockedState();
    updateDocumentTitle();
    return;
  }

  landingPanel?.classList.add('hidden');
  orgDropdowns?.classList.remove('hidden');

  function applySingleLeftOrgToolUi() {
    searchPanel?.classList.add('hidden');
    packagePanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    leftList?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');

    state.rightOrgId = null;
    const right = document.getElementById('rightOrg');
    if (right) {
      right.value = '';
      right.disabled = true;
    }
    const rightReauth = document.getElementById('rightReauthBtn');
    if (rightReauth) {
      rightReauth.classList.add('hidden');
      rightReauth.disabled = true;
    }
  }

  if (isGen) {
    applySingleLeftOrgToolUi();
    genPanel?.classList.remove('hidden');
  } else if (isApexTests) {
    applySingleLeftOrgToolUi();
    apexTestsPanel?.classList.remove('hidden');
  } else if (isFieldDep) {
    searchPanel?.classList.add('hidden');
    packagePanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    leftList?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.remove('hidden');

    const right = document.getElementById('rightOrg');
    if (right) {
      right.disabled = false;
    }
    const rightReauth = document.getElementById('rightReauthBtn');
    if (rightReauth) {
      rightReauth.disabled = false;
      rightReauth.classList.remove('hidden');
    }
  } else {
    const isPkg = op === 'PackageXml';
    searchPanel?.classList.toggle('hidden', isPkg);
    packagePanel?.classList.toggle('hidden', !isPkg);
    clearBtn?.classList.remove('hidden');
    leftList?.classList.remove('hidden');
    standardPanel?.classList.remove('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');

    const right = document.getElementById('rightOrg');
    if (right) {
      right.disabled = false;
    }
    const rightReauth = document.getElementById('rightReauthBtn');
    if (rightReauth) {
      rightReauth.disabled = false;
      rightReauth.classList.remove('hidden');
    }
  }

  if (results && (isGen || isApexTests || isFieldDep || op === 'PackageXml' || isNone)) {
    results.style.display = 'none';
    results.innerHTML = '';
  }

  syncSearchInputState();

  updateOrgDropdownLayout();
  updateAuthIndicators();
  updateOrgSelectorsLockedState();
  updateDocumentTitle();
}
