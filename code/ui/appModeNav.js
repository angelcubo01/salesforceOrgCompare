import { state } from '../core/state.js';
import {
  APP_NAV_ANALYSIS_TOOLS,
  APP_NAV_DEVELOPMENT_TOOLS,
  APP_NAV_MONITORING_TOOLS
} from '../core/constants.js';
import { getGroupedToolsForMode } from '../core/toolNavGroups.js';
import { clearComparisonSelection, handleArtifactTypeSelectChange } from './searchSetup.js';
import { resetMonacoComparisonView } from '../editor/editorRender.js';
import { syncCompareUrlFromState } from '../lib/compareDeepLink.js';
import { COMPARE_TOOLS_COVERED_BY_METADATA } from '../lib/metadataSearch.js';
import { syncCompareContextTitle } from './compareContextTitle.js';
import { refreshHelpModalIfOpen } from './appHelp.js';
import { applyArtifactTypeUi } from './artifactTypeUi.js';
import { isModeVisible, isToolVisible } from '../../shared/featureControls.js';
import { getCachedFeatureControlsConfig } from '../../shared/posthogFeatureControlsFlag.js';
import { t } from '../../shared/i18n.js';
import { showToast } from './toast.js';

export const NAV_PREFS_KEY = 'sfocAppNavPrefs';

export const APP_NAV_MODE_HOME = 'home';

export const COMPARATOR_TOOL = 'Comparator';

/** Herramientas de comparación legadas (deep links y prefs). */
export const LEGACY_COMPARE_TOOLS = new Set([
  ...COMPARE_TOOLS_COVERED_BY_METADATA,
  'PackageXml',
  COMPARATOR_TOOL
]);

/** Tools que antes vivían en `monitoring` y ahora están en `analysis`. */
export const ANALYSIS_TOOL_SET = new Set(APP_NAV_ANALYSIS_TOOLS);

export const MODE_TOOLS = {
  comparator: [COMPARATOR_TOOL],
  development: [...APP_NAV_DEVELOPMENT_TOOLS],
  analysis: [...APP_NAV_ANALYSIS_TOOLS],
  monitoring: [...APP_NAV_MONITORING_TOOLS],
  manifests: ['GeneratePackageXml', 'MetadataTypeCompare']
};

export const TOOL_I18N = {
  Comparator: 'code.appModeComparator',
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
  LightningQuickEdit: 'code.opLightningQuickEdit',
  AnonymousApex: 'code.opAnonymousApex',
  QueryExplorer: 'code.opQueryExplorer',
  DebugLogBrowser: 'code.opDebugLogs',
  EnvironmentStatus: 'code.opEnvironmentStatus',
  OrgLimits: 'code.opOrgLimits',
  DeployStatus: 'code.opDeployStatus',
  SetupAuditTrail: 'code.opSetupAuditTrail',
  FieldHistory: 'code.opFieldHistory',
  FieldDependency: 'code.opFieldDep',
  DependencyExplorer: 'code.opDepExplorer',
  PermissionDiff: 'code.opPermissionDiff',
  CustomSettingsCompare: 'code.opCustomSettingsCompare',
  CustomMetadataCompare: 'code.opCustomMetadataCompare',
  RecordCompare: 'code.opRecordCompare',
  GeneratePackageXml: 'code.opPkgGenerate',
  MetadataTypeCompare: 'code.opMetadataTypeCompare',
  PackageXml: 'code.opPkgCompare'
};

function featureControlsConfig() {
  return getCachedFeatureControlsConfig();
}

/** @param {keyof typeof MODE_TOOLS} mode */
export function getVisibleToolsForMode(mode) {
  const config = featureControlsConfig();
  if (!isModeVisible(config, mode)) return [];
  return MODE_TOOLS[mode].filter((tool) => isToolVisible(config, tool));
}

/** Oculta pestañas de modo según configuración remota. */
export function syncFeatureControlsModeTabs() {
  const config = featureControlsConfig();
  const comparatorBtn = document.getElementById('appModeTabComparator');
  if (comparatorBtn) {
    const hidden = !isModeVisible(config, 'comparator');
    comparatorBtn.hidden = hidden;
    comparatorBtn.classList.toggle('hidden', hidden);
  }
  document.querySelectorAll('.app-mode-dropdown').forEach((wrap) => {
    const mode = /** @type {keyof typeof MODE_TOOLS | null} */ (wrap.getAttribute('data-mode'));
    if (!mode) return;
    const hidden = !isModeVisible(config, mode);
    wrap.hidden = hidden;
    wrap.classList.toggle('hidden', hidden);
  });
}

/** Reconstruye menús tras cambio de feature controls. */
export function applyFeatureControlsNavigation() {
  populateModeSubmenus();
  rebuildTypeSelectForMode(state.appNavMode);
  syncTabSelection();
  syncFeatureControlsModeTabs();
}

/**
 * @param {keyof typeof MODE_TOOLS} mode
 * @returns {string}
 */
function firstVisibleTool(mode) {
  const tools = getVisibleToolsForMode(mode);
  return tools[0] || '';
}

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

/** @param {string} mode */
export function migrateLegacyNavMode(mode) {
  if (mode === 'compare' || mode === 'security') return 'comparator';
  return mode;
}

/**
 * Si el modo no incluye la herramienta, usa el modo que sí la contiene (p. ej. deep links antiguos).
 * @param {string} mode
 * @param {string} tool
 */
export function resolveModeForTool(mode, tool) {
  const effectiveTool = migrateLegacyTool(tool);
  if (!effectiveTool) return mode;
  const toolMode = toolToMode(effectiveTool);
  if (!toolMode) return mode;
  if (MODE_TOOLS[/** @type {keyof typeof MODE_TOOLS} */ (mode)]?.includes(effectiveTool)) return mode;
  return toolMode;
}

/** @param {string} tool */
export function migrateLegacyTool(tool) {
  if (LEGACY_COMPARE_TOOLS.has(tool) && tool !== COMPARATOR_TOOL) return COMPARATOR_TOOL;
  return tool;
}


function appendSubmenuTool(inner, mode, tool) {
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

function appendSubmenuHeading(inner, i18nKey) {
  const h = document.createElement('div');
  h.className = 'app-mode-submenu-heading';
  h.setAttribute('role', 'presentation');
  h.textContent = t(i18nKey);
  inner.appendChild(h);
}

function appendTypeSelectOption(sel, tool) {
  const opt = document.createElement('option');
  opt.value = tool;
  opt.textContent = t(TOOL_I18N[tool]);
  sel.appendChild(opt);
}

function populateSubmenuTools(inner, mode, visibleTools) {
  const groups = getGroupedToolsForMode(mode, visibleTools);
  if (!groups) {
    for (const tool of visibleTools) appendSubmenuTool(inner, mode, tool);
    return;
  }
  for (const group of groups) {
    appendSubmenuHeading(inner, group.i18nKey);
    for (const tool of group.tools) appendSubmenuTool(inner, mode, tool);
  }
}

function populateTypeSelectTools(sel, mode, visibleTools) {
  const groups = getGroupedToolsForMode(mode, visibleTools);
  if (!groups) {
    for (const tool of visibleTools) appendTypeSelectOption(sel, tool);
    return;
  }
  for (const group of groups) {
    const og = document.createElement('optgroup');
    og.label = t(group.i18nKey);
    sel.appendChild(og);
    for (const tool of group.tools) {
      const opt = document.createElement('option');
      opt.value = tool;
      opt.textContent = t(TOOL_I18N[tool]);
      og.appendChild(opt);
    }
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
    populateSubmenuTools(inner, mode, getVisibleToolsForMode(mode));
  });
  syncTabSelection();
}

/** Todas las herramientas navegables (modo + id + etiqueta traducida). */
export function listAllNavTools() {
  /** @type {{ mode: keyof typeof MODE_TOOLS, tool: string, label: string }[]} */
  const out = [];
  for (const [mode, tools] of Object.entries(MODE_TOOLS)) {
    if (!isModeVisible(featureControlsConfig(), mode)) continue;
    for (const tool of tools) {
      if (!isToolVisible(featureControlsConfig(), tool)) continue;
      const key = /** @type {keyof typeof TOOL_I18N} */ (tool);
      out.push({ mode, tool, label: t(TOOL_I18N[key] || tool) });
    }
  }
  return out;
}

/** @param {string} tool */
export function toolToMode(tool) {
  if (LEGACY_COMPARE_TOOLS.has(tool)) return 'comparator';
  for (const [mode, tools] of Object.entries(MODE_TOOLS)) {
    if (tools.includes(tool)) return /** @type {keyof typeof MODE_TOOLS} */ (mode);
  }
  return null;
}

function normalizePrefs(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  let lastMode = typeof p.lastMode === 'string' ? p.lastMode : APP_NAV_MODE_HOME;
  lastMode = migrateLegacyNavMode(lastMode);
  const lastToolByMode =
    p.lastToolByMode && typeof p.lastToolByMode === 'object' ? { ...p.lastToolByMode } : {};
  if (lastMode === 'manifests' && lastToolByMode.manifests === 'PackageXml') {
    lastMode = 'comparator';
    lastToolByMode.comparator = COMPARATOR_TOOL;
    delete lastToolByMode.manifests;
  }
  if (lastMode === 'comparator' && lastToolByMode.comparator) {
    lastToolByMode.comparator = migrateLegacyTool(lastToolByMode.comparator);
  }
  for (const [modeKey, toolId] of Object.entries(lastToolByMode)) {
    if (modeKey === 'monitoring' && toolId && ANALYSIS_TOOL_SET.has(String(toolId))) {
      lastToolByMode.analysis = String(toolId);
      delete lastToolByMode.monitoring;
    }
  }
  if (lastMode === 'monitoring') {
    const monTool = lastToolByMode.monitoring;
    if (monTool && ANALYSIS_TOOL_SET.has(monTool)) {
      lastMode = 'analysis';
    }
  }
  return { lastMode, lastToolByMode };
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
  const effectiveTool = migrateLegacyTool(tool);
  const mode = toolToMode(effectiveTool);
  if (!mode) return;
  closeAllSubmenus();
  if (state.appNavMode === mode) {
    rebuildTypeSelectForMode(mode);
    const sel = document.getElementById('typeSelect');
    if (sel && getVisibleToolsForMode(mode).includes(effectiveTool)) {
      sel.value = effectiveTool;
    }
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
  if (mode === 'comparator') {
    if (isToolVisible(featureControlsConfig(), COMPARATOR_TOOL)) {
      const opt = document.createElement('option');
      opt.value = COMPARATOR_TOOL;
      opt.textContent = t(TOOL_I18N.Comparator);
      sel.appendChild(opt);
      sel.value = COMPARATOR_TOOL;
    }
    sel.disabled = true;
    return;
  }
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = t('code.chooseToolInMode');
  sel.appendChild(ph);
  const visibleTools = getVisibleToolsForMode(mode);
  populateTypeSelectTools(sel, mode, visibleTools);
  sel.disabled = visibleTools.length === 0;
  const tools = visibleTools;
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

  syncCompareContextTitle();
}

export function syncSidebarToolRow() {
  const hint = document.getElementById('sidebarHomeHint');
  const home = state.appNavMode === APP_NAV_MODE_HOME;
  hint?.classList.toggle('hidden', !home);
}

function prefsDefaultTool(mode) {
  return firstVisibleTool(mode);
}

/**
 * @param {keyof typeof MODE_TOOLS | typeof APP_NAV_MODE_HOME} mode
 * @param {string} [tool]
 * @param {{ userInitiated?: boolean }} [opts]
 */
export async function navigateToModeAndTool(mode, tool, opts = {}) {
  const userInitiated = !!opts.userInitiated;
  closeAllSubmenus();
  mode = /** @type {typeof mode} */ (migrateLegacyNavMode(mode));
  state.appNavMode = mode;
  rebuildTypeSelectForMode(mode);
  syncTabSelection();
  syncSidebarToolRow();
  refreshHelpModalIfOpen();

  const sel = document.getElementById('typeSelect');
  if (!sel) return;

  if (mode === APP_NAV_MODE_HOME) {
    sel.value = '';
    clearComparisonSelection();
    await persistModeAndTools('');
    const { applyArtifactTypeUi } = await import('./artifactTypeUi.js');
    applyArtifactTypeUi();
    resetMonacoComparisonView();
    return;
  }

  const config = featureControlsConfig();
  if (!isModeVisible(config, mode)) {
    showToast(t('featureControls.modeHidden'), 'warn', { bypassCooldown: true });
    await navigateToModeAndTool(APP_NAV_MODE_HOME, '', { userInitiated });
    return;
  }

  const tools = getVisibleToolsForMode(mode);
  let pick = tool && (tools.includes(tool) || (mode === 'comparator' && LEGACY_COMPARE_TOOLS.has(tool)))
    ? migrateLegacyTool(tool)
    : prefsDefaultTool(mode);
  if (mode === 'comparator') {
    pick = isToolVisible(config, COMPARATOR_TOOL) ? COMPARATOR_TOOL : '';
  }
  if (!pick || !isToolVisible(config, pick)) {
    if (tool && !isToolVisible(config, migrateLegacyTool(tool))) {
      showToast(t('featureControls.toolRedirect'), 'warn', { bypassCooldown: true });
    }
    pick = prefsDefaultTool(mode);
    if (!pick) {
      await navigateToModeAndTool(APP_NAV_MODE_HOME, '', { userInitiated });
      return;
    }
  }
  sel.value = pick;
  handleArtifactTypeSelectChange({ isUserChange: userInitiated });
  syncCompareUrlFromState(state);
  const { applyFeatureControlsUi } = await import('./featureControlsUi.js');
  applyFeatureControlsUi();
}

/**
 * @param {{ urlOp?: string, urlNav?: string }} args
 */
export async function initializeAppNavigation(args = {}) {
  const { urlOp, urlNav } = args;
  const prefs = await readPrefs();
  let mode = APP_NAV_MODE_HOME;
  let tool = '';

  const migratedNav = urlNav ? migrateLegacyNavMode(urlNav) : null;
  const config = featureControlsConfig();
  if (migratedNav && migratedNav !== APP_NAV_MODE_HOME && MODE_TOOLS[/** @type {keyof typeof MODE_TOOLS} */ (migratedNav)]) {
    mode = /** @type {keyof typeof MODE_TOOLS} */ (migratedNav);
    tool = urlOp ? migrateLegacyTool(urlOp) : prefsDefaultTool(mode);
    if (urlOp) {
      mode = /** @type {keyof typeof MODE_TOOLS} */ (resolveModeForTool(mode, tool));
    }
    if (mode === 'comparator' && isToolVisible(config, COMPARATOR_TOOL)) tool = COMPARATOR_TOOL;
  } else if (urlOp && toolToMode(urlOp)) {
    const m = toolToMode(urlOp);
    if (m) {
      mode = m;
      tool =
        m === 'comparator' && isToolVisible(config, COMPARATOR_TOOL)
          ? COMPARATOR_TOOL
          : migrateLegacyTool(urlOp);
    }
  } else if (prefs.lastMode && prefs.lastMode !== APP_NAV_MODE_HOME && MODE_TOOLS[/** @type {keyof typeof MODE_TOOLS} */ (prefs.lastMode)]) {
    mode = /** @type {keyof typeof MODE_TOOLS} */ (prefs.lastMode);
    tool = prefs.lastToolByMode[mode] || prefsDefaultTool(mode);
    if (mode === 'comparator' && isToolVisible(config, COMPARATOR_TOOL)) tool = COMPARATOR_TOOL;
  }

  if (!isModeVisible(config, mode)) {
    mode = APP_NAV_MODE_HOME;
    tool = '';
  } else if (tool && !isToolVisible(config, migrateLegacyTool(tool))) {
    tool = prefsDefaultTool(mode);
    if (!tool) {
      mode = APP_NAV_MODE_HOME;
    }
  }

  state.appNavMode = mode;
  rebuildTypeSelectForMode(mode);
  if (mode !== APP_NAV_MODE_HOME) {
    const s = document.getElementById('typeSelect');
    const visible = getVisibleToolsForMode(mode);
    if (s && tool && (visible.includes(tool) || (mode === 'comparator' && LEGACY_COMPARE_TOOLS.has(tool)))) {
      s.value =
        mode === 'comparator' && isToolVisible(config, COMPARATOR_TOOL) ? COMPARATOR_TOOL : tool;
    } else if (s) {
      s.value = prefsDefaultTool(mode);
    }
  }
  state.selectedArtifactType = document.getElementById('typeSelect')?.value || '';
  syncTabSelection();
  syncSidebarToolRow();
  applyArtifactTypeUi();
  await persistAfterOperationChange(false);
}

/** Quita el ocultamiento de arranque una vez resuelta la vista inicial. */
export function revealAppNavigation() {
  document.body.classList.remove('app-nav-booting');
}

export function setupAppModeTabHandlers() {
  populateModeSubmenus();
  syncFeatureControlsModeTabs();

  const homeBtn = document.getElementById('appModeTabHome');
  if (homeBtn) {
    homeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllSubmenus();
      void navigateToModeAndTool(APP_NAV_MODE_HOME, '', { userInitiated: true });
    });
  }

  const comparatorBtn = document.getElementById('appModeTabComparator');
  if (comparatorBtn) {
    comparatorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllSubmenus();
      void navigateToModeAndTool('comparator', COMPARATOR_TOOL, { userInitiated: true });
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

  document.addEventListener('click', () => {
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
