import { isLogiQuickActionId } from './apexLogAiContext.js';
import { LOGI_QUICK_ACTION_IDS } from './apexLogAiAdvisorConfig.js';

export const LOGI_QUICK_ACTION_PROMPTS_KEY = 'sfoc_logi_quick_action_prompts';

/** @typedef {'es' | 'en'} LogiPromptLang */

/** @typedef {Record<LogiPromptLang, Record<string, string>>} LogiQuickActionPromptStore */

/** @type {LogiQuickActionPromptStore} */
let cache = { es: {}, en: {} };

/**
 * @param {unknown} raw
 * @returns {LogiQuickActionPromptStore}
 */
export function normalizeLogiQuickActionPromptStore(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const record = /** @type {Record<string, unknown>} */ (src);
  /** @type {LogiQuickActionPromptStore} */
  const out = { es: {}, en: {} };
  for (const lang of /** @type {LogiPromptLang[]} */ (['es', 'en'])) {
    const bucket = record[lang];
    if (!bucket || typeof bucket !== 'object') continue;
    for (const [actionId, text] of Object.entries(/** @type {Record<string, unknown>} */ (bucket))) {
      if (!isLogiQuickActionId(actionId)) continue;
      const s = typeof text === 'string' ? text.trim() : '';
      if (s) out[lang][actionId] = s.slice(0, 12_000);
    }
  }
  return out;
}

export async function loadLogiQuickActionPrompts() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const r = await chrome.storage.local.get(LOGI_QUICK_ACTION_PROMPTS_KEY);
      cache = normalizeLogiQuickActionPromptStore(r[LOGI_QUICK_ACTION_PROMPTS_KEY]);
    } else {
      cache = normalizeLogiQuickActionPromptStore({});
    }
  } catch {
    cache = normalizeLogiQuickActionPromptStore({});
  }
  return clonePromptStore(cache);
}

/**
 * @param {LogiQuickActionPromptStore} store
 */
function clonePromptStore(store) {
  return {
    es: { ...store.es },
    en: { ...store.en }
  };
}

export function getLogiQuickActionPromptsSnapshot() {
  return clonePromptStore(cache);
}

/**
 * @param {string} actionId
 * @param {LogiPromptLang} lang
 * @param {string | null | undefined} text null removes override
 */
export async function saveLogiQuickActionPrompt(actionId, lang, text) {
  if (!isLogiQuickActionId(actionId)) return clonePromptStore(cache);
  const bucket = lang === 'en' ? cache.en : cache.es;
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (trimmed) bucket[actionId] = trimmed.slice(0, 12_000);
  else delete bucket[actionId];
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [LOGI_QUICK_ACTION_PROMPTS_KEY]: cache });
    }
  } catch {
    /* ignore */
  }
  return clonePromptStore(cache);
}

/**
 * @param {unknown} data
 * @param {{ replace?: boolean }} [opts]
 */
export async function importLogiQuickActionPromptStore(data, opts = {}) {
  const incoming = normalizeLogiQuickActionPromptStore(
    data && typeof data === 'object' && 'prompts' in /** @type {object} */ (data)
      ? /** @type {{ prompts?: unknown }} */ (data).prompts
      : data
  );
  if (opts.replace) {
    cache = incoming;
  } else {
    for (const lang of /** @type {LogiPromptLang[]} */ (['es', 'en'])) {
      cache[lang] = { ...cache[lang], ...incoming[lang] };
    }
  }
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [LOGI_QUICK_ACTION_PROMPTS_KEY]: cache });
    }
  } catch {
    /* ignore */
  }
  return clonePromptStore(cache);
}

export function buildLogiQuickActionPromptsExport() {
  return {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    actionIds: [...LOGI_QUICK_ACTION_IDS],
    prompts: clonePromptStore(cache)
  };
}

/** Para tests. */
export function resetLogiQuickActionPromptsForTests() {
  cache = { es: {}, en: {} };
}
