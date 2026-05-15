import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { showToast } from './toast.js';
import { addSelected, addBundleFiles } from '../flows/addItems.js';
import { applyArtifactTypeUi } from './artifactTypeUi.js';
import { renderEditor, resetMonacoComparisonView } from '../editor/editorRender.js';
import { syncListActiveHighlight } from './listUi.js';
import { updateDocumentTitle } from './documentMeta.js';
import { syncCompareUrlFromState } from '../lib/compareDeepLink.js';
import { isFullScreenToolMode } from './artifactTypeUi.js';
import { refreshGeneratePackageXmlTypes } from './generatePackageXmlPanel.js';
import { refreshFieldDependencyPanel } from './fieldDependencyPanel.js';
import { refreshApexTestsPanel, resetApexTestsShellToHub } from './apexTestsPanel.js';
import { refreshAnonymousApexPanel } from './anonymousApexPanel.js';
import { refreshQueryExplorerPanel } from './queryExplorerPanel.js';
import { refreshOrgLimitsPanel } from './orgLimitsPanel.js';
import { refreshDebugLogBrowserPanel } from './debugLogBrowserPanel.js';
import { refreshSetupAuditTrailPanel } from './setupAuditTrailPanel.js';
import { refreshPermissionDiffPanel } from './permissionDiffPanel.js';
import { refreshQuickEditPanel } from './quickEditPanel.js';
import { refreshApexCoverageComparePanel } from './apexCoverageComparePanel.js';
import { t } from '../../shared/i18n.js';

/** @type {(isUserChange: boolean) => void} */
let onAfterArtifactTypeChange = () => {};

export function setOnAfterArtifactTypeChange(fn) {
  onAfterArtifactTypeChange = typeof fn === 'function' ? fn : () => {};
}

/** @type {((() => void) | null)} */
let runSearchFn = null;

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
  if (runSearchFn && isUserChange) void runSearchFn();
  if (isFullScreenToolMode()) {
    resetMonacoComparisonView();
  } else {
    void renderEditor();
  }
  refreshGeneratePackageXmlTypes();
  if (typeSelect?.value === 'ApexTests') {
    resetApexTestsShellToHub();
  }
  void refreshApexTestsPanel();
  void refreshAnonymousApexPanel();
  void refreshQueryExplorerPanel();
  void refreshOrgLimitsPanel();
  void refreshPermissionDiffPanel();
  void refreshDebugLogBrowserPanel();
  void refreshSetupAuditTrailPanel();
  void refreshQuickEditPanel();
  void refreshApexCoverageComparePanel();
  refreshFieldDependencyPanel();
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
    // Siempre tratamos el manifiesto como package.xml (sin mostrar el nombre real en UI).
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
  const minW = Math.max(rect.width, 280);
  const maxW = Math.min(560, window.innerWidth - viewportPad * 2);
  const width = Math.min(maxW, Math.max(minW, 320));
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
    const selectedType = typeSelect ? typeSelect.value : '';
    if (!selectedType) {
      hideSidebarSearchResults();
      return;
    }
    if (
      selectedType === 'PackageXml' ||
      selectedType === 'GeneratePackageXml' ||
      selectedType === 'ApexTests' ||
      selectedType === 'AnonymousApex' ||
      selectedType === 'QueryExplorer' ||
      selectedType === 'OrgLimits' ||
      selectedType === 'DebugLogBrowser' ||
      selectedType === 'SetupAuditTrail' ||
      selectedType === 'PermissionDiff' ||
      selectedType === 'FieldDependency'
    ) {
      hideSidebarSearchResults();
      return;
    }
    let prefix = input.value.trim();
    if (prefix.length > 64) prefix = prefix.slice(0, 64);
    // Basic sanitation: collapse control characters
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
      if (!r.ok) { showToast(t('toast.searchFailed'), 'warn'); continue; }
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

  // Cambiar tipo de metadata relanza la búsqueda actual
  typeSelect?.addEventListener('change', () => {
    handleArtifactTypeSelectChange({ isUserChange: true });
  });

  /** Tras F5, no relanzar búsqueda ni comparación solo por tener texto en el input. */
  let skipSearchOnNextFocus = false;
  if (typeof performance !== 'undefined') {
    const nav = performance.getEntriesByType?.('navigation')?.[0];
    if (nav?.type === 'reload') {
      skipSearchOnNextFocus = true;
    }
  }
  updateSearchUiForType();

  input.addEventListener('input', debounce(runSearchImpl, 300));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { void runSearchImpl(); } });
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
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
