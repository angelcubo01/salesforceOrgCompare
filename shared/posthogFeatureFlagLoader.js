import { POSTHOG_DEBUG } from './telemetryConfig.js';

/** La evaluación remota se renueva solo desde el popup. */
export const FEATURE_FLAG_RELOAD_TTL_MS = 6 * 60 * 60 * 1000;
export const FEATURE_FLAG_LAST_SUCCESSFUL_FETCH_KEY = 'lastSuccessfulFeatureFlagsFetchAt';
export const FEATURE_FLAGS_SNAPSHOT_STORAGE_KEY = 'sfocPosthogFeatureFlagsSnapshot';

/** Todas se resuelven en la misma respuesta de `reloadFeatureFlags()`. */
export const MANAGED_POSTHOG_FEATURE_FLAGS = Object.freeze([
  'sfoc_feature_controls',
  'sfoc_popup_controls',
  'sfoc_apex_log_ai_advisor',
  'sfoc_session_replay',
  'sfoc_support'
]);

let lastReloadAt = 0;
let flagsReady = false;
let waitPromise = null;
let refreshPromise = null;
let storageLoaded = false;
let featureFlagsSnapshot = null;
let snapshotLoaded = false;

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

/**
 * Persiste la evaluación y el payload de todas las flags gestionadas en una única
 * lectura del SDK. Los consumidores fuera del popup reutilizan este snapshot y
 * no abren una ventana de red propia.
 * @param {import('./posthogClient.js').posthog} ph
 */
export async function cacheManagedFeatureFlagsSnapshot(ph) {
  if (!ph) return null;

  const flags = {};
  for (const key of MANAGED_POSTHOG_FEATURE_FLAGS) {
    let enabled = false;
    let payload = null;
    try {
      enabled = ph.isFeatureEnabled?.(key) === true;
      payload = ph.getFeatureFlagPayload?.(key) ?? null;
    } catch {
      // Una flag problemática no debe impedir guardar el resto del snapshot.
    }
    flags[key] = { enabled, payload };
  }

  featureFlagsSnapshot = { fetchedAt: Date.now(), flags };
  snapshotLoaded = true;
  try {
    await chrome.storage.local.set({ [FEATURE_FLAGS_SNAPSHOT_STORAGE_KEY]: featureFlagsSnapshot });
  } catch {
    /* Sin storage se conserva la caché de memoria. */
  }
  return featureFlagsSnapshot;
}

/**
 * @param {string} key
 * @returns {Promise<{ enabled: boolean, payload: unknown, fetchedAt: number } | null>}
 */
export async function getCachedManagedFeatureFlag(key) {
  if (!snapshotLoaded) {
    snapshotLoaded = true;
    try {
      const result = await chrome.storage.local.get(FEATURE_FLAGS_SNAPSHOT_STORAGE_KEY);
      const raw = result?.[FEATURE_FLAGS_SNAPSHOT_STORAGE_KEY];
      if (raw && typeof raw === 'object' && raw.flags && typeof raw.flags === 'object') {
        featureFlagsSnapshot = raw;
      }
    } catch {
      /* Sin storage se conserva la caché de memoria. */
    }
  }

  const entry = featureFlagsSnapshot?.flags?.[key];
  if (!entry || typeof entry !== 'object') return null;
  return {
    enabled: entry.enabled === true,
    payload: entry.payload ?? null,
    fetchedAt: Number(featureFlagsSnapshot.fetchedAt) || 0
  };
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
  featureFlagsSnapshot = null;
  snapshotLoaded = false;
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
        if (loaded) {
          await Promise.all([markSuccessfulFetch(), cacheManagedFeatureFlagsSnapshot(ph)]);
        }
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
    await chrome.storage.local.remove([
      FEATURE_FLAG_LAST_SUCCESSFUL_FETCH_KEY,
      FEATURE_FLAGS_SNAPSHOT_STORAGE_KEY
    ]);
  } catch {
    /* ignore */
  }
  featureFlagsSnapshot = null;
  snapshotLoaded = true;
}
