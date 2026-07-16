import {
  isLogiAdvisorOperational,
  LOGI_PROXY_BOOTSTRAP_URL,
  parseLogiAdvisorConfig
} from './apexLogAiAdvisorConfig.js';
import {
  canSkipLogiAdvisorRemoteFetch,
  clearLogiAdvisorCache,
  readLogiAdvisorCacheEntry,
  writeLogiAdvisorCache
} from './logiAdvisorCache.js';
import { fetchLogiAdvisorRemoteConfig, LogiFlagDisabledError } from './fetchLogiAdvisorRemoteConfig.js';
import { isUsableFeatureFlagPayload } from './posthogFlagPayload.js';
import { getOrCreateTelemetryInstallId } from './telemetryInstallId.js';
import { getTelemetryEnabled } from './extensionSettings.js';

/** @type {Promise<import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig | null> | null} */
let bootstrapInFlight = null;

/**
 * Prefer keeping a working cache over wiping Logi on transient failures.
 * @param {import('./logiAdvisorCache.js').LogiAdvisorCacheEntry} cached
 */
function keepCachedOrDisabled(cached) {
  if (isLogiAdvisorOperational(cached.config)) {
    return cached.config;
  }
  return clearLogiAdvisorCache({ fromRemote: false });
}

/**
 * Carga config Logi desde logi-proxy.
 * - Sin caché operativa → siempre fetch (primera vez).
 * - Con caché operativa fresca → no llama a advisor-config.
 * - Si el fetch falla → no borra una config operativa previa.
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig | null>}
 */
export async function bootstrapLogiAdvisorViaProxy(opts = {}) {
  const force = opts.force === true;
  const telemetryEnabled = await getTelemetryEnabled();
  if (!telemetryEnabled) {
    // Do not wipe a working config if telemetry was toggled off briefly.
    const cached = await readLogiAdvisorCacheEntry();
    if (isLogiAdvisorOperational(cached.config)) return cached.config;
    return clearLogiAdvisorCache({ fromRemote: false });
  }

  const cached = await readLogiAdvisorCacheEntry();
  if (!force && canSkipLogiAdvisorRemoteFetch(cached)) {
    return cached.config;
  }

  if (bootstrapInFlight && !force) {
    return bootstrapInFlight;
  }

  bootstrapInFlight = (async () => {
    try {
      const installId = await getOrCreateTelemetryInstallId();
      const proxyUrl = cached.config?.proxyUrl || LOGI_PROXY_BOOTSTRAP_URL;
      if (!proxyUrl || !installId) {
        console.warn('[logi] bootstrap omitido: sin proxyUrl o installId', {
          proxyUrl: Boolean(proxyUrl),
          installId: Boolean(installId)
        });
        return keepCachedOrDisabled(cached);
      }

      const remote = await fetchLogiAdvisorRemoteConfig({
        proxyUrl,
        installId
      });

      if (!isUsableFeatureFlagPayload(remote)) {
        console.warn('[logi] proxy devolvió payload no usable', { proxyUrl });
        return keepCachedOrDisabled(cached);
      }

      const config = parseLogiAdvisorConfig(remote);
      if (!isLogiAdvisorOperational(config)) {
        console.warn('[logi] payload del proxy no es operacional', {
          enabled: config.enabled,
          showButton: config.showButton,
          transport: config.transport
        });
        return keepCachedOrDisabled(cached);
      }
      await writeLogiAdvisorCache(config, { fromRemote: true });
      return config;
    } catch (err) {
      if (err instanceof LogiFlagDisabledError) {
        console.warn('[logi] feature flag desactivado en PostHog');
        // Flag off: clear, but do not TTL-lock (fromRemote false → next open retries).
        return clearLogiAdvisorCache({ fromRemote: false });
      }
      console.warn('[logi] bootstrap proxy falló', err);
      return keepCachedOrDisabled(cached);
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
