/**
 * Preferencias de usuario para modos Logi (chrome.storage.local).
 */

/** @typedef {'free' | 'byok'} LogiUserMode */

import {
  DEFAULT_LOGI_LANGUAGE,
  normalizeLogiLanguage
} from './logiLanguages.js';

export const LOGI_USER_SETTINGS_KEY = 'sfoc_logi_user_settings';

export const LOGI_USER_MODES = Object.freeze(['free', 'byok']);

const DEFAULTS = Object.freeze({
  logiMode: /** @type {LogiUserMode} */ ('free'),
  logiLanguage: DEFAULT_LOGI_LANGUAGE,
  logiByokOpenRouterKey: null,
  logiByokModels: /** @type {string[]} */ ([]),
  logiSelectedPremiumModel: null
});

/** @type {typeof DEFAULTS} */
let cache = { ...DEFAULTS, logiByokModels: [] };

/**
 * @param {unknown} raw
 * @returns {LogiUserMode}
 */
export function normalizeLogiUserMode(raw) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (s === 'payg') return 'free';
  return LOGI_USER_MODES.includes(/** @type {LogiUserMode} */ (s))
    ? /** @type {LogiUserMode} */ (s)
    : 'free';
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
function normalizeOptionalKey(raw) {
  if (raw == null || raw === '') return null;
  const s = typeof raw === 'string' ? raw.trim() : String(raw).trim();
  return s || null;
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeModelList(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const id = String(item || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id.slice(0, 120));
    if (out.length >= 10) break;
  }
  return out;
}

/**
 * @param {unknown} partial
 */
export function normalizeLogiUserSettings(partial) {
  const src = partial && typeof partial === 'object' ? partial : {};
  const record = /** @type {Record<string, unknown>} */ (src);
  return {
    logiMode: normalizeLogiUserMode(record.logiMode),
    logiLanguage: normalizeLogiLanguage(record.logiLanguage),
    logiByokOpenRouterKey: normalizeOptionalKey(record.logiByokOpenRouterKey),
    logiByokModels: normalizeModelList(record.logiByokModels),
    logiSelectedPremiumModel: normalizeOptionalKey(record.logiSelectedPremiumModel)
  };
}

export async function loadLogiUserSettings() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const r = await chrome.storage.local.get(LOGI_USER_SETTINGS_KEY);
      cache = normalizeLogiUserSettings(r[LOGI_USER_SETTINGS_KEY]);
    } else {
      cache = normalizeLogiUserSettings({});
    }
  } catch {
    cache = normalizeLogiUserSettings({});
  }
  return { ...cache, logiByokModels: [...cache.logiByokModels] };
}

/**
 * @param {Partial<typeof DEFAULTS>} partial
 */
export async function saveLogiUserSettings(partial) {
  cache = normalizeLogiUserSettings({ ...cache, ...partial });
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [LOGI_USER_SETTINGS_KEY]: cache });
    }
  } catch {
    /* ignore */
  }
  return { ...cache, logiByokModels: [...cache.logiByokModels] };
}

export function getLogiUserSettingsSnapshot() {
  return { ...cache, logiByokModels: [...cache.logiByokModels] };
}

/** Para tests. */
export function resetLogiUserSettingsForTests() {
  cache = normalizeLogiUserSettings({});
}

/**
 * Sanitiza settings para UI/telemetría (nunca expone API keys).
 * @param {ReturnType<typeof normalizeLogiUserSettings>} settings
 */
export function sanitizeLogiUserSettingsForUi(settings) {
  return {
    logiMode: settings.logiMode,
    logiLanguage: normalizeLogiLanguage(settings.logiLanguage),
    hasByokKey: Boolean(settings.logiByokOpenRouterKey),
    logiByokModels: [...(settings.logiByokModels || [])],
    logiSelectedPremiumModel: settings.logiSelectedPremiumModel
  };
}
