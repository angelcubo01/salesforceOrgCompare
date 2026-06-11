import { DEFAULT_FEATURE_CONTROLS, parseFeatureControlsPayload } from './featureControls.js';

export const FEATURE_CONTROLS_STORAGE_KEY = 'sfocFeatureControlsCache';

/** @type {import('./featureControls.js').FeatureControlsConfig | null} */
let memoryCache = null;

/**
 * @param {import('./featureControls.js').FeatureControlsConfig} config
 */
export async function writeFeatureControlsCache(config) {
  memoryCache = config;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [FEATURE_CONTROLS_STORAGE_KEY]: config });
    }
  } catch {
    /* ignore */
  }
}

/**
 * @returns {Promise<import('./featureControls.js').FeatureControlsConfig>}
 */
export async function readFeatureControlsCache() {
  if (memoryCache) return memoryCache;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const result = await chrome.storage.local.get(FEATURE_CONTROLS_STORAGE_KEY);
      const raw = result[FEATURE_CONTROLS_STORAGE_KEY];
      if (raw) {
        memoryCache = parseFeatureControlsPayload(raw);
        return memoryCache;
      }
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_FEATURE_CONTROLS, modes: {}, tools: {}, metadataTypes: {}, actions: {} };
}

/** Hidrata caché en memoria (service worker al arrancar). */
export async function hydrateFeatureControlsCache() {
  return readFeatureControlsCache();
}

/** Para tests. */
export function resetFeatureControlsCacheForTests() {
  memoryCache = null;
}

/**
 * @param {import('./featureControls.js').FeatureControlsConfig} config
 */
export function setFeatureControlsMemoryCache(config) {
  memoryCache = config;
}
