/**
 * Ajustes de integración UI en páginas Salesforce (content scripts).
 * Persistidos en chrome.storage.local.
 */
import { SF_INJECT_INTEGRATION_IDS } from './registry.js';
import { normalizeSetupCommandPaletteShortcut } from '../content/setupCommandPaletteUtils.js';

export const SF_INJECT_CONFIG_KEY = 'sfoc_sf_inject';
/** Plantilla de enlaces que se puede copiar a todos los entornos desde Ajustes. */
export const SF_INJECT_GLOBAL_QUICK_LINKS_KEY = '__global__';

const DEFAULT_INTEGRATIONS = Object.fromEntries(
  SF_INJECT_INTEGRATION_IDS.map((id) => [id, false])
);

/** Preferencias de UI inyectada (escribibles desde content script). */
export const DEFAULT_SF_INJECT_PREFS = {
  /** Filtro User Trace Flags: solo activas + caducadas ≤30 min. Default inactivo. */
  userTraceFlagsActiveOnly: false,
  /** Atajo configurable para abrir la paleta de Setup en Salesforce. */
  setupCommandPaletteShortcut: 'Ctrl+K'
};

const QUICK_LINK_TYPES = new Set(['sfoc', 'custom']);
const QUICK_LINK_ICONS = new Set([
  'link', 'bookmark', 'star', 'home', 'settings', 'terminal-2', 'database', 'package', 'activity', 'shield-lock', 'help-circle', 'file-code'
]);
const QUICK_LINK_COLOR = /^#[0-9a-f]{6}$/i;

function normalizeQuickLink(raw, index) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const type = QUICK_LINK_TYPES.has(src.type) ? src.type : 'custom';
  const id = String(src.id || `quick-link-${index + 1}`).trim().slice(0, 96);
  const color = String(src.color || '#0b5cab').trim();
  const rawUrl = String(src.url || '').trim().slice(0, 2048);
  // Los enlaces personalizados se resuelven dentro de Salesforce, no a una URL externa.
  const url = type === 'custom' && rawUrl && /^\/(?!\/)/.test(rawUrl) ? rawUrl : '';
  return {
    id: id || `quick-link-${index + 1}`,
    type,
    label: String(src.label || '').trim().slice(0, 100),
    toolId: String(src.toolId || '').trim().slice(0, 80),
    url,
    icon: QUICK_LINK_ICONS.has(src.icon) ? src.icon : 'link',
    color: QUICK_LINK_COLOR.test(color) ? color.toLowerCase() : '#0b5cab'
  };
}

/** @param {unknown} raw */
export function normalizeSfInjectQuickLinks(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result = {};
  for (const [orgId, links] of Object.entries(raw)) {
    const id = String(orgId || '').trim().slice(0, 128);
    if (!id || !Array.isArray(links)) continue;
    const seen = new Set();
    const seenSfocTools = new Set();
    const normalized = [];
    for (const [index, link] of links.entries()) {
      const next = normalizeQuickLink(link, index);
      if (seen.has(next.id)) continue;
      if (next.type === 'sfoc' && next.toolId && seenSfocTools.has(next.toolId)) continue;
      seen.add(next.id);
      if (next.type === 'sfoc' && next.toolId) seenSfocTools.add(next.toolId);
      normalized.push(next);
      if (normalized.length >= 50) break;
    }
    result[id] = normalized;
  }
  return result;
}

const DEFAULTS = {
  /** Master toggle: opt-in; sin activación explícita no hay inyección. */
  enabled: false,
  /** Toggles por integración; opt-in (`true` solo si el usuario las activa). */
  integrations: { ...DEFAULT_INTEGRATIONS },
  /** Preferencias de comportamiento (no son toggles de integración). */
  prefs: { ...DEFAULT_SF_INJECT_PREFS },
  quickLinks: {}
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
    if (Object.prototype.hasOwnProperty.call(raw, 'setupCommandPaletteShortcut')) {
      next.setupCommandPaletteShortcut = normalizeSetupCommandPaletteShortcut(raw.setupCommandPaletteShortcut);
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
    prefs: normalizeSfInjectPrefs(src.prefs),
    quickLinks: normalizeSfInjectQuickLinks(src.quickLinks)
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
    prefs: partial.prefs ? { ...cache.prefs, ...partial.prefs } : cache.prefs,
    quickLinks: partial.quickLinks
      ? { ...cache.quickLinks, ...partial.quickLinks }
      : cache.quickLinks
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
