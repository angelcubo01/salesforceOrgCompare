import { POSTHOG_DEBUG } from './telemetryConfig.js';

/** La evaluación remota se renueva solo desde el popup. */
export const FEATURE_FLAG_RELOAD_TTL_MS = 6 * 60 * 60 * 1000;
export const FEATURE_FLAG_LAST_SUCCESSFUL_FETCH_KEY = 'lastSuccessfulFeatureFlagsFetchAt';

let lastReloadAt = 0;
let flagsReady = false;
let waitPromise = null;
let refreshPromise = null;
let storageLoaded = false;

function setSdkReloadingPaused(ph, paused) {
  try {
    ph?.featureFlags?.setReloadingPaused?.(paused);
  } catch {
    /* El SDK no expone esta API en mocks/versiones antiguas. */
  }
}

async function readLastSuccessfulFetchAt() {
  if (storageLoaded) return lastReloadAt;
  storageLoaded = true;
  try {
    const result = await chrome.storage.local.get(FEATURE_FLAG_LAST_SUCCESSFUL_FETCH_KEY);
    const value = Number(result[FEATURE_FLAG_LAST_SUCCESSFUL_FETCH_KEY]);
    lastReloadAt = Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    /* Sin storage se conserva la caché de memoria. */
  }
  return lastReloadAt;
}

async function markSuccessfulFetch() {
  lastReloadAt = Date.now();
  storageLoaded = true;
  try {
    await chrome.storage.local.set({ [FEATURE_FLAG_LAST_SUCCESSFUL_FETCH_KEY]: lastReloadAt });
  } catch {
    /* Sin storage se conserva la marca de memoria. */
  }
}

export async function areFeatureFlagsStale() {
  const lastFetchAt = await readLastSuccessfulFetchAt();
  return !lastFetchAt || Date.now() - lastFetchAt >= FEATURE_FLAG_RELOAD_TTL_MS;
}

/** Para tests. */
export function resetFeatureFlagLoaderForTests() {
  lastReloadAt = 0;
  flagsReady = false;
  waitPromise = null;
  refreshPromise = null;
  storageLoaded = false;
}

/** Impide recargas implícitas de posthog-js fuera de la ventana del popup. */
export function pauseFeatureFlagsReloading(ph) {
  setSdkReloadingPaused(ph, true);
}

/**
 * Espera una evaluación ya en curso; nunca inicia una petición por sí misma.
 * @param {import('./posthogClient.js').posthog} ph
 * @param {number} [timeoutMs]
 */
export function waitForFeatureFlags(ph, timeoutMs = 10000) {
  if (!ph) return Promise.resolve(false);
  if (flagsReady) return Promise.resolve(true);
  if (waitPromise) return waitPromise;

  waitPromise = new Promise((resolve) => {
    let settled = false;
    const done = (ok = true) => {
      if (settled) return;
      settled = true;
      if (ok) flagsReady = true;
      resolve(ok);
    };
    ph.onFeatureFlags?.(() => done(true));
    ph.onFeatureFlagsReady?.(() => done(true));
    setTimeout(() => done(false), timeoutMs);
  });
  return waitPromise;
}

/**
 * Único punto que puede abrir una ventana de red para flags. Debe invocarse al abrir el popup.
 * @param {import('./posthogClient.js').posthog} ph
 * @param {{ force?: boolean, timeoutMs?: number }} [opts]
 */
export async function refreshFeatureFlagsIfStale(ph, opts = {}) {
  if (!ph || typeof ph.reloadFeatureFlags !== 'function') return false;
  if (refreshPromise) return refreshPromise;

  const force = opts.force === true;
  refreshPromise = (async () => {
    try {
      if (!force && !(await areFeatureFlagsStale())) {
        if (POSTHOG_DEBUG) console.log('[posthog] feature flags cache persistente vigente');
        return false;
      }
      flagsReady = false;
      waitPromise = null;
      setSdkReloadingPaused(ph, false);
      try {
        ph.reloadFeatureFlags();
        const loaded = await waitForFeatureFlags(ph, opts.timeoutMs ?? 8000);
        if (loaded) await markSuccessfulFetch();
        if (POSTHOG_DEBUG) console.log('[posthog] feature flags popup refresh', { loaded, force });
        return loaded;
      } catch {
        return false;
      } finally {
        setSdkReloadingPaused(ph, true);
      }
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

/** Compatibilidad: ya no realiza I/O; usar refreshFeatureFlagsIfStale desde el popup. */
export function reloadFeatureFlagsIfNeeded() {
  return false;
}

/** Compatibilidad para consumidores existentes: solo espera una carga iniciada explícitamente. */
export async function ensureFeatureFlagsLoaded(ph, opts = {}) {
  if (!ph) return false;
  if (opts.refreshFromPopup === true) {
    const refreshed = await refreshFeatureFlagsIfStale(ph, opts);
    if (refreshed) return true;
  }
  return waitForFeatureFlags(ph, opts.timeoutMs ?? 10000);
}

/** Invalida la caducidad tras cambiar consentimiento o limpiar datos locales. */
export async function invalidateFeatureFlagsCache() {
  flagsReady = false;
  waitPromise = null;
  lastReloadAt = 0;
  storageLoaded = true;
  try {
    await chrome.storage.local.remove(FEATURE_FLAG_LAST_SUCCESSFUL_FETCH_KEY);
  } catch {
    /* ignore */
  }
}
