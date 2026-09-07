import { getCachedManagedFeatureFlag } from './posthogFeatureFlagLoader.js';

/**
 * Evalúa una feature flag desde el snapshot común que refresca el popup.
 * Nunca inicializa el SDK ni abre una petición de red.
 * @param {string} key
 * @param {boolean} [defaultValue=false]
 */
export async function isFeatureEnabled(key, defaultValue = false) {
  const cached = await getCachedManagedFeatureFlag(key);
  return cached ? cached.enabled : defaultValue;
}

/**
 * Obtiene el payload de un feature flag (variantes multivariante).
 * @param {string} key
 */
export async function getFeatureFlagPayload(key) {
  const cached = await getCachedManagedFeatureFlag(key);
  return cached?.payload;
}
