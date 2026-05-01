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
import { setupSearch } from './ui/searchSetup.js';
import { applyArtifactTypeUi } from './ui/artifactTypeUi.js';
import { setupGeneratePackageXmlPanel, refreshGeneratePackageXmlTypes } from './ui/generatePackageXmlPanel.js';
import { setupFieldDependencyPanel } from './ui/fieldDependencyPanel.js';
import { setupApexTestsPanel, refreshApexTestsPanel } from './ui/apexTestsPanel.js';
import { setupAnonymousApexPanel, refreshAnonymousApexPanel } from './ui/anonymousApexPanel.js';
import { setupOrgLimitsPanel, refreshOrgLimitsPanel } from './ui/orgLimitsPanel.js';
import { setupDebugLogBrowserPanel, refreshDebugLogBrowserPanel } from './ui/debugLogBrowserPanel.js';
import { setupSetupAuditTrailPanel, refreshSetupAuditTrailPanel } from './ui/setupAuditTrailPanel.js';
import {
  setupClearApexTestJobsOnPageClose,
  updateApexTestsHubPollingState
} from './ui/apexTestsHubRuns.js';
import { loadLang, t } from '../shared/i18n.js';
import { loadExtensionSettings, EXTENSION_CONFIG_KEY } from '../shared/extensionSettings.js';
import { UPDATE_PAGE_URL } from './core/constants.js';

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

async function init() {
  await loadLang();
  await loadExtensionSettings();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[EXTENSION_CONFIG_KEY]) {
      void loadExtensionSettings();
      updateApexTestsHubPollingState();
    }
  });
  applyStaticTranslations();
  applyLandingFooterLinks();

  const blocked = await maybeEnforceUpdate();
  if (blocked) {
    return;
  }

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

  if (itemType && itemKey && typeSelect) {
    const op = operationSelectValueForItemType(itemType);
    if (op) typeSelect.value = op;
  }

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
  setupGeneratePackageXmlPanel();
  setupApexTestsPanel();
  setupAnonymousApexPanel();
  setupOrgLimitsPanel();
  setupDebugLogBrowserPanel();
  setupSetupAuditTrailPanel();
  setupFieldDependencyPanel();
  renderEditor();
  refreshGeneratePackageXmlTypes();
  void refreshApexTestsPanel();
  void refreshAnonymousApexPanel();
  void refreshOrgLimitsPanel();
  void refreshDebugLogBrowserPanel();
  void refreshSetupAuditTrailPanel();
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
