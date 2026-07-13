import { POSTHOG_DEBUG } from './telemetryConfig.js';
import { ensureFeatureFlagsLoaded } from './posthogFeatureFlagLoader.js';
import {
  DEFAULT_LOGI_ADVISOR_CONFIG,
  LOGI_ADVISOR_FLAG,
  parseLogiAdvisorConfig
} from './apexLogAiAdvisorConfig.js';
import { readLogiAdvisorCache, writeLogiAdvisorCache } from './logiAdvisorCache.js';
import { getTelemetryEnabled } from './extensionSettings.js';

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
 * @param {import('./posthogClient.js').posthog | null | undefined} ph
 * @param {{ force?: boolean, timeoutMs?: number }} [opts]
 * @returns {Promise<import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig>}
 */
export async function loadLogiAdvisorFromPosthog(ph, opts = {}) {
  const telemetryEnabled = await getTelemetryEnabled();
  if (!ph || !telemetryEnabled) {
    cachedConfig = await readLogiAdvisorCache();
    if (!cachedConfig.enabled) {
      cachedConfig = { ...DEFAULT_LOGI_ADVISOR_CONFIG };
    }
    return cachedConfig;
  }

  const flagsOk = await ensureFeatureFlagsLoaded(ph, {
    force: opts.force === true,
    timeoutMs: opts.timeoutMs ?? 8000
  });
  if (!flagsOk) {
    cachedConfig = await readLogiAdvisorCache();
    if (POSTHOG_DEBUG) console.log('[posthog] logi advisor fallback to storage cache');
    return cachedConfig;
  }

  try {
    let flagOn = false;
    if (typeof ph.isFeatureEnabled === 'function') {
      flagOn = ph.isFeatureEnabled(LOGI_ADVISOR_FLAG) === true;
    }

    if (!flagOn) {
      cachedConfig = { ...DEFAULT_LOGI_ADVISOR_CONFIG };
      await writeLogiAdvisorCache(cachedConfig);
      return cachedConfig;
    }

    let rawPayload;
    if (typeof ph.getFeatureFlagPayload === 'function') {
      rawPayload = ph.getFeatureFlagPayload(LOGI_ADVISOR_FLAG);
    }
    cachedConfig = parseLogiAdvisorConfig(rawPayload);
    await writeLogiAdvisorCache(cachedConfig);
    if (POSTHOG_DEBUG) console.log('[posthog] logi advisor loaded');
    return cachedConfig;
  } catch {
    cachedConfig = await readLogiAdvisorCache();
    return cachedConfig;
  }
}

/**
 * @param {{ force?: boolean }} [opts]
 */
export async function bootstrapLogiAdvisor(opts = {}) {
  try {
    const { initPosthogClient } = await import('./posthogClient.js');
    const ph = await initPosthogClient({ forceFeatureFlags: opts.force, awaitReady: true });
    const config = await loadLogiAdvisorFromPosthog(ph, { force: opts.force === true });
    dispatchLogiAdvisorReady(config);
    return config;
  } catch {
    cachedConfig = await readLogiAdvisorCache();
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
