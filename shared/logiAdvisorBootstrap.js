import {
  isLogiAdvisorOperational,
  LOGI_PROXY_BOOTSTRAP_URL,
  parseLogiAdvisorConfig
} from './apexLogAiAdvisorConfig.js';
import { clearLogiAdvisorCache, readLogiAdvisorCache, writeLogiAdvisorCache } from './logiAdvisorCache.js';
import { fetchLogiAdvisorRemoteConfig, LogiFlagDisabledError } from './fetchLogiAdvisorRemoteConfig.js';
import { isUsableFeatureFlagPayload } from './posthogFlagPayload.js';
import { getOrCreateTelemetryInstallId } from './telemetryInstallId.js';
import { getTelemetryEnabled } from './extensionSettings.js';

/** @type {Promise<import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig | null> | null} */
let bootstrapInFlight = null;

/**
 * Carga config Logi desde logi-proxy (sin depender de posthog-js en la pagina).
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig | null>}
 */
export async function bootstrapLogiAdvisorViaProxy(opts = {}) {
  const force = opts.force === true;
  const telemetryEnabled = await getTelemetryEnabled();
  if (!telemetryEnabled) {
    return clearLogiAdvisorCache();
  }

  const cached = await readLogiAdvisorCache();

  if (bootstrapInFlight && !force) {
    return bootstrapInFlight;
  }

  bootstrapInFlight = (async () => {
    try {
      const installId = await getOrCreateTelemetryInstallId();
      const proxyUrl = cached.proxyUrl || LOGI_PROXY_BOOTSTRAP_URL;
      if (!proxyUrl || !installId) {
        console.warn('[logi] bootstrap omitido: sin proxyUrl o installId', {
          proxyUrl: Boolean(proxyUrl),
          installId: Boolean(installId)
        });
        return clearLogiAdvisorCache();
      }

      const remote = await fetchLogiAdvisorRemoteConfig({
        proxyUrl,
        proxyAuthToken: cached.proxyAuthToken || '',
        installId,
        bootstrap: !cached.proxyAuthToken
      });

      if (!isUsableFeatureFlagPayload(remote)) {
        console.warn('[logi] proxy devolvió payload no usable', { proxyUrl });
        return clearLogiAdvisorCache();
      }

      const config = parseLogiAdvisorConfig(remote);
      if (!isLogiAdvisorOperational(config)) {
        console.warn('[logi] payload del proxy no es operacional', {
          enabled: config.enabled,
          showButton: config.showButton,
          transport: config.transport
        });
        return clearLogiAdvisorCache();
      }
      await writeLogiAdvisorCache(config);
      return config;
    } catch (err) {
      if (err instanceof LogiFlagDisabledError) {
        console.warn('[logi] feature flag desactivado en PostHog');
        return clearLogiAdvisorCache();
      }
      console.warn('[logi] bootstrap proxy falló', err);
      return clearLogiAdvisorCache();
    } finally {
      bootstrapInFlight = null;
    }
  })();

  return bootstrapInFlight;
}

/** Para tests. */
export function resetLogiAdvisorBootstrapForTests() {
  bootstrapInFlight = null;
}
