import { isLogiCustomQuickActionId, isLogiQuickActionId } from './apexLogAiContext.js';
import { LOGI_QUICK_ACTION_IDS } from './apexLogAiAdvisorConfig.js';

export const LOGI_QUICK_ACTION_PROMPTS_KEY = 'sfoc_logi_quick_action_prompts';
export const LOGI_CUSTOM_QUICK_ACTIONS_MAX = 24;

/** @typedef {'es' | 'en'} LogiPromptLang */

/** @typedef {Record<LogiPromptLang, Record<string, string>>} LogiQuickActionPromptStore */

/**
 * @typedef {{ id: string, labels: Record<LogiPromptLang, string> }} LogiCustomQuickAction
 */

/**
 * @typedef {{ customActions: LogiCustomQuickAction[], prompts: LogiQuickActionPromptStore }} LogiQuickActionFullStore
 */

/** @type {LogiQuickActionFullStore} */
let cache = { customActions: [], prompts: { es: {}, en: {} } };

/**
 * @param {unknown} labels
 * @returns {Record<LogiPromptLang, string>}
 */
function normalizeCustomLabels(labels) {
  const src = labels && typeof labels === 'object' ? /** @type {Record<string, unknown>} */ (labels) : {};
  const es = typeof src.es === 'string' ? src.es.trim().slice(0, 40) : '';
  const en = typeof src.en === 'string' ? src.en.trim().slice(0, 40) : '';
  const fallback = es || en || 'Custom';
  return { es: es || fallback, en: en || fallback };
}

/**
 * @param {unknown} raw
 * @returns {LogiQuickActionPromptStore}
 */
function normalizePromptBuckets(raw) {
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

/**
 * @param {unknown} raw
 * @returns {LogiCustomQuickAction[]}
 */
function normalizeCustomActions(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {LogiCustomQuickAction[]} */
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = /** @type {Record<string, unknown>} */ (item);
    const id = typeof rec.id === 'string' ? rec.id.trim() : '';
    if (!isLogiCustomQuickActionId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, labels: normalizeCustomLabels(rec.labels) });
    if (out.length >= LOGI_CUSTOM_QUICK_ACTIONS_MAX) break;
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {LogiQuickActionFullStore}
 */
export function normalizeLogiQuickActionFullStore(raw) {
  const src = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  if (Array.isArray(src.customActions) || (src.prompts && typeof src.prompts === 'object')) {
    return {
      customActions: normalizeCustomActions(src.customActions),
      prompts: normalizePromptBuckets(src.prompts)
    };
  }
  return {
    customActions: [],
    prompts: normalizePromptBuckets(src)
  };
}

/**
 * @param {unknown} raw
 * @returns {LogiQuickActionPromptStore}
 */
export function normalizeLogiQuickActionPromptStore(raw) {
  return normalizeLogiQuickActionFullStore(raw).prompts;
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

function cloneFullStore(store) {
  return {
    customActions: store.customActions.map((a) => ({
      id: a.id,
      labels: { es: a.labels.es, en: a.labels.en }
    })),
    prompts: clonePromptStore(store.prompts)
  };
}

async function persistStore() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [LOGI_QUICK_ACTION_PROMPTS_KEY]: cache });
    }
  } catch {
    /* ignore */
  }
}

export async function loadLogiQuickActionPrompts() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const r = await chrome.storage.local.get(LOGI_QUICK_ACTION_PROMPTS_KEY);
      cache = normalizeLogiQuickActionFullStore(r[LOGI_QUICK_ACTION_PROMPTS_KEY]);
    } else {
      cache = normalizeLogiQuickActionFullStore({});
    }
  } catch {
    cache = normalizeLogiQuickActionFullStore({});
  }
  return clonePromptStore(cache.prompts);
}

export function getLogiQuickActionPromptsSnapshot() {
  return clonePromptStore(cache.prompts);
}

export function getLogiCustomQuickActionsSnapshot() {
  return cache.customActions.map((a) => ({
    id: a.id,
    labels: { es: a.labels.es, en: a.labels.en }
  }));
}

/**
 * @param {string} actionId
 * @param {LogiPromptLang} lang
 * @param {string | null | undefined} text null removes override
 */
export async function saveLogiQuickActionPrompt(actionId, lang, text) {
  if (!isLogiQuickActionId(actionId)) return clonePromptStore(cache.prompts);
  const bucket = lang === 'en' ? cache.prompts.en : cache.prompts.es;
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (trimmed) bucket[actionId] = trimmed.slice(0, 12_000);
  else delete bucket[actionId];
  await persistStore();
  return clonePromptStore(cache.prompts);
}

/**
 * @param {{ labels: Record<LogiPromptLang, string>, prompt: string, lang: LogiPromptLang }} input
 */
export async function createLogiCustomQuickAction(input) {
  if (cache.customActions.length >= LOGI_CUSTOM_QUICK_ACTIONS_MAX) {
    return { ok: false, error: 'limit' };
  }
  const label = String(input.labels?.[input.lang] || input.labels?.es || input.labels?.en || '').trim();
  const prompt = String(input.prompt || '').trim();
  if (!label || !prompt) return { ok: false, error: 'empty' };

  const id = `custom_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const labels = normalizeCustomLabels({
    es: input.lang === 'es' ? label : input.labels?.es || label,
    en: input.lang === 'en' ? label : input.labels?.en || label
  });
  cache.customActions.push({ id, labels });
  cache.prompts[input.lang][id] = prompt.slice(0, 12_000);
  const otherLang = input.lang === 'en' ? 'es' : 'en';
  if (!cache.prompts[otherLang][id]) {
    cache.prompts[otherLang][id] = prompt.slice(0, 12_000);
  }
  await persistStore();
  return { ok: true, id };
}

/**
 * @param {string} actionId
 * @param {Record<LogiPromptLang, string>} labels
 */
export async function saveLogiCustomQuickActionLabels(actionId, labels) {
  if (!isLogiCustomQuickActionId(actionId)) return getLogiCustomQuickActionsSnapshot();
  const idx = cache.customActions.findIndex((a) => a.id === actionId);
  if (idx < 0) return getLogiCustomQuickActionsSnapshot();
  cache.customActions[idx] = {
    id: actionId,
    labels: normalizeCustomLabels(labels)
  };
  await persistStore();
  return getLogiCustomQuickActionsSnapshot();
}

/**
 * @param {string} actionId
 */
export async function deleteLogiCustomQuickAction(actionId) {
  if (!isLogiCustomQuickActionId(actionId)) return clonePromptStore(cache.prompts);
  cache.customActions = cache.customActions.filter((a) => a.id !== actionId);
  delete cache.prompts.es[actionId];
  delete cache.prompts.en[actionId];
  await persistStore();
  return clonePromptStore(cache.prompts);
}

/**
 * @param {unknown} data
 * @param {{ replace?: boolean }} [opts]
 */
export async function importLogiQuickActionPromptStore(data, opts = {}) {
  const root = data && typeof data === 'object' ? /** @type {Record<string, unknown>} */ (data) : {};
  const incoming = normalizeLogiQuickActionFullStore(
    root.prompts != null || root.customActions != null ? data : root
  );
  if (opts.replace) {
    cache = incoming;
  } else {
    const mergedIds = new Set(cache.customActions.map((a) => a.id));
    for (const action of incoming.customActions) {
      if (mergedIds.has(action.id)) continue;
      cache.customActions.push(action);
      mergedIds.add(action.id);
    }
    for (const lang of /** @type {LogiPromptLang[]} */ (['es', 'en'])) {
      cache.prompts[lang] = { ...cache.prompts[lang], ...incoming.prompts[lang] };
    }
  }
  await persistStore();
  return clonePromptStore(cache.prompts);
}

export function buildLogiQuickActionPromptsExport() {
  return {
    formatVersion: 2,
    exportedAt: new Date().toISOString(),
    actionIds: [...LOGI_QUICK_ACTION_IDS],
    customActions: getLogiCustomQuickActionsSnapshot(),
    prompts: clonePromptStore(cache.prompts)
  };
}

/** Para tests. */
export function resetLogiQuickActionPromptsForTests() {
  cache = { customActions: [], prompts: { es: {}, en: {} } };
}
