import { POSTHOG_DEBUG } from './telemetryConfig.js';

/** Recarga flags como máximo cada 30 min por pestaña (estrategia equilibrada). */
export const FEATURE_FLAG_RELOAD_TTL_MS = 30 * 60 * 1000;

/** @type {number} */
let lastReloadAt = 0;

/** @type {boolean} */
let flagsReady = false;

/** @type {Promise<boolean> | null} */
let waitPromise = null;

/** Para tests. */
export function resetFeatureFlagLoaderForTests() {
  lastReloadAt = 0;
  flagsReady = false;
  waitPromise = null;
}

/**
 * @param {import('./posthogClient.js').posthog} ph
 * @param {{ force?: boolean }} [opts]
 * @returns {boolean} true si se solicitó reload al servidor
 */
export function reloadFeatureFlagsIfNeeded(ph, opts = {}) {
  if (!ph || typeof ph.reloadFeatureFlags !== 'function') return false;
  const force = opts.force === true;
  const now = Date.now();
  const stale = !lastReloadAt || now - lastReloadAt >= FEATURE_FLAG_RELOAD_TTL_MS;
  if (!force && !stale && lastReloadAt > 0) {
    if (POSTHOG_DEBUG) console.log('[posthog] feature flags cache hit (TTL)');
    return false;
  }
  lastReloadAt = now;
  flagsReady = false;
  waitPromise = null;
  try {
    ph.reloadFeatureFlags();
    if (POSTHOG_DEBUG) console.log('[posthog] feature flags reload', { force, stale });
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * Espera a que posthog-js evalúe flags ya cargados o en curso. No llama a reload.
 * @param {import('./posthogClient.js').posthog} ph
 * @param {number} [timeoutMs]
 */
export function waitForFeatureFlags(ph, timeoutMs = 10000) {
  if (!ph) return Promise.resolve(false);
  reloadFeatureFlagsIfNeeded(ph);
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

    if (typeof ph.onFeatureFlags === 'function') {
      ph.onFeatureFlags(() => done(true));
    }
    if (typeof ph.onFeatureFlagsReady === 'function') {
      ph.onFeatureFlagsReady(() => done(true));
    }

    setTimeout(() => done(false), timeoutMs);
  });

  return waitPromise;
}

/**
 * Una recarga (si TTL o force) y espera a evaluación. Punto único de entrada en init / opt-in.
 * @param {import('./posthogClient.js').posthog} ph
 * @param {{ force?: boolean, timeoutMs?: number }} [opts]
 */
export async function ensureFeatureFlagsLoaded(ph, opts = {}) {
  if (!ph) return false;
  reloadFeatureFlagsIfNeeded(ph, { force: opts.force === true });
  return waitForFeatureFlags(ph, opts.timeoutMs ?? 10000);
}

/** Invalida caché en memoria tras reload explícito (p. ej. opt-out). */
export function invalidateFeatureFlagsCache() {
  flagsReady = false;
  waitPromise = null;
  lastReloadAt = 0;
}
