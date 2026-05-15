import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import { listAllNavTools, navigateToModeAndTool, toolToMode } from './appModeNav.js';
import { addSelected, addBundleFiles } from '../flows/addItems.js';
import {
  getAnonymousApexSavedScriptsIndex,
  openAnonymousApexSavedScript
} from './anonymousApexPanel.js';
import { debounce } from './searchSetup.js';
import { refreshAuthStatuses } from './orgs.js';

/** Atajo global: Ctrl+Shift+P / ⌘⇧P (evita Ctrl+P = Imprimir en Chrome). */
const QUICK_OPEN_SHORTCUT = Object.freeze({
  ctrl: true,
  shift: true,
  key: 'p'
});

const MIN_METADATA_CHARS = 1;
const MAX_TOTAL_RESULTS = 8;

/** @type {{ artType: string, navTool: string, categoryKey: string, isBundle?: boolean }[]} */
const METADATA_SEARCH_SPECS = [
  { artType: 'ApexClass', navTool: 'Apex', categoryKey: 'quickOpen.catApexClass' },
  { artType: 'ApexTrigger', navTool: 'Apex', categoryKey: 'quickOpen.catApexTrigger' },
  { artType: 'ApexPage', navTool: 'VF', categoryKey: 'quickOpen.catApexPage' },
  { artType: 'ApexComponent', navTool: 'VF', categoryKey: 'quickOpen.catApexComponent' },
  { artType: 'LWC', navTool: 'LWC', categoryKey: 'quickOpen.catLwc', isBundle: true },
  { artType: 'Aura', navTool: 'Aura', categoryKey: 'quickOpen.catAura', isBundle: true },
  { artType: 'PermissionSet', navTool: 'PermissionSet', categoryKey: 'quickOpen.catPermSet' },
  { artType: 'Profile', navTool: 'Profile', categoryKey: 'quickOpen.catProfile' },
  { artType: 'FlexiPage', navTool: 'FlexiPage', categoryKey: 'quickOpen.catFlexi' }
];

const SPEC_BY_ART_TYPE = Object.fromEntries(METADATA_SEARCH_SPECS.map((s) => [s.artType, s]));

/**
 * Herramientas «Comparar …» ya cubiertas por el índice de metadatos (Apex, LWC, Aura, VF, etc.).
 * En Quick Open no mostramos ambas: el resultado de metadato abre el comparador con el componente cargado.
 */
const COMPARE_TOOLS_COVERED_BY_METADATA = new Set(
  METADATA_SEARCH_SPECS.map((s) => s.navTool)
);

let isOpen = false;
let searchGeneration = 0;
let indexBuildGeneration = 0;
let activeResultIndex = -1;

/** @type {{ orgId: string | null, loading: boolean, ready: boolean, entries: { artType: string, navTool: string, categoryKey: string, isBundle?: boolean, name: string, id?: string, searchHay: string }[] }} */
let nameIndex = {
  orgId: null,
  loading: false,
  ready: false,
  entries: []
};

/** Etiqueta del atajo para la UI (Windows/Linux vs macOS). */
export function getQuickOpenShortcutLabel() {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');
  return mac ? '⌘⇧P' : 'Ctrl+Shift+P';
}

function isQuickOpenShortcut(e) {
  if (!e || e.altKey) return false;
  const key = String(e.key || '').toLowerCase();
  if (key !== QUICK_OPEN_SHORTCUT.key) return false;
  return (e.ctrlKey || e.metaKey) === QUICK_OPEN_SHORTCUT.ctrl && e.shiftKey === QUICK_OPEN_SHORTCUT.shift;
}

/** Primera org del listado con sesión activa. */
function getFirstAuthenticatedOrgId() {
  for (const o of state.orgsList || []) {
    if (!o?.id) continue;
    if ((state.authStatuses[o.id] || 'expired') === 'active') return o.id;
  }
  return null;
}

function normalizeQueryLocal(raw) {
  return String(raw || '')
    .trim()
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .slice(0, 120)
    .toLowerCase();
}

function sanitizeApiPrefix(raw) {
  let prefix = String(raw || '').trim();
  if (prefix.length > 64) prefix = prefix.slice(0, 64);
  return prefix.replace(/[\u0000-\u001F\u007F]/g, '');
}

/**
 * @param {string} query
 * @param {{ orgAuthenticated?: boolean }} [opts]
 */
function filterTools(query, opts = {}) {
  if (!query) return [];
  const skipCompareTools = !!opts.orgAuthenticated;
  return listAllNavTools().filter(({ tool, label }) => {
    if (skipCompareTools && COMPARE_TOOLS_COVERED_BY_METADATA.has(tool)) return false;
    const hay = `${label} ${tool}`.toLowerCase();
    return hay.includes(query);
  });
}

function filterSavedScripts(query) {
  if (!query) return [];
  return getAnonymousApexSavedScriptsIndex().filter((s) => s.searchHay.includes(query));
}

/**
 * @param {Record<string, unknown>[]} items
 */
function mapApiIndexToEntries(items) {
  /** @type {typeof nameIndex.entries} */
  const out = [];
  for (const row of items) {
    const artType = String(row.artifactType || row.type || '');
    const spec = SPEC_BY_ART_TYPE[artType];
    if (!spec) continue;
    if (spec.isBundle) {
      const name = String(row.developerName || '');
      if (!name) continue;
      out.push({
        artType: spec.artType,
        navTool: spec.navTool,
        categoryKey: spec.categoryKey,
        isBundle: true,
        name,
        id: row.id != null ? String(row.id) : undefined,
        searchHay: name.toLowerCase()
      });
      continue;
    }
    const name = String(row.name || '');
    if (!name) continue;
    out.push({
      artType: spec.artType,
      navTool: spec.navTool,
      categoryKey: spec.categoryKey,
      name,
      searchHay: name.toLowerCase()
    });
  }
  return out;
}

function resetNameIndex() {
  nameIndex = { orgId: null, loading: false, ready: false, entries: [] };
}

function waitForNameIndex() {
  return new Promise((resolve) => {
    const tick = () => {
      if (!nameIndex.loading) {
        resolve(undefined);
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

/** Carga todos los nombres de la org (silencioso, en segundo plano). */
async function ensureNameIndex(orgId) {
  if (!orgId) return;
  if (nameIndex.orgId === orgId && nameIndex.ready) return;
  if (nameIndex.orgId === orgId && nameIndex.loading) {
    await waitForNameIndex();
    return;
  }

  const gen = ++indexBuildGeneration;
  nameIndex = { orgId, loading: true, ready: false, entries: [] };

  try {
    const res = await bg({ type: 'quickOpen:buildIndex', orgId });
    if (gen !== indexBuildGeneration) return;
    if (res?.ok && Array.isArray(res.items)) {
      nameIndex.entries = mapApiIndexToEntries(res.items);
      nameIndex.ready = true;
    }
  } catch {
    if (gen === indexBuildGeneration) resetNameIndex();
  } finally {
    if (gen === indexBuildGeneration) nameIndex.loading = false;
  }
}

function kickSilentIndexBuild(orgId) {
  if (!orgId) return;
  if (nameIndex.orgId === orgId && (nameIndex.ready || nameIndex.loading)) return;
  void ensureNameIndex(orgId).then(() => {
    if (!isOpen) return;
    const input = /** @type {HTMLInputElement | null} */ (document.getElementById('quickOpenInput'));
    if (input?.value.trim()) runQuickOpenSearchDebounced();
  });
}

function filterMetadataFromIndex(query) {
  if (!query || !nameIndex.ready) return [];
  return nameIndex.entries.filter((e) => e.searchHay.includes(query));
}

/**
 * @param {string} orgId
 * @param {string} apiPrefix
 */
async function searchMetadataByPrefix(orgId, apiPrefix) {
  const batches = await Promise.all(
    METADATA_SEARCH_SPECS.map(async (spec) => {
      const r = await bg({ type: 'searchIndex', orgId, artifactType: spec.artType, prefix: apiPrefix });
      if (!r.ok) return [];
      return mapApiIndexToEntries(
        (Array.isArray(r.items) ? r.items : []).map((item) => ({
          ...item,
          artifactType: spec.artType
        }))
      );
    })
  );
  return batches.flat();
}

function capSearchResults(tools, scripts, metadata) {
  let left = MAX_TOTAL_RESULTS;
  const toolsOut = tools.slice(0, left);
  left -= toolsOut.length;
  const scriptsOut = scripts.slice(0, left);
  left -= scriptsOut.length;
  const metadataOut = left > 0 ? metadata.slice(0, left) : [];
  return { tools: toolsOut, scripts: scriptsOut, metadata: metadataOut };
}

/**
 * @param {HTMLElement} container
 * @param {'status'|'empty'} kind
 * @param {string} message
 */
function renderStatusMessage(container, kind, message) {
  container.innerHTML = '';
  const p = document.createElement('p');
  p.className = kind === 'status' ? 'quick-open-status' : 'quick-open-empty';
  p.textContent = message;
  container.appendChild(p);
  container.classList.remove('hidden');
  syncInputExpanded(true);
}

function fillBreadcrumb(crumbs, groupLabel, name) {
  crumbs.innerHTML = '';
  const g = document.createElement('span');
  g.className = 'quick-open-crumb-group';
  g.textContent = groupLabel;
  const sep = document.createElement('span');
  sep.className = 'quick-open-crumb-sep';
  sep.setAttribute('aria-hidden', 'true');
  sep.textContent = '›';
  const n = document.createElement('span');
  n.className = 'quick-open-crumb-name';
  n.textContent = name;
  crumbs.append(g, sep, n);
}

function renderResults(results, payload) {
  results.innerHTML = '';
  activeResultIndex = -1;
  const { tools, scripts, metadata } = payload;
  if (!tools.length && !scripts.length && !metadata.length) {
    renderStatusMessage(results, 'empty', t('quickOpen.noResults'));
    return;
  }

  const frag = document.createDocumentFragment();

  for (const { mode, tool, label } of tools) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quick-open-item quick-open-item--tool';
    btn.setAttribute('role', 'option');
    const crumbs = document.createElement('span');
    crumbs.className = 'quick-open-crumbs';
    fillBreadcrumb(crumbs, t('quickOpen.groupTools'), label);
    btn.appendChild(crumbs);
    btn.addEventListener('click', () => {
      void (async () => {
        await navigateToModeAndTool(mode, tool, { userInitiated: true });
        closeQuickOpen();
      })();
    });
    frag.appendChild(btn);
  }

  for (const script of scripts) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quick-open-item quick-open-item--script';
    btn.setAttribute('role', 'option');
    const crumbs = document.createElement('span');
    crumbs.className = 'quick-open-crumbs';
    fillBreadcrumb(crumbs, t('quickOpen.groupAnonScripts'), script.name);
    btn.appendChild(crumbs);
    btn.addEventListener('click', () => {
      void (async () => {
        const ok = await openAnonymousApexSavedScript(script.id);
        if (ok) closeQuickOpen();
      })();
    });
    frag.appendChild(btn);
  }

  for (const entry of metadata) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quick-open-item quick-open-item--metadata';
    btn.setAttribute('role', 'option');
    const crumbs = document.createElement('span');
    crumbs.className = 'quick-open-crumbs';
    fillBreadcrumb(crumbs, t(entry.categoryKey), entry.name);
    btn.appendChild(crumbs);
    btn.addEventListener('click', () => {
      void selectMetadataResult(entry);
    });
    frag.appendChild(btn);
  }

  results.appendChild(frag);
  results.classList.remove('hidden');
  syncInputExpanded(true);
  highlightActiveResult(results);
}

function syncInputExpanded(expanded) {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('quickOpenInput'));
  if (input) input.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function highlightActiveResult(results) {
  const items = results.querySelectorAll('.quick-open-item');
  items.forEach((el, i) => {
    el.classList.toggle('is-active', i === activeResultIndex);
    if (i === activeResultIndex) el.scrollIntoView({ block: 'nearest' });
  });
}

async function selectMetadataResult(entry) {
  const mode = toolToMode(entry.navTool);
  if (!mode) return;
  await navigateToModeAndTool(mode, entry.navTool, { userInitiated: true });
  if (entry.isBundle && entry.id) {
    await addBundleFiles(entry.artType, { id: entry.id, developerName: entry.name });
  } else {
    addSelected({ type: entry.artType, key: entry.name, descriptor: { name: entry.name } });
  }
  closeQuickOpen();
}

async function resolveMetadataMatches(orgId, queryLocal, apiPrefix) {
  if (nameIndex.orgId === orgId && nameIndex.ready) {
    return filterMetadataFromIndex(queryLocal);
  }
  if (apiPrefix.length >= MIN_METADATA_CHARS) {
    return searchMetadataByPrefix(orgId, apiPrefix);
  }
  return [];
}

async function runQuickOpenSearchAsync() {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('quickOpenInput'));
  const results = document.getElementById('quickOpenResults');
  if (!input || !results || !isOpen) return;

  const gen = ++searchGeneration;
  const queryLocal = normalizeQueryLocal(input.value);
  const apiPrefix = sanitizeApiPrefix(input.value);

  if (!queryLocal) {
    results.innerHTML = '';
    results.classList.add('hidden');
    syncInputExpanded(false);
    activeResultIndex = -1;
    return;
  }

  const orgId = getFirstAuthenticatedOrgId();
  const tools = filterTools(queryLocal, { orgAuthenticated: !!orgId });
  const scripts = filterSavedScripts(queryLocal);

  if (!orgId) {
    const payload = capSearchResults(tools, scripts, []);
    if (!payload.tools.length && !payload.scripts.length) {
      renderStatusMessage(results, 'status', t('quickOpen.noAuth'));
    } else {
      renderResults(results, payload);
    }
    return;
  }

  kickSilentIndexBuild(orgId);

  const metadata = await resolveMetadataMatches(orgId, queryLocal, apiPrefix);
  if (gen !== searchGeneration) return;

  const payload = capSearchResults(tools, scripts, metadata);
  if (!payload.tools.length && !payload.scripts.length && !payload.metadata.length) {
    renderStatusMessage(results, 'empty', t('quickOpen.noResults'));
    return;
  }
  renderResults(results, payload);
}

const runQuickOpenSearchDebounced = debounce(() => {
  void runQuickOpenSearchAsync();
}, 200);

function runQuickOpenSearch() {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('quickOpenInput'));
  const results = document.getElementById('quickOpenResults');
  if (!input || !results) return;

  const queryLocal = normalizeQueryLocal(input.value);
  if (!queryLocal) {
    results.innerHTML = '';
    results.classList.add('hidden');
    syncInputExpanded(false);
    activeResultIndex = -1;
    return;
  }

  runQuickOpenSearchDebounced();
}

function openQuickOpen() {
  const overlay = document.getElementById('quickOpenOverlay');
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('quickOpenInput'));
  const results = document.getElementById('quickOpenResults');
  if (!overlay || !input) return;
  isOpen = true;
  searchGeneration++;
  activeResultIndex = -1;
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('quick-open-active');
  input.value = '';
  if (results) {
    results.innerHTML = '';
    results.classList.add('hidden');
    syncInputExpanded(false);
  }
  void refreshAuthStatuses().then(() => {
    if (!isOpen) return;
    kickSilentIndexBuild(getFirstAuthenticatedOrgId());
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });
}

function closeQuickOpen() {
  const overlay = document.getElementById('quickOpenOverlay');
  if (!overlay) return;
  isOpen = false;
  searchGeneration++;
  activeResultIndex = -1;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('quick-open-active');
}

function toggleQuickOpen() {
  if (isOpen) closeQuickOpen();
  else openQuickOpen();
}

function activateResultAtIndex(results, index) {
  const items = results.querySelectorAll('.quick-open-item');
  if (!items.length) return;
  const el = items[index];
  if (el) el.click();
}

export function setupQuickOpen() {
  const overlay = document.getElementById('quickOpenOverlay');
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('quickOpenInput'));
  const backdrop = document.getElementById('quickOpenBackdrop');
  if (!overlay || !input) return;

  backdrop?.addEventListener('click', () => closeQuickOpen());

  input.addEventListener('input', () => runQuickOpenSearch());
  input.addEventListener('keydown', (e) => {
    const results = document.getElementById('quickOpenResults');
    const items = results?.querySelectorAll('.quick-open-item') || [];

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeQuickOpen();
      return;
    }

    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      activeResultIndex = Math.min(items.length - 1, activeResultIndex + 1);
      if (results) highlightActiveResult(results);
      return;
    }

    if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      activeResultIndex = Math.max(0, activeResultIndex <= 0 ? 0 : activeResultIndex - 1);
      if (results) highlightActiveResult(results);
      return;
    }

    if (e.key === 'Enter' && items.length && results) {
      e.preventDefault();
      const idx = activeResultIndex >= 0 ? activeResultIndex : 0;
      activateResultAtIndex(results, idx);
    }
  });

  document.addEventListener(
    'keydown',
    (e) => {
      if (isQuickOpenShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
        toggleQuickOpen();
        return;
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        e.stopPropagation();
        closeQuickOpen();
      }
    },
    true
  );
}
