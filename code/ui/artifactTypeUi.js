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

export function isAnonymousApexMode() {
  return getSelectedArtifactType() === 'AnonymousApex';
}

export function isOrgLimitsMode() {
  return getSelectedArtifactType() === 'OrgLimits';
}

export function isDebugLogBrowserMode() {
  return getSelectedArtifactType() === 'DebugLogBrowser';
}

export function isSetupAuditTrailMode() {
  return getSelectedArtifactType() === 'SetupAuditTrail';
}

export function isQuickEditMode() {
  return getSelectedArtifactType() === 'QuickEdit';
}

export function isOperationPlaceholder() {
  return !getSelectedArtifactType();
}

/** Modos de herramienta a pantalla completa sin editor (Monaco). */
export function isFullScreenToolMode() {
  return (
    isGeneratePackageXmlMode() ||
    isApexTestsMode() ||
    isFieldDependencyMode() ||
    isAnonymousApexMode() ||
    isOrgLimitsMode() ||
    isDebugLogBrowserMode() ||
    isSetupAuditTrailMode() ||
    isQuickEditMode()
  );
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
  const isAnonymousApex = op === 'AnonymousApex';
  const isOrgLimits = op === 'OrgLimits';
  const isDebugLogs = op === 'DebugLogBrowser';
  const isSetupAudit = op === 'SetupAuditTrail';
  const isFieldDep = op === 'FieldDependency';
  const isQuickEdit = op === 'QuickEdit';
  document.body.classList.toggle('artifact-generate-package-xml', isGen);
  document.body.classList.toggle(
    'artifact-generate-package-xml-compare',
    isGen && !!state.generatePackageXmlCompareMode
  );
  document.body.classList.toggle('artifact-apex-tests', isApexTests);
  document.body.classList.toggle('artifact-anonymous-apex', isAnonymousApex);
  document.body.classList.toggle(
    'artifact-anonymous-apex-compare',
    isAnonymousApex && !!state.anonymousApexCompareMode
  );
  document.body.classList.toggle('artifact-field-dependency', isFieldDep);
  document.body.classList.toggle('artifact-org-limits', isOrgLimits);
  document.body.classList.toggle('artifact-debug-log-browser', isDebugLogs);
  document.body.classList.toggle('artifact-setup-audit-trail', isSetupAudit);
  document.body.classList.toggle('artifact-quick-edit', isQuickEdit);
  document.body.classList.toggle(
    'artifact-org-limits-compare',
    isOrgLimits && !!state.orgLimitsCompareMode
  );
  document.body.classList.toggle('artifact-no-operation', isNone);

  const searchPanel = document.getElementById('searchPanel');
  const packagePanel = document.getElementById('packageXmlPanel');
  const anonymousScriptsSidebar = document.getElementById('anonymousApexScriptsSidebar');
  const clearBtn = document.getElementById('clearHistoryButton');
  const leftList = document.getElementById('leftList');
  const standardPanel = document.getElementById('standardComparePanel');
  const genPanel = document.getElementById('generatePackageXmlPanel');
  const apexTestsPanel = document.getElementById('apexTestsPanel');
  const fieldDepPanel = document.getElementById('fieldDependencyPanel');
  const anonymousApexPanel = document.getElementById('anonymousApexPanel');
  const orgLimitsPanel = document.getElementById('orgLimitsPanel');
  const debugLogsPanel = document.getElementById('debugLogBrowserPanel');
  const setupAuditPanel = document.getElementById('setupAuditTrailPanel');
  const quickEditPanel = document.getElementById('quickEditPanel');
  const results = document.getElementById('searchResults');
  const orgDropdowns = document.getElementById('orgDropdowns');
  const landingPanel = document.getElementById('appLandingPanel');

  if (isNone) {
    orgDropdowns?.classList.add('hidden');
    landingPanel?.classList.remove('hidden');
    searchPanel?.classList.add('hidden');
    packagePanel?.classList.add('hidden');
    anonymousScriptsSidebar?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    leftList?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
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
    anonymousScriptsSidebar?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    leftList?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');

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
    searchPanel?.classList.add('hidden');
    packagePanel?.classList.add('hidden');
    anonymousScriptsSidebar?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    leftList?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.remove('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    const right = document.getElementById('rightOrg');
    const rightReauth = document.getElementById('rightReauthBtn');
    if (state.generatePackageXmlCompareMode) {
      if (right) right.disabled = false;
      if (rightReauth) {
        rightReauth.disabled = false;
        rightReauth.classList.remove('hidden');
      }
    } else {
      state.rightOrgId = null;
      if (right) {
        right.value = '';
        right.disabled = true;
      }
      if (rightReauth) {
        rightReauth.classList.add('hidden');
        rightReauth.disabled = true;
      }
    }
  } else if (isApexTests) {
    applySingleLeftOrgToolUi();
    apexTestsPanel?.classList.remove('hidden');
    anonymousApexPanel?.classList.add('hidden');
    anonymousScriptsSidebar?.classList.add('hidden');
  } else if (isAnonymousApex) {
    searchPanel?.classList.add('hidden');
    packagePanel?.classList.add('hidden');
    anonymousScriptsSidebar?.classList.remove('hidden');
    clearBtn?.classList.add('hidden');
    leftList?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.remove('hidden');
    orgLimitsPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    const right = document.getElementById('rightOrg');
    const rightReauth = document.getElementById('rightReauthBtn');
    if (state.anonymousApexCompareMode) {
      if (right) right.disabled = false;
      if (rightReauth) {
        rightReauth.disabled = false;
        rightReauth.classList.remove('hidden');
      }
    } else {
      state.rightOrgId = null;
      if (right) {
        right.value = '';
        right.disabled = true;
      }
      if (rightReauth) {
        rightReauth.classList.add('hidden');
        rightReauth.disabled = true;
      }
    }
  } else if (isOrgLimits) {
    searchPanel?.classList.add('hidden');
    packagePanel?.classList.add('hidden');
    anonymousScriptsSidebar?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    leftList?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.remove('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    const right = document.getElementById('rightOrg');
    const rightReauth = document.getElementById('rightReauthBtn');
    if (state.orgLimitsCompareMode) {
      if (right) right.disabled = false;
      if (rightReauth) {
        rightReauth.disabled = false;
        rightReauth.classList.remove('hidden');
      }
    } else {
      state.rightOrgId = null;
      if (right) {
        right.value = '';
        right.disabled = true;
      }
      if (rightReauth) {
        rightReauth.classList.add('hidden');
        rightReauth.disabled = true;
      }
    }
  } else if (isDebugLogs) {
    applySingleLeftOrgToolUi();
    debugLogsPanel?.classList.remove('hidden');
    setupAuditPanel?.classList.add('hidden');
  } else if (isSetupAudit) {
    applySingleLeftOrgToolUi();
    setupAuditPanel?.classList.remove('hidden');
  } else if (isQuickEdit) {
    applySingleLeftOrgToolUi();
    quickEditPanel?.classList.remove('hidden');
  } else if (isFieldDep) {
    searchPanel?.classList.add('hidden');
    packagePanel?.classList.add('hidden');
    anonymousScriptsSidebar?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    leftList?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.remove('hidden');
    anonymousApexPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');

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
    anonymousScriptsSidebar?.classList.add('hidden');
    clearBtn?.classList.remove('hidden');
    leftList?.classList.remove('hidden');
    standardPanel?.classList.remove('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');

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

  if (
    results &&
    (isGen ||
      isApexTests ||
      isAnonymousApex ||
      isOrgLimits ||
      isDebugLogs ||
      isSetupAudit ||
      isFieldDep ||
      isQuickEdit ||
      op === 'PackageXml' ||
      isNone)
  ) {
    results.style.display = 'none';
    results.innerHTML = '';
  }

  syncSearchInputState();

  updateOrgDropdownLayout();
  updateAuthIndicators();
  updateOrgSelectorsLockedState();
  updateDocumentTitle();
}
