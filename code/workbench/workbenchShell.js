import { state } from '../core/state.js';
import { loadToolRecents } from '../core/toolRecents.js';
import {
  APP_NAV_MODE_HOME,
  TOOL_I18N,
  navigateToModeAndTool
} from '../ui/appModeNav.js';
import { showToast } from '../ui/toast.js';
import { ensureSfocOverlayRoot } from '../ui/sfocModal.js';
import {
  getToolNotice,
  isModeVisible,
  isToolVisible
} from '../../shared/featureControls.js';
import { getCachedFeatureControlsConfig } from '../../shared/posthogFeatureControlsFlag.js';
import { getCurrentLang, t } from '../../shared/i18n.js';
import { ACTION_ICONS, CATEGORY_ICONS, STATE_ICONS, createIcon } from './iconRegistry.js';
import {
  MARKETING_CAPABILITIES,
  MARKETING_STEPS,
  MARKETING_TRUST_ITEMS
} from './landingContentRegistry.js';
import {
  WORKBENCH_CATEGORIES,
  WORKBENCH_WORKSPACES,
  getCategoryById,
  getSearchText,
  getTabById,
  getWorkspaceById,
  getWorkspaceRouteForTool
} from './workspaceRegistry.js';
import { getWorkspaceAdapter } from './workspaceAdapters.js';
import { loadWorkbenchPrefs, saveWorkbenchPrefs } from './workbenchPrefs.js';

const READ_ONLY_STORAGE_KEY = 'sfocOrgReadOnlyById';

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
let openHeaderMoreMenu = null;
let openHeaderMoreButton = null;

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
  button.dataset.onboardingAnchor = `category-${category.id}`;
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
  button.dataset.onboardingAnchor = `workspace-${item.id}`;
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
  renderMarketingCapabilities();
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

function closeHeaderMoreMenu({ restoreFocus = false } = {}) {
  if (!openHeaderMoreMenu) return;
  openHeaderMoreMenu.hidden = true;
  openHeaderMoreButton?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) openHeaderMoreButton?.focus();
  openHeaderMoreMenu = null;
  openHeaderMoreButton = null;
}

function sourceContextVisible(source) {
  if (!source) return false;
  let current = source;
  while (current && !current.classList?.contains('sfoc-tool-panel')) {
    if (current !== source && (current.hidden || current.classList?.contains('hidden') || current.getAttribute?.('aria-hidden') === 'true')) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

function actionState(action) {
  const sourceId = action.state?.sourceId || action.handler?.targetId;
  const source = sourceId ? document.getElementById(sourceId) : null;
  const disabled = action.state?.disabled === 'source'
    ? !source || source.disabled || source.getAttribute('aria-disabled') === 'true'
    : false;
  const loading = action.state?.loading === 'source' && !!source && (
    source.getAttribute('aria-busy') === 'true' ||
    source.dataset.loading === 'true' ||
    source.dataset.busy === 'true' ||
    source.classList.contains('is-loading') ||
    source.classList.contains('loading')
  );
  const visible = action.visibleWhen === 'source-context' ? sourceContextVisible(source) : true;
  return { source, disabled, loading, visible };
}

async function invokeHeaderAction(action) {
  if (action.handler?.type === 'navigate-tab') {
    await navigateToWorkspaceTab(action.handler.workspaceId, action.handler.tabId, { userInitiated: true });
    return;
  }
  if (action.handler?.type === 'dispatch-click') {
    const source = document.getElementById(action.handler.targetId);
    if (!source || source.disabled || source.getAttribute('aria-disabled') === 'true') return;
    source.click();
  }
}

function observeHeaderActionState(action, sync) {
  const sourceId = action.state?.sourceId || action.handler?.targetId;
  const source = sourceId ? document.getElementById(sourceId) : null;
  if (!source) return;
  const observer = new MutationObserver(sync);
  let current = source;
  while (current && !current.classList?.contains('sfoc-tool-panel')) {
    observer.observe(current, {
      attributes: true,
      attributeFilter: ['disabled', 'hidden', 'class', 'aria-disabled', 'aria-busy', 'aria-hidden', 'data-loading', 'data-busy']
    });
    current = current.parentElement;
  }
  headerActionObservers.push(observer);
}

function createHeaderAction(action, { menuItem = false } = {}) {
  const label = t(action.labelKey);
  const button = el('button', menuItem
    ? `workbench-more-action workbench-header-action--${action.variant}`
    : `workbench-header-action workbench-header-action--${action.variant}`);
  button.type = 'button';
  button.dataset.actionId = action.id;
  button.dataset.actionPriority = String(action.priority);
  if (menuItem) button.setAttribute('role', 'menuitem');
  const icon = createIcon(action.icon, { size: 16, className: 'workbench-action-icon' });
  const spinner = createIcon(STATE_ICONS.loading, { size: 16, className: 'workbench-action-spinner' });
  const labelEl = el('span', 'workbench-action-label', label);
  button.append(icon, spinner, labelEl);
  let inferredLoading = false;
  let inferredLoadingTimer = 0;
  const sync = () => {
    const current = actionState(action);
    if (inferredLoading && !current.disabled && !current.loading) {
      inferredLoading = false;
      window.clearTimeout(inferredLoadingTimer);
      inferredLoadingTimer = 0;
    }
    const loading = current.loading || inferredLoading;
    button.hidden = !current.visible;
    button.disabled = current.disabled || loading;
    button.classList.toggle('is-loading', loading);
    button.setAttribute('aria-disabled', button.disabled ? 'true' : 'false');
    button.setAttribute('aria-busy', loading ? 'true' : 'false');
    const reason = loading
      ? t('workbench.action.loading', { action: label })
      : current.disabled
        ? t(action.disabledReasonKey || 'workbench.action.unavailable')
        : label;
    button.title = reason;
    button.setAttribute('aria-label', label);
  };
  sync();
  observeHeaderActionState(action, sync);
  button.addEventListener('click', () => {
    closeHeaderMoreMenu();
    const before = actionState(action);
    if (before.disabled || before.loading || !before.visible) return;
    // Los handlers legacy suelen deshabilitar su botÃ³n de forma sÃ­ncrona al
    // iniciar. La cabecera anticipa un frame y mantiene el spinner mientras la
    // fuente siga disabled/busy, sin leer ni sustituir su etiqueta.
    inferredLoading = action.handler?.type === 'dispatch-click';
    sync();
    void invokeHeaderAction(action).finally(() => queueMicrotask(() => {
      const after = actionState(action);
      if (!after.disabled && !after.loading) inferredLoading = false;
      if (inferredLoading) {
        window.clearTimeout(inferredLoadingTimer);
        inferredLoadingTimer = window.setTimeout(() => {
          inferredLoading = false;
          sync();
        }, 60_000);
      }
      sync();
    }));
  });
  return button;
}

/**
 * Crea una copia visual de un control del comparador conservando el control
 * original como fuente de estado y de eventos. Así la cabecera puede
 * reconstruirse sin perder los listeners que ya tiene el visor de Monaco.
 */
function createCompareControl(sourceId) {
  const source = document.getElementById(sourceId);
  if (!source) return null;

  const button = el('button', 'workbench-compare-control');
  button.type = 'button';
  button.dataset.sourceId = sourceId;

  const sync = () => {
    button.disabled = !!source.disabled;
    button.hidden = !!source.hidden || source.classList.contains('hidden');
    button.classList.toggle('is-active', source.classList.contains('active'));
    button.classList.toggle('is-retrieve', source.classList.contains('retrieve-button'));
    button.title = source.title || source.getAttribute('aria-label') || '';
    button.setAttribute('aria-label', source.getAttribute('aria-label') || button.title);
    button.innerHTML = source.innerHTML;
  };
  sync();

  const observer = new MutationObserver(sync);
  observer.observe(source, {
    attributes: true,
    attributeFilter: ['class', 'disabled', 'hidden', 'title', 'aria-label'],
    childList: true,
    subtree: true,
    characterData: true
  });
  headerActionObservers.push(observer);

  button.addEventListener('click', () => {
    if (!source.disabled && !button.hidden) source.click();
  });
  return button;
}

function createCompareInfoPill(sourceId, className, { live = false } = {}) {
  const source = document.getElementById(sourceId);
  if (!source) return null;

  const pill = el('span', `workbench-compare-pill ${className}`);
  if (live) pill.setAttribute('aria-live', 'polite');
  const sync = () => {
    const text = source.textContent?.trim() || '';
    // `compact` solo vale mientras describa el texto actual del origen.
    const compact = source.dataset.compactFor === text ? source.dataset.compact : '';
    pill.textContent = compact || text;
    pill.hidden = !text;
    pill.title = text;
  };
  sync();

  const observer = new MutationObserver(sync);
  observer.observe(source, {
    attributes: true,
    attributeFilter: ['data-compact', 'data-compact-for'],
    childList: true,
    subtree: true,
    characterData: true
  });
  headerActionObservers.push(observer);
  return pill;
}

function createCompareToolbar() {
  if (activeWorkspaceId !== 'comparator') return null;

  const toolbar = el('div', 'workbench-compare-toolbar');
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', t('workbench.workspace.comparator'));
  const status = createCompareInfoPill('diffStatus', 'workbench-compare-status', { live: true });
  const controls = el('div', 'workbench-compare-controls');
  for (const sourceId of [
    'retrieveAllBtn',
    'toggleWhitespaceBtn',
    'toggleWordWrapBtn',
    'copyUnifiedDiffBtn',
    'exportDiffHtmlBtn',
    'toggleSidebarBtn',
    'prevDiffBtn',
    'nextDiffBtn'
  ]) {
    const control = createCompareControl(sourceId);
    if (control) controls.appendChild(control);
  }
  const context = createCompareInfoPill('compareContextTitle', 'workbench-compare-context');
  // Contexto y estado juntos (qué se compara / cuánto difiere) y después los
  // controles, para que la lectura de la cabecera siga siendo izquierda→derecha.
  if (context) toolbar.appendChild(context);
  if (status) toolbar.appendChild(status);
  toolbar.appendChild(controls);
  const divider = el('span', 'workbench-compare-divider');
  divider.setAttribute('aria-hidden', 'true');
  toolbar.appendChild(divider);
  return toolbar;
}

function shouldUseMoreMenu(actions) {
  if (!actions.some((action) => action.allowOverflow)) return false;
  return window.matchMedia('(max-width: 1120px)').matches;
}

function handleMoreMenuKeydown(event) {
  const menu = event.currentTarget;
  const items = [...menu.querySelectorAll('[role="menuitem"]:not([hidden]):not(:disabled)')];
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeHeaderMoreMenu({ restoreFocus: true });
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !items.length) return;
  event.preventDefault();
  let index = Math.max(0, items.indexOf(document.activeElement));
  if (event.key === 'ArrowDown') index = (index + 1) % items.length;
  if (event.key === 'ArrowUp') index = (index - 1 + items.length) % items.length;
  if (event.key === 'Home') index = 0;
  if (event.key === 'End') index = items.length - 1;
  items[index]?.focus();
}

function createMoreActions(actions) {
  const wrap = el('div', 'workbench-more-actions');
  const label = t('workbench.action.more');
  const button = makeIconButton('workbenchMoreActionsBtn', ACTION_ICONS.more, label, 'workbench-more-trigger');
  const menu = el('div', 'workbench-more-menu');
  menu.id = 'workbenchMoreActionsMenu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', label);
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-controls', menu.id);
  button.setAttribute('aria-expanded', 'false');
  for (const action of actions) menu.appendChild(createHeaderAction(action, { menuItem: true }));
  button.addEventListener('click', () => {
    const opening = menu.hidden;
    closeHeaderMoreMenu();
    if (!opening) return;
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    openHeaderMoreMenu = menu;
    openHeaderMoreButton = button;
    requestAnimationFrame(() => menu.querySelector('[role="menuitem"]:not([hidden]):not(:disabled)')?.focus());
  });
  menu.addEventListener('keydown', handleMoreMenuKeydown);
  wrap.append(button, menu);
  return wrap;
}

function markMovedActionSources(actions) {
  document.querySelectorAll('.is-workbench-action-source').forEach((source) => {
    source.classList.remove('is-workbench-action-source');
    delete source.dataset.workbenchActionSource;
  });
  for (const action of actions) {
    if (action.handler?.type !== 'dispatch-click') continue;
    const source = document.getElementById(action.handler.targetId);
    if (!source) continue;
    source.classList.add('is-workbench-action-source');
    source.dataset.workbenchActionSource = action.id;
  }
}

function createContextHeader() {
  const header = el('header', 'workbench-context-header');
  header.id = 'workbenchContextHeader';
  header.dataset.onboardingAnchor = 'tool-context';
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
  const titleCopy = el('div', 'workbench-context-title-copy');
  const title = el('h1', 'workbench-context-title', item ? t(item.labelKey) : t('workbench.home.title'));
  title.id = 'workbenchContextTitle';
  title.tabIndex = -1;
  titleCopy.appendChild(title);
  const description = item ? translatedDescription(item) : '';
  if (description) titleCopy.appendChild(el('p', 'workbench-context-description', description));
  titleRow.appendChild(titleCopy);
  const currentTab = activeWorkspaceId && activeTabId ? getTabById(activeWorkspaceId, activeTabId) : null;
  if (currentTab?.risk === 'write' || currentTab?.risk === 'destructive') {
    const risk = el('span', `workbench-risk-badge workbench-risk-badge--${currentTab.risk}`);
    risk.appendChild(createIcon(STATE_ICONS.warning, { size: 16 }));
    risk.appendChild(el('span', '', t(currentTab.risk === 'destructive' ? 'workbench.risk.destructive' : 'workbench.risk.write')));
    titleRow.appendChild(risk);
  }
  identity.appendChild(titleRow);
  main.appendChild(identity);

  const actions = el('div', 'workbench-context-actions');
  const configuredActions = [...(getWorkspaceAdapter(activeWorkspaceId)?.getHeaderActions({
    workspaceId: activeWorkspaceId,
    tabId: activeTabId
  }) || currentTab?.actions || [])].sort((left, right) => left.priority - right.priority);
  markMovedActionSources(configuredActions);
  const useMore = shouldUseMoreMenu(configuredActions);
  const directActions = useMore ? configuredActions.filter((action) => !action.allowOverflow) : configuredActions;
  const overflowActions = useMore ? configuredActions.filter((action) => action.allowOverflow) : [];
  for (const action of directActions) actions.appendChild(createHeaderAction(action));
  if (overflowActions.length) actions.appendChild(createMoreActions(overflowActions));
  const compareToolbar = createCompareToolbar();
  if (compareToolbar) actions.appendChild(compareToolbar);
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
      button.dataset.onboardingAnchor = `tab-${item.id}-${tabInfo.id}`;
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
    compactActions: window.matchMedia('(max-width: 1120px)').matches,
    orgSignature,
    tabsSignature
  });
  if (signature === headerRenderSignature && document.getElementById('workbenchContextHeader')) return;
  headerRenderSignature = signature;
  for (const observer of headerActionObservers) observer.disconnect();
  headerActionObservers = [];
  closeHeaderMoreMenu();
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

function createMarketingSearchButton(className = '') {
  const isMac = navigator.platform?.toLowerCase().includes('mac');
  const shortcut = isMac ? '⌘K' : 'Ctrl+K';
  const search = el('button', `workbench-marketing-search ${className}`.trim());
  search.type = 'button';
  search.appendChild(createIcon(ACTION_ICONS.search, { size: 20 }));
  search.appendChild(el('span', 'workbench-marketing-search-copy', t('workbench.marketing.search')));
  search.appendChild(el('kbd', '', shortcut));
  search.setAttribute('aria-label', `${t('workbench.marketing.search')}, ${t('workbench.marketing.shortcut', { shortcut })}`);
  search.addEventListener('click', () => document.dispatchEvent(new CustomEvent('sfoc:open-command-palette')));
  return search;
}

function createMarketingButton(id, labelKey, iconName, className, handler) {
  const button = el('button', `workbench-marketing-button ${className}`.trim());
  button.type = 'button';
  button.id = id;
  button.appendChild(createIcon(iconName, { size: 20 }));
  button.appendChild(el('span', '', t(labelKey)));
  button.addEventListener('click', handler);
  return button;
}

function marketingToolIsVisible(toolId) {
  const route = getWorkspaceRouteForTool(toolId);
  const tabInfo = route && getTabById(route.workspaceId, route.tabId);
  return !!tabInfo && tabVisibility(tabInfo).visible;
}

function marketingComparatorIsAvailable() {
  const category = getCategoryById('comparator');
  const item = category?.directWorkspaceId ? getWorkspaceById(category.directWorkspaceId) : null;
  return !!(item && preferredTabForWorkspace(item));
}

function openComparatorFromLanding(event) {
  const category = getCategoryById('comparator');
  if (category) void selectDirectWorkspace(category, event.detail === 0 || lastInputWasKeyboard);
}

function renderMarketingCapabilities() {
  const grid = document.getElementById('workbenchCapabilityGrid');
  if (!grid) return;
  const visible = MARKETING_CAPABILITIES.filter((capability) => capability.toolIds.some(marketingToolIsVisible));
  const signature = `${getCurrentLang()}|${visible.map((item) => item.id).join('|')}`;
  if (grid.dataset.renderSignature !== signature) {
    grid.dataset.renderSignature = signature;
    grid.replaceChildren();
    for (const capability of visible) {
      const card = el('article', `workbench-capability-card workbench-capability-card--${capability.tone} is-${capability.size}`);
      card.dataset.capabilityId = capability.id;
      const top = el('div', 'workbench-capability-top');
      const icon = el('span', 'workbench-capability-icon');
      icon.appendChild(createIcon(capability.icon, { size: 24 }));
      top.appendChild(icon);
      top.appendChild(el('span', 'workbench-capability-label', t(capability.labelKey)));
      card.appendChild(top);
      card.appendChild(el('h3', 'workbench-capability-title', t(capability.titleKey)));
      card.appendChild(el('p', 'workbench-capability-description', t(capability.descriptionKey)));
      grid.appendChild(card);
    }
  }
  document.getElementById('workbenchCapabilities')?.toggleAttribute('hidden', visible.length === 0);
  const comparatorAvailable = marketingComparatorIsAvailable();
  for (const button of document.querySelectorAll('[data-marketing-action="compare"]')) {
    button.disabled = !comparatorAvailable;
    button.setAttribute('aria-disabled', comparatorAvailable ? 'false' : 'true');
    button.title = comparatorAvailable ? '' : t('workbench.marketing.comparatorUnavailable');
  }
}

function createMarketingPreview() {
  const preview = el('div', 'workbench-marketing-preview');
  preview.setAttribute('aria-hidden', 'true');
  const chrome = el('div', 'workbench-preview-chrome');
  const dots = el('span', 'workbench-preview-dots');
  dots.append(el('i'), el('i'), el('i'));
  chrome.appendChild(dots);
  chrome.appendChild(el('span', 'workbench-preview-name', t('workbench.marketing.preview.label')));
  const ready = el('span', 'workbench-preview-ready');
  ready.appendChild(createIcon(STATE_ICONS.success, { size: 16 }));
  ready.appendChild(el('span', '', t('workbench.marketing.preview.ready')));
  chrome.appendChild(ready);
  preview.appendChild(chrome);

  const orgs = el('div', 'workbench-preview-orgs');
  const source = el('span', 'workbench-preview-org workbench-preview-org--sandbox');
  source.appendChild(createIcon(STATE_ICONS.sandbox, { size: 16 }));
  source.appendChild(el('span', '', t('workbench.marketing.preview.source')));
  const target = el('span', 'workbench-preview-org workbench-preview-org--production');
  target.appendChild(createIcon(STATE_ICONS.production, { size: 16 }));
  target.appendChild(el('span', '', t('workbench.marketing.preview.target')));
  orgs.appendChild(source);
  orgs.appendChild(createIcon('arrows-diff', { size: 20, className: 'workbench-preview-swap' }));
  orgs.appendChild(target);
  preview.appendChild(orgs);

  const editor = el('div', 'workbench-preview-editor');
  const file = el('div', 'workbench-preview-file');
  file.appendChild(createIcon('file-code', { size: 16 }));
  file.appendChild(el('span', '', 'AccountService.cls'));
  editor.appendChild(file);
  for (const [number, type, code] of [
    ['18', 'context', 'public with sharing class AccountService {'],
    ['19', 'removed', '-  return accounts;'],
    ['19', 'added', '+  return accounts.deepClone();'],
    ['20', 'context', '}']
  ]) {
    const line = el('div', `workbench-preview-line is-${type}`);
    line.appendChild(el('span', 'workbench-preview-line-number', number));
    line.appendChild(el('code', '', code));
    editor.appendChild(line);
  }
  preview.appendChild(editor);
  const summary = el('div', 'workbench-preview-summary');
  summary.appendChild(el('span', 'workbench-preview-summary-count', '3'));
  summary.appendChild(el('span', '', t('workbench.marketing.preview.differences')));
  preview.appendChild(summary);
  return preview;
}

function decorateLanding() {
  const landing = document.getElementById('appLandingPanel');
  const inner = landing?.querySelector('.app-landing-inner');
  const header = inner?.querySelector('.app-landing-header');
  if (!landing || !inner || !header || header.dataset.marketingReady === 'true') return;
  header.dataset.marketingReady = 'true';

  document.getElementById('appLandingPinnedHeading')?.closest('.app-landing-tools-section')?.remove();
  inner.querySelector('.app-landing-tools-wrap')?.remove();
  inner.querySelector('.app-landing-discover-banner')?.remove();
  inner.querySelector('.app-landing-grid-wrap')?.remove();

  header.id = 'workbenchMarketingHero';
  header.classList.add('workbench-marketing-hero');
  header.replaceChildren();
  const heroCopy = el('div', 'workbench-marketing-hero-copy');
  const eyebrow = el('div', 'workbench-marketing-eyebrow');
  const logoWrap = el('span', 'workbench-landing-logo-wrap');
  const logo = el('img', 'workbench-landing-logo');
  logo.id = 'workbenchLandingLogo';
  logo.src = chrome.runtime.getURL('icons/logo-horizontal.png');
  logo.alt = '';
  logo.width = 88;
  logo.height = 58;
  logoWrap.appendChild(logo);
  eyebrow.appendChild(logoWrap);
  eyebrow.appendChild(el('span', '', t('workbench.marketing.eyebrow')));
  heroCopy.appendChild(eyebrow);
  const title = el('h1', 'app-landing-title workbench-marketing-title', t('workbench.marketing.title'));
  title.id = 'appLandingHeading';
  heroCopy.appendChild(title);
  heroCopy.appendChild(el('p', 'app-landing-lead workbench-marketing-lead', t('workbench.marketing.subtitle')));

  const actions = el('div', 'workbench-marketing-actions');
  const compare = createMarketingButton(
    'workbenchMarketingPrimaryCta', 'workbench.marketing.primary', 'arrows-diff',
    'is-primary', openComparatorFromLanding
  );
  compare.dataset.marketingAction = 'compare';
  actions.appendChild(compare);
  actions.appendChild(createMarketingButton(
    'workbenchMarketingExploreCta', 'workbench.marketing.secondary', ACTION_ICONS.forward,
    'is-secondary', () => {
      document.getElementById('workbenchCapabilities')?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start'
      });
    }
  ));
  heroCopy.appendChild(actions);
  heroCopy.appendChild(createMarketingSearchButton('workbench-marketing-search--hero'));

  const chips = el('div', 'workbench-marketing-chips');
  for (const [iconName, labelKey] of [
    ['building-factory-2', 'workbench.marketing.chip.environments'],
    ['arrows-diff', 'workbench.marketing.chip.comparison'],
    ['shield-check', 'workbench.marketing.chip.control']
  ]) {
    const chip = el('span', 'workbench-marketing-chip');
    chip.appendChild(createIcon(iconName, { size: 16 }));
    chip.appendChild(el('span', '', t(labelKey)));
    chips.appendChild(chip);
  }
  heroCopy.appendChild(chips);
  header.appendChild(heroCopy);
  header.appendChild(createMarketingPreview());

  const capabilities = el('section', 'workbench-marketing-section workbench-capabilities');
  capabilities.id = 'workbenchCapabilities';
  capabilities.setAttribute('aria-labelledby', 'workbenchCapabilitiesTitle');
  const capabilitiesHeader = el('div', 'workbench-marketing-section-header');
  const capabilitiesTitle = el('h2', '', t('workbench.marketing.capabilities.title'));
  capabilitiesTitle.id = 'workbenchCapabilitiesTitle';
  capabilitiesHeader.appendChild(capabilitiesTitle);
  capabilitiesHeader.appendChild(el('p', '', t('workbench.marketing.capabilities.lead')));
  capabilities.appendChild(capabilitiesHeader);
  const capabilityGrid = el('div', 'workbench-capability-grid');
  capabilityGrid.id = 'workbenchCapabilityGrid';
  capabilities.appendChild(capabilityGrid);
  inner.insertBefore(capabilities, inner.querySelector('.app-landing-help-hint, .app-landing-footer'));

  const workflow = el('section', 'workbench-marketing-section workbench-workflow');
  workflow.setAttribute('aria-labelledby', 'workbenchWorkflowTitle');
  const workflowHeader = el('div', 'workbench-marketing-section-header');
  const workflowTitle = el('h2', '', t('workbench.marketing.workflow.title'));
  workflowTitle.id = 'workbenchWorkflowTitle';
  workflowHeader.appendChild(workflowTitle);
  workflowHeader.appendChild(el('p', '', t('workbench.marketing.workflow.lead')));
  workflow.appendChild(workflowHeader);
  const steps = el('ol', 'workbench-workflow-steps');
  MARKETING_STEPS.forEach((step, index) => {
    const item = el('li', 'workbench-workflow-step');
    const marker = el('span', 'workbench-workflow-marker');
    marker.appendChild(el('span', 'workbench-workflow-number', String(index + 1).padStart(2, '0')));
    marker.appendChild(createIcon(step.icon, { size: 24 }));
    item.appendChild(marker);
    item.appendChild(el('h3', '', t(step.titleKey)));
    item.appendChild(el('p', '', t(step.descriptionKey)));
    steps.appendChild(item);
  });
  workflow.appendChild(steps);
  inner.insertBefore(workflow, inner.querySelector('.app-landing-help-hint, .app-landing-footer'));

  const trust = el('aside', 'workbench-trust-band');
  trust.setAttribute('aria-labelledby', 'workbenchTrustTitle');
  const trustCopy = el('div', 'workbench-trust-copy');
  const trustTitle = el('h2', '', t('workbench.marketing.trust.title'));
  trustTitle.id = 'workbenchTrustTitle';
  trustCopy.appendChild(trustTitle);
  trustCopy.appendChild(el('p', '', t('workbench.marketing.trust.lead')));
  trust.appendChild(trustCopy);
  const trustItems = el('div', 'workbench-trust-items');
  for (const item of MARKETING_TRUST_ITEMS) {
    const badge = el('span', `workbench-trust-badge workbench-trust-badge--${item.tone}`);
    badge.appendChild(createIcon(item.icon, { size: 18 }));
    badge.appendChild(el('span', '', t(item.labelKey)));
    trustItems.appendChild(badge);
  }
  trust.appendChild(trustItems);
  inner.insertBefore(trust, inner.querySelector('.app-landing-help-hint, .app-landing-footer'));

  const finalCta = el('section', 'workbench-final-cta');
  finalCta.setAttribute('aria-labelledby', 'workbenchFinalCtaTitle');
  const finalCopy = el('div', 'workbench-final-cta-copy');
  const finalTitle = el('h2', '', t('workbench.marketing.final.title'));
  finalTitle.id = 'workbenchFinalCtaTitle';
  finalCopy.appendChild(finalTitle);
  finalCopy.appendChild(el('p', '', t('workbench.marketing.final.lead')));
  finalCta.appendChild(finalCopy);
  const finalActions = el('div', 'workbench-final-cta-actions');
  const finalCompare = createMarketingButton(
    'workbenchMarketingFinalCompare', 'workbench.marketing.primary', 'arrows-diff',
    'is-primary', openComparatorFromLanding
  );
  finalCompare.dataset.marketingAction = 'compare';
  finalActions.appendChild(finalCompare);
  finalActions.appendChild(createMarketingSearchButton('workbench-marketing-search--compact'));
  finalCta.appendChild(finalActions);
  inner.insertBefore(finalCta, inner.querySelector('.app-landing-help-hint, .app-landing-footer'));

  renderMarketingCapabilities();
}

function decorateV2Surfaces() {
  document.body.classList.add('workbench-v2-decorated');
  const quickOpenTitle = document.getElementById('quickOpenTitle');
  const quickOpenSubtitle = document.querySelector('.quick-open-subtitle');
  if (quickOpenTitle) quickOpenTitle.textContent = t('workbench.command.title');
  if (quickOpenSubtitle) quickOpenSubtitle.textContent = t('workbench.command.description');
  document.querySelectorAll('.sfoc-tool-panel').forEach((panel) => {
    panel.classList.add('workbench-tool-surface');
    const title = panel.querySelector('h2');
    const subtitle = panel.querySelector('.sfoc-panel-subtitle, .permission-diff-subtitle');
    title?.classList.add('workbench-legacy-tool-heading');
    subtitle?.classList.add('workbench-legacy-tool-description');
    title?.setAttribute('aria-hidden', 'true');
    subtitle?.setAttribute('aria-hidden', 'true');
    for (const [node, attribute] of [[title, 'aria-labelledby'], [subtitle, 'aria-describedby']]) {
      if (!node?.id) continue;
      document.querySelectorAll(`[${attribute}~="${node.id}"]`).forEach((owner) => {
        const remaining = String(owner.getAttribute(attribute) || '')
          .split(/\s+/)
          .filter((id) => id && id !== node.id);
        if (remaining.length) owner.setAttribute(attribute, remaining.join(' '));
        else owner.removeAttribute(attribute);
      });
    }
    if (title) {
      const group = title.parentElement;
      if (group && group !== panel && [...group.children].every((child) => child === title || child === subtitle)) {
        group.classList.add('workbench-legacy-heading-group');
      }
      const header = group?.parentElement;
      if (header && header !== panel && [...header.children].every((child) => child === group || child.classList.contains('workbench-legacy-tool-description'))) {
        header.classList.add('workbench-legacy-header-only');
      }
    }
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
  ensureSfocOverlayRoot();
  await Promise.all([loadToolRecents(), loadReadOnlyMap()]);
  document.querySelector('.app-landing-tools-section--recents')?.remove();
  decorateV2Surfaces();

  const editor = document.getElementById('editorContainer');
  const content = document.querySelector('.content');
  if (!editor || !content) return;
  const shell = createPrimaryNavigation();
  content.insertBefore(shell, editor);
  initialized = true;
  document.body.dataset.workbenchSubbar = 'closed';
  syncFromLegacyNavigation();

  document.addEventListener('sfoc:navigationchange', syncFromLegacyNavigation);
  document.addEventListener('pointerdown', () => { lastInputWasKeyboard = false; }, true);
  document.addEventListener('keydown', (event) => {
    lastInputWasKeyboard = true;
    if (document.body.dataset.sfocModalOpen === 'true') return;
    if (event.key === 'Escape' && openCategoryId) {
      event.preventDefault();
      event.stopPropagation();
      closeToolSubbar({ restoreFocus: true });
    }
  }, true);
  document.addEventListener('click', (event) => {
    if (openCategoryId && !shell.contains(event.target)) closeToolSubbar();
    if (openHeaderMoreMenu && !openHeaderMoreMenu.parentElement?.contains(event.target)) closeHeaderMoreMenu();
  });
  document.addEventListener('sfoc:overlay-will-open', () => {
    closeToolSubbar();
    closeHeaderMoreMenu();
  });
  window.addEventListener('resize', () => {
    const compact = window.matchMedia('(max-width: 1120px)').matches;
    if (compact === (JSON.parse(headerRenderSignature || '{}').compactActions ?? compact)) return;
    headerRenderSignature = '';
    renderWorkbenchHeader();
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
