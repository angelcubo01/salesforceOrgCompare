import { state } from '../core/state.js';
import { APP_NAV_DEVELOPMENT_TOOLS } from '../core/constants.js';
import { updateOrgDropdownLayout, updateAuthIndicators } from './orgs.js';
import { updateOrgSelectorsLockedState } from './viewerChrome.js';
import { updateDocumentTitle } from './documentMeta.js';
import { t } from '../../shared/i18n.js';
import { hideSidebarSearchResults } from './searchSetup.js';
import { syncCompareListToolbarVisibility } from './listUi.js';

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

export function isQueryExplorerMode() {
  return getSelectedArtifactType() === 'QueryExplorer';
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

export function isPermissionDiffMode() {
  return getSelectedArtifactType() === 'PermissionDiff';
}

export function isQuickEditMode() {
  return getSelectedArtifactType() === 'QuickEdit';
}

export function isApexCoverageCompareMode() {
  return getSelectedArtifactType() === 'ApexCoverageCompare';
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
    isQueryExplorerMode() ||
    isOrgLimitsMode() ||
    isDebugLogBrowserMode() ||
    isSetupAuditTrailMode() ||
    isPermissionDiffMode() ||
    isQuickEditMode() ||
    isApexCoverageCompareMode()
  );
}

/** Sidebar oculto: inicio; monitorización; manifiestos excepto comparar package.xml; desarrollo (test & debug). */
function syncHomeLayoutChrome() {
  const mode = state.appNavMode;
  const home = mode === 'home';
  const tool = getSelectedArtifactType();
  const manifestsWithoutComparePkg = mode === 'manifests' && tool !== 'PackageXml';
  const hideForDevTools = APP_NAV_DEVELOPMENT_TOOLS.includes(tool);
  const hideSidebar =
    home || mode === 'monitoring' || manifestsWithoutComparePkg || hideForDevTools;
  document.body.classList.toggle('app-mode-home', home);
  document.querySelector('.content .sidebar')?.classList.toggle('hidden', hideSidebar);
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
  const isQueryExplorer = op === 'QueryExplorer';
  const isOrgLimits = op === 'OrgLimits';
  const isDebugLogs = op === 'DebugLogBrowser';
  const isSetupAudit = op === 'SetupAuditTrail';
  const isPermissionDiff = op === 'PermissionDiff';
  const isFieldDep = op === 'FieldDependency';
  const isQuickEdit = op === 'QuickEdit';
  const isApexCoverageCompare = op === 'ApexCoverageCompare';
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
  document.body.classList.toggle('artifact-query-explorer', isQueryExplorer);
  document.body.classList.toggle(
    'artifact-query-explorer-compare',
    isQueryExplorer && !!state.queryExplorerCompareMode
  );
  document.body.classList.toggle('artifact-field-dependency', isFieldDep);
  document.body.classList.toggle('artifact-org-limits', isOrgLimits);
  document.body.classList.toggle('artifact-debug-log-browser', isDebugLogs);
  document.body.classList.toggle('artifact-setup-audit-trail', isSetupAudit);
  document.body.classList.toggle('artifact-permission-diff', isPermissionDiff);
  document.body.classList.toggle(
    'artifact-permission-diff-compare',
    isPermissionDiff && !!state.permissionDiffCompareMode
  );
  document.body.classList.toggle('artifact-quick-edit', isQuickEdit);
  document.body.classList.toggle('artifact-apex-coverage-compare', isApexCoverageCompare);
  document.body.classList.toggle(
    'artifact-org-limits-compare',
    isOrgLimits && !!state.orgLimitsCompareMode
  );
  document.body.classList.toggle('artifact-no-operation', isNone);

  const searchPanel = document.getElementById('searchPanel');
  const packagePanel = document.getElementById('packageXmlPanel');
  const clearBtn = document.getElementById('clearHistoryButton');
  const compareListBody = document.getElementById('compareListBody');
  const compareListToolbar = document.getElementById('compareListToolbar');
  const standardPanel = document.getElementById('standardComparePanel');
  const genPanel = document.getElementById('generatePackageXmlPanel');
  const apexTestsPanel = document.getElementById('apexTestsPanel');
  const fieldDepPanel = document.getElementById('fieldDependencyPanel');
  const anonymousApexPanel = document.getElementById('anonymousApexPanel');
  const queryExplorerPanel = document.getElementById('queryExplorerPanel');
  const orgLimitsPanel = document.getElementById('orgLimitsPanel');
  const debugLogsPanel = document.getElementById('debugLogBrowserPanel');
  const setupAuditPanel = document.getElementById('setupAuditTrailPanel');
  const permissionDiffPanel = document.getElementById('permissionDiffPanel');
  const quickEditPanel = document.getElementById('quickEditPanel');
  const apexCoverageComparePanel = document.getElementById('apexCoverageComparePanel');
  const orgDropdowns = document.getElementById('orgDropdowns');
  const landingPanel = document.getElementById('appLandingPanel');

  if (isNone) {
    if (state.appNavMode === 'home') {
      orgDropdowns?.classList.add('hidden');
    } else {
      orgDropdowns?.classList.remove('hidden');
    }
    landingPanel?.classList.remove('hidden');
    searchPanel?.classList.add('hidden');
    packagePanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');
    hideSidebarSearchResults();
    syncSearchInputState();
    updateOrgDropdownLayout();
    updateAuthIndicators();
    updateOrgSelectorsLockedState();
    updateDocumentTitle();
    syncHomeLayoutChrome();
    return;
  }

  landingPanel?.classList.add('hidden');
  orgDropdowns?.classList.remove('hidden');

  function applySingleLeftOrgToolUi() {
    searchPanel?.classList.add('hidden');
    packagePanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');

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
    clearBtn?.classList.add('hidden');
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.remove('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');
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
    queryExplorerPanel?.classList.add('hidden');
  } else if (isAnonymousApex) {
    searchPanel?.classList.add('hidden');
    packagePanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.remove('hidden');
    queryExplorerPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');
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
  } else if (isQueryExplorer) {
    searchPanel?.classList.add('hidden');
    packagePanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.remove('hidden');
    orgLimitsPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');
    const rightQx = document.getElementById('rightOrg');
    const rightReauthQx = document.getElementById('rightReauthBtn');
    if (state.queryExplorerCompareMode) {
      if (rightQx) rightQx.disabled = false;
      if (rightReauthQx) {
        rightReauthQx.disabled = false;
        rightReauthQx.classList.remove('hidden');
      }
    } else {
      state.rightOrgId = null;
      if (rightQx) {
        rightQx.value = '';
        rightQx.disabled = true;
      }
      if (rightReauthQx) {
        rightReauthQx.classList.add('hidden');
        rightReauthQx.disabled = true;
      }
    }
  } else if (isPermissionDiff) {
    searchPanel?.classList.add('hidden');
    packagePanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.remove('hidden');
    quickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');
    const rightPd = document.getElementById('rightOrg');
    const rightReauthPd = document.getElementById('rightReauthBtn');
    if (state.permissionDiffCompareMode) {
      if (rightPd) rightPd.disabled = false;
      if (rightReauthPd) {
        rightReauthPd.disabled = false;
        rightReauthPd.classList.remove('hidden');
      }
    } else {
      state.rightOrgId = null;
      if (rightPd) {
        rightPd.value = '';
        rightPd.disabled = true;
      }
      if (rightReauthPd) {
        rightReauthPd.classList.add('hidden');
        rightReauthPd.disabled = true;
      }
    }
  } else if (isOrgLimits) {
    searchPanel?.classList.add('hidden');
    packagePanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.remove('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');
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
  } else if (isApexCoverageCompare) {
    searchPanel?.classList.add('hidden');
    packagePanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.remove('hidden');
    const right = document.getElementById('rightOrg');
    if (right) right.disabled = false;
    const rightReauth = document.getElementById('rightReauthBtn');
    if (rightReauth) {
      rightReauth.disabled = false;
      rightReauth.classList.remove('hidden');
    }
  } else if (isFieldDep) {
    searchPanel?.classList.add('hidden');
    packagePanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.remove('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');

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
    compareListBody?.classList.remove('hidden');
    standardPanel?.classList.remove('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');

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
    isGen ||
    isApexTests ||
    isAnonymousApex ||
    isQueryExplorer ||
    isOrgLimits ||
    isPermissionDiff ||
    isDebugLogs ||
    isSetupAudit ||
    isFieldDep ||
    isQuickEdit ||
    isApexCoverageCompare ||
    op === 'PackageXml' ||
    isNone
  ) {
    hideSidebarSearchResults();
  }

  syncSearchInputState();

  updateOrgDropdownLayout();
  updateAuthIndicators();
  updateOrgSelectorsLockedState();
  updateDocumentTitle();
  syncHomeLayoutChrome();
  syncCompareListToolbarVisibility();
}
