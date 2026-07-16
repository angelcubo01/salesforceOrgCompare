import { POSTHOG_DEBUG } from './telemetryConfig.js';
import { ensureFeatureFlagsLoaded } from './posthogFeatureFlagLoader.js';
import {
  DEFAULT_LOGI_ADVISOR_CONFIG,
  LOGI_ADVISOR_FLAG,
  LOGI_PROXY_BOOTSTRAP_URL,
  isLogiAdvisorOperational,
  parseLogiAdvisorConfig
} from './apexLogAiAdvisorConfig.js';
import {
  readLogiAdvisorCacheEntry,
  writeLogiAdvisorCache,
  clearLogiAdvisorCache,
  canSkipLogiAdvisorRemoteFetch
} from './logiAdvisorCache.js';
import { getTelemetryEnabled } from './extensionSettings.js';
import { fetchLogiAdvisorRemoteConfig, LogiFlagDisabledError } from './fetchLogiAdvisorRemoteConfig.js';
import {
  isEncryptedPosthogPayload,
  isUsableFeatureFlagPayload,
  normalizeFeatureFlagPayload
} from './posthogFlagPayload.js';
import { getOrCreateTelemetryInstallId } from './telemetryInstallId.js';

export const LOGI_ADVISOR_READY_EVENT = 'sfoc:logi-advisor-ready';

/** @type {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig | null} */
let cachedConfig = null;

/** Para tests. */
export function resetLogiAdvisorFlagCacheForTests() {
  cachedConfig = null;
}

/**
 * @returns {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig}
 */
export function getCachedLogiAdvisorConfig() {
  return cachedConfig || { ...DEFAULT_LOGI_ADVISOR_CONFIG };
}

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 */
function dispatchLogiAdvisorReady(config) {
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent(LOGI_ADVISOR_READY_EVENT, { detail: { config } }));
  }
}

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} cached
 * @param {unknown} rawPosthogPayload
 * @returns {string | null}
 */
function resolveProxyUrl(cached, rawPosthogPayload) {
  if (cached?.proxyUrl) return cached.proxyUrl.trim();

  if (!isUsableFeatureFlagPayload(rawPosthogPayload)) return null;
  const o = /** @type {Record<string, unknown>} */ (normalizeFeatureFlagPayload(rawPosthogPayload));
  const proxyUrl = typeof o.proxyUrl === 'string' ? o.proxyUrl.trim() : '';
  return proxyUrl || null;
}

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} cached
 * @param {unknown} rawPosthogPayload
 * @returns {Promise<unknown>}
 */
async function fetchLogiConfigViaProxy(cached, rawPosthogPayload) {
  if (isUsableFeatureFlagPayload(rawPosthogPayload)) {
    return normalizeFeatureFlagPayload(rawPosthogPayload);
  }

  const proxyUrl = resolveProxyUrl(cached, rawPosthogPayload) || cached?.proxyUrl || LOGI_PROXY_BOOTSTRAP_URL;
  const installId = await getOrCreateTelemetryInstallId();
  if (!proxyUrl || !installId) {
    return null;
  }

  try {
    const remote = await fetchLogiAdvisorRemoteConfig({
      proxyUrl,
      installId
    });
    if (POSTHOG_DEBUG) {
      console.log('[posthog] logi advisor remote config loaded via proxy');
    }
    return remote;
  } catch (e) {
    if (e instanceof LogiFlagDisabledError) {
      if (POSTHOG_DEBUG) console.log('[posthog] logi advisor flag disabled (proxy)');
      return null;
    }
    if (POSTHOG_DEBUG) {
      console.warn('[posthog] logi advisor remote config fetch failed', e);
    }
    return null;
  }
}

/**
 * Solo la evaluación del SDK PostHog cuenta como flag activo.
 * Un payload cifrado puede existir aunque el flag esté desactivado (remote config).
 * @param {import('./posthogClient.js').posthog | null | undefined} ph
 */
export function isLogiAdvisorFlagEnabled(ph) {
  if (!ph) return false;
  if (typeof ph.isFeatureEnabled === 'function' && ph.isFeatureEnabled(LOGI_ADVISOR_FLAG) === true) {
    return true;
  }
  if (typeof ph.getFeatureFlag === 'function' && ph.getFeatureFlag(LOGI_ADVISOR_FLAG) === true) {
    return true;
  }
  return false;
}

/**
 * @param {import('./posthogClient.js').posthog | null | undefined} ph
 * @param {unknown} _rawPayload
 */
function isLogiAdvisorFlagActive(ph, _rawPayload) {
  return isLogiAdvisorFlagEnabled(ph);
}

/**
 * @param {unknown} resolvedPayload
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} cached
 * @returns {Promise<import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig>}
 */
async function commitLogiAdvisorConfig(resolvedPayload, cached) {
  if (isUsableFeatureFlagPayload(resolvedPayload)) {
    const parsed = parseLogiAdvisorConfig(normalizeFeatureFlagPayload(resolvedPayload));
    if (isLogiAdvisorOperational(parsed)) {
      cachedConfig = parsed;
      await writeLogiAdvisorCache(cachedConfig, { fromRemote: true });
      return cachedConfig;
    }
  }
  return clearLogiAdvisorCache({ fromRemote: false }).then((disabled) => {
    cachedConfig = disabled;
    return disabled;
  });
}

/**
 * @param {import('./posthogClient.js').posthog | null | undefined} ph
 * @param {{ force?: boolean, timeoutMs?: number }} [opts]
 * @returns {Promise<import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig>}
 */
export async function loadLogiAdvisorFromPosthog(ph, opts = {}) {
  const telemetryEnabled = await getTelemetryEnabled();
  const cacheEntry = await readLogiAdvisorCacheEntry();
  const cached = cacheEntry.config;

  if (!telemetryEnabled) {
    if (isLogiAdvisorOperational(cached)) {
      cachedConfig = cached;
      return cached;
    }
    return clearLogiAdvisorCache({ fromRemote: false }).then((disabled) => {
      cachedConfig = disabled;
      return disabled;
    });
  }

  if (!opts.force && canSkipLogiAdvisorRemoteFetch(cacheEntry)) {
    cachedConfig = cached;
    return cached;
  }

  let rawPayload;
  let flagsOk = false;

  if (ph) {
    flagsOk = await ensureFeatureFlagsLoaded(ph, {
      force: opts.force === true,
      timeoutMs: opts.timeoutMs ?? 8000
    });
    if (typeof ph.getFeatureFlagPayload === 'function') {
      rawPayload = ph.getFeatureFlagPayload(LOGI_ADVISOR_FLAG);
    }
  }

  const flagActive = isLogiAdvisorFlagActive(ph, rawPayload);

  if (ph && flagsOk && !flagActive) {
    if (POSTHOG_DEBUG) console.log('[posthog] logi advisor flag disabled');
    return clearLogiAdvisorCache({ fromRemote: true }).then((disabled) => {
      cachedConfig = disabled;
      return disabled;
    });
  }

  if (flagActive && isUsableFeatureFlagPayload(rawPayload)) {
    const parsed = parseLogiAdvisorConfig(normalizeFeatureFlagPayload(rawPayload));
    if (isLogiAdvisorOperational(parsed)) {
      cachedConfig = parsed;
      await writeLogiAdvisorCache(cachedConfig, { fromRemote: true });
      if (POSTHOG_DEBUG) console.log('[posthog] logi advisor loaded from flag payload');
      return cachedConfig;
    }
  }

  const shouldTryProxy =
    flagActive &&
    (!ph ||
      !flagsOk ||
      isEncryptedPosthogPayload(rawPayload) ||
      !isUsableFeatureFlagPayload(rawPayload));

  if (shouldTryProxy) {
    const remote = await fetchLogiConfigViaProxy(cached, rawPayload);
    if (isUsableFeatureFlagPayload(remote)) {
      return commitLogiAdvisorConfig(remote, cached);
    }
  }

  // Prefer a still-valid operational cache over disabling on transient failures.
  if (isLogiAdvisorOperational(cached) && cached.proxyUrl) {
    cachedConfig = cached;
    return cached;
  }

  if (POSTHOG_DEBUG) {
    console.log('[posthog] logi advisor fallback to disabled', { flagsOk, flagActive });
  }
  return clearLogiAdvisorCache({ fromRemote: false }).then((disabled) => {
    cachedConfig = disabled;
    return disabled;
  });
}

/**
 * @param {{ force?: boolean }} [opts]
 */
export async function bootstrapLogiAdvisor(opts = {}) {
  try {
    const { initPosthogClient, syncPosthogSfUserContext } = await import('./posthogClient.js');
    const { invalidateFeatureFlagsCache } = await import('./posthogFeatureFlagLoader.js');
    const ph = await initPosthogClient({ forceFeatureFlags: opts.force, awaitReady: true });
    if (ph) {
      await syncPosthogSfUserContext();
      invalidateFeatureFlagsCache();
    }
    const config = await loadLogiAdvisorFromPosthog(ph, {
      force: opts.force === true,
      timeoutMs: 12000
    });
    dispatchLogiAdvisorReady(config);
    return config;
  } catch {
    cachedConfig = await clearLogiAdvisorCache({ fromRemote: false });
    dispatchLogiAdvisorReady(cachedConfig);
    return cachedConfig;
  }
}

/**
 * @param {import('./posthogClient.js').posthog} ph
 * @param {(config: import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig) => void} [onChange]
 */
export function hookLogiAdvisorOnFeatureFlags(ph, onChange) {
  if (!ph || ph.__sfocLogiAdvisorFlagHooked) return;
  ph.__sfocLogiAdvisorFlagHooked = true;

  const run = () => {
    cachedConfig = null;
    void loadLogiAdvisorFromPosthog(ph).then((config) => {
      dispatchLogiAdvisorReady(config);
      onChange?.(config);
    });
  };

  if (typeof ph.onFeatureFlags === 'function') {
    ph.onFeatureFlags(run);
  }
  if (typeof ph.onFeatureFlagsReady === 'function') {
    ph.onFeatureFlagsReady(run);
  }
}
