import '../shared/installEarlyExceptionCapture.js';
import './editor/monacoSuppress.js';
import { state } from './core/state.js';
import { bg } from './core/bridge.js';
import {
  saveItemsToStorage,
  loadItemsFromStorage,
  setupPersistSavedItemsOnPageClose,
  loadPinnedKeys,
  prunePinnedKeysToSavedItems
} from './core/persistence.js';
import {
  loadSavedOrgs,
  setupOrgSelectorAutoSync,
  updateOrgDropdownLayout,
  updateAuthIndicators,
  ensureRightOrgDistinctFromLeft
} from './ui/orgs.js';
import { initOrgUserDropdowns } from './ui/orgUserDropdown.js';
import { renderSavedItems, setupCompareListToolbar } from './ui/listUi.js';
import { updateDocumentTitle } from './ui/documentMeta.js';
import { renderEditor } from './editor/editorRender.js';
import { updateOrgSelectorsLockedState } from './ui/viewerChrome.js';
import {
  wireSelectors,
  setupResizable,
  setupDownloadAll,
  setupCopyAll,
  setupClearHistoryButton,
  setupRemoveAll,
  setupModifierKeyTracking,
  setupDiffNavigation,
  setupSidebarToggle
} from './setup/setupListeners.js';
import { setupSearch, setOnAfterArtifactTypeChange } from './ui/searchSetup.js';
import { setupQuickOpen } from './ui/quickOpen.js';
import {
  initializeAppNavigation,
  setupAppModeTabHandlers,
  persistAfterOperationChange,
  navigateToModeAndTool,
  revealAppNavigation
} from './ui/appModeNav.js';
import { applyArtifactTypeUi, getSelectedArtifactType } from './ui/artifactTypeUi.js';
import { setupAppHelp, maybeShowToolOnboarding, refreshHelpModalIfOpen } from './ui/appHelp.js';
import { setupAppSupport, refreshAppSupportUi } from './ui/appSupport.js';
import { setupFeatureControlsUi, applyFeatureControlsUi } from './ui/featureControlsUi.js';
import {
  setupGeneratePackageXmlPanel,
  refreshGeneratePackageXmlTypes
} from './ui/generatePackageXmlPanel.js';
import {
  setupMetadataTypeComparePanel,
  refreshMetadataTypeComparePanel
} from './ui/metadataTypeComparePanel.js';
import { setupFieldDependencyPanel } from './ui/fieldDependencyPanel.js';
import { setupObjectDescribePanel, refreshObjectDescribePanel } from './ui/objectDescribePanel.js';
import { setupRestExplorerPanel, refreshRestExplorerPanel } from './ui/restExplorerPanel.js';
import { setupDataWorkbenchPanel, refreshDataWorkbenchPanel } from './ui/dataWorkbenchPanel.js';
import { setupBulkJobMonitorPanel, refreshBulkJobMonitorPanel } from './ui/bulkJobMonitorPanel.js';
import { setupEventMonitorPanel, refreshEventMonitorPanel } from './ui/eventMonitorPanel.js';
import {
  setupDependencyExplorerPanel,
  refreshDependencyExplorerPanel
} from './ui/dependencyExplorerPanel.js';
import { setupApexTestsPanel, refreshApexTestsPanel } from './ui/apexTestsPanel.js';
import { setupAnonymousApexPanel, refreshAnonymousApexPanel } from './ui/anonymousApexPanel.js';
import { setupOrgLimitsPanel, refreshOrgLimitsPanel } from './ui/orgLimitsPanel.js';
import {
  setupEnvironmentStatusPanel,
  refreshEnvironmentStatusPanel,
  reloadEnvironmentStatusIfActive
} from './ui/environmentStatusPanel.js';
import {
  setupDeployStatusPanel,
  refreshDeployStatusPanel,
  updateDeployStatusPollingState,
  stopDeployStatusPolling
} from './ui/deployStatusPanel.js';
import { setupQueryExplorerPanel, refreshQueryExplorerPanel } from './ui/queryExplorerPanel.js';
import { setupDebugLogBrowserPanel, refreshDebugLogBrowserPanel } from './ui/debugLogBrowserPanel.js';
import { setupDebugLogTraceModal } from './ui/debugLogTraceModal.js';
import { setupDebugLogViewTracesModal } from './ui/debugLogViewTracesModal.js';
import { setupDebugLogLocalAnalyzeModal } from './ui/debugLogLocalAnalyzeModal.js';
import { setupApexCoverageComparePanel, refreshApexCoverageComparePanel } from './ui/apexCoverageComparePanel.js';
import {
  setupCustomSettingsComparePanel,
  refreshCustomSettingsComparePanel
} from './ui/customSettingsComparePanel.js';
import {
  setupCustomMetadataComparePanel,
  refreshCustomMetadataComparePanel
} from './ui/customMetadataComparePanel.js';
import {
  setupRecordComparePanel,
  refreshRecordComparePanel
} from './ui/recordComparePanel.js';
import { setupSetupAuditTrailPanel, refreshSetupAuditTrailPanel } from './ui/setupAuditTrailPanel.js';
import { setupFieldHistoryPanel, refreshFieldHistoryPanel } from './ui/fieldHistoryPanel.js';
import { setupPermissionDiffPanel, refreshPermissionDiffPanel } from './ui/permissionDiffPanel.js';
import { setupQuickEditPanel, refreshQuickEditPanel } from './ui/quickEditPanel.js';
import {
  setupLightningQuickEditPanel,
  refreshLightningQuickEditPanel
} from './ui/lightningQuickEditPanel.js';
import {
  setupClearApexTestJobsOnPageClose,
  updateApexTestsHubPollingState
} from './ui/apexTestsHubRuns.js';
import { loadLang, t } from '../shared/i18n.js';
import {
  loadExtensionSettings,
  EXTENSION_CONFIG_KEY,
  applyUiThemeToDocument
} from '../shared/extensionSettings.js';
import { UPDATE_PAGE_URL } from './core/constants.js';
import { applyMonacoThemeGlobally } from './editor/monaco.js';
import {
  parseCompareDeepLink,
  operationSelectValueForItemType,
  syncCompareUrlFromState
} from './lib/compareDeepLink.js';
import { applyDeepLinkOrgs, applyDeepLinkItemHint } from './lib/compareDeepLinkUi.js';
import { setupAppHistoryNavigation } from './lib/appHistoryNavigation.js';
import { buildDiscoverBannerLineHtml } from '../shared/landingDiscoverBanner.js';
import { refreshLandingToolRecents } from './ui/landingRecentsUi.js';
import { ensureExtensionExceptionReporting } from '../shared/posthogClient.js';
import { bootstrapFeatureControls } from '../shared/posthogFeatureControlsFlag.js';
import { wakeServiceWorker } from '../shared/wakeServiceWorker.js';

function applyStaticTranslations() {
  const brandLogo = document.getElementById('sidebarBrandLogo');
  if (brandLogo && typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    brandLogo.src = chrome.runtime.getURL('icons/icon-32.png');
  }

  document.querySelectorAll('[data-i18n]').forEach((elem) => {
    elem.textContent = t(elem.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((elem) => {
    elem.title = t(elem.getAttribute('data-i18n-title'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((elem) => {
    elem.placeholder = t(elem.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((elem) => {
    elem.setAttribute('aria-label', t(elem.getAttribute('data-i18n-aria-label')));
  });
  document.querySelectorAll('[data-i18n-label]').forEach((elem) => {
    elem.label = t(elem.getAttribute('data-i18n-label'));
  });
}

function applyLandingFooterLinks() {
  const tool = document.getElementById('landingToolLink');
  if (tool) {
    tool.href = UPDATE_PAGE_URL;
    tool.textContent = UPDATE_PAGE_URL;
  }
}

/** Banner azul de descubrimiento (Quick Open); texto por i18n. */
function applyLandingDiscoverBanner() {
  const textEl = document.getElementById('appLandingDiscoverBannerText');
  if (!textEl) return;
  textEl.innerHTML = buildDiscoverBannerLineHtml(t);
}

async function init() {
  await Promise.all([loadLang(), loadExtensionSettings()]);
  applyUiThemeToDocument(document);

  await bootstrapFeatureControls({ force: true });
  setupFeatureControlsUi();

  applyStaticTranslations();
  applyLandingFooterLinks();
  applyLandingDiscoverBanner();

  const typeSelect = document.getElementById('typeSelect');
  let urlDeepLink = parseCompareDeepLink(window.location.search);
  if (urlDeepLink.itemType === 'PackageXml') {
    state.selectedItem = null;
    urlDeepLink = { ...urlDeepLink, itemType: null, itemKey: null, fileName: null, descriptor: null };
    syncCompareUrlFromState(state);
  }
  const urlOp =
    urlDeepLink.op ||
    (urlDeepLink.itemType && urlDeepLink.itemKey
      ? operationSelectValueForItemType(urlDeepLink.itemType)
      : '');

  setOnAfterArtifactTypeChange((isUserChange) => {
    syncCompareUrlFromState(state, { method: isUserChange ? 'push' : 'replace' });
    void persistAfterOperationChange(isUserChange);
    void maybeShowToolOnboarding(getSelectedArtifactType());
    refreshHelpModalIfOpen();
    applyFeatureControlsUi();
  });

  if (urlDeepLink.navMode) {
    await navigateToModeAndTool(urlDeepLink.navMode, urlOp, { userInitiated: false });
  } else {
    await initializeAppNavigation({ urlOp });
  }

  if (typeSelect) {
    state.selectedArtifactType = typeSelect.value || '';
  }
  applyArtifactTypeUi();
  applyFeatureControlsUi();
  revealAppNavigation();
  void refreshLandingToolRecents();
  void maybeShowToolOnboarding(getSelectedArtifactType());

  ensureExtensionExceptionReporting();
  void wakeServiceWorker();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[EXTENSION_CONFIG_KEY]) {
      void (async () => {
        const prevCfg = changes[EXTENSION_CONFIG_KEY].oldValue;
        const nextCfg = changes[EXTENSION_CONFIG_KEY].newValue;
        const wasPersistEnabled = !prevCfg || prevCfg.codeEditorPersistEnabled !== false;
        const isPersistEnabled = !nextCfg || nextCfg.codeEditorPersistEnabled !== false;

        await loadExtensionSettings();
        applyUiThemeToDocument(document);
        updateApexTestsHubPollingState();
        updateDeployStatusPollingState();
        if (state.monaco) applyMonacoThemeGlobally(state.monaco);
        const { refreshAnonymousApexEditorTheme } = await import('./ui/anonymousApexPanel.js');
        const { refreshQuickEditEditorTheme, refreshQuickEditPersistenceUi } = await import('./ui/quickEditPanel.js');
        const { refreshLightningQuickEditEditorTheme, refreshLightningQuickEditPersistenceUi } = await import(
          './ui/lightningQuickEditPanel.js'
        );
        refreshAnonymousApexEditorTheme();
        refreshQuickEditEditorTheme();
        refreshLightningQuickEditEditorTheme();
        if (wasPersistEnabled && !isPersistEnabled) {
          const { clearQuickEditEditorSessions } = await import('./lib/codeEditorSession.js');
          await clearQuickEditEditorSessions();
        }
        refreshQuickEditPersistenceUi();
        refreshLightningQuickEditPersistenceUi();
        await refreshAppSupportUi();
      })();
    }
    if (area === 'sync' && changes.savedOrgs) {
      void loadSavedOrgs();
    }
  });

  await loadSavedOrgs();
  await loadPinnedKeys();
  await loadItemsFromStorage();
  prunePinnedKeysToSavedItems();

  applyArtifactTypeUi();

  applyDeepLinkOrgs(urlDeepLink);
  if (urlDeepLink.leftOrgId && !urlDeepLink.rightOrgId) {
    ensureRightOrgDistinctFromLeft();
  }

  renderSavedItems();

  if (urlDeepLink.itemType && urlDeepLink.itemKey && urlDeepLink.itemType !== 'PackageXml') {
    setTimeout(() => applyDeepLinkItemHint(urlDeepLink), 80);
  }
  
  wireSelectors();
  setupOrgSelectorAutoSync();
  initOrgUserDropdowns();
  setupSearch();
  setupQuickOpen();
  setupAppModeTabHandlers();
  setupAppHelp();
  setupAppSupport();
  setupGeneratePackageXmlPanel();
  setupMetadataTypeComparePanel();
  setupApexTestsPanel();
  setupAnonymousApexPanel();
  setupOrgLimitsPanel();
  setupEnvironmentStatusPanel();
  setupDeployStatusPanel();
  setupPermissionDiffPanel();
  setupQueryExplorerPanel();
  setupDebugLogBrowserPanel();
  setupDebugLogTraceModal();
  setupDebugLogViewTracesModal();
  setupDebugLogLocalAnalyzeModal();
  setupApexCoverageComparePanel();
  setupCustomSettingsComparePanel();
  setupCustomMetadataComparePanel();
  setupRecordComparePanel();
  setupSetupAuditTrailPanel();
  setupFieldHistoryPanel();
  setupQuickEditPanel();
  setupLightningQuickEditPanel();
  setupFieldDependencyPanel();
  setupObjectDescribePanel();
  setupRestExplorerPanel();
  setupDataWorkbenchPanel();
  setupBulkJobMonitorPanel();
  setupEventMonitorPanel();
  setupDependencyExplorerPanel();
  renderEditor();
  refreshGeneratePackageXmlTypes();
  void refreshMetadataTypeComparePanel();
  void refreshApexTestsPanel();
  void refreshAnonymousApexPanel();
  void refreshOrgLimitsPanel();
  void refreshEnvironmentStatusPanel();
  void refreshDeployStatusPanel();
  void refreshPermissionDiffPanel();
  void refreshQueryExplorerPanel();
  void refreshRestExplorerPanel();
  void refreshObjectDescribePanel();
  void refreshDataWorkbenchPanel();
  void refreshBulkJobMonitorPanel();
  void refreshEventMonitorPanel();
  void refreshDebugLogBrowserPanel();
  void refreshApexCoverageComparePanel();
  void refreshCustomSettingsComparePanel();
  void refreshCustomMetadataComparePanel();
  void refreshRecordComparePanel();
  void refreshSetupAuditTrailPanel();
  void refreshFieldHistoryPanel();
  void refreshQuickEditPanel();
  void refreshLightningQuickEditPanel();
  refreshDependencyExplorerPanel();
  setupResizable();
  setupCompareListToolbar();
  setupDownloadAll();
  setupCopyAll();
  setupRemoveAll();
  setupClearHistoryButton();
  setupModifierKeyTracking();
  setupDiffNavigation();
  setupSidebarToggle();
  updateOrgDropdownLayout();
  updateDocumentTitle();
  updateOrgSelectorsLockedState();
  setupAppHistoryNavigation();
  syncCompareUrlFromState(state);
  setupPersistSavedItemsOnPageClose();
  setupClearApexTestJobsOnPageClose();
  setInterval(async () => {
    const auth = await bg({ type: 'auth:getStatuses', force: true });
    state.authStatuses = auth.ok ? auth.statuses || {} : {};
    updateAuthIndicators();
  }, 600000);
}

init();
