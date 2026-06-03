/** Contexto de audiencia/dispositivo seguro para PostHog (sin PII ni fingerprinting fino). */

/** @type {Record<string, string> | null} */
let cache = null;

/**
 * @param {string} ua
 * @returns {{ browser: string, browser_major: string }}
 */
export function parseBrowserFromUserAgent(ua) {
  const s = String(ua || '');
  const chrome = /(?:Chrome|CriOS)\/(\d+)/.exec(s);
  if (chrome) return { browser: 'chrome', browser_major: chrome[1] };
  const edge = /Edg\/(\d+)/.exec(s);
  if (edge) return { browser: 'edge', browser_major: edge[1] };
  return { browser: 'other', browser_major: '' };
}

function readTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

/**
 * @returns {Promise<Record<string, string>>}
 */
export async function getTelemetryAudienceContext() {
  if (cache) return { ...cache };

  const manifest = chrome.runtime.getManifest();
  let uiLanguage = '';
  try {
    uiLanguage = chrome.i18n.getUILanguage() || '';
  } catch {
    /* ignore */
  }

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const { browser, browser_major } = parseBrowserFromUserAgent(ua);
  const browserLanguage =
    typeof navigator !== 'undefined' && navigator.language ? navigator.language : '';

  /** @type {Record<string, string>} */
  const out = {
    extension_version: manifest.version || '',
    ui_language: uiLanguage.slice(0, 16),
    browser_language: browserLanguage.slice(0, 16),
    timezone: readTimezone().slice(0, 64),
    browser,
    browser_major: browser_major.slice(0, 8),
    device_class: 'desktop'
  };

  try {
    const platform = await chrome.runtime.getPlatformInfo();
    if (platform?.os) out.os_platform = String(platform.os).slice(0, 16);
    if (platform?.arch) out.os_arch = String(platform.arch).slice(0, 16);
  } catch {
    /* ignore */
  }

  cache = out;
  return { ...out };
}

/** Limpia caché (tests). */
export function resetTelemetryAudienceCache() {
  cache = null;
}

/**
 * Propiedades de persona PostHog ($set) a partir del contexto de audiencia.
 * @param {Record<string, string>} audience
 */
export function buildPostHogPersonProperties(audience) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, raw] of Object.entries(audience)) {
    if (raw == null || raw === '') continue;
    out[key] = String(raw).slice(0, 128);
  }
  return out;
}

/** @deprecated Alias legacy para tests; usar buildPostHogPersonProperties. */
export function buildGa4UserProperties(audience) {
  const flat = buildPostHogPersonProperties(audience);
  /** @type {Record<string, { value: string }>} */
  const out = {};
  for (const [key, value] of Object.entries(flat)) {
    out[key] = { value };
  }
  return out;
}

/** Parámetros de evento derivados del contexto (dimensiones de evento en exploraciones). */
export function audienceParamsForEvent(audience) {
  /** @type {Record<string, string | number>} */
  const p = {};
  if (audience.os_platform) p.os_platform = audience.os_platform;
  if (audience.os_arch) p.os_arch = audience.os_arch;
  if (audience.browser) p.browser = audience.browser;
  if (audience.browser_major) p.browser_major = audience.browser_major;
  if (audience.timezone) p.timezone = audience.timezone;
  if (audience.ui_language) p.ui_language = audience.ui_language;
  if (audience.device_class) p.device_class = audience.device_class;
  return p;
}
