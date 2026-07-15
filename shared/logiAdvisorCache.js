import { DEFAULT_LOGI_ADVISOR_CONFIG, parseLogiAdvisorConfig } from './apexLogAiAdvisorConfig.js';

export const LOGI_ADVISOR_STORAGE_KEY = 'sfocLogiAdvisorCache';

/** @type {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig | null} */
let memoryCache = null;

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[LOGI_ADVISOR_STORAGE_KEY]) return;
    const raw = changes[LOGI_ADVISOR_STORAGE_KEY].newValue;
    memoryCache = raw ? parseLogiAdvisorConfig(raw) : null;
  });
}

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 */
function sanitizeLogiAdvisorConfigForStorage(config) {
  return config ? { ...config, proxyAuthToken: null } : config;
}

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 */
export async function writeLogiAdvisorCache(config) {
  const sanitized = sanitizeLogiAdvisorConfigForStorage(config);
  memoryCache = sanitized;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [LOGI_ADVISOR_STORAGE_KEY]: sanitized });
    }
  } catch {
    /* ignore */
  }
}

/** Borra la config operacional cuando el feature flag está desactivado. */
export async function clearLogiAdvisorCache() {
  const disabled = { ...DEFAULT_LOGI_ADVISOR_CONFIG };
  memoryCache = disabled;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [LOGI_ADVISOR_STORAGE_KEY]: disabled });
    }
  } catch {
    /* ignore */
  }
  return disabled;
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

/** Fuerza lectura desde chrome.storage (evita memoria obsoleta en el SW). */
export async function readLogiAdvisorCacheFresh() {
  memoryCache = null;
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
