import './editor/monacoSuppress.js';
import { state } from './core/state.js';
import { bg } from './core/bridge.js';
import {
  saveItemsToStorage,
  loadItemsFromStorage,
  setupClearFileHistoryOnPageClose,
  loadPinnedKeys,
  prunePinnedKeysToSavedItems
} from './core/persistence.js';
import {
  loadSavedOrgs,
  updateOrgDropdownLayout,
  updateAuthIndicators,
  ensureRightOrgDistinctFromLeft
} from './ui/orgs.js';
import { renderSavedItems } from './ui/listUi.js';
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
  setupClearHistoryButton,
  setupRemoveAll,
  setupModifierKeyTracking,
  setupDiffNavigation,
  setupSidebarToggle
} from './setup/setupListeners.js';
import { setupSearch, setOnAfterArtifactTypeChange } from './ui/searchSetup.js';
import {
  initializeAppNavigation,
  setupAppModeTabHandlers,
  persistAfterOperationChange
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

/** Alinea `#typeSelect` con un ítem abierto por URL (`type` = API del metadata). */
function operationSelectValueForItemType(itemType) {
  const map = {
    ApexClass: 'Apex',
    ApexTrigger: 'Apex',
    ApexPage: 'VF',
    ApexComponent: 'VF',
    LWC: 'LWC',
    Aura: 'Aura',
    PermissionSet: 'PermissionSet',
    Profile: 'Profile',
    FlexiPage: 'FlexiPage',
    PackageXml: 'PackageXml',
    CustomObject: 'FieldDependency'
  };
  return map[itemType] || '';
}

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

  await applyLandingHomeBanner();

  await loadSavedOrgs();
  await loadPinnedKeys();
  await loadItemsFromStorage();
  prunePinnedKeysToSavedItems();

  const typeSelect = document.getElementById('typeSelect');
  const urlParams = new URLSearchParams(window.location.search);
  const itemType = urlParams.get('type');
  const itemKey = urlParams.get('key');
  const itemFileName = urlParams.get('fileName');
  const descriptorParam = urlParams.get('descriptor');
  const orgIdParam = urlParams.get('orgId');

  const urlOp = itemType && itemKey ? operationSelectValueForItemType(itemType) : '';

  setOnAfterArtifactTypeChange((isUserChange) => {
    void persistAfterOperationChange(isUserChange);
  });

  await initializeAppNavigation({ urlOp });

  if (typeSelect) {
    state.selectedArtifactType = typeSelect.value || '';
  }
  applyArtifactTypeUi();

  if (orgIdParam) {
    state.leftOrgId = orgIdParam;
    const leftOrgSelect = document.getElementById('leftOrg');
    if (leftOrgSelect) {
      leftOrgSelect.value = orgIdParam;
    }
    ensureRightOrgDistinctFromLeft();
  }
  
  renderSavedItems();
  
  if (itemType && itemKey) {
    let targetItem = state.savedItems.find(
      (saved) => saved.type === itemType && saved.key === itemKey
    );
    
    if (!targetItem) {
      targetItem = {
        type: itemType,
        key: itemKey,
        fileName: itemFileName || undefined,
        descriptor: descriptorParam ? JSON.parse(descriptorParam) : { name: itemKey }
      };
      
      state.savedItems.push(targetItem);
      saveItemsToStorage();
      renderSavedItems();
    }
    
    state.selectedItem = targetItem;
    
    setTimeout(() => {
      try {
        const list = document.getElementById('leftList');
        const items = Array.from(list.querySelectorAll('li'));
        for (const el of items) el.classList.remove('active');
        const match = items.find(
          (li) =>
          li.getAttribute('data-type') === state.selectedItem.type && 
          li.getAttribute('data-key') === state.selectedItem.key
        );
        if (match) {
          match.classList.add('active');
          match.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        updateDocumentTitle();
        renderEditor();
      } catch {}
    }, 100);
  }
  
  wireSelectors();
  setupSearch();
  setupAppModeTabHandlers();
  setupGeneratePackageXmlPanel();
  setupApexTestsPanel();
  setupAnonymousApexPanel();
  setupOrgLimitsPanel();
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
  void refreshQueryExplorerPanel();
  void refreshDebugLogBrowserPanel();
  void refreshApexCoverageComparePanel();
  void refreshSetupAuditTrailPanel();
  void refreshQuickEditPanel();
  setupResizable();
  setupDragAndDrop();
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
  setupClearFileHistoryOnPageClose();
  setupClearApexTestJobsOnPageClose();
  setInterval(async () => {
    const auth = await bg({ type: 'auth:getStatuses', force: true });
    state.authStatuses = auth.ok ? auth.statuses || {} : {};
    updateAuthIndicators();
  }, 600000);
}

init();
