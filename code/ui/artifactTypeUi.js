import { state } from '../core/state.js';
import { APP_NAV_DEVELOPMENT_TOOLS } from '../core/constants.js';
import { updateOrgDropdownLayout, updateAuthIndicators, restorePausedRightOrgIfDualMode, stashAndClearRightOrg } from './orgs.js';
import { updateOrgSelectorsLockedState } from './viewerChrome.js';
import { updateDocumentTitle } from './documentMeta.js';
import { t } from '../../shared/i18n.js';
import { hideSidebarSearchResults } from './searchSetup.js';
import { syncCompareListToolbarVisibility } from './listUi.js';
import { syncAppComparisonToggle } from './appComparisonToggle.js';

export function getSelectedArtifactType() {
  const el = document.getElementById('typeSelect');
  let val = el ? el.value : '';
  if (val === 'StreamingExplorer') {
    val = 'EventMonitor';
    if (el) el.value = val;
  }
  if (val === 'RecordDetail') {
    val = 'DataWorkbench';
    if (el) el.value = val;
  }
  return val;
}

export function isGeneratePackageXmlMode() {
  return getSelectedArtifactType() === 'GeneratePackageXml';
}

export function isMetadataTypeCompareMode() {
  return getSelectedArtifactType() === 'MetadataTypeCompare';
}

export function isFieldDependencyMode() {
  return getSelectedArtifactType() === 'FieldDependency';
}

export function isDependencyExplorerMode() {
  return getSelectedArtifactType() === 'DependencyExplorer';
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

export function isRestExplorerMode() {
  return getSelectedArtifactType() === 'RestExplorer';
}

export function isDataWorkbenchMode() {
  return getSelectedArtifactType() === 'DataWorkbench';
}

export function isBulkJobMonitorMode() {
  return getSelectedArtifactType() === 'BulkJobMonitor';
}

export function isEventMonitorMode() {
  return getSelectedArtifactType() === 'EventMonitor';
}

export function isOrgLimitsMode() {
  return getSelectedArtifactType() === 'OrgLimits';
}

export function isEnvironmentStatusMode() {
  return getSelectedArtifactType() === 'EnvironmentStatus';
}

export function isDeployStatusMode() {
  return getSelectedArtifactType() === 'DeployStatus';
}

export function isDebugLogBrowserMode() {
  return getSelectedArtifactType() === 'DebugLogBrowser';
}

export function isSetupAuditTrailMode() {
  return getSelectedArtifactType() === 'SetupAuditTrail';
}

export function isFieldHistoryMode() {
  return getSelectedArtifactType() === 'FieldHistory';
}

export function isPermissionDiffMode() {
  return getSelectedArtifactType() === 'PermissionDiff';
}

export function isQuickEditMode() {
  return getSelectedArtifactType() === 'QuickEdit';
}

export function isLightningQuickEditMode() {
  return getSelectedArtifactType() === 'LightningQuickEdit';
}

export function isApexCoverageCompareMode() {
  return getSelectedArtifactType() === 'ApexCoverageCompare';
}

export function isCustomSettingsCompareMode() {
  return getSelectedArtifactType() === 'CustomSettingsCompare';
}

export function isCustomMetadataCompareMode() {
  return getSelectedArtifactType() === 'CustomMetadataCompare';
}

export function isRecordCompareMode() {
  return getSelectedArtifactType() === 'RecordCompare';
}

export function isObjectDescribeMode() {
  return getSelectedArtifactType() === 'ObjectDescribe';
}

export function isOperationPlaceholder() {
  return !getSelectedArtifactType();
}

export function isComparatorMode() {
  return state.appNavMode === 'comparator' || getSelectedArtifactType() === 'Comparator';
}

/** Modos de herramienta a pantalla completa sin editor (Monaco). */
export function isFullScreenToolMode() {
  return (
    isGeneratePackageXmlMode() ||
    isMetadataTypeCompareMode() ||
    isApexTestsMode() ||
    isFieldDependencyMode() ||
    isDependencyExplorerMode() ||
    isAnonymousApexMode() ||
    isQueryExplorerMode() ||
    isRestExplorerMode() ||
    isOrgLimitsMode() ||
    isEnvironmentStatusMode() ||
    isDeployStatusMode() ||
    isDebugLogBrowserMode() ||
    isSetupAuditTrailMode() ||
    isFieldHistoryMode() ||
    isPermissionDiffMode() ||
    isQuickEditMode() ||
    isLightningQuickEditMode() ||
    isApexCoverageCompareMode() ||
    isCustomSettingsCompareMode() ||
    isCustomMetadataCompareMode() ||
    isRecordCompareMode() ||
    isObjectDescribeMode() ||
    isDataWorkbenchMode() ||
    isBulkJobMonitorMode() ||
    isEventMonitorMode()
  );
}

/** Sidebar oculto: inicio; monitorización; manifiestos excepto comparar package.xml; desarrollo (test & debug). */
function syncHomeLayoutChrome() {
  const mode = state.appNavMode;
  const home = mode === 'home';
  const tool = getSelectedArtifactType();
  const hideForDevTools = APP_NAV_DEVELOPMENT_TOOLS.includes(tool);
  const hideSidebar =
    home || mode === 'analysis' || mode === 'monitoring' || mode === 'manifests' || hideForDevTools;
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
    input.placeholder = isComparatorMode()
      ? t('code.searchPlaceholderComparator')
      : t('code.searchPlaceholder');
    panel?.classList.remove('search-panel-locked');
  }
}

function syncComparatorActionButtons() {
  const pkgBtn = document.getElementById('packageXmlLoadBtn');
  const show = isComparatorMode();
  pkgBtn?.classList.toggle('hidden', !show);
}

/**
 * Aplica visibilidad y estado de orgs según el tipo de metadata seleccionado.
 * No llama a `renderEditor` (evita dependencias circulares); hazlo desde el caller.
 */
export function applyArtifactTypeUi() {
  const op = getSelectedArtifactType();
  state.selectedArtifactType = op;
  syncAppComparisonToggle(op);
  const isNone = !op;
  const isGen = op === 'GeneratePackageXml';
  const isMetadataTypeCompare = op === 'MetadataTypeCompare';
  const isApexTests = op === 'ApexTests';
  const isAnonymousApex = op === 'AnonymousApex';
  const isQueryExplorer = op === 'QueryExplorer';
  const isRestExplorer = op === 'RestExplorer';
  const isDataWorkbench = op === 'DataWorkbench';
  const isBulkJobMonitor = op === 'BulkJobMonitor';
  const isEventMonitor = op === 'EventMonitor';
  const isOrgLimits = op === 'OrgLimits';
  const isEnvironmentStatus = op === 'EnvironmentStatus';
  const isDeployStatus = op === 'DeployStatus';
  const isDebugLogs = op === 'DebugLogBrowser';
  const isSetupAudit = op === 'SetupAuditTrail';
  const isFieldHistory = op === 'FieldHistory';
  const isPermissionDiff = op === 'PermissionDiff';
  const isFieldDep = op === 'FieldDependency';
  const isDepExplorer = op === 'DependencyExplorer';
  const isQuickEdit = op === 'QuickEdit';
  const isLightningQuickEdit = op === 'LightningQuickEdit';
  const isApexCoverageCompare = op === 'ApexCoverageCompare';
  const isCustomSettingsCompare = op === 'CustomSettingsCompare';
  const isCustomMetadataCompare = op === 'CustomMetadataCompare';
  const isRecordCompare = op === 'RecordCompare';
  const isObjectDescribe = op === 'ObjectDescribe';
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
  document.body.classList.toggle('artifact-rest-explorer', isRestExplorer);
  document.body.classList.toggle('artifact-data-workbench', isDataWorkbench);
  document.body.classList.toggle(
    'artifact-query-explorer-compare',
    isQueryExplorer && !!state.queryExplorerCompareMode
  );
  document.body.classList.toggle('artifact-field-dependency', isFieldDep);
  document.body.classList.toggle('artifact-dependency-explorer', isDepExplorer);
  document.body.classList.toggle(
    'artifact-dependency-explorer-compare',
    isDepExplorer && !!state.dependencyExplorerCompareMode
  );
  document.body.classList.toggle('artifact-org-limits', isOrgLimits);
  document.body.classList.toggle('artifact-environment-status', isEnvironmentStatus);
  document.body.classList.toggle('artifact-deploy-status', isDeployStatus);
  document.body.classList.toggle('artifact-debug-log-browser', isDebugLogs);
  document.body.classList.toggle('artifact-setup-audit-trail', isSetupAudit);
  document.body.classList.toggle('artifact-field-history', isFieldHistory);
  document.body.classList.toggle('artifact-permission-diff', isPermissionDiff);
  document.body.classList.toggle(
    'artifact-permission-diff-compare',
    isPermissionDiff && !!state.permissionDiffCompareMode
  );
  document.body.classList.toggle('artifact-quick-edit', isQuickEdit);
  document.body.classList.toggle('artifact-lightning-quick-edit', isLightningQuickEdit);
  document.body.classList.toggle('artifact-apex-coverage-compare', isApexCoverageCompare);
  document.body.classList.toggle('artifact-custom-settings-compare', isCustomSettingsCompare);
  document.body.classList.toggle('artifact-custom-metadata-compare', isCustomMetadataCompare);
  document.body.classList.toggle('artifact-record-compare', isRecordCompare);
  document.body.classList.toggle('artifact-object-describe', isObjectDescribe);
  document.body.classList.toggle('artifact-bulk-job-monitor', isBulkJobMonitor);
  document.body.classList.toggle('artifact-event-monitor', isEventMonitor);
  document.body.classList.toggle(
    'artifact-record-compare-compare',
    isRecordCompare && !!state.recordCompareCompareMode
  );
  document.body.classList.toggle(
    'artifact-org-limits-compare',
    isOrgLimits && !!state.orgLimitsCompareMode
  );
  document.body.classList.toggle('artifact-metadata-type-compare', isMetadataTypeCompare);

  const searchPanel = document.getElementById('searchPanel');
  const clearBtn = document.getElementById('clearHistoryButton');
  const compareListBody = document.getElementById('compareListBody');
  const compareListToolbar = document.getElementById('compareListToolbar');
  const standardPanel = document.getElementById('standardComparePanel');
  const genPanel = document.getElementById('generatePackageXmlPanel');
  const metadataTypeComparePanel = document.getElementById('metadataTypeComparePanel');
  const apexTestsPanel = document.getElementById('apexTestsPanel');
  const fieldDepPanel = document.getElementById('fieldDependencyPanel');
  const objectDescribePanel = document.getElementById('objectDescribePanel');
  const depExplorerPanel = document.getElementById('dependencyExplorerPanel');
  const anonymousApexPanel = document.getElementById('anonymousApexPanel');
  const queryExplorerPanel = document.getElementById('queryExplorerPanel');
  const restExplorerPanel = document.getElementById('restExplorerPanel');
  const dataWorkbenchPanel = document.getElementById('dataWorkbenchPanel');
  const bulkJobMonitorPanel = document.getElementById('bulkJobMonitorPanel');
  const eventMonitorPanel = document.getElementById('eventMonitorPanel');
  const orgLimitsPanel = document.getElementById('orgLimitsPanel');
  const environmentStatusPanel = document.getElementById('environmentStatusPanel');
  const deployStatusPanel = document.getElementById('deployStatusPanel');
  const debugLogsPanel = document.getElementById('debugLogBrowserPanel');
  const setupAuditPanel = document.getElementById('setupAuditTrailPanel');
  const fieldHistoryPanel = document.getElementById('fieldHistoryPanel');
  const permissionDiffPanel = document.getElementById('permissionDiffPanel');
  const quickEditPanel = document.getElementById('quickEditPanel');
  const lightningQuickEditPanel = document.getElementById('lightningQuickEditPanel');
  const apexCoverageComparePanel = document.getElementById('apexCoverageComparePanel');
  const customSettingsComparePanel = document.getElementById('customSettingsComparePanel');
  const customMetadataComparePanel = document.getElementById('customMetadataComparePanel');
  const recordComparePanel = document.getElementById('recordComparePanel');
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
    clearBtn?.classList.add('hidden');
    syncComparatorActionButtons();
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    objectDescribePanel?.classList.add('hidden');
    depExplorerPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    restExplorerPanel?.classList.add('hidden');
    dataWorkbenchPanel?.classList.add('hidden');
    bulkJobMonitorPanel?.classList.add('hidden');
    eventMonitorPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    environmentStatusPanel?.classList.add('hidden');
    deployStatusPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    fieldHistoryPanel?.classList.add('hidden');
    fieldHistoryPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    lightningQuickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');
    customSettingsComparePanel?.classList.add('hidden');
    customMetadataComparePanel?.classList.add('hidden');
    recordComparePanel?.classList.add('hidden');
    metadataTypeComparePanel?.classList.add('hidden');
    hideSidebarSearchResults();
    syncSearchInputState();
    updateOrgDropdownLayout();
    updateAuthIndicators();
    updateOrgSelectorsLockedState();
    updateDocumentTitle();
    syncHomeLayoutChrome();
    // La navegación publica su cambio antes de aplicar la visibilidad de las
    // fuentes legacy. Avisamos una segunda vez cuando Inicio ya está montado
    // para que Workbench reconstruya sus acciones reales.
    document.dispatchEvent(new CustomEvent('sfoc:artifact-ui-applied'));
    return;
  }

  landingPanel?.classList.add('hidden');
  orgDropdowns?.classList.remove('hidden');

  /** Oculta paneles del comparador sin tocar la selección de orgs (p. ej. estado entornos). */
  function applyFullScreenToolShellUi() {
    searchPanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    syncComparatorActionButtons();
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    objectDescribePanel?.classList.add('hidden');
    depExplorerPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    restExplorerPanel?.classList.add('hidden');
    dataWorkbenchPanel?.classList.add('hidden');
    bulkJobMonitorPanel?.classList.add('hidden');
    eventMonitorPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    environmentStatusPanel?.classList.add('hidden');
    deployStatusPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    fieldHistoryPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    lightningQuickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');
    customSettingsComparePanel?.classList.add('hidden');
    customMetadataComparePanel?.classList.add('hidden');
    recordComparePanel?.classList.add('hidden');
    metadataTypeComparePanel?.classList.add('hidden');
  }

  function applySingleLeftOrgToolUi() {
    applyFullScreenToolShellUi();

    stashAndClearRightOrg();
    const right = document.getElementById('rightOrg');
    if (right) right.disabled = true;
    const rightReauth = document.getElementById('rightReauthBtn');
    if (rightReauth) {
      rightReauth.classList.add('hidden');
      rightReauth.disabled = true;
    }
  }

  if (isGen) {
    searchPanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    syncComparatorActionButtons();
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.remove('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    objectDescribePanel?.classList.add('hidden');
    depExplorerPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    restExplorerPanel?.classList.add('hidden');
    dataWorkbenchPanel?.classList.add('hidden');
    bulkJobMonitorPanel?.classList.add('hidden');
    eventMonitorPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    environmentStatusPanel?.classList.add('hidden');
    deployStatusPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    fieldHistoryPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    lightningQuickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');
    customSettingsComparePanel?.classList.add('hidden');
    customMetadataComparePanel?.classList.add('hidden');
    recordComparePanel?.classList.add('hidden');
    metadataTypeComparePanel?.classList.add('hidden');
    const right = document.getElementById('rightOrg');
    const rightReauth = document.getElementById('rightReauthBtn');
    if (state.generatePackageXmlCompareMode) {
      if (right) right.disabled = false;
      if (rightReauth) {
        rightReauth.disabled = false;
        rightReauth.classList.remove('hidden');
      }
    } else {
      stashAndClearRightOrg();
      if (right) {
        right.value = '';
        right.disabled = true;
      }
      if (rightReauth) {
        rightReauth.classList.add('hidden');
        rightReauth.disabled = true;
      }
    }
  } else if (isMetadataTypeCompare) {
    searchPanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    syncComparatorActionButtons();
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    metadataTypeComparePanel?.classList.remove('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    objectDescribePanel?.classList.add('hidden');
    depExplorerPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    restExplorerPanel?.classList.add('hidden');
    dataWorkbenchPanel?.classList.add('hidden');
    bulkJobMonitorPanel?.classList.add('hidden');
    eventMonitorPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    environmentStatusPanel?.classList.add('hidden');
    deployStatusPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    fieldHistoryPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    lightningQuickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');
    customSettingsComparePanel?.classList.add('hidden');
    customMetadataComparePanel?.classList.add('hidden');
    recordComparePanel?.classList.add('hidden');
    const rightMtc = document.getElementById('rightOrg');
    if (rightMtc) rightMtc.disabled = false;
    const rightReauthMtc = document.getElementById('rightReauthBtn');
    if (rightReauthMtc) {
      rightReauthMtc.disabled = false;
      rightReauthMtc.classList.remove('hidden');
    }
  } else if (isApexTests) {
    applySingleLeftOrgToolUi();
    apexTestsPanel?.classList.remove('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    restExplorerPanel?.classList.add('hidden');
    dataWorkbenchPanel?.classList.add('hidden');
    bulkJobMonitorPanel?.classList.add('hidden');
    eventMonitorPanel?.classList.add('hidden');
  } else if (isAnonymousApex) {
    searchPanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    syncComparatorActionButtons();
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    objectDescribePanel?.classList.add('hidden');
    depExplorerPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.remove('hidden');
    queryExplorerPanel?.classList.add('hidden');
    restExplorerPanel?.classList.add('hidden');
    dataWorkbenchPanel?.classList.add('hidden');
    bulkJobMonitorPanel?.classList.add('hidden');
    eventMonitorPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    environmentStatusPanel?.classList.add('hidden');
    deployStatusPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    fieldHistoryPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    lightningQuickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');
    customSettingsComparePanel?.classList.add('hidden');
    customMetadataComparePanel?.classList.add('hidden');
    recordComparePanel?.classList.add('hidden');
    metadataTypeComparePanel?.classList.add('hidden');
    const right = document.getElementById('rightOrg');
    const rightReauth = document.getElementById('rightReauthBtn');
    if (state.anonymousApexCompareMode) {
      if (right) right.disabled = false;
      if (rightReauth) {
        rightReauth.disabled = false;
        rightReauth.classList.remove('hidden');
      }
    } else {
      stashAndClearRightOrg();
      if (right) {
        right.value = '';
        right.disabled = true;
      }
      if (rightReauth) {
        rightReauth.classList.add('hidden');
        rightReauth.disabled = true;
      }
    }
  } else if (isRestExplorer) {
    applySingleLeftOrgToolUi();
    restExplorerPanel?.classList.remove('hidden');
  } else if (isQueryExplorer) {
    applyFullScreenToolShellUi();
    queryExplorerPanel?.classList.remove('hidden');
    const rightQx = document.getElementById('rightOrg');
    const rightReauthQx = document.getElementById('rightReauthBtn');
    if (state.queryExplorerCompareMode) {
      if (rightQx) rightQx.disabled = false;
      if (rightReauthQx) {
        rightReauthQx.disabled = false;
        rightReauthQx.classList.remove('hidden');
      }
    } else {
      stashAndClearRightOrg();
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
    clearBtn?.classList.add('hidden');
    syncComparatorActionButtons();
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    objectDescribePanel?.classList.add('hidden');
    depExplorerPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    restExplorerPanel?.classList.add('hidden');
    dataWorkbenchPanel?.classList.add('hidden');
    bulkJobMonitorPanel?.classList.add('hidden');
    eventMonitorPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    environmentStatusPanel?.classList.add('hidden');
    deployStatusPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    fieldHistoryPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.remove('hidden');
    quickEditPanel?.classList.add('hidden');
    lightningQuickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');
    customSettingsComparePanel?.classList.add('hidden');
    customMetadataComparePanel?.classList.add('hidden');
    recordComparePanel?.classList.add('hidden');
    metadataTypeComparePanel?.classList.add('hidden');
    const rightPd = document.getElementById('rightOrg');
    const rightReauthPd = document.getElementById('rightReauthBtn');
    if (state.permissionDiffCompareMode) {
      if (rightPd) rightPd.disabled = false;
      if (rightReauthPd) {
        rightReauthPd.disabled = false;
        rightReauthPd.classList.remove('hidden');
      }
    } else {
      stashAndClearRightOrg();
      if (rightPd) {
        rightPd.value = '';
        rightPd.disabled = true;
      }
      if (rightReauthPd) {
        rightReauthPd.classList.add('hidden');
        rightReauthPd.disabled = true;
      }
    }
  } else if (isEnvironmentStatus) {
    applyFullScreenToolShellUi();
    environmentStatusPanel?.classList.remove('hidden');
    orgDropdowns?.classList.add('hidden');
  } else if (isDeployStatus) {
    applySingleLeftOrgToolUi();
    deployStatusPanel?.classList.remove('hidden');
  } else if (isOrgLimits) {
    searchPanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    syncComparatorActionButtons();
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    objectDescribePanel?.classList.add('hidden');
    depExplorerPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    restExplorerPanel?.classList.add('hidden');
    dataWorkbenchPanel?.classList.add('hidden');
    bulkJobMonitorPanel?.classList.add('hidden');
    eventMonitorPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.remove('hidden');
    environmentStatusPanel?.classList.add('hidden');
    deployStatusPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    fieldHistoryPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    lightningQuickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');
    customSettingsComparePanel?.classList.add('hidden');
    customMetadataComparePanel?.classList.add('hidden');
    recordComparePanel?.classList.add('hidden');
    metadataTypeComparePanel?.classList.add('hidden');
    const right = document.getElementById('rightOrg');
    const rightReauth = document.getElementById('rightReauthBtn');
    if (state.orgLimitsCompareMode) {
      if (right) right.disabled = false;
      if (rightReauth) {
        rightReauth.disabled = false;
        rightReauth.classList.remove('hidden');
      }
    } else {
      stashAndClearRightOrg();
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
    fieldHistoryPanel?.classList.add('hidden');
  } else if (isSetupAudit) {
    applySingleLeftOrgToolUi();
    setupAuditPanel?.classList.remove('hidden');
    fieldHistoryPanel?.classList.add('hidden');
  } else if (isFieldHistory) {
    applySingleLeftOrgToolUi();
    fieldHistoryPanel?.classList.remove('hidden');
    setupAuditPanel?.classList.add('hidden');
  } else if (isQuickEdit) {
    applySingleLeftOrgToolUi();
    quickEditPanel?.classList.remove('hidden');
  } else if (isLightningQuickEdit) {
    applySingleLeftOrgToolUi();
    lightningQuickEditPanel?.classList.remove('hidden');
  } else if (isApexCoverageCompare) {
    searchPanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    syncComparatorActionButtons();
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    objectDescribePanel?.classList.add('hidden');
    depExplorerPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    restExplorerPanel?.classList.add('hidden');
    dataWorkbenchPanel?.classList.add('hidden');
    bulkJobMonitorPanel?.classList.add('hidden');
    eventMonitorPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    environmentStatusPanel?.classList.add('hidden');
    deployStatusPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    fieldHistoryPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    lightningQuickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.remove('hidden');
    customSettingsComparePanel?.classList.add('hidden');
    customMetadataComparePanel?.classList.add('hidden');
    recordComparePanel?.classList.add('hidden');
    metadataTypeComparePanel?.classList.add('hidden');
    const right = document.getElementById('rightOrg');
    if (right) right.disabled = false;
    const rightReauth = document.getElementById('rightReauthBtn');
    if (rightReauth) {
      rightReauth.disabled = false;
      rightReauth.classList.remove('hidden');
    }
  } else if (isCustomSettingsCompare) {
    searchPanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    syncComparatorActionButtons();
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    objectDescribePanel?.classList.add('hidden');
    depExplorerPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    restExplorerPanel?.classList.add('hidden');
    dataWorkbenchPanel?.classList.add('hidden');
    bulkJobMonitorPanel?.classList.add('hidden');
    eventMonitorPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    environmentStatusPanel?.classList.add('hidden');
    deployStatusPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    fieldHistoryPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    lightningQuickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');
    customMetadataComparePanel?.classList.add('hidden');
    recordComparePanel?.classList.add('hidden');
    metadataTypeComparePanel?.classList.add('hidden');
    customSettingsComparePanel?.classList.remove('hidden');
    const rightCs = document.getElementById('rightOrg');
    if (rightCs) rightCs.disabled = false;
    const rightReauthCs = document.getElementById('rightReauthBtn');
    if (rightReauthCs) {
      rightReauthCs.disabled = false;
      rightReauthCs.classList.remove('hidden');
    }
  } else if (isCustomMetadataCompare) {
    searchPanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    syncComparatorActionButtons();
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    objectDescribePanel?.classList.add('hidden');
    depExplorerPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    restExplorerPanel?.classList.add('hidden');
    dataWorkbenchPanel?.classList.add('hidden');
    bulkJobMonitorPanel?.classList.add('hidden');
    eventMonitorPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    environmentStatusPanel?.classList.add('hidden');
    deployStatusPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    fieldHistoryPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    lightningQuickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');
    customSettingsComparePanel?.classList.add('hidden');
    customMetadataComparePanel?.classList.remove('hidden');
    recordComparePanel?.classList.add('hidden');
    metadataTypeComparePanel?.classList.add('hidden');
    const rightCm = document.getElementById('rightOrg');
    if (rightCm) rightCm.disabled = false;
    const rightReauthCm = document.getElementById('rightReauthBtn');
    if (rightReauthCm) {
      rightReauthCm.disabled = false;
      rightReauthCm.classList.remove('hidden');
    }
  } else if (isRecordCompare) {
    searchPanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    syncComparatorActionButtons();
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    objectDescribePanel?.classList.add('hidden');
    depExplorerPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    restExplorerPanel?.classList.add('hidden');
    dataWorkbenchPanel?.classList.add('hidden');
    bulkJobMonitorPanel?.classList.add('hidden');
    eventMonitorPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    environmentStatusPanel?.classList.add('hidden');
    deployStatusPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    fieldHistoryPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    lightningQuickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');
    customSettingsComparePanel?.classList.add('hidden');
    customMetadataComparePanel?.classList.add('hidden');
    recordComparePanel?.classList.remove('hidden');
    const rightRc = document.getElementById('rightOrg');
    const rightReauthRc = document.getElementById('rightReauthBtn');
    if (state.recordCompareCompareMode) {
      if (rightRc) rightRc.disabled = false;
      if (rightReauthRc) {
        rightReauthRc.disabled = false;
        rightReauthRc.classList.remove('hidden');
      }
    } else {
      stashAndClearRightOrg();
      if (rightRc) {
        rightRc.value = '';
        rightRc.disabled = true;
      }
      if (rightReauthRc) {
        rightReauthRc.disabled = true;
        rightReauthRc.classList.add('hidden');
      }
    }
  } else if (isDepExplorer) {
    searchPanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    syncComparatorActionButtons();
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    objectDescribePanel?.classList.add('hidden');
    depExplorerPanel?.classList.remove('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    restExplorerPanel?.classList.add('hidden');
    dataWorkbenchPanel?.classList.add('hidden');
    bulkJobMonitorPanel?.classList.add('hidden');
    eventMonitorPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    environmentStatusPanel?.classList.add('hidden');
    deployStatusPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    fieldHistoryPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    lightningQuickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');
    customSettingsComparePanel?.classList.add('hidden');
    customMetadataComparePanel?.classList.add('hidden');
    recordComparePanel?.classList.add('hidden');
    metadataTypeComparePanel?.classList.add('hidden');
    const rightDep = document.getElementById('rightOrg');
    const rightReauthDep = document.getElementById('rightReauthBtn');
    if (state.dependencyExplorerCompareMode) {
      if (rightDep) rightDep.disabled = false;
      if (rightReauthDep) {
        rightReauthDep.disabled = false;
        rightReauthDep.classList.remove('hidden');
      }
    } else {
      stashAndClearRightOrg();
      if (rightDep) {
        rightDep.value = '';
        rightDep.disabled = true;
      }
      if (rightReauthDep) {
        rightReauthDep.classList.add('hidden');
        rightReauthDep.disabled = true;
      }
    }
  } else if (isFieldDep) {
    searchPanel?.classList.add('hidden');
    clearBtn?.classList.add('hidden');
    syncComparatorActionButtons();
    compareListBody?.classList.add('hidden');
    compareListToolbar?.classList.add('hidden');
    standardPanel?.classList.add('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.remove('hidden');
    objectDescribePanel?.classList.add('hidden');
    depExplorerPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    restExplorerPanel?.classList.add('hidden');
    dataWorkbenchPanel?.classList.add('hidden');
    bulkJobMonitorPanel?.classList.add('hidden');
    eventMonitorPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    environmentStatusPanel?.classList.add('hidden');
    deployStatusPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    fieldHistoryPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    lightningQuickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');
    customSettingsComparePanel?.classList.add('hidden');
    customMetadataComparePanel?.classList.add('hidden');
    recordComparePanel?.classList.add('hidden');
    metadataTypeComparePanel?.classList.add('hidden');

    const right = document.getElementById('rightOrg');
    if (right) {
      right.disabled = false;
    }
    const rightReauth = document.getElementById('rightReauthBtn');
    if (rightReauth) {
      rightReauth.disabled = false;
      rightReauth.classList.remove('hidden');
    }
  } else if (isObjectDescribe) {
    applySingleLeftOrgToolUi();
    objectDescribePanel?.classList.remove('hidden');
  } else if (isDataWorkbench) {
    applySingleLeftOrgToolUi();
    dataWorkbenchPanel?.classList.remove('hidden');
  } else if (isBulkJobMonitor) {
    applySingleLeftOrgToolUi();
    bulkJobMonitorPanel?.classList.remove('hidden');
  } else if (isEventMonitor) {
    applySingleLeftOrgToolUi();
    eventMonitorPanel?.classList.remove('hidden');
  } else {
    searchPanel?.classList.remove('hidden');
    clearBtn?.classList.remove('hidden');
    compareListBody?.classList.remove('hidden');
    compareListToolbar?.classList.remove('hidden');
    standardPanel?.classList.remove('hidden');
    genPanel?.classList.add('hidden');
    apexTestsPanel?.classList.add('hidden');
    fieldDepPanel?.classList.add('hidden');
    objectDescribePanel?.classList.add('hidden');
    depExplorerPanel?.classList.add('hidden');
    anonymousApexPanel?.classList.add('hidden');
    queryExplorerPanel?.classList.add('hidden');
    restExplorerPanel?.classList.add('hidden');
    dataWorkbenchPanel?.classList.add('hidden');
    bulkJobMonitorPanel?.classList.add('hidden');
    eventMonitorPanel?.classList.add('hidden');
    orgLimitsPanel?.classList.add('hidden');
    environmentStatusPanel?.classList.add('hidden');
    deployStatusPanel?.classList.add('hidden');
    debugLogsPanel?.classList.add('hidden');
    setupAuditPanel?.classList.add('hidden');
    fieldHistoryPanel?.classList.add('hidden');
    permissionDiffPanel?.classList.add('hidden');
    quickEditPanel?.classList.add('hidden');
    lightningQuickEditPanel?.classList.add('hidden');
    apexCoverageComparePanel?.classList.add('hidden');
    customSettingsComparePanel?.classList.add('hidden');
    customMetadataComparePanel?.classList.add('hidden');
    recordComparePanel?.classList.add('hidden');
    metadataTypeComparePanel?.classList.add('hidden');

    const left = document.getElementById('leftOrg');
    if (left) {
      left.disabled = false;
      left.value = state.leftOrgId || '';
    }
    const right = document.getElementById('rightOrg');
    if (right) {
      right.disabled = false;
      right.value = state.rightOrgId || '';
    }
    const rightReauth = document.getElementById('rightReauthBtn');
    if (rightReauth) {
      rightReauth.disabled = false;
      rightReauth.classList.remove('hidden');
    }
  }

  if (
    isGen ||
    isMetadataTypeCompare ||
    isApexTests ||
    isAnonymousApex ||
    isQueryExplorer ||
    isRestExplorer ||
    isOrgLimits ||
    isEnvironmentStatus ||
    isDeployStatus ||
    isPermissionDiff ||
    isDebugLogs ||
    isSetupAudit ||
    isFieldHistory ||
    isFieldDep ||
    isObjectDescribe ||
    isDataWorkbench ||
    isBulkJobMonitor ||
    isEventMonitor ||
    isDepExplorer ||
    isQuickEdit ||
    isLightningQuickEdit ||
    isApexCoverageCompare ||
    isCustomSettingsCompare ||
    isCustomMetadataCompare ||
    isRecordCompare ||
    isNone
  ) {
    hideSidebarSearchResults();
  }

  syncComparatorActionButtons();
  syncSearchInputState();

  if (isEnvironmentStatus) {
    orgDropdowns?.classList.add('hidden');
  } else {
    orgDropdowns?.classList.remove('hidden');
  }

  updateOrgDropdownLayout();
  restorePausedRightOrgIfDualMode();
  updateOrgDropdownLayout();
  updateAuthIndicators();
  updateOrgSelectorsLockedState();
  updateDocumentTitle();
  syncHomeLayoutChrome();
  syncCompareListToolbarVisibility();
  document.dispatchEvent(new CustomEvent('sfoc:artifact-ui-applied'));
}
