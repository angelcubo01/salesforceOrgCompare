import { SETUP_PALETTE_PAGES } from './setupPaletteCatalog.js';
import { isQuickLinksSalesforcePage } from './matchers/quickLinksPages.js';
import { SFOC_TOOL_MODES, buildCustomQuickLinkUrl } from '../lib/quickLinkNavigation.js';
import { sfInjectSend } from './bridge.js';
import {
  DEFAULT_SETUP_COMMAND_PALETTE_SHORTCUT,
  filterSetupCommandPaletteEntries,
  isSetupCommandPaletteShortcut
} from './setupCommandPaletteUtils.js';

export const INTEGRATION_ID = 'setupCommandPalette';
const ROOT_ID = 'sfoc-setup-command-palette';
const MAX_RESULTS = 60;

const COPY = Object.freeze({
  es: {
    title: 'Paleta de configuración Salesforce',
    search: 'Buscar Setup, Quick links, herramientas, scripts o ficheros…',
    searchLabel: 'Buscar en la paleta de configuración Salesforce',
    hint: '↑↓ navegar · Enter abrir · Esc cerrar',
    noResults: 'No hay resultados.', loadingFiles: 'Buscando ficheros del entorno…',
    setup: 'Setup Salesforce',
    quickLinks: 'Quick links del entorno', tools: 'Herramientas SFOC', scripts: 'Scripts',
    savedScripts: 'Scripts Apex guardados', savedFiles: 'Ficheros del entorno',
    openInNewTab: 'Abrir en una nueva pestaña', anonymousApex: 'Abrir Anonymous Apex en SFOC'
  },
  en: {
    title: 'Salesforce Setup palette',
    search: 'Search Setup, Quick links, tools, scripts, or files…',
    searchLabel: 'Search Salesforce Setup palette',
    hint: '↑↓ navigate · Enter open · Esc close',
    noResults: 'No results.', loadingFiles: 'Searching environment files…',
    setup: 'Salesforce Setup',
    quickLinks: 'Environment Quick links', tools: 'SFOC tools', scripts: 'Scripts',
    savedScripts: 'Saved Apex scripts', savedFiles: 'Environment files',
    openInNewTab: 'Open in a new tab', anonymousApex: 'Open Anonymous Apex in SFOC'
  }
});

function copyFor(lang) {
  return COPY[lang === 'en' ? 'en' : 'es'];
}

function humanize(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
}

function setupEntries(copy) {
  return SETUP_PALETTE_PAGES.flatMap((item) => {
    const path = String(item?.path || '');
    const label = String(item?.label || '').trim();
    if (!path || !label) return [];
    return [{
      kind: 'setup', order: 3, group: copy.setup, label, detail: path, path
    }];
  });
}

function sfocEntries(copy) {
  return Object.keys(SFOC_TOOL_MODES).map((toolId) => ({
    kind: 'tool', order: 2, group: copy.tools, label: humanize(toolId), detail: toolId, toolId
  }));
}

function quickLinkEntries(copy, links) {
  return (Array.isArray(links) ? links : []).flatMap((link) => {
    if (!link || typeof link !== 'object') return [];
    if (link.type === 'sfoc') return [];
    const label = String(link.label || '').trim();
    if (!label) return [];
    const path = String(link.url || '');
    return buildCustomQuickLinkUrl(path) ? [{ kind: 'setup', order: 0, group: copy.quickLinks, label, detail: path, path }] : [];
  });
}

function scriptEntries(copy, scripts = []) {
  const saved = (Array.isArray(scripts) ? scripts : []).map((script) => ({
    kind: 'script', order: 1, group: copy.savedScripts, label: script.name || 'script', detail: 'Anonymous Apex', scriptId: script.id
  })).filter((script) => script.scriptId);
  return saved.length ? saved : [{
    kind: 'tool', order: 1, group: copy.scripts, label: copy.savedScripts,
    detail: copy.anonymousApex, toolId: 'AnonymousApex'
  }];
}

function createResultIcon(doc, entry) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('sfoc-setup-palette-result-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  const order = Number(entry.order);
  if (order === 0) path.setAttribute('d', 'M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1');
  else if (order === 1) path.setAttribute('d', 'M8 9l-3 3 3 3M16 9l3 3-3 3M14 5l-4 14');
  else if (order === 2) path.setAttribute('d', 'M14.7 6.3a5 5 0 0 0-6 6L3 18l3 3 5.7-5.7a5 5 0 0 0 6-6L14 13l-3-3z');
  else if (order === 3) path.setAttribute('d', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5');
  else path.setAttribute('d', 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.2 2.2-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-3.2v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L6.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H5v-3.2h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.2-2.2.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V4h3.2v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.2 2.2-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2V14h-.2a1.7 1.7 0 0 0-1.5 1z');
  svg.appendChild(path);
  return svg;
}

function createOption(doc, entry, active, onSelect, copy) {
  const row = doc.createElement('div');
  row.className = 'sfoc-setup-palette-option';
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', active ? 'true' : 'false');
  if (active) row.classList.add('is-active');
  const option = doc.createElement('button');
  option.type = 'button';
  option.className = 'sfoc-setup-palette-option-main';
  const group = doc.createElement('span');
  group.className = 'sfoc-setup-palette-option-group';
  group.textContent = entry.group;
  const label = doc.createElement('strong');
  label.textContent = entry.label;
  const content = doc.createElement('span');
  content.className = 'sfoc-setup-palette-option-content';
  content.append(group, label);
  option.append(createResultIcon(doc, entry), content);
  option.addEventListener('click', () => onSelect(entry));
  const openNewTab = doc.createElement('button');
  openNewTab.type = 'button';
  openNewTab.className = 'sfoc-setup-palette-open-new-tab';
  openNewTab.title = copy.openInNewTab;
  openNewTab.setAttribute('aria-label', `${copy.openInNewTab}: ${entry.label}`);
  openNewTab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M18 14v5H5V6h5"/></svg>';
  openNewTab.addEventListener('click', () => onSelect(entry, true));
  row.append(option, openNewTab);
  return row;
}

async function loadExtraEntries(ctx, copy) {
  try {
    const result = await sfInjectSend({ type: 'sfInject:getSetupCommandPaletteFiles', orgId: ctx.orgId });
    return {
      files: (Array.isArray(result?.files) ? result.files : []).map((file) => ({
      kind: 'file', order: 4, group: copy.savedFiles, label: `${file.typeLabel || file.type} > ${file.label}`,
      detail: file.type, searchLabel: file.label, type: file.type, key: file.key, bundleId: file.bundleId
      })),
      scripts: Array.isArray(result?.scripts) ? result.scripts : []
    };
  } catch {
    return { files: [], scripts: [] };
  }
}

function createPalette(doc, ctx) {
  const copy = copyFor(ctx.lang);
  const root = doc.createElement('section');
  root.id = ROOT_ID;
  root.className = 'sfoc-setup-palette';
  root.setAttribute('aria-hidden', 'true');
  const backdrop = doc.createElement('div');
  backdrop.className = 'sfoc-setup-palette-backdrop';
  const dialog = doc.createElement('div');
  dialog.className = 'sfoc-setup-palette-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', copy.title);
  const searchRow = doc.createElement('div');
  searchRow.className = 'sfoc-setup-palette-search-row';
  const appIcon = doc.createElement('img');
  appIcon.className = 'sfoc-setup-palette-app-icon';
  appIcon.src = chrome.runtime.getURL('icons/icon-512.png');
  appIcon.alt = '';
  appIcon.setAttribute('aria-hidden', 'true');
  const input = doc.createElement('input');
  input.type = 'search';
  input.className = 'sfoc-setup-palette-input';
  input.placeholder = copy.search;
  input.setAttribute('aria-label', copy.searchLabel);
  input.setAttribute('autocomplete', 'off');
  const hint = doc.createElement('p');
  hint.className = 'sfoc-setup-palette-hint';
  hint.textContent = `${copy.hint} · ${ctx.shortcut || DEFAULT_SETUP_COMMAND_PALETTE_SHORTCUT}`;
  const results = doc.createElement('div');
  results.className = 'sfoc-setup-palette-results';
  results.setAttribute('role', 'listbox');
  results.setAttribute('aria-live', 'polite');
  searchRow.append(appIcon, input);
  dialog.append(searchRow, results, hint);
  root.append(backdrop, dialog);
  doc.body.appendChild(root);

  let entries = [...quickLinkEntries(copy, ctx.quickLinks), ...scriptEntries(copy), ...sfocEntries(copy), ...setupEntries(copy)];
  let matches = [];
  let activeIndex = 0;
  let previousFocus = null;
  let open = false;
  let fileEntries = [];
  let savedScripts = [];
  let fileSearchTimer = null;
  let fileSearchGeneration = 0;
  let filesLoading = false;

  const rebuildEntries = () => {
    entries = [...quickLinkEntries(copy, ctx.quickLinks), ...scriptEntries(copy, savedScripts), ...sfocEntries(copy), ...setupEntries(copy), ...fileEntries];
  };

  const close = () => {
    if (!open) return;
    open = false;
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
    if (previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  };
  const select = async (entry, openInNewTab = false) => {
    close();
    if (entry.kind === 'setup') {
      const url = buildCustomQuickLinkUrl(entry.path);
      if (openInNewTab) window.open(url, '_blank', 'noopener,noreferrer');
      else location.assign(url);
      return;
    }
    try {
      await sfInjectSend({
        type: 'sfInject:openSetupCommandPaletteTarget', orgId: ctx.orgId,
        target: entry.kind, toolId: entry.toolId, itemType: entry.type, itemKey: entry.key,
        scriptId: entry.scriptId, bundleId: entry.bundleId, openInNewTab
      });
    } catch {
      ctx.onError?.(ctx.lang === 'en'
        ? 'The selected item could not be opened in SFOC.'
        : 'No se pudo abrir el elemento seleccionado en SFOC.');
    }
  };
  const render = () => {
    if (!input.value.trim()) {
      matches = [];
      activeIndex = 0;
      results.replaceChildren();
      return;
    }
    matches = filterSetupCommandPaletteEntries(entries, input.value, MAX_RESULTS);
    activeIndex = Math.min(activeIndex, Math.max(0, matches.length - 1));
    results.replaceChildren();
    const appendLoading = () => {
      const loading = doc.createElement('p');
      loading.className = 'sfoc-setup-palette-loading';
      const spinner = doc.createElement('span');
      spinner.className = 'sfoc-setup-palette-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      loading.append(spinner, doc.createTextNode(copy.loadingFiles));
      results.appendChild(loading);
    };
    if (!matches.length) {
      if (filesLoading) {
        appendLoading();
        return;
      }
      const empty = doc.createElement('p');
      empty.className = 'sfoc-setup-palette-empty';
      empty.textContent = copy.noResults;
      results.appendChild(empty);
      return;
    }
    matches.forEach((entry, index) => results.appendChild(createOption(doc, entry, index === activeIndex, select, copy)));
    if (filesLoading) appendLoading();
  };
  const show = () => {
    if (open) return close();
    previousFocus = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    open = true;
    if (fileSearchTimer) clearTimeout(fileSearchTimer);
    fileSearchGeneration++;
    filesLoading = false;
    fileEntries = [];
    rebuildEntries();
    activeIndex = 0;
    input.value = '';
    root.classList.add('is-open');
    root.setAttribute('aria-hidden', 'false');
    render();
    requestAnimationFrame(() => input.focus());
  };
  const searchFiles = () => {
    const query = input.value.trim();
    const generation = ++fileSearchGeneration;
    if (fileSearchTimer) clearTimeout(fileSearchTimer);
    if (!query) {
      filesLoading = false;
      fileEntries = [];
      rebuildEntries();
      return;
    }
    filesLoading = true;
    fileSearchTimer = setTimeout(async () => {
      const result = await sfInjectSend({
        type: 'sfInject:searchSetupCommandPaletteFiles', orgId: ctx.orgId, query
      }).catch(() => null);
      if (generation !== fileSearchGeneration) return;
      filesLoading = false;
      fileEntries = (Array.isArray(result?.files) ? result.files : []).map((file) => ({
        kind: 'file', order: 4, group: copy.savedFiles, label: `${file.typeLabel || file.type} > ${file.label}`,
        detail: file.type, searchLabel: file.label, type: file.type, key: file.key, bundleId: file.bundleId
      }));
      rebuildEntries();
      if (open) render();
    }, 220);
  };
  input.addEventListener('input', () => { activeIndex = 0; searchFiles(); render(); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key === 'ArrowDown' && matches.length) { event.preventDefault(); activeIndex = Math.min(activeIndex + 1, matches.length - 1); render(); }
    if (event.key === 'ArrowUp' && matches.length) { event.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); render(); }
    if (event.key === 'Enter' && matches[activeIndex]) { event.preventDefault(); void select(matches[activeIndex]); }
  });
  backdrop.addEventListener('click', close);
  const onKeyDown = (event) => {
    if (open && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
    if (!isSetupCommandPaletteShortcut(event, ctx.shortcut)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    show();
  };
  doc.addEventListener('keydown', onKeyDown, true);
  void loadExtraEntries(ctx, copy).then(({ scripts }) => {
    savedScripts = scripts;
    rebuildEntries();
    if (open) render();
  });
  return () => { doc.removeEventListener('keydown', onKeyDown, true); root.remove(); };
}

function isParentPageActive() {
  try { return isQuickLinksSalesforcePage(window.top.location.href); } catch { return isQuickLinksSalesforcePage(location.href); }
}

export const setupCommandPaletteIntegration = {
  id: INTEGRATION_ID,
  isParentPageActive,
  isFrameRelevant: () => window.top === window,
  mount(doc, ctx) {
    return createPalette(doc, {
      ...ctx,
      shortcut: ctx.prefs?.setupCommandPaletteShortcut || DEFAULT_SETUP_COMMAND_PALETTE_SHORTCUT
    });
  }
};
