import { getPosthogClient, initPosthogClient } from './posthogClient.js';
import { getTelemetryEnabled } from './extensionSettings.js';

/**
 * Evalúa un feature flag de PostHog. Devuelve false si telemetría desactivada o PostHog no inicializado.
 * @param {string} key
 * @param {boolean} [defaultValue=false]
 */
export async function isFeatureEnabled(key, defaultValue = false) {
  const telemetryEnabled = await getTelemetryEnabled();
  if (!telemetryEnabled) return defaultValue;

  let ph = getPosthogClient();
  if (!ph) {
    ph = await initPosthogClient();
  }
  if (!ph) return defaultValue;

  try {
    return ph.isFeatureEnabled(key) ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Obtiene el payload de un feature flag (variantes multivariante).
 * @param {string} key
 */
export async function getFeatureFlagPayload(key) {
  const telemetryEnabled = await getTelemetryEnabled();
  if (!telemetryEnabled) return undefined;

  let ph = getPosthogClient();
  if (!ph) {
    ph = await initPosthogClient();
  }
  if (!ph) return undefined;

  try {
    return ph.getFeatureFlagPayload(key);
  } catch {
    return undefined;
  }
}
