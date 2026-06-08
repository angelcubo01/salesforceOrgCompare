import { POSTHOG_DEBUG } from './telemetryConfig.js';
import { waitForFeatureFlags } from './posthogSessionReplay.js';

/** Feature flag remoto (PostHog). Rollout 0 % por defecto; activar gradualmente en el dashboard. */
export const SUPPORT_FLAG = 'sfoc_support';

export const SUPPORT_FLAG_READY_EVENT = 'sfoc:posthog-support-flag-ready';

/**
 * @typedef {{ enabled?: boolean }} SupportFlagConfig
 */

/**
 * @param {unknown} raw
 * @returns {SupportFlagConfig}
 */
export function parseSupportFlagPayload(raw) {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return { enabled: false };
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { enabled: false };
  }
  const o = /** @type {Record<string, unknown>} */ (value);
  return { enabled: o.enabled !== false };
}

/**
 * Support desactivado salvo flag explícitamente true y payload.enabled !== false.
 * @param {import('./posthogClient.js').posthog | null | undefined} ph
 */
export async function isPosthogSupportFlagEnabled(ph) {
  if (!ph) return false;

  await waitForFeatureFlags(ph, 8000);

  try {
    if (typeof ph.isFeatureEnabled !== 'function') return false;
    const evaluated = ph.isFeatureEnabled(SUPPORT_FLAG);
    if (evaluated !== true) {
      if (POSTHOG_DEBUG) console.log('[posthog] support flag off', { evaluated });
      return false;
    }

    let rawPayload;
    if (typeof ph.getFeatureFlagPayload === 'function') {
      rawPayload = ph.getFeatureFlagPayload(SUPPORT_FLAG);
    }
    const payload = parseSupportFlagPayload(rawPayload);
    if (!payload.enabled) {
      if (POSTHOG_DEBUG) console.log('[posthog] support flag payload disabled');
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {import('./posthogClient.js').posthog} ph
 * @param {(enabled: boolean) => void} [onChange]
 */
export function hookSupportOnFeatureFlags(ph, onChange) {
  if (!ph || ph.__sfocSupportFlagHooked) return;
  ph.__sfocSupportFlagHooked = true;

  const run = () => {
    void isPosthogSupportFlagEnabled(ph).then((enabled) => {
      if (typeof document !== 'undefined') {
        document.dispatchEvent(
          new CustomEvent(SUPPORT_FLAG_READY_EVENT, { detail: { enabled } })
        );
      }
      onChange?.(enabled);
    });
  };

  if (typeof ph.onFeatureFlags === 'function') {
    ph.onFeatureFlags(run);
  }
  if (typeof ph.onFeatureFlagsReady === 'function') {
    ph.onFeatureFlagsReady(run);
  }
}
