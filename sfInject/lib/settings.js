/**
 * Ajustes de integración UI en páginas Salesforce (content scripts).
 * Persistidos en chrome.storage.local.
 */
import { SF_INJECT_INTEGRATION_IDS } from './registry.js';

export const SF_INJECT_CONFIG_KEY = 'sfoc_sf_inject';

const DEFAULT_INTEGRATIONS = Object.fromEntries(
  SF_INJECT_INTEGRATION_IDS.map((id) => [id, true])
);

const DEFAULTS = {
  /** Master toggle: activa content scripts e inyección DOM. */
  enabled: true,
  /** Toggles por integración; `false` desactiva solo ese control. */
  integrations: { ...DEFAULT_INTEGRATIONS }
};

/** @type {typeof DEFAULTS} */
let cache = structuredClone(DEFAULTS);

function normalizeIntegrations(raw) {
  const next = { ...DEFAULT_INTEGRATIONS };
  if (raw && typeof raw === 'object') {
    for (const id of SF_INJECT_INTEGRATION_IDS) {
      if (Object.prototype.hasOwnProperty.call(raw, id)) {
        next[id] = raw[id] !== false;
      }
    }
  }
  return next;
}

/** @param {unknown} partial */
export function normalizeSfInjectConfig(partial) {
  const src = partial && typeof partial === 'object' ? partial : {};
  return {
    enabled: src.enabled !== false,
    integrations: normalizeIntegrations(src.integrations)
  };
}

export async function loadSfInjectSettings() {
  try {
    const r = await chrome.storage.local.get(SF_INJECT_CONFIG_KEY);
    cache = normalizeSfInjectConfig(r[SF_INJECT_CONFIG_KEY]);
  } catch {
    cache = normalizeSfInjectConfig({});
  }
  return cache;
}

/** @param {Partial<typeof DEFAULTS>} partial */
export async function saveSfInjectSettings(partial) {
  cache = normalizeSfInjectConfig({ ...cache, ...partial });
  if (partial.integrations) {
    cache.integrations = normalizeIntegrations({ ...cache.integrations, ...partial.integrations });
  }
  try {
    await chrome.storage.local.set({ [SF_INJECT_CONFIG_KEY]: cache });
  } catch {
    /* ignore */
  }
  return cache;
}

export function getSfInjectSettingsSnapshot() {
  return structuredClone(cache);
}

/**
 * @param {typeof DEFAULTS | undefined} settings
 * @param {string} integrationId
 */
export function isSfInjectIntegrationEnabled(settings, integrationId) {
  const cfg = settings || cache;
  if (!cfg.enabled) return false;
  if (!SF_INJECT_INTEGRATION_IDS.includes(integrationId)) return false;
  return cfg.integrations?.[integrationId] !== false;
}
