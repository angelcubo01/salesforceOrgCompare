/** @typedef {'QuickEdit' | 'LightningQuickEdit' | 'AnonymousApex'} CodeEditorTool */

export const CODE_EDITOR_SESSION_KEYS = Object.freeze({
  QuickEdit: 'sfocQuickEditSession',
  LightningQuickEdit: 'sfocLightningQuickEditSession',
  AnonymousApex: 'sfocAnonymousApexSession'
});

export const MAX_CODE_EDITOR_TABS = 15;

/**
 * @param {string} [prefix]
 * @returns {string}
 */
export function createTabId(prefix = 'tab') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @param {CodeEditorTool} tool
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function loadCodeEditorSession(tool) {
  const key = CODE_EDITOR_SESSION_KEYS[tool];
  if (!key) return null;
  try {
    const res = await chrome.storage.local.get(key);
    const session = res[key];
    return session && typeof session === 'object' ? session : null;
  } catch {
    return null;
  }
}

/**
 * @param {CodeEditorTool} tool
 * @param {Record<string, unknown> | null} session
 */
export async function saveCodeEditorSession(tool, session) {
  const key = CODE_EDITOR_SESSION_KEYS[tool];
  if (!key) return;
  try {
    if (!session || !Array.isArray(session.tabs) || session.tabs.length === 0) {
      await chrome.storage.local.remove(key);
      return;
    }
    await chrome.storage.local.set({ [key]: session });
  } catch {
    /* ignore quota errors */
  }
}

/**
 * @param {CodeEditorTool} tool
 * @param {() => void | Promise<void>} persistFn
 * @param {number} [delayMs]
 */
export function scheduleCodeEditorSessionPersist(tool, persistFn, delayMs = 800) {
  const timers = scheduleCodeEditorSessionPersist._timers || (scheduleCodeEditorSessionPersist._timers = new Map());
  const prev = timers.get(tool);
  if (prev) clearTimeout(prev);
  timers.set(
    tool,
    setTimeout(() => {
      timers.delete(tool);
      void persistFn();
    }, delayMs)
  );
}

/**
 * @param {CodeEditorTool} tool
 */
export async function clearCodeEditorSession(tool) {
  const timers = scheduleCodeEditorSessionPersist._timers;
  if (timers?.has(tool)) {
    clearTimeout(timers.get(tool));
    timers.delete(tool);
  }
  await saveCodeEditorSession(tool, null);
}

/**
 * @param {string | null | undefined} storedOrgId
 * @param {string | null | undefined} currentOrgId
 */
export function codeEditorSessionOrgMismatch(storedOrgId, currentOrgId) {
  if (!storedOrgId || !currentOrgId) return false;
  return String(storedOrgId) !== String(currentOrgId);
}

/**
 * @param {Record<string, unknown> | null | undefined} session
 * @returns {boolean}
 */
export function hasStoredCodeEditorTabs(session) {
  return !!(session && Array.isArray(session.tabs) && session.tabs.length > 0);
}

/**
 * @param {CodeEditorTool} tool
 * @param {() => void | Promise<void>} persistFn
 */
export function setupCodeEditorSessionPersistence(tool, persistFn) {
  const persist = () => {
    try {
      void persistFn();
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('pagehide', persist, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist();
  });
}

/**
 * @param {unknown[]} tabs
 * @returns {unknown[]}
 */
export function trimTabsToLimit(tabs) {
  if (!Array.isArray(tabs)) return [];
  return tabs.slice(0, MAX_CODE_EDITOR_TABS);
}

/**
 * @param {string} content
 * @param {string} originalContent
 * @returns {boolean}
 */
export function isTabContentDirty(content, originalContent) {
  return String(content ?? '') !== String(originalContent ?? '');
}
