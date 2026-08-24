import { state } from '../core/state.js';
import { loadToolRecents } from '../core/toolRecents.js';
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
  getCategoryById,
  getSearchText,
  getTabById,
  getWorkspaceById,
  getWorkspaceRouteForTool
} from './workspaceRegistry.js';
import { loadWorkbenchPrefs, saveWorkbenchPrefs } from './workbenchPrefs.js';

const READ_ONLY_STORAGE_KEY = 'sfocOrgReadOnlyById';

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
let activeCategoryId = 'home';
let openCategoryId = null;
let activeWorkspaceId = null;
let activeTabId = null;
let pendingHistorySelection = null;
let readOnlyByOrgId = {};
let initialized = false;
let headerActionObservers = [];
let headerRenderSignature = '';
let navigationRenderSignature = '';
let workbenchNavigationDepth = 0;
let navigationGeneration = 0;
let prefsWriteQueue = Promise.resolve();
let availabilityConfig = null;
let availabilityLang = '';
let availabilityCache = new Map();
let lastInputWasKeyboard = false;

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
  const lang = getCurrentLang();
  if (config !== availabilityConfig || lang !== availabilityLang) {
    availabilityConfig = config;
    availabilityLang = lang;
    availabilityCache = new Map();
  }
  const cacheKey = `${tabInfo.legacyMode}\u0000${tabInfo.toolId}`;
  if (availabilityCache.has(cacheKey)) return availabilityCache.get(cacheKey);
  let result;
  if (!isModeVisible(config, tabInfo.legacyMode) || !isToolVisible(config, tabInfo.toolId)) {
    result = { visible: false, disabled: true, message: '' };
  } else {
    const notice = getToolNotice(config, tabInfo.toolId, lang);
    result = {
      visible: true,
      disabled: notice?.blocking === true,
      message: notice?.message || ''
    };
  }
  availabilityCache.set(cacheKey, result);
  return result;
}

function visibleTabs(item) {
  return item.tabs.filter((tabInfo) => tabVisibility(tabInfo).visible);
}

function visibleWorkspaces(categoryId = null) {
  if (categoryId) {
    const category = getCategoryById(categoryId);
    return (category?.workspaceIds || [])
      .map((workspaceId) => getWorkspaceById(workspaceId))
      .filter((item) => item && visibleTabs(item).length > 0);
  }
  return WORKBENCH_CATEGORIES
    .filter((category) => !category.direct)
    .flatMap((category) => visibleWorkspaces(category.id));
}

function categoryLabel(categoryId) {
  const category = getCategoryById(categoryId);
  return category ? t(category.labelKey) : '';
}

function workspaceLabel(workspaceId) {
  const item = getWorkspaceById(workspaceId);
  return item ? t(item.labelKey) : '';
}

function toolLabel(toolId) {
  return t(TOOL_I18N[toolId] || toolId);
}

function translatedDescription(item) {
  if (!item?.descriptionKey) return '';
  const value = t(item.descriptionKey);
  return value === item.descriptionKey ? '' : value;
}

function preferredTabForWorkspace(item) {
  const candidates = [
    prefs?.lastTabByWorkspace?.[item.id],
    item.defaultTabId,
    ...item.tabs.map(({ id }) => id)
  ].filter((id, index, all) => id && all.indexOf(id) === index);
  return candidates
    .map((id) => getTabById(item.id, id))
    .find((tabInfo) => tabInfo && tabVisibility(tabInfo).visible && !tabVisibility(tabInfo).disabled) || null;
}

function blockedWorkspaceMessage(item) {
  const blocked = visibleTabs(item).find((tabInfo) => tabVisibility(tabInfo).disabled);
  return blocked ? tabVisibility(blocked).message : '';
}

function setSubbarAccessibility(open) {
  const region = document.getElementById('workbenchSubbarRegion');
  if (!region) return;
  region.classList.toggle('is-open', open);
  region.setAttribute('aria-hidden', open ? 'false' : 'true');
  region.inert = !open;
  document.body.dataset.workbenchSubbar = open ? 'open' : 'closed';
}

function closeToolSubbar({ restoreFocus = false } = {}) {
  const triggerId = openCategoryId;
  openCategoryId = null;
  setSubbarAccessibility(false);
  syncCategoryButtons();
  if (restoreFocus && triggerId) {
    requestAnimationFrame(() => document.getElementById(`workbenchCategory-${triggerId}`)?.focus());
  }
}

function moveFocus(button, selector, key) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return false;
  const container = button.parentElement;
  const buttons = [...(container?.querySelectorAll(selector) || [])]
    .filter((candidate) => !candidate.hidden && !candidate.disabled);
  if (!buttons.length) return false;
  let index = Math.max(0, buttons.indexOf(button));
  if (key === 'ArrowRight') index = (index + 1) % buttons.length;
  if (key === 'ArrowLeft') index = (index - 1 + buttons.length) % buttons.length;
  if (key === 'Home') index = 0;
  if (key === 'End') index = buttons.length - 1;
  buttons[index]?.focus();
  return true;
}

function handleCategoryKeydown(event) {
  if (moveFocus(event.currentTarget, '.workbench-category-button', event.key)) event.preventDefault();
}

function handleToolNavKeydown(event) {
  if (moveFocus(event.currentTarget, '.workbench-tool-button', event.key)) event.preventDefault();
}

async function selectHome() {
  closeToolSubbar();
  await navigateToModeAndTool(APP_NAV_MODE_HOME, '', { userInitiated: true });
}

async function selectDirectWorkspace(category, keyboardInitiated = false) {
  closeToolSubbar();
  const item = getWorkspaceById(category.directWorkspaceId);
  const targetTab = item ? preferredTabForWorkspace(item) : null;
  if (!item || !targetTab) {
    const message = item ? blockedWorkspaceMessage(item) : '';
    if (message) showToast(message, 'warn', { bypassCooldown: true });
    return;
  }
  const navigated = await navigateToWorkspaceTab(item.id, targetTab.id, { userInitiated: true });
  if (navigated && keyboardInitiated) {
    requestAnimationFrame(() => document.getElementById('workbenchContextTitle')?.focus({ preventScroll: true }));
  }
}

function openCategory(categoryId, { focusFirstTool = false } = {}) {
  if (!visibleWorkspaces(categoryId).length) return;
  if (openCategoryId === categoryId) {
    closeToolSubbar({ restoreFocus: true });
    return;
  }
  openCategoryId = categoryId;
  renderToolSubbar();
  syncCategoryButtons();
  setSubbarAccessibility(true);
  if (focusFirstTool) {
    requestAnimationFrame(() => document.querySelector('#workbenchToolSubbar .workbench-tool-button:not(:disabled)')?.focus());
  }
}

function createCategoryButton(category) {
  const label = t(category.labelKey);
  const button = el('button', 'workbench-category-button');
  button.type = 'button';
  button.id = `workbenchCategory-${category.id}`;
  button.dataset.categoryId = category.id;
  button.appendChild(createIcon(category.icon, { size: 20 }));
  button.appendChild(el('span', 'workbench-category-label', label));
  button.title = label;
  if (category.direct) {
    button.addEventListener('click', () => void selectHome());
  } else if (category.directWorkspaceId) {
    button.addEventListener('click', (event) => {
      void selectDirectWorkspace(category, event.detail === 0 || lastInputWasKeyboard);
    });
  } else {
    button.setAttribute('aria-controls', 'workbenchSubbarRegion');
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => openCategory(category.id));
  }
  button.addEventListener('keydown', handleCategoryKeydown);
  return button;
}

function createPrimaryNavigation() {
  const shell = el('div', 'workbench-shell');
  shell.id = 'workbenchShell';

  const primary = el('div', 'workbench-primary-bar');
  const nav = el('nav', 'workbench-category-nav');
  nav.id = 'workbenchCategoryNav';
  nav.setAttribute('aria-label', t('workbench.navigation.label'));
  for (const category of WORKBENCH_CATEGORIES) nav.appendChild(createCategoryButton(category));
  primary.appendChild(nav);

  shell.appendChild(primary);

  const region = el('div', 'workbench-subbar-region');
  region.id = 'workbenchSubbarRegion';
  region.setAttribute('aria-hidden', 'true');
  region.inert = true;
  const inner = el('div', 'workbench-subbar-overflow');
  const toolNav = el('nav', 'workbench-tool-subbar');
  toolNav.id = 'workbenchToolSubbar';
  toolNav.setAttribute('aria-label', t('workbench.subbar.label'));
  inner.appendChild(toolNav);
  region.appendChild(inner);
  shell.appendChild(region);
  return shell;
}

async function activateWorkspaceFromSubbar(item, targetTab, keyboardInitiated) {
  const navigated = await navigateToWorkspaceTab(item.id, targetTab.id, { userInitiated: true });
  if (!navigated) return;
  closeToolSubbar();
  if (keyboardInitiated) {
    requestAnimationFrame(() => document.getElementById('workbenchContextTitle')?.focus({ preventScroll: true }));
  }
}

function createWorkspaceNavButton(item) {
  const targetTab = preferredTabForWorkspace(item);
  const message = targetTab ? '' : blockedWorkspaceMessage(item);
  const description = message || translatedDescription(item) || t(item.labelKey);
  const button = el('button', 'workbench-tool-button');
  button.type = 'button';
  button.dataset.workspaceId = item.id;
  button.title = description;
  button.disabled = !targetTab;
  button.setAttribute('aria-disabled', targetTab ? 'false' : 'true');
  button.setAttribute('aria-current', item.id === activeWorkspaceId ? 'page' : 'false');
  button.appendChild(createIcon(item.icon, { size: 20 }));
  const copy = el('span', 'workbench-tool-copy');
  copy.appendChild(el('span', 'workbench-tool-label', t(item.labelKey)));
  if (visibleTabs(item).length > 1) {
    const views = el('span', 'workbench-tool-views', t('workbench.subbar.views', { count: visibleTabs(item).length }));
    copy.appendChild(views);
  }
  button.appendChild(copy);
  if (!targetTab) {
    button.appendChild(createIcon(STATE_ICONS.locked, { size: 16, className: 'workbench-tool-lock' }));
    if (message) button.appendChild(el('span', 'sr-only', message));
  }
  button.addEventListener('keydown', handleToolNavKeydown);
  button.addEventListener('click', (event) => {
    if (!targetTab) return;
    void activateWorkspaceFromSubbar(item, targetTab, event.detail === 0 || lastInputWasKeyboard);
  });
  return button;
}

function renderToolSubbar() {
  const host = document.getElementById('workbenchToolSubbar');
  if (!host) return;
  host.classList.add('is-switching');
  host.replaceChildren();
  if (openCategoryId) {
    host.setAttribute('aria-label', t('workbench.subbar.categoryLabel', { category: categoryLabel(openCategoryId) }));
    for (const item of visibleWorkspaces(openCategoryId)) host.appendChild(createWorkspaceNavButton(item));
  }
  requestAnimationFrame(() => host.classList.remove('is-switching'));
}

function getNavigationSignature() {
  return JSON.stringify(WORKBENCH_CATEGORIES.map((category) => [
    category.id,
    categoryLabel(category.id),
    visibleWorkspaces(category.id).map((item) => [
      item.id,
      t(item.labelKey),
      visibleTabs(item).map((tabInfo) => {
        const availability = tabVisibility(tabInfo);
        return [tabInfo.id, availability.disabled, availability.message];
      })
    ])
  ]));
}

function syncCategoryButtons() {
  for (const category of WORKBENCH_CATEGORIES) {
    const button = document.getElementById(`workbenchCategory-${category.id}`);
    if (!button) continue;
    const visible = category.direct || visibleWorkspaces(category.id).length > 0;
    button.hidden = !visible;
    const current = category.id === activeCategoryId;
    const open = category.id === openCategoryId;
    button.classList.toggle('is-current', current);
    button.classList.toggle('is-open', open);
    button.setAttribute('aria-current', current ? 'page' : 'false');
    if (category.directWorkspaceId) {
      const item = getWorkspaceById(category.directWorkspaceId);
      const targetTab = item ? preferredTabForWorkspace(item) : null;
      const message = item && !targetTab ? blockedWorkspaceMessage(item) : '';
      button.disabled = !targetTab;
      button.setAttribute('aria-disabled', targetTab ? 'false' : 'true');
      button.title = message || categoryLabel(category.id);
      if (message) button.setAttribute('aria-description', message);
      else button.removeAttribute('aria-description');
    } else if (!category.direct) {
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  }
}

function renderWorkbenchNavigation() {
  const signature = getNavigationSignature();
  if (signature !== navigationRenderSignature) {
    navigationRenderSignature = signature;
    renderToolSubbar();
  } else if (openCategoryId) {
    document.querySelectorAll('.workbench-tool-button').forEach((button) => {
      button.setAttribute('aria-current', button.dataset.workspaceId === activeWorkspaceId ? 'page' : 'false');
    });
  }
  syncCategoryButtons();
  setSubbarAccessibility(!!openCategoryId);
}

function selectedOrgIds(tabInfo) {
  if (!tabInfo || tabInfo.orgScope === 'none') return [];
  const ids = [state.leftOrgId].filter(Boolean);
  if (tabInfo.orgScope === 'dual' && state.rightOrgId) ids.push(state.rightOrgId);
  return [...new Set(ids)];
}

function orgDisplayName(orgId) {
  const select = document.getElementById(state.leftOrgId === orgId ? 'leftOrg' : 'rightOrg');
  const selectedText = select?.selectedOptions?.[0]?.textContent?.trim();
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
  const target = document.getElementById(targetId);
  if (!target) return null;
  const label = target.textContent?.trim() || target.getAttribute('aria-label') || target.title || t('workbench.action.open');
  const proxy = el('button', 'workbench-header-action');
  proxy.type = 'button';
  proxy.title = label;
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
  const item = activeWorkspaceId ? getWorkspaceById(activeWorkspaceId) : null;
  breadcrumb.appendChild(el('span', '', categoryLabel(item?.categoryId || activeCategoryId)));
  if (activeWorkspaceId) {
    breadcrumb.appendChild(el('span', 'workbench-breadcrumb-separator', '/'));
    breadcrumb.appendChild(el('span', '', workspaceLabel(activeWorkspaceId)));
  }
  identity.appendChild(breadcrumb);
  const titleRow = el('div', 'workbench-context-title-row');
  titleRow.appendChild(createIcon(item?.icon || CATEGORY_ICONS.home, { size: 24 }));
  const title = el('h1', 'workbench-context-title', item ? t(item.labelKey) : t('workbench.home.title'));
  title.id = 'workbenchContextTitle';
  title.tabIndex = -1;
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
  const themeIcon = document.documentElement.dataset.uiTheme === 'light' ? ACTION_ICONS.darkTheme : ACTION_ICONS.lightTheme;
  const theme = makeIconButton('workbenchThemeBtn', themeIcon, t('workbench.action.theme'));
  theme.addEventListener('click', () => {
    document.getElementById('appThemeToggleInput')?.click();
    requestAnimationFrame(() => {
      headerRenderSignature = '';
      renderWorkbenchHeader();
    });
  });
  actions.appendChild(theme);
  main.appendChild(actions);
  header.appendChild(main);

  if (item && visibleTabs(item).length > 1) {
    const tabs = el('div', 'workbench-tabs');
    tabs.id = 'workbenchWorkspaceTabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', t('workbench.tabs.label', { workspace: t(item.labelKey) }));
    for (const tabInfo of visibleTabs(item)) {
      const availability = tabVisibility(tabInfo);
      const button = el('button', 'workbench-tab');
      button.type = 'button';
      button.id = `workbenchTab-${item.id}-${tabInfo.id}`;
      button.dataset.tabId = tabInfo.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', tabInfo.id === activeTabId ? 'true' : 'false');
      button.setAttribute('tabindex', tabInfo.id === activeTabId ? '0' : '-1');
      button.disabled = availability.disabled;
      button.textContent = t(tabInfo.labelKey);
      if (availability.message) button.title = availability.message;
      button.addEventListener('click', () => void navigateToWorkspaceTab(item.id, tabInfo.id, { userInitiated: true }));
      button.addEventListener('keydown', (event) => handleTabKeydown(event, item));
      tabs.appendChild(button);
    }
    header.appendChild(tabs);
  }
  return header;
}

function handleTabKeydown(event, item) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = visibleTabs(item).filter((candidate) => !tabVisibility(candidate).disabled);
  if (!tabs.length) return;
  const currentIndex = Math.max(0, tabs.findIndex(({ id }) => id === activeTabId));
  let nextIndex = currentIndex;
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
  if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = tabs.length - 1;
  event.preventDefault();
  void navigateToWorkspaceTab(item.id, tabs[nextIndex].id, { userInitiated: true }).then(() => {
    document.getElementById(`workbenchTab-${item.id}-${tabs[nextIndex].id}`)?.focus();
  });
}

export function renderWorkbenchHeader() {
  const editor = document.getElementById('editorContainer');
  if (!editor) return;
  const item = activeWorkspaceId ? getWorkspaceById(activeWorkspaceId) : null;
  const tabInfo = activeWorkspaceId && activeTabId ? getTabById(activeWorkspaceId, activeTabId) : null;
  const orgSignature = selectedOrgIds(tabInfo).map((orgId) => {
    const env = environmentForOrg(orgId);
    return [orgId, orgDisplayName(orgId), env.className, !!readOnlyByOrgId[orgId]];
  });
  const tabsSignature = item
    ? visibleTabs(item).map((candidate) => [candidate.id, tabVisibility(candidate).disabled, tabVisibility(candidate).message])
    : [];
  const signature = JSON.stringify({
    activeCategoryId,
    activeWorkspaceId,
    activeTabId,
    theme: document.documentElement.dataset.uiTheme || '',
    orgSignature,
    tabsSignature
  });
  if (signature === headerRenderSignature && document.getElementById('workbenchContextHeader')) return;
  headerRenderSignature = signature;
  for (const observer of headerActionObservers) observer.disconnect();
  headerActionObservers = [];
  document.getElementById('workbenchContextHeader')?.remove();
  const header = createContextHeader();
  const classicHeader = editor.querySelector('.app-mode-tabs-wrap');
  editor.insertBefore(header, classicHeader || editor.children[1] || null);
}

export function renderWorkbenchShell() {
  if (!initialized) return;
  renderWorkbenchNavigation();
  renderWorkbenchHeader();
}

function validHistorySelection(value, toolId) {
  const item = getWorkspaceById(value?.workspaceId);
  const tabInfo = item && getTabById(item.id, value?.tabId);
  return tabInfo && tabInfo.toolId === toolId ? { workspaceId: item.id, tabId: tabInfo.id } : null;
}

function syncFromLegacyNavigation(event = null) {
  if (event?.detail?.source === 'tool-handlers-ready') {
    if (activeWorkspaceId && activeTabId) void applyWorkspaceTabVariant(activeWorkspaceId, activeTabId);
    headerRenderSignature = '';
    renderWorkbenchHeader();
    return;
  }
  if (workbenchNavigationDepth > 0) return;
  const toolId = document.getElementById('typeSelect')?.value || '';
  const currentRoute = toolId ? getWorkspaceRouteForTool(toolId) : null;
  const sameSelection = state.appNavMode === APP_NAV_MODE_HOME
    ? activeCategoryId === 'home' && !activeWorkspaceId
    : currentRoute?.workspaceId === activeWorkspaceId && getTabById(activeWorkspaceId, activeTabId)?.toolId === toolId;
  // La navegación Classic emite un evento redundante en cada click del documento.
  // Mientras se explora una categoría no debe cerrar la subbarra si la ruta no cambió.
  if (openCategoryId && !pendingHistorySelection && sameSelection) return;
  if (state.appNavMode === APP_NAV_MODE_HOME || !toolId) {
    activeWorkspaceId = null;
    activeTabId = null;
    activeCategoryId = 'home';
  } else {
    const fromHistory = validHistorySelection(pendingHistorySelection || history.state?.sfocWorkbench, toolId);
    const route = fromHistory || getWorkspaceRouteForTool(toolId);
    if (route) {
      const selectionChanged = activeWorkspaceId !== route.workspaceId || activeTabId !== route.tabId;
      activeWorkspaceId = route.workspaceId;
      activeTabId = route.tabId;
      activeCategoryId = getWorkspaceById(route.workspaceId)?.categoryId || 'home';
      if (selectionChanged) void applyWorkspaceTabVariant(activeWorkspaceId, activeTabId);
    }
  }
  pendingHistorySelection = null;
  closeToolSubbar();
  renderWorkbenchShell();
}

async function applyWorkspaceTabVariant(workspaceId, tabId) {
  document.body.dataset.workbenchWorkspace = workspaceId || '';
  document.body.dataset.workbenchTab = tabId || '';
  const { activateWorkspaceAdapter } = await import('./workspaceAdapters.js');
  await activateWorkspaceAdapter(workspaceId, tabId);
}

function writeWorkbenchHistoryState(workspaceId, tabId, opts = {}) {
  const method = opts.push ? 'pushState' : 'replaceState';
  history[method](
    { ...(history.state || {}), sfocWorkbench: { workspaceId, tabId } },
    '',
    window.location.href
  );
}

export async function navigateToWorkspaceTab(workspaceId, tabId, opts = {}) {
  const item = getWorkspaceById(workspaceId);
  const tabInfo = item && getTabById(workspaceId, tabId);
  if (!item || !tabInfo) return false;
  const availability = tabVisibility(tabInfo);
  if (!availability.visible || availability.disabled) {
    if (availability.message) showToast(availability.message, 'warn', { bypassCooldown: true });
    return false;
  }
  const requestId = ++navigationGeneration;
  workbenchNavigationDepth++;
  const currentToolId = document.getElementById('typeSelect')?.value || '';
  const sameLegacyTool = state.appNavMode === tabInfo.legacyMode && currentToolId === tabInfo.toolId;
  activeWorkspaceId = workspaceId;
  activeTabId = tabId;
  activeCategoryId = item.categoryId;
  document.body.dataset.workbenchWorkspace = workspaceId;
  document.body.dataset.workbenchTab = tabId;
  renderWorkbenchShell();
  try {
    if (!sameLegacyTool) {
      await navigateToModeAndTool(tabInfo.legacyMode, tabInfo.toolId, { userInitiated: opts.userInitiated === true });
    }
    if (requestId !== navigationGeneration) return false;
    await applyWorkspaceTabVariant(workspaceId, tabId);
    if (requestId !== navigationGeneration) return false;
    writeWorkbenchHistoryState(workspaceId, tabId, {
      push: sameLegacyTool && opts.userInitiated === true
    });
    const nextPrefs = {
      ...prefs,
      lastTabByWorkspace: { ...prefs.lastTabByWorkspace, [workspaceId]: tabId }
    };
    prefs = nextPrefs;
    prefsWriteQueue = prefsWriteQueue
      .catch(() => {})
      .then(() => saveWorkbenchPrefs(nextPrefs))
      .then((saved) => {
        if (navigationGeneration === requestId) prefs = saved;
      });
    renderWorkbenchShell();
    return true;
  } finally {
    workbenchNavigationDepth = Math.max(0, workbenchNavigationDepth - 1);
    if (workbenchNavigationDepth === 0 && pendingHistorySelection) {
      requestAnimationFrame(() => syncFromLegacyNavigation());
    }
  }
}

async function loadReadOnlyMap() {
  try {
    const result = await chrome.storage.local.get(READ_ONLY_STORAGE_KEY);
    readOnlyByOrgId = result?.[READ_ONLY_STORAGE_KEY] || {};
  } catch {
    readOnlyByOrgId = {};
  }
}

function decorateLanding() {
  document.getElementById('appLandingPinnedHeading')?.closest('.app-landing-tools-section')?.remove();
  document.querySelector('.app-landing-tools-wrap')?.remove();

  const header = document.querySelector('.app-landing-header');
  if (header && !document.getElementById('workbenchLandingLogo')) {
    const logoWrap = el('div', 'workbench-landing-logo-wrap');
    const logo = el('img', 'workbench-landing-logo');
    logo.id = 'workbenchLandingLogo';
    logo.src = chrome.runtime.getURL('icons/icon-32.png');
    logo.alt = '';
    logo.width = 40;
    logo.height = 40;
    logoWrap.appendChild(logo);
    header.prepend(logoWrap);

    const actions = el('div', 'workbench-landing-actions');
    const search = el('button', 'workbench-landing-search');
    search.type = 'button';
    search.appendChild(createIcon(ACTION_ICONS.search, { size: 20 }));
    search.appendChild(el('span', '', t('workbench.landing.search')));
    search.appendChild(el('kbd', '', navigator.platform?.toLowerCase().includes('mac') ? '⌘K' : 'Ctrl+K'));
    search.addEventListener('click', () => document.dispatchEvent(new CustomEvent('sfoc:open-command-palette')));
    actions.appendChild(search);
    const shortcuts = el('div', 'workbench-landing-shortcuts');
    for (const [keys, labelKey] of [
      ['Ctrl+Enter', 'workbench.shortcut.run'],
      ['Ctrl+S', 'workbench.shortcut.save'],
      ['?', 'workbench.shortcut.help']
    ]) {
      const chip = el('span', 'workbench-shortcut-chip');
      chip.appendChild(el('kbd', '', keys));
      chip.appendChild(el('span', '', t(labelKey)));
      shortcuts.appendChild(chip);
    }
    actions.appendChild(shortcuts);
    header.appendChild(actions);
  }

  document.querySelectorAll('.app-landing-card').forEach((card, index) => {
    if (card.querySelector('.workbench-benefit-icon')) return;
    const icons = [
      CATEGORY_ICONS.comparator,
      CATEGORY_ICONS.development,
      CATEGORY_ICONS.metadata,
      CATEGORY_ICONS.security,
      CATEGORY_ICONS.operations,
      CATEGORY_ICONS.dataApi
    ];
    const icon = el('span', 'workbench-benefit-icon');
    icon.appendChild(createIcon(icons[index] || CATEGORY_ICONS.home, { size: 20 }));
    card.prepend(icon);
  });
}

function decorateV2Surfaces() {
  document.body.classList.add('workbench-v2-decorated');
  const quickOpenTitle = document.getElementById('quickOpenTitle');
  const quickOpenSubtitle = document.querySelector('.quick-open-subtitle');
  if (quickOpenTitle) quickOpenTitle.textContent = t('workbench.command.title');
  if (quickOpenSubtitle) quickOpenSubtitle.textContent = t('workbench.command.description');
  document.querySelectorAll('.sfoc-tool-panel').forEach((panel) => {
    panel.classList.add('workbench-tool-surface');
    panel.querySelector('h2')?.classList.add('workbench-native-panel-title');
  });
  const leftOrg = document.getElementById('leftOrg');
  const rightOrg = document.getElementById('rightOrg');
  leftOrg?.setAttribute('aria-label', t('workbench.org.source'));
  rightOrg?.setAttribute('aria-label', t('workbench.org.target'));
  leftOrg?.parentElement?.setAttribute('data-workbench-label', t('workbench.org.source'));
  rightOrg?.parentElement?.setAttribute('data-workbench-label', t('workbench.org.target'));
  decorateLanding();
}

export function getWorkbenchSnapshot() {
  return {
    activeWorkspaceId,
    activeTabId,
    selectedCategoryId: activeCategoryId,
    activeCategoryId,
    openCategoryId,
    panelExpanded: false,
    panelPinned: false
  };
}

export function getVisibleWorkbenchSearchEntries() {
  const entries = [];
  for (const item of visibleWorkspaces()) {
    const defaultTab = preferredTabForWorkspace(item) || visibleTabs(item)[0];
    if (!defaultTab) continue;
    entries.push({
      type: 'workspace', workspaceId: item.id, tabId: defaultTab.id,
      label: t(item.labelKey), searchText: getSearchText(item, t)
    });
    const seen = new Set();
    for (const tabInfo of visibleTabs(item)) {
      const key = `${tabInfo.toolId}\u0000${tabInfo.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const availability = tabVisibility(tabInfo);
      entries.push({
        type: 'tool', workspaceId: item.id, tabId: tabInfo.id, toolId: tabInfo.toolId,
        label: t(tabInfo.labelKey), workspaceLabel: t(item.labelKey),
        searchText: `${getSearchText(item, t)} ${t(tabInfo.labelKey)} ${toolLabel(tabInfo.toolId)}`.toLocaleLowerCase(),
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
  document.querySelector('.app-landing-tools-section--recents')?.remove();
  decorateV2Surfaces();

  const editor = document.getElementById('editorContainer');
  if (!editor) return;
  const shell = createPrimaryNavigation();
  editor.insertBefore(shell, editor.firstChild);
  initialized = true;
  document.body.dataset.workbenchSubbar = 'closed';
  syncFromLegacyNavigation();

  document.addEventListener('sfoc:navigationchange', syncFromLegacyNavigation);
  document.addEventListener('pointerdown', () => { lastInputWasKeyboard = false; }, true);
  document.addEventListener('keydown', (event) => {
    lastInputWasKeyboard = true;
    if (event.key === 'Escape' && openCategoryId) {
      event.preventDefault();
      event.stopPropagation();
      closeToolSubbar({ restoreFocus: true });
    }
  }, true);
  document.addEventListener('click', (event) => {
    if (openCategoryId && !shell.contains(event.target)) closeToolSubbar();
  });
  window.addEventListener('popstate', (event) => {
    pendingHistorySelection = event.state?.sfocWorkbench || null;
  });
  for (const id of ['leftOrg', 'rightOrg']) {
    const select = document.getElementById(id);
    select?.addEventListener('change', () => requestAnimationFrame(renderWorkbenchHeader));
    if (select) new MutationObserver(() => requestAnimationFrame(renderWorkbenchHeader)).observe(select, { childList: true });
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[READ_ONLY_STORAGE_KEY]) {
      readOnlyByOrgId = changes[READ_ONLY_STORAGE_KEY].newValue || {};
      headerRenderSignature = '';
      renderWorkbenchHeader();
    }
  });
}
