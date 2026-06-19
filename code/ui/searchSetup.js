import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { showToast } from './toast.js';
import { addSelected, addBundleFiles } from '../flows/addItems.js';
import { applyArtifactTypeUi, isComparatorMode, isFullScreenToolMode } from './artifactTypeUi.js';
import { renderEditor, resetMonacoComparisonView } from '../editor/editorRender.js';
import { syncListActiveHighlight } from './listUi.js';
import { updateDocumentTitle } from './documentMeta.js';
import { syncCompareUrlFromState } from '../lib/compareDeepLink.js';
import { refreshGeneratePackageXmlTypes } from './generatePackageXmlPanel.js';
import { refreshMetadataTypeComparePanel } from './metadataTypeComparePanel.js';
import { refreshFieldDependencyPanel } from './fieldDependencyPanel.js';
import { refreshDependencyExplorerPanel } from './dependencyExplorerPanel.js';
import { refreshApexTestsPanel, resetApexTestsShellToHub } from './apexTestsPanel.js';
import { refreshAnonymousApexPanel } from './anonymousApexPanel.js';
import { refreshQueryExplorerPanel } from './queryExplorerPanel.js';
import { refreshOrgLimitsPanel } from './orgLimitsPanel.js';
import { refreshEnvironmentStatusPanel } from './environmentStatusPanel.js';
import { refreshDeployStatusPanel, updateDeployStatusPollingState } from './deployStatusPanel.js';
import { refreshDebugLogBrowserPanel } from './debugLogBrowserPanel.js';
import { refreshSetupAuditTrailPanel } from './setupAuditTrailPanel.js';
import { refreshFieldHistoryPanel } from './fieldHistoryPanel.js';
import { refreshPermissionDiffPanel } from './permissionDiffPanel.js';
import { refreshQuickEditPanel } from './quickEditPanel.js';
import { refreshLightningQuickEditPanel } from './lightningQuickEditPanel.js';
import { refreshApexCoverageComparePanel } from './apexCoverageComparePanel.js';
import { refreshCustomSettingsComparePanel } from './customSettingsComparePanel.js';
import { refreshCustomMetadataComparePanel } from './customMetadataComparePanel.js';
import { refreshRecordComparePanel } from './recordComparePanel.js';
import { t } from '../../shared/i18n.js';
import {
  capMetadataResults,
  fillBreadcrumb,
  kickSilentIndexBuild,
  metadataSearchItemClasses,
  MIN_METADATA_CHARS,
  normalizeQueryLocal,
  resolveMetadataMatches,
  sanitizeApiPrefix
} from '../lib/metadataSearch.js';
import {
  getMetadataSearchLoadingMessage,
  renderSearchLoadingSpinner
} from './searchLoadingUi.js';

const SIDEBAR_MAX_METADATA_RESULTS = 20;

/** @type {(isUserChange: boolean) => void} */
let onAfterArtifactTypeChange = () => {};

export function setOnAfterArtifactTypeChange(fn) {
  onAfterArtifactTypeChange = typeof fn === 'function' ? fn : () => {};
}

/** @type {((() => void) | null)} */
let runSearchFn = null;

let sidebarSearchGeneration = 0;
let sidebarActiveResultIndex = -1;

export function updateSearchUiForType() {
  applyArtifactTypeUi();
}

/** Quita selección y búsqueda; la comparación solo se abre al elegir en la barra de búsqueda o en la lista. */
export function clearComparisonSelection() {
  state.selectedItem = null;
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';
  hideSidebarSearchResults();
  syncListActiveHighlight();
  updateDocumentTitle();
  syncCompareUrlFromState(state);
}

/**
 * Ejecuta el mismo efecto que al cambiar `#typeSelect` (búsqueda, paneles, persistencia).
 * @param {{ isUserChange?: boolean, preserveSelection?: boolean }} [options]
 */
export function handleArtifactTypeSelectChange(options = {}) {
  const isUserChange = !!options.isUserChange;
  const typeSelect = document.getElementById('typeSelect');
  if (!options.preserveSelection) {
    clearComparisonSelection();
  }
  updateSearchUiForType();
  if (isComparatorMode() && state.leftOrgId) {
    kickSilentIndexBuild(state.leftOrgId);
  }
  if (runSearchFn && isUserChange) void runSearchFn();
  if (isFullScreenToolMode()) {
    resetMonacoComparisonView();
  } else {
    void renderEditor();
  }
  refreshGeneratePackageXmlTypes();
  void refreshMetadataTypeComparePanel();
  if (typeSelect?.value === 'ApexTests') {
    resetApexTestsShellToHub();
  }
  void refreshApexTestsPanel();
  void refreshAnonymousApexPanel();
  void refreshQueryExplorerPanel();
  void refreshOrgLimitsPanel();
  void refreshEnvironmentStatusPanel();
  void refreshDeployStatusPanel();
  updateDeployStatusPollingState();
  void refreshPermissionDiffPanel();
  void refreshDebugLogBrowserPanel();
  void refreshSetupAuditTrailPanel();
  void refreshFieldHistoryPanel();
  void refreshQuickEditPanel();
  void refreshLightningQuickEditPanel();
  void refreshApexCoverageComparePanel();
  void refreshCustomSettingsComparePanel();
  void refreshCustomMetadataComparePanel();
  void refreshRecordComparePanel();
  refreshFieldDependencyPanel();
  refreshDependencyExplorerPanel();
  onAfterArtifactTypeChange(isUserChange);
}

export function handlePackageXmlFileSelected(file) {
  if (!file) return;
  const lower = file.name.toLowerCase();
  if (!lower.endsWith('.xml')) {
    showToast(t('toast.selectXml'), 'warn');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result != null ? String(reader.result) : '';
    const key = `local-${Date.now()}-package`;
    state.packageXmlLocalContent[key] = { fileName: 'package.xml', content: text };
    addSelected({
      type: 'PackageXml',
      key,
      descriptor: {
        name: 'package.xml',
        originalFileName: 'package.xml',
        source: 'localFile'
      }
    });
  };
  reader.onerror = () => showToast(t('toast.readError'), 'error');
  reader.readAsText(file, 'UTF-8');
}

function ensureSearchResultsPortal(results) {
  if (results && results.parentElement !== document.body) {
    document.body.appendChild(results);
  }
}

export function hideSidebarSearchResults() {
  const results = document.getElementById('searchResults');
  if (!results) return;
  results.hidden = true;
  results.innerHTML = '';
  sidebarActiveResultIndex = -1;
}

function showSidebarSearchResults() {
  const results = document.getElementById('searchResults');
  if (!results) return;
  ensureSearchResultsPortal(results);
  results.hidden = false;
  positionSidebarSearchResults();
}

function isSidebarSearchResultsVisible() {
  const results = document.getElementById('searchResults');
  return !!results && !results.hidden && results.childElementCount > 0;
}

/** Coloca el panel bajo la fila del buscador (fixed, fuera del flujo del sidebar). */
function positionSidebarSearchResults() {
  const row = document.querySelector('.sidebar-search-input-row');
  const results = document.getElementById('searchResults');
  if (!row || !results || results.hidden) return;

  const rect = row.getBoundingClientRect();
  const gap = 4;
  const viewportPad = 8;
  const minW = 520;
  const maxW = Math.min(780, window.innerWidth - viewportPad * 2);
  const width = Math.min(maxW, Math.max(minW, rect.width + 240));
  let left = rect.left;
  if (left + width > window.innerWidth - viewportPad) {
    left = window.innerWidth - viewportPad - width;
  }
  if (left < viewportPad) left = viewportPad;

  const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPad;
  const maxH = Math.min(400, Math.max(120, spaceBelow));
  results.style.position = 'fixed';
  results.style.top = `${rect.bottom + gap}px`;
  results.style.left = `${left}px`;
  results.style.width = `${width}px`;
  results.style.maxHeight = `${maxH}px`;
  results.style.bottom = 'auto';
}

function highlightSidebarActiveResult(results) {
  const items = results.querySelectorAll('.quick-open-item');
  items.forEach((el, i) => {
    el.classList.toggle('is-active', i === sidebarActiveResultIndex);
    if (i === sidebarActiveResultIndex) el.scrollIntoView({ block: 'nearest' });
  });
}

/**
 * @param {HTMLElement} results
 * @param {'status'|'empty'} kind
 * @param {string} message
 */
function renderSidebarStatusMessage(results, kind, message) {
  results.innerHTML = '';
  const p = document.createElement('p');
  p.className = kind === 'status' ? 'quick-open-status' : 'quick-open-empty';
  p.textContent = message;
  results.appendChild(p);
  showSidebarSearchResults();
}

/**
 * Fila de carga con spinner (mismo aspecto que un resultado).
 * @param {HTMLElement} results
 * @param {string} message
 */
function renderSidebarSearchLoading(results, message) {
  sidebarActiveResultIndex = -1;
  renderSearchLoadingSpinner(results, message, { onShow: () => showSidebarSearchResults() });
}

/**
 * @param {import('../lib/metadataSearch.js').MetadataSearchEntry} entry
 */
function selectComparatorMetadataResult(entry) {
  if (entry.isBundle && entry.id) {
    void addBundleFiles(entry.artType, { id: entry.id, developerName: entry.name });
  } else {
    addSelected({ type: entry.artType, key: entry.name, descriptor: { name: entry.name } });
  }
  hideSidebarSearchResults();
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';
}

/**
 * @param {HTMLElement} results
 * @param {import('../lib/metadataSearch.js').MetadataSearchEntry[]} metadata
 */
function renderComparatorSearchResults(results, metadata) {
  results.innerHTML = '';
  sidebarActiveResultIndex = -1;
  if (!metadata.length) {
    renderSidebarStatusMessage(results, 'empty', t('quickOpen.noResults'));
    return;
  }

  const frag = document.createDocumentFragment();
  for (const entry of metadata) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = metadataSearchItemClasses(entry.artType);
    btn.setAttribute('role', 'option');
    const crumbs = document.createElement('span');
    crumbs.className = 'quick-open-crumbs';
    fillBreadcrumb(crumbs, t(entry.categoryKey), entry.name);
    btn.appendChild(crumbs);
    btn.addEventListener('click', () => selectComparatorMetadataResult(entry));
    frag.appendChild(btn);
  }
  results.appendChild(frag);
  showSidebarSearchResults();
  highlightSidebarActiveResult(results);
}

async function runComparatorSearchImpl() {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('searchInput'));
  const results = document.getElementById('searchResults');
  if (!input || !results) return;

  const gen = ++sidebarSearchGeneration;
  const queryLocal = normalizeQueryLocal(input.value);
  const apiPrefix = sanitizeApiPrefix(input.value);

  if (!queryLocal) {
    hideSidebarSearchResults();
    return;
  }

  const orgId = state.leftOrgId;
  if (!orgId) {
    renderSidebarStatusMessage(results, 'status', t('quickOpen.noAuth'));
    return;
  }

  kickSilentIndexBuild(orgId, () => {
    if (input.value.trim() && gen === sidebarSearchGeneration) void runComparatorSearchImpl();
  });

  const loadingMessage = getMetadataSearchLoadingMessage(orgId);
  renderSidebarSearchLoading(results, loadingMessage);

  const metadata = await resolveMetadataMatches(orgId, queryLocal, apiPrefix);
  if (gen !== sidebarSearchGeneration) return;

  const capped = capMetadataResults(metadata, SIDEBAR_MAX_METADATA_RESULTS);
  if (!capped.length && apiPrefix.length < MIN_METADATA_CHARS) {
    hideSidebarSearchResults();
    return;
  }
  renderComparatorSearchResults(results, capped);
}

function isSearchDisabledForTool(selectedType) {
  return (
    !selectedType ||
    selectedType === 'GeneratePackageXml' ||
    selectedType === 'MetadataTypeCompare' ||
    selectedType === 'ApexTests' ||
    selectedType === 'AnonymousApex' ||
    selectedType === 'QueryExplorer' ||
    selectedType === 'OrgLimits' ||
    selectedType === 'DebugLogBrowser' ||
    selectedType === 'SetupAuditTrail' ||
    selectedType === 'FieldHistory' ||
    selectedType === 'PermissionDiff' ||
    selectedType === 'FieldDependency' ||
    selectedType === 'DependencyExplorer'
  );
}

export function setupSearch() {
  const input = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  const searchRow = document.querySelector('.sidebar-search-input-row');
  const typeSelect = document.getElementById('typeSelect');
  if (results) ensureSearchResultsPortal(results);
  const packageXmlLoadBtn = document.getElementById('packageXmlLoadBtn');
  const packageXmlFileInput = document.getElementById('packageXmlFileInput');

  if (packageXmlLoadBtn && packageXmlFileInput) {
    packageXmlLoadBtn.addEventListener('click', () => {
      packageXmlFileInput.click();
    });
    packageXmlFileInput.addEventListener('change', (ev) => {
      const f = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (f) handlePackageXmlFileSelected(f);
    });
  }

  async function runSearchImpl() {
    if (isComparatorMode()) {
      await runComparatorSearchImpl();
      return;
    }

    const selectedType = typeSelect ? typeSelect.value : '';
    if (isSearchDisabledForTool(selectedType)) {
      hideSidebarSearchResults();
      return;
    }
    let prefix = input.value.trim();
    if (prefix.length > 64) prefix = prefix.slice(0, 64);
    prefix = prefix.replace(/[\u0000-\u001F\u007F]/g, '');
    const orgId = state.leftOrgId;
    if (!orgId || !prefix || prefix.length < 3) {
      hideSidebarSearchResults();
      return;
    }

    let types = [];
    if (selectedType === 'Apex') {
      types = ['ApexClass', 'ApexTrigger'];
    } else if (selectedType === 'VF') {
      types = ['ApexPage', 'ApexComponent'];
    } else if (selectedType === 'LWC') {
      types = ['LWC'];
    } else if (selectedType === 'Aura') {
      types = ['Aura'];
    } else if (selectedType === 'PermissionSet') {
      types = ['PermissionSet'];
    } else if (selectedType === 'Profile') {
      types = ['Profile'];
    } else if (selectedType === 'FlexiPage') {
      types = ['FlexiPage'];
    }
    results.innerHTML = '';
    let count = 0;
    for (const art of types) {
      const r = await bg({ type: 'searchIndex', orgId, artifactType: art, prefix });
      if (!r.ok) {
        showToast(t('toast.searchFailed'), 'warn');
        continue;
      }
      if (art === 'LWC' || art === 'Aura') {
        for (const b of r.items) {
          const div = document.createElement('div');
          div.className = 'item';
          div.textContent = b.developerName;
          div.addEventListener('click', () => {
            addBundleFiles(art, { id: b.id, developerName: b.developerName });
            hideSidebarSearchResults();
          });
          results.appendChild(div);
          count++;
        }
      } else {
        for (const rec of r.items) {
          const div = document.createElement('div');
          div.className = 'item';
          div.textContent = rec.name;
          div.addEventListener('click', () => {
            addSelected({ type: art, key: rec.name, descriptor: { name: rec.name } });
            hideSidebarSearchResults();
          });
          results.appendChild(div);
          count++;
        }
      }
    }
    if (count) {
      showSidebarSearchResults();
    } else {
      hideSidebarSearchResults();
    }
  }

  runSearchFn = () => {
    void runSearchImpl();
  };

  typeSelect?.addEventListener('change', () => {
    handleArtifactTypeSelectChange({ isUserChange: true });
  });

  let skipSearchOnNextFocus = false;
  if (typeof performance !== 'undefined') {
    const nav = performance.getEntriesByType?.('navigation')?.[0];
    if (nav?.type === 'reload') {
      skipSearchOnNextFocus = true;
    }
  }
  updateSearchUiForType();

  input.addEventListener('input', debounce(runSearchImpl, 200));
  input.addEventListener('keydown', (e) => {
    if (!isComparatorMode()) {
      if (e.key === 'Enter') void runSearchImpl();
      return;
    }

    const items = results?.querySelectorAll('.quick-open-item') || [];

    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      sidebarActiveResultIndex = Math.min(items.length - 1, sidebarActiveResultIndex + 1);
      highlightSidebarActiveResult(results);
      return;
    }

    if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      sidebarActiveResultIndex = Math.max(0, sidebarActiveResultIndex <= 0 ? 0 : sidebarActiveResultIndex - 1);
      highlightSidebarActiveResult(results);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (items.length) {
        const idx = sidebarActiveResultIndex >= 0 ? sidebarActiveResultIndex : 0;
        items[idx]?.click();
      } else {
        void runSearchImpl();
      }
    }
  });

  input.addEventListener('focus', () => {
    if (skipSearchOnNextFocus) {
      skipSearchOnNextFocus = false;
      return;
    }
    if (results.childElementCount) {
      showSidebarSearchResults();
    }
  });

  window.addEventListener('resize', () => {
    if (isSidebarSearchResultsVisible()) positionSidebarSearchResults();
  });

  document.addEventListener('click', (e) => {
    if (!isSidebarSearchResultsVisible()) return;
    const target = e.target;
    if (
      input.contains(/** @type {Node} */ (target)) ||
      searchRow?.contains(/** @type {Node} */ (target)) ||
      results.contains(/** @type {Node} */ (target))
    ) {
      return;
    }
    hideSidebarSearchResults();
  });
}

export function debounce(fn, wait = 300) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
