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
  updateOrgDropdownLayout,
  updateAuthIndicators,
  ensureRightOrgDistinctFromLeft
} from './ui/orgs.js';
import { renderSavedItems, setupCompareListToolbar } from './ui/listUi.js';
import { updateDocumentTitle } from './ui/documentMeta.js';
import { renderEditor } from './editor/editorRender.js';
import { updateOrgSelectorsLockedState } from './ui/viewerChrome.js';
import { maybeEnforceUpdate } from './setup/versionCheck.js';
import {
  wireSelectors,
  setupResizable,
  setupDragAndDrop,
  setupDownloadAll,
  setupCopyAll,
  setupCopyCompareLink,
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
  navigateToModeAndTool
} from './ui/appModeNav.js';
import { applyArtifactTypeUi } from './ui/artifactTypeUi.js';
import { setupGeneratePackageXmlPanel, refreshGeneratePackageXmlTypes } from './ui/generatePackageXmlPanel.js';
import { setupFieldDependencyPanel } from './ui/fieldDependencyPanel.js';
import { setupApexTestsPanel, refreshApexTestsPanel } from './ui/apexTestsPanel.js';
import { setupAnonymousApexPanel, refreshAnonymousApexPanel } from './ui/anonymousApexPanel.js';
import { setupOrgLimitsPanel, refreshOrgLimitsPanel } from './ui/orgLimitsPanel.js';
import { setupQueryExplorerPanel, refreshQueryExplorerPanel } from './ui/queryExplorerPanel.js';
import { setupDebugLogBrowserPanel, refreshDebugLogBrowserPanel } from './ui/debugLogBrowserPanel.js';
import { setupApexCoverageComparePanel, refreshApexCoverageComparePanel } from './ui/apexCoverageComparePanel.js';
import { setupSetupAuditTrailPanel, refreshSetupAuditTrailPanel } from './ui/setupAuditTrailPanel.js';
import { setupPermissionDiffPanel, refreshPermissionDiffPanel } from './ui/permissionDiffPanel.js';
import { setupQuickEditPanel, refreshQuickEditPanel } from './ui/quickEditPanel.js';
import {
  setupClearApexTestJobsOnPageClose,
  updateApexTestsHubPollingState
} from './ui/apexTestsHubRuns.js';
import { loadLang, t, getCurrentLang } from '../shared/i18n.js';
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
import {
  resolveLandingDiscoverBannerContent
} from '../shared/landingDiscoverBanner.js';

function applyStaticTranslations() {
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

/** Banner azul de descubrimiento (Quick Open); texto por i18n o version.json remoto. */
async function applyLandingDiscoverBanner() {
  const textEl = document.getElementById('appLandingDiscoverBannerText');
  if (!textEl) return;
  const lang = getCurrentLang() === 'es' ? 'es' : 'en';
  let remote = null;
  try {
    const res = await bg({ type: 'version:getUpdateInfo', forceRefreshRemote: false });
    if (res?.ok) remote = res;
  } catch {
    /* ignore */
  }
  const { html } = resolveLandingDiscoverBannerContent(remote, lang, t);
  textEl.innerHTML = html;
}

async function applyLandingHomeBanner() {
  const wrap = document.getElementById('appLandingHomeBanner');
  const textEl = document.getElementById('appLandingHomeBannerText');
  if (!wrap || !textEl) return;
  wrap.classList.add('hidden');
  textEl.textContent = '';
  try {
    const res = await bg({ type: 'version:getUpdateInfo', forceRefreshRemote: true });
    if (!res || !res.ok) return;
    const lang = getCurrentLang();
    const es = String(res.homeBanner_es || '').trim();
    const en = String(res.homeBanner_en || '').trim();
    const gen = String(res.homeBanner || '').trim();
    const message = lang === 'es' ? es || gen || en : en || gen || es;
    if (!message) return;
    textEl.textContent = message;
    wrap.classList.remove('hidden');
  } catch {
    /* ignore */
  }
}

async function init() {
  await loadLang();
  await loadExtensionSettings();
  applyUiThemeToDocument(document);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[EXTENSION_CONFIG_KEY]) {
      void (async () => {
        await loadExtensionSettings();
        applyUiThemeToDocument(document);
        updateApexTestsHubPollingState();
        if (state.monaco) applyMonacoThemeGlobally(state.monaco);
        const { refreshAnonymousApexEditorTheme } = await import('./ui/anonymousApexPanel.js');
        const { refreshQuickEditEditorTheme } = await import('./ui/quickEditPanel.js');
        refreshAnonymousApexEditorTheme();
        refreshQuickEditEditorTheme();
      })();
    }
  });
  applyStaticTranslations();
  applyLandingFooterLinks();

  const blocked = await maybeEnforceUpdate();
  if (blocked) {
    return;
  }

  applyLandingDiscoverBanner();
  await applyLandingHomeBanner();

  await loadSavedOrgs();
  await loadPinnedKeys();
  await loadItemsFromStorage();
  prunePinnedKeysToSavedItems();

  const typeSelect = document.getElementById('typeSelect');
  const urlDeepLink = parseCompareDeepLink(window.location.search);
  const urlOp =
    urlDeepLink.op ||
    (urlDeepLink.itemType && urlDeepLink.itemKey
      ? operationSelectValueForItemType(urlDeepLink.itemType)
      : '');

  setOnAfterArtifactTypeChange((isUserChange) => {
    syncCompareUrlFromState(state);
    void persistAfterOperationChange(isUserChange);
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

  applyDeepLinkOrgs(urlDeepLink);
  if (urlDeepLink.leftOrgId && !urlDeepLink.rightOrgId) {
    ensureRightOrgDistinctFromLeft();
  }

  renderSavedItems();

  if (urlDeepLink.itemType && urlDeepLink.itemKey) {
    setTimeout(() => applyDeepLinkItemHint(urlDeepLink), 80);
  }
  
  wireSelectors();
  setupSearch();
  setupQuickOpen();
  setupAppModeTabHandlers();
  setupGeneratePackageXmlPanel();
  setupApexTestsPanel();
  setupAnonymousApexPanel();
  setupOrgLimitsPanel();
  setupPermissionDiffPanel();
  setupQueryExplorerPanel();
  setupDebugLogBrowserPanel();
  setupApexCoverageComparePanel();
  setupSetupAuditTrailPanel();
  setupQuickEditPanel();
  setupFieldDependencyPanel();
  renderEditor();
  refreshGeneratePackageXmlTypes();
  void refreshApexTestsPanel();
  void refreshAnonymousApexPanel();
  void refreshOrgLimitsPanel();
  void refreshPermissionDiffPanel();
  void refreshQueryExplorerPanel();
  void refreshDebugLogBrowserPanel();
  void refreshApexCoverageComparePanel();
  void refreshSetupAuditTrailPanel();
  void refreshQuickEditPanel();
  setupResizable();
  setupCompareListToolbar();
  setupDragAndDrop();
  setupDownloadAll();
  setupCopyAll();
  setupCopyCompareLink();
  setupRemoveAll();
  setupClearHistoryButton();
  setupModifierKeyTracking();
  setupDiffNavigation();
  setupSidebarToggle();
  updateOrgDropdownLayout();
  updateDocumentTitle();
  updateOrgSelectorsLockedState();
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
