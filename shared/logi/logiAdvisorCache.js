import {
  DEFAULT_LOGI_ADVISOR_CONFIG,
  isLogiAdvisorOperational,
  parseLogiAdvisorConfig
} from './apexLogAiAdvisorConfig.js';

export const LOGI_ADVISOR_STORAGE_KEY = 'sfocLogiAdvisorCache';

/** Ventana compartida para comprobar acceso, límites y configuración de Logi. */
export const LOGI_ADVISOR_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Máximo de una comprobación remota por instalación cada 6 h. */
export const LOGI_ADVISOR_REMOTE_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * @typedef {object} LogiAdvisorCacheEntry
 * @property {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @property {number} cachedAt
 * @property {boolean} fromRemote true only after a real advisor-config response
 */

/** @type {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig | null} */
let memoryCache = null;
/** @type {number} */
let memoryCachedAt = 0;
/** @type {boolean} */
let memoryFromRemote = false;

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[LOGI_ADVISOR_STORAGE_KEY]) return;
    const entry = unwrapCacheRaw(changes[LOGI_ADVISOR_STORAGE_KEY].newValue);
    memoryCache = entry.config;
    memoryCachedAt = entry.cachedAt;
    memoryFromRemote = entry.fromRemote;
  });
}

/**
 * @param {unknown} raw
 * @returns {LogiAdvisorCacheEntry}
 */
export function unwrapCacheRaw(raw) {
  if (!raw || typeof raw !== 'object') {
    return { config: { ...DEFAULT_LOGI_ADVISOR_CONFIG }, cachedAt: 0, fromRemote: false };
  }
  const o = /** @type {Record<string, unknown>} */ (raw);
  // New format: { config, cachedAt, fromRemote? }
  // Detect wrapper by cachedAt + config object (LogiAdvisorConfig itself has no top-level "config").
  if (
    o.config != null &&
    typeof o.config === 'object' &&
    !Array.isArray(o.config) &&
    ('cachedAt' in o || 'fromRemote' in o)
  ) {
    const cachedAt = Number(o.cachedAt);
    const config = parseLogiAdvisorConfig(o.config);
    const fromRemote =
      o.fromRemote === true ||
      (Number.isFinite(cachedAt) && cachedAt > 0 && isLogiAdvisorOperational(config));
    return {
      config,
      cachedAt: Number.isFinite(cachedAt) && cachedAt > 0 ? cachedAt : 0,
      fromRemote
    };
  }
  // Legacy: config object stored directly.
  const config = parseLogiAdvisorConfig(raw);
  // Promote a working legacy cache so we don't wipe it with a forced re-fetch loop.
  if (isLogiAdvisorOperational(config)) {
    return { config, cachedAt: Date.now(), fromRemote: true };
  }
  return { config, cachedAt: 0, fromRemote: false };
}

/**
 * @param {number} cachedAt
 * @param {number} [ttlMs]
 */
export function isLogiAdvisorCacheFresh(cachedAt, ttlMs = LOGI_ADVISOR_CACHE_TTL_MS) {
  const at = Number(cachedAt);
  const ttl = Number(ttlMs);
  if (!Number.isFinite(at) || at <= 0) return false;
  if (!Number.isFinite(ttl) || ttl <= 0) return false;
  return Date.now() - at < ttl;
}

/**
 * Skip proxy when an authoritative remote response is cached, incluso si Logi
 * estaba desactivado para el usuario. Así no se reconsulta la cohorte al abrir
 * varios logs o Ajustes dentro de la misma ventana.
 * - Without force: never open red; chat/uso reutilizan siempre caché.
 * - With force: only skip while within LOGI_ADVISOR_REMOTE_MIN_INTERVAL_MS (6 h).
 * @param {LogiAdvisorCacheEntry | null | undefined} entry
 * @param {{ force?: boolean, minIntervalMs?: number }} [opts]
 */
export function canSkipLogiAdvisorRemoteFetch(entry, opts = {}) {
  if (!entry || entry.fromRemote !== true) return false;
  if (opts.force === true) {
    const minMs = Number(opts.minIntervalMs);
    const ttl = Number.isFinite(minMs) && minMs > 0 ? minMs : LOGI_ADVISOR_REMOTE_MIN_INTERVAL_MS;
    return isLogiAdvisorCacheFresh(entry.cachedAt, ttl);
  }
  return true;
}

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 */
function sanitizeLogiAdvisorConfigForStorage(config) {
  return config ? { ...config, proxyAuthToken: null } : config;
}

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @param {{ cachedAt?: number, fromRemote?: boolean }} [opts]
 */
export async function writeLogiAdvisorCache(config, opts = {}) {
  const sanitized = sanitizeLogiAdvisorConfigForStorage(config);
  const fromRemote = opts.fromRemote === true;
  const at = fromRemote
    ? Number.isFinite(Number(opts.cachedAt))
      ? Number(opts.cachedAt)
      : Date.now()
    : Number.isFinite(Number(opts.cachedAt))
      ? Number(opts.cachedAt)
      : 0;
  memoryCache = sanitized;
  memoryCachedAt = at;
  memoryFromRemote = fromRemote;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({
        [LOGI_ADVISOR_STORAGE_KEY]: { config: sanitized, cachedAt: at, fromRemote }
      });
    }
  } catch {
    /* ignore */
  }
}

/**
 * @param {{ fromRemote?: boolean }} [opts]
 * Prefer fromRemote:false so the next bootstrap retries the network.
 */
export async function clearLogiAdvisorCache(opts = {}) {
  const disabled = { ...DEFAULT_LOGI_ADVISOR_CONFIG };
  await writeLogiAdvisorCache(disabled, {
    fromRemote: opts.fromRemote === true,
    cachedAt: opts.fromRemote === true ? Date.now() : 0
  });
  return disabled;
}

/**
 * @returns {Promise<LogiAdvisorCacheEntry>}
 */
export async function readLogiAdvisorCacheEntry() {
  if (memoryCache) {
    return { config: memoryCache, cachedAt: memoryCachedAt, fromRemote: memoryFromRemote };
  }
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const result = await chrome.storage.local.get(LOGI_ADVISOR_STORAGE_KEY);
      const entry = unwrapCacheRaw(result[LOGI_ADVISOR_STORAGE_KEY]);
      memoryCache = entry.config;
      memoryCachedAt = entry.cachedAt;
      memoryFromRemote = entry.fromRemote;
      // Persist migration of legacy operational flat cache into the wrapper format.
      if (
        entry.fromRemote &&
        isLogiAdvisorOperational(entry.config) &&
        result[LOGI_ADVISOR_STORAGE_KEY] &&
        typeof result[LOGI_ADVISOR_STORAGE_KEY] === 'object' &&
        !('cachedAt' in /** @type {object} */ (result[LOGI_ADVISOR_STORAGE_KEY]))
      ) {
        void writeLogiAdvisorCache(entry.config, { fromRemote: true, cachedAt: entry.cachedAt });
      }
      return entry;
    }
  } catch {
    /* ignore */
  }
  return { config: { ...DEFAULT_LOGI_ADVISOR_CONFIG }, cachedAt: 0, fromRemote: false };
}

/**
 * @returns {Promise<import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig>}
 */
export async function readLogiAdvisorCache() {
  const entry = await readLogiAdvisorCacheEntry();
  return entry.config;
}

/** Hidrata caché en memoria (service worker al arrancar). */
export async function hydrateLogiAdvisorCache() {
  return readLogiAdvisorCache();
}

/** Fuerza lectura desde chrome.storage (evita memoria obsoleta en el SW). */
export async function readLogiAdvisorCacheFresh() {
  memoryCache = null;
  memoryCachedAt = 0;
  memoryFromRemote = false;
  return readLogiAdvisorCache();
}

/** Para tests. */
export function resetLogiAdvisorCacheForTests() {
  memoryCache = null;
  memoryCachedAt = 0;
  memoryFromRemote = false;
}

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @param {number} [cachedAt]
 * @param {boolean} [fromRemote]
 */
export function setLogiAdvisorMemoryCache(config, cachedAt = Date.now(), fromRemote = true) {
  memoryCache = config;
  memoryCachedAt = Number.isFinite(Number(cachedAt)) ? Number(cachedAt) : Date.now();
  memoryFromRemote = fromRemote === true;
}
