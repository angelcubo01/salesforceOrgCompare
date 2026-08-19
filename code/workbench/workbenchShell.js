import { state } from '../core/state.js';
import {
  getToolRecentsSnapshot,
  isToolPinned,
  loadToolRecents,
  toggleToolPin
} from '../core/toolRecents.js';
import {
  APP_NAV_MODE_HOME,
  TOOL_I18N,
  navigateToModeAndTool
} from '../ui/appModeNav.js';
import { showToast } from '../ui/toast.js';
import {
  getToolNotice,
  isModeVisible,
  isToolVisible
} from '../../shared/featureControls.js';
import { getCachedFeatureControlsConfig } from '../../shared/posthogFeatureControlsFlag.js';
import { getCurrentLang, t } from '../../shared/i18n.js';
import { ACTION_ICONS, CATEGORY_ICONS, STATE_ICONS, createIcon } from './iconRegistry.js';
import {
  WORKBENCH_CATEGORIES,
  WORKBENCH_WORKSPACES,
  getSearchText,
  getTabById,
  getToolIcon,
  getWorkspaceById,
  getWorkspaceRouteForTool
} from './workspaceRegistry.js';
import { loadWorkbenchPrefs, saveWorkbenchPrefs } from './workbenchPrefs.js';

const READ_ONLY_STORAGE_KEY = 'sfocOrgReadOnlyById';
const COMPACT_QUERY = '(max-width: 1100px)';

const HEADER_ACTION_TARGETS = Object.freeze({
  ApexTests: ['apexTestsRunBtn'],
  ApexCoverageCompare: ['apexCoverageCompareRefreshBtn'],
  AnonymousApex: ['anonymousApexRunBtn'],
  QueryExplorer: ['queryExplorerRunBtn'],
  RestExplorer: ['restExplorerSendBtn'],
  ObjectDescribe: ['objectDescribeDescribeBtn'],
  DataWorkbench: ['dataWorkbenchLoadRecordBtn'],
  EventMonitor: ['eventMonitorLoadChannelsBtn'],
  DependencyExplorer: ['depExplorerAnalyzeBtn'],
  RecordCompare: ['recordCompareBtn'],
  EnvironmentStatus: ['environmentStatusRefreshBtn'],
  OrgLimits: ['orgLimitsRefreshBtn'],
  DeployStatus: ['deployStatusRefreshBtn'],
  BulkJobMonitor: ['bulkJobLoadBtn'],
  GeneratePackageXml: ['generatePkgDownloadXml'],
  MetadataTypeCompare: ['metadataTypeCompareRunBtn'],
  DebugLogBrowser: ['debugLogBrowserRefreshBtn']
});

let prefs = null;
let selectedCategoryId = 'home';
let activeWorkspaceId = null;
let activeTabId = null;
let pendingHistorySelection = null;
let readOnlyByOrgId = {};
let panelQuery = '';
let initialized = false;
let compactMedia = null;
let headerActionObservers = [];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function makeIconButton(id, iconName, label, className = '') {
  const button = el('button', `workbench-icon-button ${className}`.trim());
  button.type = 'button';
  if (id) button.id = id;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.appendChild(createIcon(iconName, { size: 20 }));
  return button;
}

function currentConfig() {
  return getCachedFeatureControlsConfig();
}

function tabVisibility(tabInfo) {
  const config = currentConfig();
  if (!isModeVisible(config, tabInfo.legacyMode) || !isToolVisible(config, tabInfo.toolId)) {
    return { visible: false, disabled: true, message: '' };
  }
  const notice = getToolNotice(config, tabInfo.toolId, getCurrentLang());
  return {
    visible: true,
    disabled: notice?.blocking === true,
    message: notice?.message || ''
  };
}

function visibleTabs(workspace) {
  return workspace.tabs.filter((tabInfo) => tabVisibility(tabInfo).visible);
}

function visibleWorkspaces(categoryId = null) {
  return WORKBENCH_WORKSPACES.filter((workspace) => {
    if (categoryId && workspace.categoryId !== categoryId) return false;
    return visibleTabs(workspace).length > 0;
  });
}

function categoryLabel(categoryId) {
  const category = WORKBENCH_CATEGORIES.find(({ id }) => id === categoryId);
  return category ? t(category.labelKey) : '';
}

function workspaceLabel(workspaceId) {
  const workspace = getWorkspaceById(workspaceId);
  return workspace ? t(workspace.labelKey) : '';
}

function tabLabel(workspaceId, tabId) {
  const tabInfo = getTabById(workspaceId, tabId);
  return tabInfo ? t(tabInfo.labelKey) : '';
}

function isCompact() {
  return compactMedia?.matches === true;
}

function effectivePanelExpanded() {
  if (!prefs?.panelExpanded) return false;
  if (activeWorkspaceId === 'comparator' && !prefs.panelPinned) return false;
  return true;
}

function syncShellLayoutAttributes() {
  const expanded = effectivePanelExpanded();
  document.body.dataset.workbenchPanel = expanded ? 'expanded' : 'collapsed';
  document.body.dataset.workbenchPanelPinned = prefs?.panelPinned ? 'true' : 'false';
  document.body.dataset.workbenchCompact = isCompact() ? 'true' : 'false';
  const panel = document.getElementById('workbenchPanel');
  const railToggle = document.getElementById('workbenchRailPanelToggle');
  const backdrop = document.getElementById('workbenchPanelBackdrop');
  panel?.setAttribute('aria-hidden', expanded ? 'false' : 'true');
  railToggle?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  backdrop?.classList.toggle('hidden', !(expanded && isCompact()));
}

async function updatePrefs(patch) {
  prefs = await saveWorkbenchPrefs({ ...prefs, ...patch });
  syncShellLayoutAttributes();
}

async function setPanelExpanded(expanded) {
  await updatePrefs({ panelExpanded: !!expanded });
  if (expanded) requestAnimationFrame(() => document.getElementById('workbenchToolSearch')?.focus());
}

function createRail() {
  const rail = el('nav', 'workbench-rail');
  rail.id = 'workbenchRail';
  rail.setAttribute('aria-label', t('workbench.rail.label'));

  const brand = el('div', 'workbench-rail-brand');
  const logo = /** @type {HTMLImageElement} */ (el('img', 'workbench-rail-logo'));
  logo.src = chrome.runtime.getURL('icons/icon-32.png');
  logo.alt = '';
  logo.width = 28;
  logo.height = 28;
  brand.appendChild(logo);
  rail.appendChild(brand);

  const items = el('div', 'workbench-rail-items');
  for (const category of WORKBENCH_CATEGORIES) {
    if (category.id !== 'home' && category.id !== 'comparator' && !visibleWorkspaces(category.id).length) continue;
    if (category.id === 'comparator' && !visibleWorkspaces('comparator').length) continue;
    const label = t(category.labelKey);
    const button = makeIconButton(`workbenchRail-${category.id}`, category.icon, label, 'workbench-rail-button');
    button.dataset.categoryId = category.id;
    button.setAttribute('aria-controls', 'workbenchPanel');
    button.appendChild(el('span', 'workbench-rail-label', label));
    button.addEventListener('click', () => void selectCategory(category.id));
    items.appendChild(button);
  }
  rail.appendChild(items);

  const foot = el('div', 'workbench-rail-foot');
  const paletteLabel = `${t('workbench.command.open')} (${navigator.platform?.toLowerCase().includes('mac') ? '⌘K' : 'Ctrl+K'})`;
  const palette = makeIconButton('workbenchOpenCommandPalette', ACTION_ICONS.command, paletteLabel, 'workbench-rail-button');
  palette.addEventListener('click', () => document.dispatchEvent(new CustomEvent('sfoc:open-command-palette')));
  foot.appendChild(palette);
  const panelToggle = makeIconButton('workbenchRailPanelToggle', ACTION_ICONS.expandPanel, t('workbench.panel.open'), 'workbench-rail-button');
  panelToggle.setAttribute('aria-controls', 'workbenchPanel');
  panelToggle.addEventListener('click', () => void setPanelExpanded(!effectivePanelExpanded()));
  foot.appendChild(panelToggle);
  rail.appendChild(foot);
  return rail;
}

async function selectCategory(categoryId) {
  selectedCategoryId = categoryId;
  if (categoryId === 'home') {
    await navigateToModeAndTool(APP_NAV_MODE_HOME, '', { userInitiated: true });
    await setPanelExpanded(true);
    return;
  }
  if (categoryId === 'comparator') {
    await navigateToWorkspaceTab('comparator', 'main', { userInitiated: true });
    return;
  }
  if (!prefs.panelExpanded) await updatePrefs({ panelExpanded: true });
  renderWorkbenchShell();
}

function createSectionHeading(key) {
  return el('h3', 'workbench-panel-section-title', t(key));
}

function toolLabel(toolId) {
  return t(TOOL_I18N[toolId] || toolId);
}

function createToolLink(toolId, opts = {}) {
  const route = getWorkspaceRouteForTool(toolId);
  if (!route) return null;
  const tabInfo = getTabById(route.workspaceId, route.tabId);
  if (!tabInfo) return null;
  const availability = tabVisibility(tabInfo);
  if (!availability.visible) return null;
  const row = el('div', 'workbench-tool-row');
  const button = el('button', 'workbench-tool-link');
  button.type = 'button';
  button.dataset.toolId = toolId;
  button.disabled = availability.disabled;
  button.setAttribute('aria-disabled', availability.disabled ? 'true' : 'false');
  if (availability.message) button.title = availability.message;
  button.appendChild(createIcon(getToolIcon(toolId), { size: 16 }));
  button.appendChild(el('span', 'workbench-tool-link-label', opts.label || toolLabel(toolId)));
  if (availability.disabled) {
    button.appendChild(createIcon(STATE_ICONS.locked, { size: 16, className: 'workbench-tool-lock' }));
    const reason = el('span', 'sr-only', availability.message || t('workbench.feature.blocked'));
    button.appendChild(reason);
  }
  button.addEventListener('click', () => {
    if (availability.disabled) {
      if (availability.message) showToast(availability.message, 'warn', { bypassCooldown: true });
      return;
    }
    void navigateToWorkspaceTab(route.workspaceId, route.tabId, { userInitiated: true });
  });
  row.appendChild(button);

  if (opts.favoriteControl !== false) {
    const favoriteLabel = isToolPinned(toolId)
      ? t('workbench.favorites.remove', { tool: toolLabel(toolId) })
      : t('workbench.favorites.add', { tool: toolLabel(toolId) });
    const favorite = makeIconButton('', ACTION_ICONS.favorite, favoriteLabel, 'workbench-favorite-button');
    favorite.setAttribute('aria-pressed', isToolPinned(toolId) ? 'true' : 'false');
    favorite.addEventListener('click', async () => {
      await toggleToolPin(toolId);
      renderWorkbenchPanel();
    });
    row.appendChild(favorite);
  }
  return row;
}

function appendToolCollection(host, titleKey, toolIds, emptyKey) {
  const section = el('section', 'workbench-panel-section');
  section.appendChild(createSectionHeading(titleKey));
  const list = el('div', 'workbench-tool-list');
  let count = 0;
  for (const toolId of toolIds) {
    const row = createToolLink(toolId);
    if (!row) continue;
    list.appendChild(row);
    count++;
  }
  if (!count) list.appendChild(el('p', 'workbench-panel-empty', t(emptyKey)));
  section.appendChild(list);
  host.appendChild(section);
}

function createWorkspaceButton(workspace) {
  const button = el('button', 'workbench-workspace-button');
  button.type = 'button';
  button.dataset.workspaceId = workspace.id;
  button.setAttribute('aria-current', workspace.id === activeWorkspaceId ? 'page' : 'false');
  button.appendChild(createIcon(workspace.icon, { size: 20 }));
  const copy = el('span', 'workbench-workspace-copy');
  copy.appendChild(el('span', 'workbench-workspace-label', t(workspace.labelKey)));
  const itemCount = visibleTabs(workspace).length + (workspace.toolAliases?.length || 0);
  copy.appendChild(el('span', 'workbench-workspace-meta', t('workbench.workspace.toolCount', { count: itemCount })));
  button.appendChild(copy);
  button.addEventListener('click', () => {
    const storedTab = prefs.lastTabByWorkspace[workspace.id];
    const target = getTabById(workspace.id, storedTab) && tabVisibility(getTabById(workspace.id, storedTab)).visible
      ? storedTab
      : workspace.defaultTabId;
    void navigateToWorkspaceTab(workspace.id, target, { userInitiated: true });
  });
  return button;
}

function appendWorkspaceList(host) {
  const section = el('section', 'workbench-panel-section workbench-panel-section--workspaces');
  section.appendChild(createSectionHeading('workbench.panel.workspaces'));
  const list = el('div', 'workbench-workspace-list');
  const normalized = panelQuery.trim().toLocaleLowerCase();
  let matches = 0;
  for (const workspace of visibleWorkspaces(selectedCategoryId === 'home' ? null : selectedCategoryId)) {
    if (normalized && !getSearchText(workspace, t).includes(normalized)) continue;
    list.appendChild(createWorkspaceButton(workspace));
    if (workspace.toolAliases?.length && !normalized) {
      for (const alias of workspace.toolAliases) {
        const canonicalWorkspace = getWorkspaceById(alias.workspaceId);
        const row = createToolLink(alias.toolId, {
          label: `${toolLabel(alias.toolId)} · ${canonicalWorkspace ? t(canonicalWorkspace.labelKey) : ''}`
        });
        if (row) list.appendChild(row);
      }
    }
    if (normalized) {
      for (const tabInfo of visibleTabs(workspace)) {
        const haystack = `${t(tabInfo.labelKey)} ${toolLabel(tabInfo.toolId)} ${tabInfo.toolId}`.toLocaleLowerCase();
        if (!haystack.includes(normalized)) continue;
        const toolRow = createToolLink(tabInfo.toolId, { label: `${t(workspace.labelKey)} · ${t(tabInfo.labelKey)}` });
        if (toolRow) list.appendChild(toolRow);
      }
    }
    matches++;
  }
  if (!matches) list.appendChild(el('p', 'workbench-panel-empty', t('workbench.search.empty')));
  section.appendChild(list);
  host.appendChild(section);
}

export function renderWorkbenchPanel() {
  const body = document.getElementById('workbenchPanelBody');
  if (!body) return;
  body.replaceChildren();
  const snapshot = getToolRecentsSnapshot();
  if (!panelQuery.trim()) {
    const last = snapshot.recents[0];
    if (last) appendToolCollection(body, 'workbench.panel.lastTool', [last], 'workbench.panel.noRecents');
    appendToolCollection(body, 'workbench.panel.favorites', snapshot.pins, 'workbench.panel.noFavorites');
    appendToolCollection(body, 'workbench.panel.recents', snapshot.recents, 'workbench.panel.noRecents');
  }
  appendWorkspaceList(body);
}

function createPanel() {
  const panel = el('aside', 'workbench-panel');
  panel.id = 'workbenchPanel';
  panel.setAttribute('aria-label', t('workbench.panel.label'));
  const head = el('header', 'workbench-panel-head');
  const titleWrap = el('div', 'workbench-panel-title-wrap');
  titleWrap.appendChild(el('strong', 'workbench-panel-title', t('workbench.productName')));
  titleWrap.appendChild(el('span', 'workbench-panel-subtitle', categoryLabel(selectedCategoryId)));
  head.appendChild(titleWrap);
  const controls = el('div', 'workbench-panel-controls');
  const pin = makeIconButton('workbenchPanelPin', ACTION_ICONS.pin, t('workbench.panel.pin'), 'workbench-panel-control');
  pin.setAttribute('aria-pressed', prefs.panelPinned ? 'true' : 'false');
  pin.addEventListener('click', async () => {
    await updatePrefs({ panelPinned: !prefs.panelPinned });
    renderWorkbenchShell();
  });
  controls.appendChild(pin);
  const close = makeIconButton('workbenchPanelClose', ACTION_ICONS.collapsePanel, t('workbench.panel.collapse'), 'workbench-panel-control');
  close.addEventListener('click', () => void setPanelExpanded(false));
  controls.appendChild(close);
  head.appendChild(controls);
  panel.appendChild(head);

  const searchWrap = el('div', 'workbench-panel-search');
  searchWrap.appendChild(createIcon(ACTION_ICONS.search, { size: 16 }));
  const search = /** @type {HTMLInputElement} */ (el('input', 'workbench-panel-search-input'));
  search.id = 'workbenchToolSearch';
  search.type = 'search';
  search.autocomplete = 'off';
  search.placeholder = t('workbench.search.placeholder');
  search.setAttribute('aria-label', t('workbench.search.label'));
  search.setAttribute('aria-controls', 'workbenchPanelBody');
  search.value = panelQuery;
  search.addEventListener('input', () => {
    panelQuery = search.value;
    renderWorkbenchPanel();
  });
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (search.value) {
        panelQuery = '';
        search.value = '';
        renderWorkbenchPanel();
      } else {
        void setPanelExpanded(false);
      }
    }
  });
  searchWrap.appendChild(search);
  panel.appendChild(searchWrap);
  const body = el('div', 'workbench-panel-body');
  body.id = 'workbenchPanelBody';
  panel.appendChild(body);
  return panel;
}

function selectedOrgIds(tabInfo) {
  if (!tabInfo || tabInfo.orgScope === 'none') return [];
  const ids = [state.leftOrgId].filter(Boolean);
  if (tabInfo.orgScope === 'dual' && state.rightOrgId) ids.push(state.rightOrgId);
  return [...new Set(ids)];
}

function orgDisplayName(orgId) {
  const select = document.getElementById(state.leftOrgId === orgId ? 'leftOrg' : 'rightOrg');
  const selectedText = /** @type {HTMLSelectElement | null} */ (select)?.selectedOptions?.[0]?.textContent?.trim();
  if (selectedText) return selectedText;
  const org = state.orgsList.find((item) => item.id === orgId);
  return org?.label || t('workbench.org.unknown');
}

function environmentForOrg(orgId) {
  const org = state.orgsList.find((item) => item.id === orgId);
  if (org?.isSandbox === true) return { key: 'workbench.environment.sandbox', icon: STATE_ICONS.sandbox, className: 'sandbox' };
  if (org?.isSandbox === false) return { key: 'workbench.environment.production', icon: STATE_ICONS.production, className: 'production' };
  return { key: 'workbench.environment.unknown', icon: STATE_ICONS.unknownEnvironment, className: 'unknown' };
}

function createOrgContext(tabInfo) {
  const host = el('div', 'workbench-org-context ph-no-capture');
  host.setAttribute('aria-label', t('workbench.org.context'));
  const ids = selectedOrgIds(tabInfo);
  if (!ids.length) {
    host.appendChild(el('span', 'workbench-org-empty', t('workbench.org.notSelected')));
    return host;
  }
  for (const orgId of ids) {
    const env = environmentForOrg(orgId);
    const badge = el('span', `workbench-org-badge workbench-org-badge--${env.className}`);
    badge.appendChild(createIcon(env.icon, { size: 16 }));
    badge.appendChild(el('span', 'workbench-org-name', orgDisplayName(orgId)));
    badge.appendChild(el('span', 'workbench-org-environment', t(env.key)));
    if (readOnlyByOrgId[orgId]) {
      const readOnly = el('span', 'workbench-read-only-badge');
      readOnly.appendChild(createIcon(STATE_ICONS.readOnly, { size: 16 }));
      readOnly.appendChild(el('span', '', t('workbench.org.readOnly')));
      badge.appendChild(readOnly);
    }
    host.appendChild(badge);
  }
  return host;
}

function actionIconForTarget(targetId) {
  if (/refresh|load/i.test(targetId)) return ACTION_ICONS.refresh;
  if (/download|export/i.test(targetId)) return ACTION_ICONS.download;
  return ACTION_ICONS.run;
}

function createHeaderActionProxy(targetId) {
  const target = /** @type {HTMLButtonElement | null} */ (document.getElementById(targetId));
  if (!target) return null;
  const label = target.textContent?.trim() || target.getAttribute('aria-label') || target.title || t('workbench.action.open');
  const proxy = el('button', 'workbench-header-action');
  proxy.type = 'button';
  proxy.appendChild(createIcon(actionIconForTarget(targetId), { size: 16 }));
  proxy.appendChild(el('span', '', label));
  const sync = () => {
    proxy.disabled = target.disabled || target.classList.contains('hidden') || target.hidden;
    proxy.setAttribute('aria-disabled', proxy.disabled ? 'true' : 'false');
  };
  sync();
  proxy.addEventListener('click', () => target.click());
  const observer = new MutationObserver(sync);
  observer.observe(target, { attributes: true, attributeFilter: ['disabled', 'hidden', 'class'] });
  headerActionObservers.push(observer);
  return proxy;
}

function createContextHeader() {
  const header = el('header', 'workbench-context-header');
  header.id = 'workbenchContextHeader';
  const main = el('div', 'workbench-context-main');
  const identity = el('div', 'workbench-context-identity');
  const breadcrumb = el('nav', 'workbench-breadcrumb');
  breadcrumb.setAttribute('aria-label', t('workbench.breadcrumb'));
  const category = categoryLabel(selectedCategoryId);
  breadcrumb.appendChild(el('span', '', category));
  if (activeWorkspaceId) {
    breadcrumb.appendChild(el('span', 'workbench-breadcrumb-separator', '/'));
    breadcrumb.appendChild(el('span', '', workspaceLabel(activeWorkspaceId)));
  }
  identity.appendChild(breadcrumb);
  const titleRow = el('div', 'workbench-context-title-row');
  const workspace = activeWorkspaceId ? getWorkspaceById(activeWorkspaceId) : null;
  titleRow.appendChild(createIcon(workspace?.icon || CATEGORY_ICONS.home, { size: 24 }));
  const title = el('h1', 'workbench-context-title', workspace ? t(workspace.labelKey) : t('workbench.home.title'));
  title.id = 'workbenchContextTitle';
  titleRow.appendChild(title);
  const currentTab = activeWorkspaceId && activeTabId ? getTabById(activeWorkspaceId, activeTabId) : null;
  if (currentTab?.risk === 'write' || currentTab?.risk === 'destructive') {
    const risk = el('span', `workbench-risk-badge workbench-risk-badge--${currentTab.risk}`);
    risk.appendChild(createIcon(STATE_ICONS.warning, { size: 16 }));
    risk.appendChild(el('span', '', t(currentTab.risk === 'destructive' ? 'workbench.risk.destructive' : 'workbench.risk.write')));
    titleRow.appendChild(risk);
  }
  identity.appendChild(titleRow);
  main.appendChild(identity);
  main.appendChild(createOrgContext(currentTab));
  const actions = el('div', 'workbench-context-actions');
  for (const targetId of HEADER_ACTION_TARGETS[currentTab?.toolId] || []) {
    const proxy = createHeaderActionProxy(targetId);
    if (proxy) actions.appendChild(proxy);
  }
  const help = makeIconButton('workbenchHelpBtn', ACTION_ICONS.help, t('workbench.action.help'));
  help.addEventListener('click', () => document.getElementById('appHelpBtn')?.click());
  actions.appendChild(help);
  const theme = makeIconButton('workbenchThemeBtn', document.documentElement.dataset.uiTheme === 'light' ? ACTION_ICONS.darkTheme : ACTION_ICONS.lightTheme, t('workbench.action.theme'));
  theme.addEventListener('click', () => {
    const input = /** @type {HTMLInputElement | null} */ (document.getElementById('appThemeToggleInput'));
    input?.click();
    requestAnimationFrame(renderWorkbenchHeader);
  });
  actions.appendChild(theme);
  main.appendChild(actions);
  header.appendChild(main);

  if (workspace && visibleTabs(workspace).length > 1) {
    const tabs = el('div', 'workbench-tabs');
    tabs.id = 'workbenchWorkspaceTabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', t('workbench.tabs.label', { workspace: t(workspace.labelKey) }));
    for (const tabInfo of visibleTabs(workspace)) {
      const availability = tabVisibility(tabInfo);
      const button = el('button', 'workbench-tab');
      button.type = 'button';
      button.id = `workbenchTab-${workspace.id}-${tabInfo.id}`;
      button.dataset.tabId = tabInfo.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', tabInfo.id === activeTabId ? 'true' : 'false');
      button.setAttribute('tabindex', tabInfo.id === activeTabId ? '0' : '-1');
      button.disabled = availability.disabled;
      button.textContent = t(tabInfo.labelKey);
      if (availability.message) button.title = availability.message;
      button.addEventListener('click', () => void navigateToWorkspaceTab(workspace.id, tabInfo.id, { userInitiated: true }));
      button.addEventListener('keydown', (event) => handleTabKeydown(event, workspace));
      tabs.appendChild(button);
    }
    header.appendChild(tabs);
  }
  return header;
}

function handleTabKeydown(event, workspace) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = visibleTabs(workspace).filter((item) => !tabVisibility(item).disabled);
  if (!tabs.length) return;
  const currentIndex = Math.max(0, tabs.findIndex(({ id }) => id === activeTabId));
  let nextIndex = currentIndex;
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
  if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = tabs.length - 1;
  event.preventDefault();
  void navigateToWorkspaceTab(workspace.id, tabs[nextIndex].id, { userInitiated: true }).then(() => {
    document.getElementById(`workbenchTab-${workspace.id}-${tabs[nextIndex].id}`)?.focus();
  });
}

export function renderWorkbenchHeader() {
  const editor = document.getElementById('editorContainer');
  if (!editor) return;
  for (const observer of headerActionObservers) observer.disconnect();
  headerActionObservers = [];
  document.getElementById('workbenchContextHeader')?.remove();
  const header = createContextHeader();
  const classicHeader = editor.querySelector('.app-mode-tabs-wrap');
  editor.insertBefore(header, classicHeader || editor.firstChild);
}

function syncActiveRail() {
  document.querySelectorAll('.workbench-rail-button[data-category-id]').forEach((button) => {
    const active = button.getAttribute('data-category-id') === selectedCategoryId;
    button.setAttribute('aria-current', active ? 'page' : 'false');
    button.classList.toggle('is-active', active);
  });
}

export function renderWorkbenchShell() {
  if (!initialized) return;
  const shell = document.getElementById('workbenchShell');
  if (shell) {
    const previousFocusId = document.activeElement?.id;
    shell.replaceChildren(createRail(), createPanel());
    renderWorkbenchPanel();
    if (previousFocusId) document.getElementById(previousFocusId)?.focus({ preventScroll: true });
  }
  syncActiveRail();
  syncShellLayoutAttributes();
  renderWorkbenchHeader();
}

function validHistorySelection(value, toolId) {
  const workspace = getWorkspaceById(value?.workspaceId);
  const tabInfo = workspace && getTabById(workspace.id, value?.tabId);
  return tabInfo && tabInfo.toolId === toolId ? { workspaceId: workspace.id, tabId: tabInfo.id } : null;
}

function syncFromLegacyNavigation() {
  const toolId = document.getElementById('typeSelect')?.value || '';
  if (state.appNavMode === APP_NAV_MODE_HOME || !toolId) {
    activeWorkspaceId = null;
    activeTabId = null;
    selectedCategoryId = 'home';
  } else {
    const fromHistory = validHistorySelection(pendingHistorySelection || history.state?.sfocWorkbench, toolId);
    const route = fromHistory || getWorkspaceRouteForTool(toolId);
    if (route) {
      activeWorkspaceId = route.workspaceId;
      activeTabId = route.tabId;
      selectedCategoryId = getWorkspaceById(route.workspaceId)?.categoryId || 'home';
      applyWorkspaceTabVariant(activeWorkspaceId, activeTabId);
    }
  }
  pendingHistorySelection = null;
  renderWorkbenchShell();
}

function applyWorkspaceTabVariant(workspaceId, tabId) {
  document.body.dataset.workbenchWorkspace = workspaceId || '';
  document.body.dataset.workbenchTab = tabId || '';
  if (workspaceId === 'apex-quality') {
    if (tabId === 'tests') document.getElementById('apexTestsOpenRunnerBtn')?.click();
    if (tabId === 'runs' || tabId === 'results') document.getElementById('apexTestsBackToHubBtn')?.click();
  }
  if (workspaceId === 'diagnostics' && tabId === 'trace-flags') {
    document.getElementById('debugLogBrowserViewTracesBtn')?.click();
  }
}

function writeWorkbenchHistoryState(workspaceId, tabId) {
  history.replaceState(
    { ...(history.state || {}), sfocWorkbench: { workspaceId, tabId } },
    '',
    window.location.href
  );
}

export async function navigateToWorkspaceTab(workspaceId, tabId, opts = {}) {
  const workspace = getWorkspaceById(workspaceId);
  const tabInfo = workspace && getTabById(workspaceId, tabId);
  if (!workspace || !tabInfo) return false;
  const availability = tabVisibility(tabInfo);
  if (!availability.visible || availability.disabled) {
    if (availability.message) showToast(availability.message, 'warn', { bypassCooldown: true });
    return false;
  }
  await navigateToModeAndTool(tabInfo.legacyMode, tabInfo.toolId, { userInitiated: opts.userInitiated === true });
  activeWorkspaceId = workspaceId;
  activeTabId = tabId;
  selectedCategoryId = workspace.categoryId;
  prefs = await saveWorkbenchPrefs({
    ...prefs,
    lastTabByWorkspace: { ...prefs.lastTabByWorkspace, [workspaceId]: tabId }
  });
  applyWorkspaceTabVariant(workspaceId, tabId);
  writeWorkbenchHistoryState(workspaceId, tabId);
  renderWorkbenchShell();
  return true;
}

async function loadReadOnlyMap() {
  try {
    const result = await chrome.storage.local.get(READ_ONLY_STORAGE_KEY);
    readOnlyByOrgId = result?.[READ_ONLY_STORAGE_KEY] || {};
  } catch {
    readOnlyByOrgId = {};
  }
}

export function getWorkbenchSnapshot() {
  return {
    activeWorkspaceId,
    activeTabId,
    selectedCategoryId,
    panelExpanded: effectivePanelExpanded(),
    panelPinned: prefs?.panelPinned === true
  };
}

export function getVisibleWorkbenchSearchEntries() {
  const entries = [];
  for (const workspace of visibleWorkspaces()) {
    entries.push({ type: 'workspace', workspaceId: workspace.id, tabId: workspace.defaultTabId, label: t(workspace.labelKey), searchText: getSearchText(workspace, t) });
    for (const tabInfo of visibleTabs(workspace)) {
      const availability = tabVisibility(tabInfo);
      entries.push({
        type: 'tool', workspaceId: workspace.id, tabId: tabInfo.id, toolId: tabInfo.toolId,
        label: t(tabInfo.labelKey), workspaceLabel: t(workspace.labelKey),
        searchText: `${getSearchText(workspace, t)} ${t(tabInfo.labelKey)} ${toolLabel(tabInfo.toolId)}`.toLocaleLowerCase(),
        disabled: availability.disabled, message: availability.message
      });
    }
  }
  return entries;
}

export async function setupWorkbenchShell() {
  if (initialized) return;
  prefs = await loadWorkbenchPrefs();
  await Promise.all([loadToolRecents(), loadReadOnlyMap()]);
  compactMedia = window.matchMedia(COMPACT_QUERY);
  const shell = el('div', 'workbench-shell');
  shell.id = 'workbenchShell';
  document.body.insertBefore(shell, document.body.firstChild);
  const backdrop = el('button', 'workbench-panel-backdrop hidden');
  backdrop.id = 'workbenchPanelBackdrop';
  backdrop.type = 'button';
  backdrop.setAttribute('aria-label', t('workbench.panel.collapse'));
  backdrop.addEventListener('click', () => void setPanelExpanded(false));
  document.body.appendChild(backdrop);
  initialized = true;
  syncFromLegacyNavigation();

  document.addEventListener('sfoc:navigationchange', syncFromLegacyNavigation);
  document.addEventListener('sfoc:tool-recents-change', renderWorkbenchPanel);
  window.addEventListener('popstate', (event) => {
    pendingHistorySelection = event.state?.sfocWorkbench || null;
  });
  for (const id of ['leftOrg', 'rightOrg']) {
    const select = document.getElementById(id);
    select?.addEventListener('change', () => requestAnimationFrame(renderWorkbenchHeader));
    if (select) {
      new MutationObserver(() => requestAnimationFrame(renderWorkbenchHeader)).observe(select, { childList: true });
    }
  }
  compactMedia.addEventListener?.('change', () => syncShellLayoutAttributes());
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[READ_ONLY_STORAGE_KEY]) {
      readOnlyByOrgId = changes[READ_ONLY_STORAGE_KEY].newValue || {};
      renderWorkbenchHeader();
    }
  });
}
