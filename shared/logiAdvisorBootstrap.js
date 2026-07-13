import {
  DEFAULT_LOGI_ADVISOR_CONFIG,
  isLogiAdvisorOperational,
  LOGI_PROXY_BOOTSTRAP_URL,
  parseLogiAdvisorConfig
} from './apexLogAiAdvisorConfig.js';
import { readLogiAdvisorCache, writeLogiAdvisorCache } from './logiAdvisorCache.js';
import { fetchLogiAdvisorRemoteConfig } from './fetchLogiAdvisorRemoteConfig.js';
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
  if (!telemetryEnabled) return null;

  const cached = await readLogiAdvisorCache();
  if (
    !force &&
    cached.enabled &&
    cached.showButton &&
    isLogiAdvisorOperational(cached)
  ) {
    return cached;
  }

  if (bootstrapInFlight && !force) {
    return bootstrapInFlight;
  }

  bootstrapInFlight = (async () => {
    try {
      const installId = await getOrCreateTelemetryInstallId();
      const proxyUrl = cached.proxyUrl || LOGI_PROXY_BOOTSTRAP_URL;
      if (!proxyUrl || !installId) {
        return cached.enabled ? cached : null;
      }

      const remote = await fetchLogiAdvisorRemoteConfig({
        proxyUrl,
        proxyAuthToken: cached.proxyAuthToken || '',
        installId,
        bootstrap: !cached.proxyAuthToken
      });

      if (!isUsableFeatureFlagPayload(remote)) {
        return cached.enabled ? cached : null;
      }

      const config = parseLogiAdvisorConfig(remote);
      await writeLogiAdvisorCache(config);
      return config;
    } catch {
      return cached.enabled ? cached : null;
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
