export const WORKBENCH_PREFS_KEY = 'sfocWorkbenchPrefs';

export const DEFAULT_WORKBENCH_PREFS = Object.freeze({
  panelExpanded: true,
  panelPinned: false,
  lastTabByWorkspace: {}
});

export function normalizeWorkbenchPrefs(raw) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const rawTabs = value.lastTabByWorkspace;
  const lastTabByWorkspace = {};
  if (rawTabs && typeof rawTabs === 'object' && !Array.isArray(rawTabs)) {
    for (const [workspaceId, tabId] of Object.entries(rawTabs)) {
      if (typeof workspaceId === 'string' && typeof tabId === 'string' && workspaceId && tabId) {
        lastTabByWorkspace[workspaceId] = tabId;
      }
    }
  }
  return {
    panelExpanded: value.panelExpanded !== false,
    panelPinned: value.panelPinned === true,
    lastTabByWorkspace
  };
}

function storageAreaOrDefault(storageArea) {
  return storageArea || (typeof chrome !== 'undefined' ? chrome.storage?.local : null);
}

export async function loadWorkbenchPrefs(storageArea) {
  const area = storageAreaOrDefault(storageArea);
  if (!area?.get) return normalizeWorkbenchPrefs(null);
  try {
    const result = await area.get(WORKBENCH_PREFS_KEY);
    return normalizeWorkbenchPrefs(result?.[WORKBENCH_PREFS_KEY]);
  } catch {
    return normalizeWorkbenchPrefs(null);
  }
}

export async function saveWorkbenchPrefs(prefs, storageArea) {
  const normalized = normalizeWorkbenchPrefs(prefs);
  const area = storageAreaOrDefault(storageArea);
  if (area?.set) await area.set({ [WORKBENCH_PREFS_KEY]: normalized });
  return normalized;
}

