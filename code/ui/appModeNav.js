import { state } from '../core/state.js';
import { APP_NAV_DEVELOPMENT_TOOLS } from '../core/constants.js';
import { t } from '../../shared/i18n.js';
import { handleArtifactTypeSelectChange } from './searchSetup.js';

export const NAV_PREFS_KEY = 'sfocAppNavPrefs';

export const APP_NAV_MODE_HOME = 'home';

export const MODE_TOOLS = {
  compare: ['Apex', 'LWC', 'Aura', 'VF'],
  security: ['PermissionSet', 'Profile', 'FlexiPage'],
  development: [...APP_NAV_DEVELOPMENT_TOOLS],
  monitoring: ['OrgLimits', 'SetupAuditTrail', 'FieldDependency'],
  manifests: ['GeneratePackageXml', 'PackageXml']
};

const TOOL_I18N = {
  Apex: 'code.opApex',
  LWC: 'code.opLwc',
  Aura: 'code.opAura',
  VF: 'code.opVf',
  PermissionSet: 'code.opPermSet',
  Profile: 'code.opProfile',
  FlexiPage: 'code.opFlexi',
  ApexTests: 'code.opApexTests',
  ApexCoverageCompare: 'code.opApexCoverageCompare',
  QuickEdit: 'code.opQuickEdit',
  AnonymousApex: 'code.opAnonymousApex',
  QueryExplorer: 'code.opQueryExplorer',
  DebugLogBrowser: 'code.opDebugLogs',
  OrgLimits: 'code.opOrgLimits',
  SetupAuditTrail: 'code.opSetupAuditTrail',
  FieldDependency: 'code.opFieldDep',
  GeneratePackageXml: 'code.opPkgGenerate',
  PackageXml: 'code.opPkgCompare'
};

function closeAllSubmenus() {
  document.querySelectorAll('.app-mode-dropdown.is-open').forEach((el) => {
    el.classList.remove('is-open');
    const trig = el.querySelector('.app-mode-tab-trigger');
    trig?.setAttribute('aria-expanded', 'false');
  });
}

function openSubmenu(wrap) {
  if (!wrap) return;
  document.querySelectorAll('.app-mode-dropdown.is-open').forEach((el) => {
    if (el !== wrap) {
      el.classList.remove('is-open');
      el.querySelector('.app-mode-tab-trigger')?.setAttribute('aria-expanded', 'false');
    }
  });
  wrap.classList.add('is-open');
  wrap.querySelector('.app-mode-tab-trigger')?.setAttribute('aria-expanded', 'true');
}

function toggleSubmenu(wrap) {
  if (!wrap) return;
  if (wrap.classList.contains('is-open')) {
    wrap.classList.remove('is-open');
    wrap.querySelector('.app-mode-tab-trigger')?.setAttribute('aria-expanded', 'false');
  } else {
    openSubmenu(wrap);
  }
}

/** Rellena las subcategorías (tras `loadLang` / traducciones estáticas). */
export function populateModeSubmenus() {
  document.querySelectorAll('.app-mode-dropdown').forEach((wrap) => {
    const mode = /** @type {keyof typeof MODE_TOOLS | null} */ (wrap.getAttribute('data-mode'));
    if (!mode || !MODE_TOOLS[mode]) return;
    const inner = wrap.querySelector('.app-mode-submenu-inner');
    if (!inner) return;
    inner.innerHTML = '';
    for (const tool of MODE_TOOLS[mode]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'app-mode-submenu-item';
      b.setAttribute('role', 'menuitem');
      b.setAttribute('data-tool', tool);
      b.textContent = t(TOOL_I18N[tool]);
      b.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        closeAllSubmenus();
        void navigateToModeAndTool(mode, tool, { userInitiated: true });
      });
      inner.appendChild(b);
    }
  });
  syncTabSelection();
}

/** @param {string} tool */
export function toolToMode(tool) {
  for (const [mode, tools] of Object.entries(MODE_TOOLS)) {
    if (tools.includes(tool)) return /** @type {keyof typeof MODE_TOOLS} */ (mode);
  }
  return null;
}

function normalizePrefs(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  return {
    lastMode: typeof p.lastMode === 'string' ? p.lastMode : APP_NAV_MODE_HOME,
    lastToolByMode: p.lastToolByMode && typeof p.lastToolByMode === 'object' ? { ...p.lastToolByMode } : {}
  };
}

async function readPrefs() {
  try {
    const result = await chrome.storage.local.get(NAV_PREFS_KEY);
    return normalizePrefs(result[NAV_PREFS_KEY]);
  } catch {
    return normalizePrefs(null);
  }
}

async function writePrefs(prefs) {
  try {
    await chrome.storage.local.set({ [NAV_PREFS_KEY]: prefs });
  } catch {}
}

async function persistModeAndTools(tool) {
  const prefs = await readPrefs();
  const lastToolByMode = { ...prefs.lastToolByMode };
  if (state.appNavMode !== APP_NAV_MODE_HOME && tool) {
    lastToolByMode[state.appNavMode] = tool;
  }
  await writePrefs({
    lastMode: state.appNavMode,
    lastToolByMode
  });
}

/** Persistencia del modo y herramienta tras cambiar `#typeSelect` o al iniciar. */
export async function persistAfterOperationChange(_isUserChange) {
  const tool = document.getElementById('typeSelect')?.value || '';
  await persistModeAndTools(tool);
  syncTabSelection();
}

/**
 * Asegura que el modo actual incluye la herramienta (p. ej. tras generar package.xml).
 * @param {string} tool
 */
export async function ensureModeForTool(tool) {
  const mode = toolToMode(tool);
  if (!mode) return;
  closeAllSubmenus();
  if (state.appNavMode === mode) {
    rebuildTypeSelectForMode(mode);
    syncTabSelection();
    return;
  }
  state.appNavMode = mode;
  rebuildTypeSelectForMode(mode);
  syncTabSelection();
  syncSidebarToolRow();
  const prefs = await readPrefs();
  await writePrefs({
    lastMode: mode,
    lastToolByMode: prefs.lastToolByMode
  });
}

export function rebuildTypeSelectForMode(mode) {
  const sel = document.getElementById('typeSelect');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '';
  if (mode === APP_NAV_MODE_HOME) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = t('code.operationPlaceholder');
    sel.appendChild(opt);
    sel.value = '';
    sel.disabled = true;
    return;
  }
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = t('code.chooseToolInMode');
  sel.appendChild(ph);
  for (const tool of MODE_TOOLS[mode]) {
    const opt = document.createElement('option');
    opt.value = tool;
    opt.textContent = t(TOOL_I18N[tool]);
    sel.appendChild(opt);
  }
  sel.disabled = false;
  const tools = MODE_TOOLS[mode];
  if (prev && tools.includes(prev)) {
    sel.value = prev;
  }
}

export function syncTabSelection() {
  const mode = state.appNavMode;
  const tool = document.getElementById('typeSelect')?.value || '';

  document.querySelectorAll('.app-mode-tab').forEach((btn) => {
    const drop = btn.closest('.app-mode-dropdown');
    const m = drop ? drop.getAttribute('data-mode') : btn.getAttribute('data-mode');
    const selected = m === mode;
    btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    btn.classList.toggle('app-mode-tab-active', selected);
    if (drop && btn.classList.contains('app-mode-tab-trigger')) {
      const open = drop.classList.contains('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  });

  document.querySelectorAll('.app-mode-submenu-item').forEach((item) => {
    const drop = item.closest('.app-mode-dropdown');
    const m = drop?.getAttribute('data-mode');
    const tu = item.getAttribute('data-tool');
    item.classList.toggle('is-active', !!(m === mode && tu === tool && tool));
  });

  syncOrgSelectorsContextTitle();
}

/** Título discreto encima de los selectores de org (comparar código, permisos/páginas y comparar package.xml). */
function syncOrgSelectorsContextTitle() {
  const el = document.getElementById('compareContextTitle');
  if (!el) return;
  const mode = state.appNavMode;
  const tool = document.getElementById('typeSelect')?.value || '';
  const showForTool =
    !!tool &&
    ((mode === 'compare' && MODE_TOOLS.compare.includes(/** @type {any} */ (tool))) ||
      (mode === 'security' && MODE_TOOLS.security.includes(/** @type {any} */ (tool))) ||
      (mode === 'manifests' && tool === 'PackageXml'));
  if (showForTool) {
    el.textContent = t(TOOL_I18N[/** @type {keyof typeof TOOL_I18N} */ (tool)]);
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

export function syncSidebarToolRow() {
  const hint = document.getElementById('sidebarHomeHint');
  const home = state.appNavMode === APP_NAV_MODE_HOME;
  hint?.classList.toggle('hidden', !home);
}

function prefsDefaultTool(mode) {
  const list = MODE_TOOLS[mode];
  return list[0] || '';
}

/**
 * @param {keyof typeof MODE_TOOLS | typeof APP_NAV_MODE_HOME} mode
 * @param {string} [tool]
 * @param {{ userInitiated?: boolean }} [opts]
 */
export async function navigateToModeAndTool(mode, tool, opts = {}) {
  const userInitiated = !!opts.userInitiated;
  closeAllSubmenus();
  state.appNavMode = mode;
  rebuildTypeSelectForMode(mode);
  syncTabSelection();
  syncSidebarToolRow();

  const sel = document.getElementById('typeSelect');
  if (!sel) return;

  if (mode === APP_NAV_MODE_HOME) {
    sel.value = '';
    await persistModeAndTools('');
    const { applyArtifactTypeUi } = await import('./artifactTypeUi.js');
    applyArtifactTypeUi();
    const { renderEditor } = await import('../editor/editorRender.js');
    renderEditor();
    return;
  }

  const tools = MODE_TOOLS[mode];
  const pick = tool && tools.includes(tool) ? tool : prefsDefaultTool(mode);
  sel.value = pick;
  handleArtifactTypeSelectChange({ isUserChange: userInitiated });
}

/**
 * @param {{ urlOp?: string }} args
 */
export async function initializeAppNavigation(args = {}) {
  const { urlOp } = args;
  const prefs = await readPrefs();
  let mode = APP_NAV_MODE_HOME;
  let tool = '';

  if (urlOp && toolToMode(urlOp)) {
    const m = toolToMode(urlOp);
    if (m) {
      mode = m;
      tool = urlOp;
    }
  } else if (prefs.lastMode && prefs.lastMode !== APP_NAV_MODE_HOME && MODE_TOOLS[/** @type {keyof typeof MODE_TOOLS} */ (prefs.lastMode)]) {
    mode = /** @type {keyof typeof MODE_TOOLS} */ (prefs.lastMode);
    tool = prefs.lastToolByMode[mode] || prefsDefaultTool(mode);
  }

  state.appNavMode = mode;
  rebuildTypeSelectForMode(mode);
  if (mode !== APP_NAV_MODE_HOME) {
    const s = document.getElementById('typeSelect');
    if (s && tool && MODE_TOOLS[mode].includes(tool)) {
      s.value = tool;
    } else if (s) {
      const fallback = prefsDefaultTool(mode);
      s.value = fallback;
    }
  }
  state.selectedArtifactType = document.getElementById('typeSelect')?.value || '';
  syncTabSelection();
  syncSidebarToolRow();
  await persistAfterOperationChange(false);
}

export function setupAppModeTabHandlers() {
  populateModeSubmenus();

  const homeBtn = document.getElementById('appModeTabHome');
  if (homeBtn) {
    homeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllSubmenus();
      void navigateToModeAndTool(APP_NAV_MODE_HOME, '', { userInitiated: true });
    });
  }

  document.querySelectorAll('.app-mode-dropdown').forEach((wrap) => {
    const trigger = wrap.querySelector('.app-mode-tab-trigger');
    if (!trigger) return;

    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSubmenu(wrap);
      syncTabSelection();
    });
  });

  document.addEventListener('click', (e) => {
    closeAllSubmenus();
    syncTabSelection();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllSubmenus();
      syncTabSelection();
    }
  });
}
