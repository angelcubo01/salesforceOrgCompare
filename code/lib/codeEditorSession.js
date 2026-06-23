/** @typedef {'QuickEdit' | 'LightningQuickEdit' | 'AnonymousApex'} CodeEditorTool */

import { getCodeEditorPersistenceEnabled, getCodeEditorMaxTabs } from '../../shared/extensionSettings.js';

export const CODE_EDITOR_SESSION_KEYS = Object.freeze({
  QuickEdit: 'sfocQuickEditSession',
  LightningQuickEdit: 'sfocLightningQuickEditSession',
  AnonymousApex: 'sfocAnonymousApexSession'
});

/** @param {CodeEditorTool} tool */
export function isQuickEditStorageTool(tool) {
  return tool === 'QuickEdit' || tool === 'LightningQuickEdit';
}

/** @param {CodeEditorTool} tool */
function canPersistCodeEditorSession(tool) {
  if (!isQuickEditStorageTool(tool)) return true;
  return getCodeEditorPersistenceEnabled();
}

export function getMaxCodeEditorTabs() {
  return getCodeEditorMaxTabs();
}

/** @deprecated Use getMaxCodeEditorTabs() */
export const MAX_CODE_EDITOR_TABS = 15;

/**
 * @param {string} [prefix]
 * @returns {string}
 */
export function createTabId(prefix = 'tab') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Garantiza ids únicos por pestaña (sesiones legacy podían reutilizar el mismo id).
 * @template {object} T
 * @param {T[]} tabs
 * @param {string} prefix
 * @param {string | null | undefined} activeTabId
 * @returns {{ tabs: T[], activeTabId: string | null }}
 */
export function ensureUniqueEditorTabIds(tabs, prefix, activeTabId) {
  if (!Array.isArray(tabs) || tabs.length === 0) {
    return { tabs: [], activeTabId: activeTabId ? String(activeTabId) : null };
  }

  const seen = new Set();
  const out = tabs.map((tab) => {
    let id = String(tab?.id || '');
    if (!id || seen.has(id)) {
      id = createTabId(prefix);
    }
    seen.add(id);
    return { ...tab, id };
  });

  const nextActive = activeTabId ? String(activeTabId) : null;
  if (nextActive && !out.some((t) => t.id === nextActive)) {
    return { tabs: out, activeTabId: out[0]?.id ? String(out[0].id) : null };
  }
  return { tabs: out, activeTabId: nextActive };
}

/**
 * @param {CodeEditorTool} tool
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function loadCodeEditorSession(tool) {
  const key = CODE_EDITOR_SESSION_KEYS[tool];
  if (!key) return null;
  if (!canPersistCodeEditorSession(tool)) return null;
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
    if (!canPersistCodeEditorSession(tool)) return;
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
  if (!canPersistCodeEditorSession(tool)) return;
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
export function flushCodeEditorSessionPersist(tool, persistFn) {
  const timers = scheduleCodeEditorSessionPersist._timers;
  if (timers?.has(tool)) {
    clearTimeout(timers.get(tool));
    timers.delete(tool);
  }
  if (!canPersistCodeEditorSession(tool)) return;
  try {
    void persistFn();
  } catch {
    /* ignore */
  }
}

/**
 * @param {CodeEditorTool} tool
 * @param {() => void | Promise<void>} persistFn
 */
export function setupCodeEditorSessionPersistence(tool, persistFn) {
  const persist = () => flushCodeEditorSessionPersist(tool, persistFn);
  window.addEventListener('pagehide', persist, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist();
  });
}

/** Borra sesiones persistidas de Quick Edit y Lightning Quick Edit. */
export async function clearQuickEditEditorSessions() {
  await clearCodeEditorSession('QuickEdit');
  await clearCodeEditorSession('LightningQuickEdit');
}

/**
 * @param {unknown[]} tabs
 * @returns {unknown[]}
 */
export function trimTabsToLimit(tabs) {
  if (!Array.isArray(tabs)) return [];
  return tabs.slice(0, getCodeEditorMaxTabs());
}

/**
 * @param {string} content
 * @param {string} originalContent
 * @returns {boolean}
 */
export function isTabContentDirty(content, originalContent) {
  return String(content ?? '') !== String(originalContent ?? '');
}

/**
 * Resuelve sourceOrgId de una pestaña restaurada (migración de sesiones legacy).
 * No usa el selector actual: una pestaña sin org explícita solo hereda la org de la sesión guardada.
 * @param {string | null | undefined} tabSourceOrgId
 * @param {string | null | undefined} sessionOrgId
 * @returns {string | null}
 */
export function resolveStoredTabSourceOrgId(tabSourceOrgId, sessionOrgId) {
  if (tabSourceOrgId != null && String(tabSourceOrgId) !== '') return String(tabSourceOrgId);
  if (sessionOrgId != null && String(sessionOrgId) !== '') return String(sessionOrgId);
  return null;
}

/**
 * Marca contenido como guardado localmente (baseline = contenido actual).
 * @param {string} content
 * @returns {{ content: string, originalContent: string }}
 */
export function commitTabContentAsSaved(content) {
  const saved = String(content ?? '');
  return { content: saved, originalContent: saved };
}

/**
 * Marca de tiempo ISO para guardado local en la extensión.
 * @returns {string}
 */
export function createLocalSaveTimestamp() {
  return new Date().toISOString();
}

/**
 * @param {{ localSavedAt?: string | null }} tab
 * @returns {boolean}
 */
export function hasTabLocalSave(tab) {
  if (!getCodeEditorPersistenceEnabled()) return false;
  return !!tab?.localSavedAt;
}

/**
 * @param {{ files?: Array<{ localSavedAt?: string | null }> }} tab
 * @returns {boolean}
 */
export function hasBundleTabLocalSave(tab) {
  if (!getCodeEditorPersistenceEnabled()) return false;
  return (tab?.files || []).some((f) => !!f.localSavedAt);
}

/**
 * @param {{ files?: Array<{ content?: string }> }} tab
 * @returns {boolean}
 */
export function isBundleTabContentEmpty(tab) {
  const files = tab?.files || [];
  if (!files.length) return true;
  return !files.some((f) => String(f.content ?? '').trim());
}

/**
 * Restaura contenido al baseline guardado.
 * @param {string} originalContent
 * @returns {{ content: string, originalContent: string }}
 */
export function revertContentToBaseline(originalContent) {
  const baseline = String(originalContent ?? '');
  return { content: baseline, originalContent: baseline };
}
