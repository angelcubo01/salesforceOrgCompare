import { POSTHOG_DEBUG } from './telemetryConfig.js';
import { ensureFeatureFlagsLoaded } from './posthogFeatureFlagLoader.js';
import { DEFAULT_POPUP_CONTROLS, parsePopupControlsPayload } from './popupControls.js';

/** Feature flag remoto (PostHog). Rollout 100 %; restricciones vía payload JSON. */
export const POPUP_CONTROLS_FLAG = 'sfoc_popup_controls';

export const POPUP_CONTROLS_READY_EVENT = 'sfoc:popup-controls-ready';
export const POPUP_CONTROLS_STORAGE_KEY = 'sfocPopupControlsCache';

/** @type {import('./popupControls.js').PopupControlsConfig | null} */
let cachedConfig = null;

/** Para tests. */
export function resetPopupControlsFlagCacheForTests() {
  cachedConfig = null;
}

async function readPopupControlsCache() {
  if (cachedConfig) return cachedConfig;
  try {
    const result = await chrome.storage.local.get(POPUP_CONTROLS_STORAGE_KEY);
    if (result[POPUP_CONTROLS_STORAGE_KEY]) {
      cachedConfig = parsePopupControlsPayload(result[POPUP_CONTROLS_STORAGE_KEY], { flagActive: true });
      return cachedConfig;
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_POPUP_CONTROLS };
}

async function writePopupControlsCache(config) {
  cachedConfig = config;
  try {
    await chrome.storage.local.set({ [POPUP_CONTROLS_STORAGE_KEY]: config });
  } catch {
    /* ignore */
  }
}

/**
 * @returns {import('./popupControls.js').PopupControlsConfig}
 */
export function getCachedPopupControlsConfig() {
  return cachedConfig || { ...DEFAULT_POPUP_CONTROLS };
}

/**
 * @param {import('./popupControls.js').PopupControlsConfig} config
 */
function dispatchPopupControlsReady(config) {
  if (typeof document !== 'undefined') {
    document.dispatchEvent(
      new CustomEvent(POPUP_CONTROLS_READY_EVENT, { detail: { config } })
    );
  }
}

/**
 * @param {import('./posthogClient.js').posthog | null | undefined} ph
 * @param {{ force?: boolean, timeoutMs?: number }} [opts]
 * @returns {Promise<import('./popupControls.js').PopupControlsConfig>}
 */
export async function loadPopupControlsFromPosthog(ph, opts = {}) {
  if (!ph) {
    cachedConfig = await readPopupControlsCache();
    return cachedConfig;
  }

  const flagsOk = await ensureFeatureFlagsLoaded(ph, {
    force: opts.force === true,
    timeoutMs: opts.timeoutMs ?? 8000
  });
  if (!flagsOk) {
    if (POSTHOG_DEBUG) console.log('[posthog] popup controls flags timeout — fail-open');
    cachedConfig = await readPopupControlsCache();
    return cachedConfig;
  }

  try {
    let flagOn = false;
    if (typeof ph.isFeatureEnabled === 'function') {
      flagOn = ph.isFeatureEnabled(POPUP_CONTROLS_FLAG) === true;
    }

    if (!flagOn) {
      if (POSTHOG_DEBUG) console.log('[posthog] popup controls flag off');
      cachedConfig = { ...DEFAULT_POPUP_CONTROLS };
      await writePopupControlsCache(cachedConfig);
      return cachedConfig;
    }

    let rawPayload;
    if (typeof ph.getFeatureFlagPayload === 'function') {
      rawPayload = ph.getFeatureFlagPayload(POPUP_CONTROLS_FLAG);
    }
    cachedConfig = parsePopupControlsPayload(rawPayload, { flagActive: true });
    await writePopupControlsCache(cachedConfig);
    if (POSTHOG_DEBUG) console.log('[posthog] popup controls loaded', cachedConfig);
    return cachedConfig;
  } catch {
    cachedConfig = await readPopupControlsCache();
    return cachedConfig;
  }
}

/**
 * @param {import('./posthogClient.js').posthog} ph
 * @param {(config: import('./popupControls.js').PopupControlsConfig) => void} [onChange]
 */
export function hookPopupControlsOnFeatureFlags(ph, onChange) {
  if (!ph || ph.__sfocPopupControlsHooked) return;
  ph.__sfocPopupControlsHooked = true;

  const run = () => {
    void loadPopupControlsFromPosthog(ph).then((config) => {
      dispatchPopupControlsReady(config);
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
