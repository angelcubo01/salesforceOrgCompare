import { createDockview } from '../../vendor/dockview/dockview.esm.mjs';
import { state } from '../core/state.js';
import { DiffWorkbench } from '../editor/diffWorkbench.js';
import { renderEditor } from '../editor/editorRender.js';
import { getItemKey, getDisplayFileName } from '../lib/itemLabels.js';
import { syncCompareUrlFromState } from '../lib/compareDeepLink.js';
import { updateDocumentTitle } from './documentMeta.js';
import { syncListActiveHighlight } from './listUi.js';
import { t } from '../../shared/i18n.js';
import {
  debounceLayoutSave,
  loadComparatorDockLayout,
  saveComparatorDockLayout,
  sfocDockviewThemeClass
} from '../lib/dockviewShell.js';
import { createCompareDockTabComponent } from './compareDockTab.js';

const COMPARE_DIFF_TAB = 'compare-diff-tab';

export const HISTORY_EDGE_ID = 'compare-history-edge';
export const HISTORY_PANEL_ID = 'compare-history';

/** @type {import('../../vendor/dockview-core/dockview-core.esm.mjs').DockviewApi | null} */
let dockApi = null;
/** @type {ReturnType<typeof debounceLayoutSave> | null} */
let scheduleLayoutSave = null;
let compareTabCounter = 0;
let mounted = false;
/** @type {HTMLElement | null} */
let sidebarRestoreParent = null;

export const compareDiffWorkbench = new DiffWorkbench({ maxTabs: 12 });

/** @returns {boolean} */
export function isCompareDockActive() {
  return mounted && !!dockApi;
}

/** @returns {import('../../vendor/dockview-core/dockview-core.esm.mjs').DockviewApi | null} */
export function getCompareDockApi() {
  return dockApi;
}

function getCompareDockRoot() {
  return document.getElementById('compareDockRoot');
}

function getLegacyMonacoContainer() {
  return document.getElementById('monacoContainer');
}

function getMainDiffGroupviewEl() {
  const root = getCompareDockRoot();
  return root?.querySelector('.dv-groupview:not(.dv-groupview-edge)') || null;
}

/** Mueve toolbar y chunk bar bajo la tira de pestañas (orden IDE: tabs → toolbar → editor). */
function ensureCompareChromeInDock() {
  if (!mounted || !dockApi) return;
  const group = getMainDiffGroupviewEl();
  const contentContainer = group?.querySelector('.dv-content-container');
  const chrome = document.querySelector('#standardComparePanel .compare-viewer-chrome');
  const chunk = document.getElementById('viewerChunkBar');
  if (!group || !contentContainer || !(chrome instanceof Element)) return;
  if (chrome.parentElement !== group) {
    group.insertBefore(chrome, contentContainer);
  }
  if (chunk instanceof Element && chunk.parentElement !== group) {
    group.insertBefore(chunk, contentContainer);
  }
}

function restoreCompareChromeFromDock() {
  const panel = document.getElementById('standardComparePanel');
  const monaco = getLegacyMonacoContainer();
  const chrome = document.querySelector('.compare-viewer-chrome');
  const chunk = document.getElementById('viewerChunkBar');
  const dock = getCompareDockRoot();
  if (!panel || !monaco) return;
  const anchor = dock || monaco;
  if (chrome instanceof Element && chrome.parentElement !== panel) {
    panel.insertBefore(chrome, anchor);
  }
  if (chunk instanceof Element && chunk.parentElement !== panel) {
    panel.insertBefore(chunk, anchor);
  }
}

function moveSidebarIntoHistory(host) {
  const sidebar = document.querySelector('.content > .sidebar');
  if (!sidebar || !host) return;
  if (!sidebarRestoreParent) {
    sidebarRestoreParent = sidebar.parentElement;
  }
  host.classList.add('compare-history-host');
  host.appendChild(sidebar);
  sidebar.classList.add('compare-dock-sidebar');
  sidebar.querySelector('.resize-handle')?.classList.add('hidden');
}

function restoreSidebarFromDock() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar || !sidebarRestoreParent) return;
  sidebar.classList.remove('compare-dock-sidebar');
  sidebar.querySelector('.resize-handle')?.classList.remove('hidden');
  sidebarRestoreParent.insertBefore(sidebar, sidebarRestoreParent.firstChild);
  sidebarRestoreParent = null;
}

function syncCompareTabsStateFromDock() {
  if (!dockApi) {
    state.compareTabs = [];
    state.activeCompareTabId = null;
    return;
  }
  const tabs = [];
  for (const panel of dockApi.panels) {
    if (panel.id === HISTORY_PANEL_ID) continue;
    const item = compareDiffWorkbench.getItem(panel.id);
    if (item) tabs.push({ tabId: panel.id, item });
  }
  state.compareTabs = tabs;
  state.activeCompareTabId = dockApi.activePanel?.id && dockApi.activePanel.id !== HISTORY_PANEL_ID
    ? dockApi.activePanel.id
    : null;
  const activeItem = state.activeCompareTabId
    ? compareDiffWorkbench.getItem(state.activeCompareTabId)
    : null;
  state.selectedItem = activeItem;
}

/**
 * @param {string} panelId
 */
export async function activateCompareTab(panelId) {
  if (!dockApi) return;
  const panel = dockApi.getPanel(panelId);
  if (!panel) return;
  if (dockApi.activePanel?.id !== panelId) {
    panel.api.setActive();
  }
  state.activeCompareTabId = panelId;
  state.selectedItem = compareDiffWorkbench.getItem(panelId) || null;
  syncCompareTabsStateFromDock();
  syncListActiveHighlight();
  updateDocumentTitle();
  syncCompareUrlFromState(state, { method: 'replace' });
  await renderEditor({ compareTabId: panelId });
}

/**
 * @param {import('../core/state.js').state.savedItems[0]} item
 * @param {{ forceNew?: boolean }} [opts]
 */
export async function openCompareTab(item, opts = {}) {
  if (!dockApi || !item) return null;
  const forceNew = opts.forceNew === true;

  if (!forceNew && state.activeCompareTabId) {
    const panelId = state.activeCompareTabId;
    const panel = dockApi.getPanel(panelId);
    if (panel) {
      compareDiffWorkbench.upsertTab(panelId, item);
      state.selectedItem = item;
      panel.api.setTitle(getDisplayFileName(item));
      panel.api.updateParameters({ panelId, item });
      await activateCompareTab(panelId);
      return panelId;
    }
  }

  const itemKey = getItemKey(item);
  if (!forceNew) {
    const existing = dockApi.getPanel(itemKey);
    if (existing) {
      compareDiffWorkbench.upsertTab(itemKey, item);
      await activateCompareTab(itemKey);
      return itemKey;
    }
  }

  const panelId = forceNew ? `compare-tab-${++compareTabCounter}` : itemKey;
  compareDiffWorkbench.upsertTab(panelId, item);
  dockApi.addPanel({
    id: panelId,
    component: 'compare-diff',
    tabComponent: COMPARE_DIFF_TAB,
    title: getDisplayFileName(item),
    params: { panelId, item }
  });
  ensureCompareChromeInDock();
  await activateCompareTab(panelId);
  return panelId;
}

/**
 * @param {string} panelId
 */
export async function closeCompareTab(panelId) {
  if (!dockApi || panelId === HISTORY_PANEL_ID) return;
  const panel = dockApi.getPanel(panelId);
  if (!panel) return;
  compareDiffWorkbench.closeTab(panelId);
  dockApi.removePanel(panel);
  syncCompareTabsStateFromDock();
  syncListActiveHighlight();
  updateDocumentTitle();
  syncCompareUrlFromState(state, { method: 'replace' });
  const nextId = state.activeCompareTabId;
  if (nextId) {
    await renderEditor({ compareTabId: nextId });
  } else {
    await renderEditor({ compareTabId: null });
  }
}

/** @param {boolean} visible */
export function setHistoryPanelVisible(visible) {
  if (!dockApi) {
    document.body.classList.toggle('sidebar-collapsed', !visible);
    return;
  }
  try {
    dockApi.setEdgeGroupVisible('left', visible);
  } catch {
    document.body.classList.toggle('sidebar-collapsed', !visible);
  }
}

/** @returns {boolean} */
export function isHistoryPanelVisible() {
  if (!dockApi) return !document.body.classList.contains('sidebar-collapsed');
  try {
    return dockApi.isEdgeGroupVisible('left');
  } catch {
    return !document.body.classList.contains('sidebar-collapsed');
  }
}

function toggleHistoryPanelVisible() {
  setHistoryPanelVisible(!isHistoryPanelVisible());
}

async function persistLayout() {
  if (!dockApi || !scheduleLayoutSave) return;
  const layout = dockApi.toJSON();
  const openTabs = state.compareTabs.map((tab) => ({
    tabId: tab.tabId,
    item: tab.item
  }));
  await saveComparatorDockLayout({
    layout,
    openTabs,
    activeCompareTabId: state.activeCompareTabId,
    historyVisible: isHistoryPanelVisible()
  });
}

function createCompareDiffMount(panelId) {
  const mount = document.createElement('div');
  mount.className = 'compare-diff-mount monaco-container ph-no-capture';
  mount.dataset.compareTabId = panelId;

  const legacyNoOrg = document.getElementById('noOrgMessage');
  if (legacyNoOrg) {
    const noOrg = legacyNoOrg.cloneNode(true);
    noOrg.id = `noOrgMessage-${panelId}`;
    noOrg.classList.remove('hidden');
    mount.appendChild(noOrg);
  }

  const legacyLoading = document.getElementById('fileViewerLoadingBar');
  if (legacyLoading) {
    const loading = legacyLoading.cloneNode(true);
    loading.id = `fileViewerLoadingBar-${panelId}`;
    mount.appendChild(loading);
  }

  return mount;
}

function createCompareDiffPanel() {
  const element = document.createElement('div');
  element.className = 'compare-diff-panel';
  return {
    get element() {
      return element;
    },
    /** @param {{ params?: { panelId?: string } }} params */
    init(params) {
      const panelId = params.params?.panelId || '';
      const mount = createCompareDiffMount(panelId);
      element.replaceChildren(mount);
      compareDiffWorkbench.setMount(panelId, mount);
    }
  };
}

function createCompareHistoryPanel() {
  const element = document.createElement('div');
  return {
    get element() {
      return element;
    },
    init() {
      moveSidebarIntoHistory(element);
    }
  };
}

function createDockComponents() {
  return {
    /**
     * @param {{ name: string }} options
     */
    createComponent: (options) => {
      if (options.name === 'compare-history') {
        return createCompareHistoryPanel();
      }
      if (options.name === 'compare-diff') {
        return createCompareDiffPanel();
      }
      const element = document.createElement('div');
      return {
        get element() {
          return element;
        },
        init() {
          element.textContent = '';
        }
      };
    }
  };
}

async function restoreOpenTabs(saved) {
  const openTabs = Array.isArray(saved?.openTabs) ? saved.openTabs : [];
  for (const entry of openTabs) {
    if (!entry?.item || !entry?.tabId) continue;
    compareDiffWorkbench.upsertTab(entry.tabId, entry.item);
    if (!dockApi?.getPanel(entry.tabId)) {
      dockApi?.addPanel({
        id: entry.tabId,
        component: 'compare-diff',
        tabComponent: COMPARE_DIFF_TAB,
        title: getDisplayFileName(entry.item),
        params: { panelId: entry.tabId, item: entry.item }
      });
    }
  }
  const activeId = saved?.activeCompareTabId;
  if (activeId && dockApi?.getPanel(activeId)) {
    await activateCompareTab(activeId);
  } else if (state.selectedItem) {
    await openCompareTab(state.selectedItem, { forceNew: false });
  }
}

export async function mountCompareDock() {
  if (mounted) return;
  const root = getCompareDockRoot();
  const legacyMonaco = getLegacyMonacoContainer();
  if (!root) return;

  root.classList.remove('hidden');
  root.removeAttribute('aria-hidden');
  root.className = `compare-dock-root ${sfocDockviewThemeClass()}`;
  legacyMonaco?.classList.add('hidden');
  document.body.classList.add('comparator-dock-active');

  dockApi = createDockview(root, {
    ...createDockComponents(),
    createTabComponent: createCompareDockTabComponent,
    defaultTabComponent: COMPARE_DIFF_TAB,
    className: sfocDockviewThemeClass(),
    disableFloatingGroups: true,
    hideBorders: false,
    singleTabMode: 'fullwidth'
  });

  scheduleLayoutSave = debounceLayoutSave(() => {
    void persistLayout();
  });

  dockApi.onDidLayoutChange(() => scheduleLayoutSave?.());
  dockApi.onDidActivePanelChange((event) => {
    const id = event.panel?.id;
    if (!id || id === HISTORY_PANEL_ID) return;
    syncCompareTabsStateFromDock();
    syncListActiveHighlight();
    updateDocumentTitle();
    syncCompareUrlFromState(state, { method: 'replace' });
    void renderEditor({ compareTabId: id });
  });
  dockApi.onDidRemovePanel((panel) => {
    if (panel.id === HISTORY_PANEL_ID) return;
    compareDiffWorkbench.closeTab(panel.id);
    syncCompareTabsStateFromDock();
  });

  dockApi.addEdgeGroup('left', {
    id: HISTORY_EDGE_ID,
    initialSize: 300,
    minimumSize: 200,
    collapsed: false
  });

  dockApi.addPanel({
    id: HISTORY_PANEL_ID,
    component: 'compare-history',
    title: t('code.ariaCompareList'),
    position: {
      referenceGroup: HISTORY_EDGE_ID,
      direction: 'within'
    }
  });

  const saved = await loadComparatorDockLayout();

  if (typeof saved?.historyVisible === 'boolean') {
    setHistoryPanelVisible(saved.historyVisible);
  }

  mounted = true;

  if (saved?.openTabs?.length) {
    await restoreOpenTabs(saved);
  } else if (state.selectedItem) {
    await openCompareTab(state.selectedItem, { forceNew: false });
  }

  ensureCompareChromeInDock();
  scheduleLayoutSave();
}

export function unmountCompareDock() {
  if (!mounted) return;
  restoreCompareChromeFromDock();
  compareDiffWorkbench.disposeAll();
  restoreSidebarFromDock();
  dockApi?.dispose();
  dockApi = null;
  scheduleLayoutSave = null;
  mounted = false;

  const root = getCompareDockRoot();
  root?.classList.add('hidden');
  root?.setAttribute('aria-hidden', 'true');
  if (root) root.replaceChildren();

  getLegacyMonacoContainer()?.classList.remove('hidden');
  document.body.classList.remove('comparator-dock-active');

  state.compareTabs = [];
  state.activeCompareTabId = null;
}

export function setupCompareDockToggle() {
  const toggleBtn = document.getElementById('toggleSidebarBtn');
  if (!toggleBtn || toggleBtn.dataset.compareDockToggle === '1') return;
  toggleBtn.dataset.compareDockToggle = '1';
  toggleBtn.addEventListener('click', () => {
    if (!isCompareDockActive()) {
      document.body.classList.toggle('sidebar-collapsed');
      return;
    }
    toggleHistoryPanelVisible();
    scheduleLayoutSave?.();
  });
}
