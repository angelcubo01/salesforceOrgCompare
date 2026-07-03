/** @typedef {import('../../vendor/dockview-core/dockview-core.esm.mjs').DockviewApi} DockviewApi */
/** @typedef {import('../../vendor/dockview-core/dockview-core.esm.mjs').PaneviewApi} PaneviewApi */

export const COMPARATOR_DOCK_STORAGE_KEY = 'dockviewLayout.comparator';

/**
 * @param {string} [suffix]
 */
export function sfocDockviewThemeClass(suffix = '') {
  const base = 'dockview-theme-abyss sfoc-dockview';
  return suffix ? `${base} ${suffix}`.trim() : base;
}

/**
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function loadComparatorDockLayout() {
  try {
    const data = await chrome.storage.local.get(COMPARATOR_DOCK_STORAGE_KEY);
    const raw = data?.[COMPARATOR_DOCK_STORAGE_KEY];
    if (!raw || typeof raw !== 'object') return null;
    return /** @type {Record<string, unknown>} */ (raw);
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, unknown>} payload
 */
export async function saveComparatorDockLayout(payload) {
  try {
    await chrome.storage.local.set({ [COMPARATOR_DOCK_STORAGE_KEY]: payload });
  } catch {
    /* ignore quota / extension context */
  }
}

/**
 * @param {() => void} fn
 * @param {number} [ms]
 */
export function debounceLayoutSave(fn, ms = 400) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}
