import { state } from '../core/state.js';
import { getToolRecentsSnapshot, loadToolRecents } from '../core/toolRecents.js';
import { t } from '../../shared/i18n.js';
import { listAllNavTools, navigateToModeAndTool } from './appModeNav.js';
import { addSelected, addBundleFiles } from '../flows/addItems.js';
import {
  getAnonymousApexSavedScriptsIndex,
  openAnonymousApexSavedScript
} from './anonymousApexPanel.js';
import { debounce } from './searchSetup.js';
import { refreshAuthStatuses } from './orgs.js';
import {
  COMPARE_TOOLS_COVERED_BY_METADATA,
  fillBreadcrumb,
  kickSilentIndexBuild,
  metadataSearchItemClasses,
  normalizeQueryLocal,
  resolveMetadataMatches,
  sanitizeApiPrefix
} from '../lib/metadataSearch.js';
import {
  getMetadataSearchLoadingMessage,
  renderSearchLoadingSpinner
} from './searchLoadingUi.js';
import { createIcon } from '../workbench/iconRegistry.js';
import { getToolIcon, getWorkspaceById } from '../workbench/workspaceRegistry.js';

const QUICK_OPEN_SHORTCUT = Object.freeze({ shift: true, key: 'p' });
const COMMAND_PALETTE_SHORTCUT = Object.freeze({ shift: false, key: 'k' });
const MAX_TOTAL_RESULTS = 18;

let isOpen = false;
let searchGeneration = 0;
let activeResultIndex = -1;
let previouslyFocusedElement = null;
let resultSequence = 0;

/** Etiqueta del atajo principal para la UI. */
export function getQuickOpenShortcutLabel() {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');
  return mac ? '⌘K' : 'Ctrl+K';
}

/** Acepta el atajo nuevo y conserva Ctrl/Cmd+Shift+P durante la convivencia. */
export function isCommandPaletteShortcut(event) {
  if (!event || event.altKey || !(event.ctrlKey || event.metaKey)) return false;
  const key = String(event.key || '').toLowerCase();
  const shift = event.shiftKey === true;
  return (
    (key === COMMAND_PALETTE_SHORTCUT.key && shift === COMMAND_PALETTE_SHORTCUT.shift) ||
    (key === QUICK_OPEN_SHORTCUT.key && shift === QUICK_OPEN_SHORTCUT.shift)
  );
}

function isV2() {
  return document.body.dataset.uiMode === 'v2';
}

/** Primera org del listado con sesión activa. */
function getFirstAuthenticatedOrgId() {
  for (const org of state.orgsList || []) {
    if (!org?.id) continue;
    if ((state.authStatuses[org.id] || 'expired') === 'active') return org.id;
  }
  return null;
}

function filterLegacyTools(query, opts = {}) {
  if (!query) return [];
  const skipCompareTools = !!opts.orgAuthenticated;
  return listAllNavTools().filter(({ tool, label }) => {
    if (skipCompareTools && COMPARE_TOOLS_COVERED_BY_METADATA.has(tool)) return false;
    return `${label} ${tool}`.toLocaleLowerCase().includes(query);
  });
}

async function filterWorkbenchTools(query) {
  const { getVisibleWorkbenchSearchEntries } = await import('../workbench/workbenchShell.js');
  const entries = getVisibleWorkbenchSearchEntries();
  const normalized = String(query || '').toLocaleLowerCase();
  if (normalized) {
    return entries
      .filter((entry) => entry.searchText.includes(normalized))
      .map((entry) => ({
        ...entry,
        groupLabel: entry.type === 'workspace' ? t('quickOpen.groupWorkspaces') : t('quickOpen.groupTools')
      }));
  }

  const snapshot = getToolRecentsSnapshot();
  const findTool = (toolId, groupLabel) => {
    const found = entries.find((entry) => entry.type === 'tool' && entry.toolId === toolId);
    return found ? { ...found, groupLabel } : null;
  };
  const favorites = snapshot.pins
    .map((toolId) => findTool(toolId, t('quickOpen.groupFavorites')))
    .filter(Boolean);
  const recents = snapshot.recents
    .filter((toolId) => !snapshot.pins.includes(toolId))
    .map((toolId) => findTool(toolId, t('quickOpen.groupRecents')))
    .filter(Boolean);
  const workspaces = entries
    .filter((entry) => entry.type === 'workspace')
    .map((entry) => ({ ...entry, groupLabel: t('quickOpen.groupWorkspaces') }));
  return [...favorites, ...recents, ...workspaces];
}

async function filterTools(query, opts = {}) {
  return isV2() ? filterWorkbenchTools(query) : filterLegacyTools(query, opts);
}

function filterSavedScripts(query) {
  if (!query) return [];
  return getAnonymousApexSavedScriptsIndex().filter((script) => script.searchHay.includes(query));
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

function syncInputExpanded(expanded) {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('quickOpenInput'));
  if (!input) return;
  input.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  if (!expanded) input.removeAttribute('aria-activedescendant');
}

function renderStatusMessage(container, kind, message) {
  container.replaceChildren();
  const paragraph = document.createElement('p');
  paragraph.className = kind === 'status' ? 'quick-open-status' : 'quick-open-empty';
  paragraph.textContent = message;
  container.appendChild(paragraph);
  container.classList.remove('hidden');
  syncInputExpanded(true);
}

function prepareOption(button) {
  button.id = `quickOpenResult-${++resultSequence}`;
  button.setAttribute('role', 'option');
  button.setAttribute('tabindex', '-1');
  button.setAttribute('aria-selected', 'false');
}

function createToolOption(entry) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'quick-open-item quick-open-item--tool';
  prepareOption(button);
  button.setAttribute('aria-disabled', entry.disabled ? 'true' : 'false');
  if (entry.disabled && entry.message) button.setAttribute('aria-description', entry.message);

  const crumbs = document.createElement('span');
  crumbs.className = 'quick-open-crumbs';
  fillBreadcrumb(
    crumbs,
    entry.groupLabel || t('quickOpen.groupTools'),
    entry.label || entry.workspaceLabel || entry.tool || ''
  );
  if (isV2()) {
    const main = document.createElement('span');
    main.className = 'quick-open-option-main';
    const workspace = entry.workspaceId ? getWorkspaceById(entry.workspaceId) : null;
    const iconName = entry.toolId || entry.tool
      ? getToolIcon(entry.toolId || entry.tool)
      : workspace?.icon || 'command';
    main.appendChild(createIcon(iconName, { size: 20 }));
    main.appendChild(crumbs);
    button.appendChild(main);
  } else {
    button.appendChild(crumbs);
  }

  if (entry.disabled) {
    const reason = document.createElement('span');
    reason.className = 'quick-open-blocked-reason';
    reason.textContent = entry.message || t('quickOpen.blocked');
    button.appendChild(reason);
  }

  button.addEventListener('click', () => {
    void (async () => {
      if (entry.disabled) return;
      if (entry.workspaceId && entry.tabId) {
        const { navigateToWorkspaceTab } = await import('../workbench/workbenchShell.js');
        await navigateToWorkspaceTab(entry.workspaceId, entry.tabId, { userInitiated: true });
      } else {
        await navigateToModeAndTool(entry.mode, entry.tool, { userInitiated: true });
      }
      closeQuickOpen();
    })();
  });
  return button;
}

function createScriptOption(script) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'quick-open-item quick-open-item--script';
  prepareOption(button);
  const crumbs = document.createElement('span');
  crumbs.className = 'quick-open-crumbs';
  fillBreadcrumb(crumbs, t('quickOpen.groupAnonScripts'), script.name);
  button.appendChild(crumbs);
  button.addEventListener('click', () => {
    void (async () => {
      const ok = await openAnonymousApexSavedScript(script.id);
      if (ok) closeQuickOpen();
    })();
  });
  return button;
}

function createMetadataOption(entry) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = metadataSearchItemClasses(entry.artType);
  prepareOption(button);
  const crumbs = document.createElement('span');
  crumbs.className = 'quick-open-crumbs';
  fillBreadcrumb(crumbs, t(entry.categoryKey), entry.name);
  button.appendChild(crumbs);
  button.addEventListener('click', () => void selectMetadataResult(entry));
  return button;
}

function renderResults(results, payload) {
  results.replaceChildren();
  activeResultIndex = -1;
  resultSequence = 0;
  const { tools, scripts, metadata } = payload;
  if (!tools.length && !scripts.length && !metadata.length) {
    renderStatusMessage(results, 'empty', t('quickOpen.noResults'));
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const entry of tools) fragment.appendChild(createToolOption(entry));
  for (const script of scripts) fragment.appendChild(createScriptOption(script));
  for (const entry of metadata) fragment.appendChild(createMetadataOption(entry));
  results.appendChild(fragment);
  results.classList.remove('hidden');
  syncInputExpanded(true);
  highlightActiveResult(results);
}

function highlightActiveResult(results) {
  const items = results.querySelectorAll('.quick-open-item');
  const input = document.getElementById('quickOpenInput');
  items.forEach((item, index) => {
    const active = index === activeResultIndex;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-selected', active ? 'true' : 'false');
    if (active) {
      item.scrollIntoView({ block: 'nearest' });
      input?.setAttribute('aria-activedescendant', item.id);
    }
  });
  if (activeResultIndex < 0) input?.removeAttribute('aria-activedescendant');
}

async function selectMetadataResult(entry) {
  await navigateToModeAndTool('comparator', 'Comparator', { userInitiated: true });
  if (entry.isBundle && entry.id) {
    await addBundleFiles(entry.artType, { id: entry.id, developerName: entry.name });
  } else {
    addSelected({ type: entry.artType, key: entry.name, descriptor: { name: entry.name } });
  }
  closeQuickOpen();
}

async function runQuickOpenSearchAsync() {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('quickOpenInput'));
  const results = document.getElementById('quickOpenResults');
  if (!input || !results || !isOpen) return;

  const generation = ++searchGeneration;
  const queryLocal = normalizeQueryLocal(input.value);
  const apiPrefix = sanitizeApiPrefix(input.value);
  if (!queryLocal && !isV2()) {
    results.replaceChildren();
    results.classList.add('hidden');
    syncInputExpanded(false);
    activeResultIndex = -1;
    return;
  }

  const orgId = getFirstAuthenticatedOrgId();
  const tools = await filterTools(queryLocal, { orgAuthenticated: !!orgId });
  const scripts = filterSavedScripts(queryLocal);
  if (!queryLocal) {
    renderResults(results, capSearchResults(tools, [], []));
    return;
  }

  if (!orgId) {
    const payload = capSearchResults(tools, scripts, []);
    if (!payload.tools.length && !payload.scripts.length) {
      renderStatusMessage(results, 'status', t('quickOpen.noAuth'));
    } else {
      renderResults(results, payload);
    }
    return;
  }

  kickSilentIndexBuild(orgId, () => {
    if (!isOpen) return;
    const currentInput = /** @type {HTMLInputElement | null} */ (document.getElementById('quickOpenInput'));
    if (currentInput?.value.trim()) runQuickOpenSearchDebounced();
  });

  renderSearchLoadingSpinner(results, getMetadataSearchLoadingMessage(orgId), {
    onShow: () => {
      results.classList.remove('hidden');
      syncInputExpanded(true);
    }
  });
  const metadata = await resolveMetadataMatches(orgId, queryLocal, apiPrefix);
  if (generation !== searchGeneration) return;
  renderResults(results, capSearchResults(tools, scripts, metadata));
}

const runQuickOpenSearchDebounced = debounce(() => void runQuickOpenSearchAsync(), 200);

function runQuickOpenSearch() {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('quickOpenInput'));
  const results = document.getElementById('quickOpenResults');
  if (!input || !results) return;
  const queryLocal = normalizeQueryLocal(input.value);
  if (!queryLocal && !isV2()) {
    results.replaceChildren();
    results.classList.add('hidden');
    syncInputExpanded(false);
    activeResultIndex = -1;
    return;
  }
  runQuickOpenSearchDebounced();
}

export function openQuickOpen() {
  const overlay = document.getElementById('quickOpenOverlay');
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('quickOpenInput'));
  const results = document.getElementById('quickOpenResults');
  if (!overlay || !input) return;
  previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  isOpen = true;
  searchGeneration++;
  activeResultIndex = -1;
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('quick-open-active');
  input.value = '';
  if (results) {
    results.replaceChildren();
    results.classList.toggle('hidden', !isV2());
    syncInputExpanded(false);
  }
  const hint = document.getElementById('quickOpenShortcutHint');
  if (hint) hint.textContent = getQuickOpenShortcutLabel();
  if (isV2()) void runQuickOpenSearchAsync();

  void refreshAuthStatuses().then(() => {
    if (!isOpen) return;
    kickSilentIndexBuild(getFirstAuthenticatedOrgId());
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });
}

export function closeQuickOpen() {
  const overlay = document.getElementById('quickOpenOverlay');
  if (!overlay) return;
  isOpen = false;
  searchGeneration++;
  activeResultIndex = -1;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('quick-open-active');
  document.getElementById('quickOpenInput')?.removeAttribute('aria-activedescendant');
  if (previouslyFocusedElement?.isConnected) previouslyFocusedElement.focus();
  previouslyFocusedElement = null;
}

function toggleQuickOpen() {
  if (isOpen) closeQuickOpen();
  else openQuickOpen();
}

function activateResultAtIndex(results, index) {
  const item = results.querySelectorAll('.quick-open-item')[index];
  item?.click();
}

function trapPaletteFocus(event, overlay) {
  if (event.key !== 'Tab') return;
  const focusable = [...overlay.querySelectorAll('input, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
    .filter((item) => !item.classList.contains('hidden') && item.getAttribute('aria-hidden') !== 'true');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function setupQuickOpen() {
  const overlay = document.getElementById('quickOpenOverlay');
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('quickOpenInput'));
  const results = document.getElementById('quickOpenResults');
  const backdrop = document.getElementById('quickOpenBackdrop');
  const closeButton = document.getElementById('quickOpenCloseBtn');
  if (!overlay || !input) return;

  backdrop?.addEventListener('click', closeQuickOpen);
  closeButton?.addEventListener('click', closeQuickOpen);
  overlay.addEventListener('keydown', (event) => trapPaletteFocus(event, overlay));
  document.addEventListener('sfoc:open-command-palette', openQuickOpen);
  void loadToolRecents();

  input.addEventListener('input', runQuickOpenSearch);
  input.addEventListener('keydown', (event) => {
    const items = results?.querySelectorAll('.quick-open-item') || [];
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeQuickOpen();
      return;
    }
    if (event.key === 'ArrowDown' && items.length) {
      event.preventDefault();
      activeResultIndex = Math.min(items.length - 1, activeResultIndex + 1);
    } else if (event.key === 'ArrowUp' && items.length) {
      event.preventDefault();
      activeResultIndex = Math.max(0, activeResultIndex <= 0 ? 0 : activeResultIndex - 1);
    } else if (event.key === 'Home' && items.length) {
      event.preventDefault();
      activeResultIndex = 0;
    } else if (event.key === 'End' && items.length) {
      event.preventDefault();
      activeResultIndex = items.length - 1;
    } else if (event.key === 'Enter' && items.length && results) {
      event.preventDefault();
      activateResultAtIndex(results, activeResultIndex >= 0 ? activeResultIndex : 0);
      return;
    } else {
      return;
    }
    if (results) highlightActiveResult(results);
  });

  document.addEventListener(
    'keydown',
    (event) => {
      if (isCommandPaletteShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        toggleQuickOpen();
        return;
      }
      if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        event.stopPropagation();
        closeQuickOpen();
      }
    },
    true
  );
}
