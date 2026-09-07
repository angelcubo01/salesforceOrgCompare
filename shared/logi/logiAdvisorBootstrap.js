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
import { applyQuotaBonuses } from './logiQuotaBonus.js';
import { isUsableFeatureFlagPayload } from '../posthogFlagPayload.js';
import { getOrCreateTelemetryInstallId } from '../telemetryInstallId.js';
import { getTelemetryEnabled } from '../extensionSettings.js';

/** @type {Promise<import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig | null> | null} */
let bootstrapInFlight = null;

/**
 * Prefer keeping a working cache over wiping Logi on transient failures.
 * @param {import('./logiAdvisorCache.js').LogiAdvisorCacheEntry} cached
 */
async function keepCachedOrDisabled(cached, opts = {}) {
  const config = isLogiAdvisorOperational(cached.config)
    ? cached.config
    : await clearLogiAdvisorCache({ fromRemote: false });
  if (opts.cacheAsRemote === true) {
    await writeLogiAdvisorCache(config, { fromRemote: true });
  }
  return config;
}

/**
 * @param {unknown} remotePayload
 * @param {unknown} quotaBonus
 */
function parseConfigWithQuotaBonus(remotePayload, quotaBonus) {
  const config = parseLogiAdvisorConfig(remotePayload);
  return applyQuotaBonuses(config, quotaBonus);
}

/**
 * Carga config Logi desde logi-proxy.
 * - force:true solo refresca si el lease local de 6h expiró.
 * - Sin force nunca abre red: chat/uso reutilizan cache.
 * - Si ya hay un bootstrap en vuelo, se reutiliza también con force (anti-herd).
 * - Si el fetch falla de forma transitoria → no borra una config operativa previa.
 * - Si el proxy responde flag_disabled (fuera de cohort) → limpia caché.
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
  if (canSkipLogiAdvisorRemoteFetch(cached, { force })) {
    return cached.config;
  }

  // Solo Ajustes y el detalle de un log solicitan force:true. Las operaciones
  // posteriores (chat, límites, guardar preferencias) no pueden abrir una
  // comprobación de acceso propia.
  if (!force) {
    return cached.config;
  }

  if (bootstrapInFlight) {
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
        return force ? clearLogiAdvisorCache({ fromRemote: false }) : keepCachedOrDisabled(cached);
      }

      const remote = await fetchLogiAdvisorRemoteConfig({
        proxyUrl,
        installId
      });

      if (!isUsableFeatureFlagPayload(remote.payload)) {
        console.warn('[logi] proxy devolvió payload no usable', { proxyUrl });
        return keepCachedOrDisabled(cached, { cacheAsRemote: true });
      }

      const config = parseConfigWithQuotaBonus(remote.payload, remote.quotaBonus);
      if (!isLogiAdvisorOperational(config)) {
        console.warn('[logi] payload del proxy no es operacional', {
          enabled: config.enabled,
          showButton: config.showButton,
          transport: config.transport
        });
        // Una respuesta válida que deshabilita Logi también se cachea: evita
        // repetir la consulta de cohorte en cada apertura de log.
        await writeLogiAdvisorCache(config, { fromRemote: true });
        return config;
      }
      await writeLogiAdvisorCache(config, { fromRemote: true });
      return config;
    } catch (err) {
      if (err instanceof LogiFlagDisabledError) {
        console.warn('[logi] feature flag desactivado en PostHog (fuera de cohort o flag off)');
        return clearLogiAdvisorCache({ fromRemote: true });
      }
      console.warn('[logi] bootstrap proxy falló', err);
      // Incluso un fallo se amortigua durante la ventana para no multiplicar
      // llamadas al proxy al abrir varios logs.
      return keepCachedOrDisabled(cached, { cacheAsRemote: true });
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
