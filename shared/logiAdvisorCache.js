import { DEFAULT_LOGI_ADVISOR_CONFIG, parseLogiAdvisorConfig } from './apexLogAiAdvisorConfig.js';

export const LOGI_ADVISOR_STORAGE_KEY = 'sfocLogiAdvisorCache';

/** @type {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig | null} */
let memoryCache = null;

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 */
export async function writeLogiAdvisorCache(config) {
  memoryCache = config;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [LOGI_ADVISOR_STORAGE_KEY]: config });
    }
  } catch {
    /* ignore */
  }
}

/**
 * @returns {Promise<import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig>}
 */
export async function readLogiAdvisorCache() {
  if (memoryCache) return memoryCache;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const result = await chrome.storage.local.get(LOGI_ADVISOR_STORAGE_KEY);
      const raw = result[LOGI_ADVISOR_STORAGE_KEY];
      if (raw) {
        memoryCache = parseLogiAdvisorConfig(raw);
        return memoryCache;
      }
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_LOGI_ADVISOR_CONFIG };
}

/** Hidrata caché en memoria (service worker al arrancar). */
export async function hydrateLogiAdvisorCache() {
  return readLogiAdvisorCache();
}

/** Para tests. */
export function resetLogiAdvisorCacheForTests() {
  memoryCache = null;
}

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 */
export function setLogiAdvisorMemoryCache(config) {
  memoryCache = config;
}
