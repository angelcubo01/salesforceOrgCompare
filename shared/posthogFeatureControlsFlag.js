import { POSTHOG_DEBUG } from './telemetryConfig.js';
import { ensureFeatureFlagsLoaded } from './posthogFeatureFlagLoader.js';
import { parseFeatureControlsPayload, DEFAULT_FEATURE_CONTROLS } from './featureControls.js';
import { writeFeatureControlsCache, readFeatureControlsCache } from './featureControlsCache.js';

/** Feature flag remoto (PostHog). Rollout 100 %; restricciones vía payload JSON. */
export const FEATURE_CONTROLS_FLAG = 'sfoc_feature_controls';

export const FEATURE_CONTROLS_READY_EVENT = 'sfoc:feature-controls-ready';

/** @type {import('./featureControls.js').FeatureControlsConfig | null} */
let cachedConfig = null;

/** Para tests. */
export function resetFeatureControlsFlagCacheForTests() {
  cachedConfig = null;
}

/**
 * @returns {import('./featureControls.js').FeatureControlsConfig}
 */
export function getCachedFeatureControlsConfig() {
  return cachedConfig || {
    ...DEFAULT_FEATURE_CONTROLS,
    modes: {},
    tools: {},
    metadataTypes: {},
    actions: {}
  };
}

/**
 * @param {import('./featureControls.js').FeatureControlsConfig} config
 */
function dispatchFeatureControlsReady(config) {
  if (typeof document !== 'undefined') {
    document.dispatchEvent(
      new CustomEvent(FEATURE_CONTROLS_READY_EVENT, { detail: { config } })
    );
  }
}

/**
 * @param {import('./posthogClient.js').posthog | null | undefined} ph
 * @param {{ force?: boolean, timeoutMs?: number }} [opts]
 * @returns {Promise<import('./featureControls.js').FeatureControlsConfig>}
 */
export async function loadFeatureControlsFromPosthog(ph, opts = {}) {
  if (!ph) {
    cachedConfig = {
      ...DEFAULT_FEATURE_CONTROLS,
      modes: {},
      tools: {},
      metadataTypes: {},
      actions: {}
    };
    return cachedConfig;
  }

  const flagsOk = await ensureFeatureFlagsLoaded(ph, {
    force: opts.force === true,
    timeoutMs: opts.timeoutMs ?? 8000
  });
  if (!flagsOk) {
    cachedConfig = await readFeatureControlsCache();
    if (POSTHOG_DEBUG) console.log('[posthog] feature controls fallback to storage cache');
    return cachedConfig;
  }

  try {
    let flagOn = false;
    if (typeof ph.isFeatureEnabled === 'function') {
      const evaluated = ph.isFeatureEnabled(FEATURE_CONTROLS_FLAG);
      flagOn = evaluated === true;
    }

    if (!flagOn) {
      if (POSTHOG_DEBUG) console.log('[posthog] feature controls flag off');
      cachedConfig = {
        ...DEFAULT_FEATURE_CONTROLS,
        modes: {},
        tools: {},
        metadataTypes: {},
        actions: {}
      };
      await writeFeatureControlsCache(cachedConfig);
      return cachedConfig;
    }

    let rawPayload;
    if (typeof ph.getFeatureFlagPayload === 'function') {
      rawPayload = ph.getFeatureFlagPayload(FEATURE_CONTROLS_FLAG);
    }
    cachedConfig = parseFeatureControlsPayload(rawPayload);
    await writeFeatureControlsCache(cachedConfig);
    if (POSTHOG_DEBUG) console.log('[posthog] feature controls loaded', cachedConfig);
    return cachedConfig;
  } catch {
    cachedConfig = {
      ...DEFAULT_FEATURE_CONTROLS,
      modes: {},
      tools: {},
      metadataTypes: {},
      actions: {}
    };
    return cachedConfig;
  }
}

/**
 * @param {import('./posthogClient.js').posthog} ph
 * @param {(config: import('./featureControls.js').FeatureControlsConfig) => void} [onChange]
 * @param {{ skipInitialRun?: boolean }} [hookOpts]
 */
export function hookFeatureControlsOnFeatureFlags(ph, onChange, hookOpts = {}) {
  if (!ph || ph.__sfocFeatureControlsHooked) return;
  ph.__sfocFeatureControlsHooked = true;

  const run = () => {
    void loadFeatureControlsFromPosthog(ph).then((config) => {
      dispatchFeatureControlsReady(config);
      onChange?.(config);
    });
  };

  if (typeof ph.onFeatureFlags === 'function') {
    ph.onFeatureFlags(run);
  }
  if (typeof ph.onFeatureFlagsReady === 'function') {
    ph.onFeatureFlagsReady(run);
  }
  if (!hookOpts.skipInitialRun) {
    run();
  }
}

/** @type {Promise<import('./featureControls.js').FeatureControlsConfig> | null} */
let bootstrapPromise = null;

/**
 * Arranque de Compare: fuerza recarga del flag y bloquea hasta tener payload (o caché / defaults).
 * @param {{ force?: boolean }} [opts] force=true en cada F5 (por defecto).
 */
export async function bootstrapFeatureControls(opts = {}) {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    // code.html nunca consulta PostHog: aplica lo que el popup haya dejado persistido.
    cachedConfig = await readFeatureControlsCache();
    dispatchFeatureControlsReady(cachedConfig);
    return cachedConfig;
  })();

  return bootstrapPromise;
}
