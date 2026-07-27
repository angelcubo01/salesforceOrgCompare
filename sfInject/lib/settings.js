/**
 * Ajustes de integración UI en páginas Salesforce (content scripts).
 * Persistidos en chrome.storage.local.
 */
import { SF_INJECT_INTEGRATION_IDS } from './registry.js';

export const SF_INJECT_CONFIG_KEY = 'sfoc_sf_inject';

const DEFAULT_INTEGRATIONS = Object.fromEntries(
  SF_INJECT_INTEGRATION_IDS.map((id) => [id, false])
);

/** Preferencias de UI inyectada (escribibles desde content script). */
export const DEFAULT_SF_INJECT_PREFS = {
  /** Filtro User Trace Flags: solo activas + caducadas ≤30 min. Default inactivo. */
  userTraceFlagsActiveOnly: false
};

const DEFAULTS = {
  /** Master toggle: opt-in; sin activación explícita no hay inyección. */
  enabled: false,
  /** Toggles por integración; opt-in (`true` solo si el usuario las activa). */
  integrations: { ...DEFAULT_INTEGRATIONS },
  /** Preferencias de comportamiento (no son toggles de integración). */
  prefs: { ...DEFAULT_SF_INJECT_PREFS }
};

/** @type {typeof DEFAULTS} */
let cache = structuredClone(DEFAULTS);

function normalizeIntegrations(raw) {
  const next = { ...DEFAULT_INTEGRATIONS };
  if (raw && typeof raw === 'object') {
    for (const id of SF_INJECT_INTEGRATION_IDS) {
      if (Object.prototype.hasOwnProperty.call(raw, id)) {
        next[id] = raw[id] === true;
      }
    }
  }
  return next;
}

/**
 * @param {unknown} raw
 * @returns {typeof DEFAULT_SF_INJECT_PREFS}
 */
export function normalizeSfInjectPrefs(raw) {
  const next = { ...DEFAULT_SF_INJECT_PREFS };
  if (raw && typeof raw === 'object') {
    if (Object.prototype.hasOwnProperty.call(raw, 'userTraceFlagsActiveOnly')) {
      next.userTraceFlagsActiveOnly =
        /** @type {{ userTraceFlagsActiveOnly?: unknown }} */ (raw).userTraceFlagsActiveOnly === true;
    }
  }
  return next;
}

/** @param {unknown} partial */
export function normalizeSfInjectConfig(partial) {
  const src = partial && typeof partial === 'object' ? partial : {};
  return {
    enabled: src.enabled === true,
    integrations: normalizeIntegrations(src.integrations),
    prefs: normalizeSfInjectPrefs(src.prefs)
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
  const merged = {
    ...cache,
    ...partial,
    integrations: partial.integrations
      ? { ...cache.integrations, ...partial.integrations }
      : cache.integrations,
    prefs: partial.prefs ? { ...cache.prefs, ...partial.prefs } : cache.prefs
  };
  cache = normalizeSfInjectConfig(merged);
  try {
    await chrome.storage.local.set({ [SF_INJECT_CONFIG_KEY]: cache });
  } catch {
    /* ignore */
  }
  return cache;
}

/**
 * Solo preferencias (content scripts en Debug Logs pueden llamar esto).
 * @param {Partial<typeof DEFAULT_SF_INJECT_PREFS>} prefsPartial
 */
export async function saveSfInjectPrefs(prefsPartial) {
  return saveSfInjectSettings({ prefs: prefsPartial || {} });
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
  return cfg.integrations?.[integrationId] === true;
}
