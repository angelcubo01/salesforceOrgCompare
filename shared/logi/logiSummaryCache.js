/**
 * Cache of one-shot Logi summaries keyed by session (orgId::logId).
 * Stored in chrome.storage.session when available, else memory.
 */

export const LOGI_SUMMARY_STORAGE_KEY = 'sfocLogiSummaries';

const MAX_SUMMARIES = 30;

/** @type {Record<string, LogiSummaryEntry>} */
let memoryStore = Object.create(null);

/**
 * @typedef {object} LogiSummaryEntry
 * @property {string} text
 * @property {number} updatedAt
 * @property {'ready' | 'error'} status
 * @property {string} [errorReason]
 */

/**
 * @param {string} key
 * @returns {Promise<LogiSummaryEntry | null>}
 */
export async function readLogiSummary(key) {
  if (!key) return null;
  if (memoryStore[key]) return memoryStore[key];
  try {
    const storage = typeof chrome !== 'undefined' ? chrome.storage?.session || chrome.storage?.local : null;
    if (!storage) return null;
    const bag = await storage.get(LOGI_SUMMARY_STORAGE_KEY);
    const store = bag[LOGI_SUMMARY_STORAGE_KEY];
    if (store && typeof store === 'object' && store[key]) {
      const entry = normalizeEntry(store[key]);
      if (entry) {
        memoryStore[key] = entry;
        return entry;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {string} key
 * @param {LogiSummaryEntry} entry
 */
export async function writeLogiSummary(key, entry) {
  if (!key || !entry) return;
  const normalized = normalizeEntry(entry);
  if (!normalized) return;
  memoryStore[key] = normalized;
  try {
    const storage = typeof chrome !== 'undefined' ? chrome.storage?.session || chrome.storage?.local : null;
    if (!storage) return;
    const bag = await storage.get(LOGI_SUMMARY_STORAGE_KEY);
    /** @type {Record<string, LogiSummaryEntry>} */
    const store = bag[LOGI_SUMMARY_STORAGE_KEY] && typeof bag[LOGI_SUMMARY_STORAGE_KEY] === 'object'
      ? { ...bag[LOGI_SUMMARY_STORAGE_KEY] }
      : {};
    store[key] = normalized;
    pruneStore(store);
    await storage.set({ [LOGI_SUMMARY_STORAGE_KEY]: store });
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} key
 */
export async function clearLogiSummary(key) {
  if (!key) return;
  delete memoryStore[key];
  try {
    const storage = typeof chrome !== 'undefined' ? chrome.storage?.session || chrome.storage?.local : null;
    if (!storage) return;
    const bag = await storage.get(LOGI_SUMMARY_STORAGE_KEY);
    if (!bag[LOGI_SUMMARY_STORAGE_KEY] || typeof bag[LOGI_SUMMARY_STORAGE_KEY] !== 'object') return;
    const store = { ...bag[LOGI_SUMMARY_STORAGE_KEY] };
    delete store[key];
    await storage.set({ [LOGI_SUMMARY_STORAGE_KEY]: store });
  } catch {
    /* ignore */
  }
}

/**
 * @param {unknown} raw
 * @returns {LogiSummaryEntry | null}
 */
function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const text = typeof o.text === 'string' ? o.text : '';
  const status = o.status === 'error' ? 'error' : 'ready';
  const updatedAt = Number(o.updatedAt) || Date.now();
  /** @type {LogiSummaryEntry} */
  const entry = { text, status, updatedAt };
  if (typeof o.errorReason === 'string' && o.errorReason) entry.errorReason = o.errorReason;
  return entry;
}

/**
 * @param {Record<string, LogiSummaryEntry>} store
 */
function pruneStore(store) {
  const keys = Object.keys(store);
  if (keys.length <= MAX_SUMMARIES) return;
  keys
    .sort((a, b) => (store[a].updatedAt || 0) - (store[b].updatedAt || 0))
    .slice(0, keys.length - MAX_SUMMARIES)
    .forEach((k) => {
      delete store[k];
    });
}

export function resetLogiSummariesForTests() {
  memoryStore = Object.create(null);
}
