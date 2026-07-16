/**
 * Idiomas de respuesta de Logi (independientes del idioma de la UI de la extensión).
 * Por defecto: inglés.
 */

/** @typedef {{ code: string, nameEn: string, nativeName: string }} LogiLanguageOption */

/** @type {readonly LogiLanguageOption[]} */
export const LOGI_LANGUAGES = Object.freeze([
  { code: 'en', nameEn: 'English', nativeName: 'English' },
  { code: 'es', nameEn: 'Spanish', nativeName: 'Español' },
  { code: 'fr', nameEn: 'French', nativeName: 'Français' },
  { code: 'de', nameEn: 'German', nativeName: 'Deutsch' },
  { code: 'pt', nameEn: 'Portuguese', nativeName: 'Português' },
  { code: 'it', nameEn: 'Italian', nativeName: 'Italiano' },
  { code: 'nl', nameEn: 'Dutch', nativeName: 'Nederlands' },
  { code: 'pl', nameEn: 'Polish', nativeName: 'Polski' },
  { code: 'ru', nameEn: 'Russian', nativeName: 'Русский' },
  { code: 'zh', nameEn: 'Chinese (Simplified)', nativeName: '简体中文' },
  { code: 'ja', nameEn: 'Japanese', nativeName: '日本語' },
  { code: 'ko', nameEn: 'Korean', nativeName: '한국어' },
  { code: 'ar', nameEn: 'Arabic', nativeName: 'العربية' },
  { code: 'hi', nameEn: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'tr', nameEn: 'Turkish', nativeName: 'Türkçe' }
]);

export const LOGI_LANGUAGE_CODES = Object.freeze(LOGI_LANGUAGES.map((l) => l.code));

export const DEFAULT_LOGI_LANGUAGE = 'en';

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeLogiLanguage(raw) {
  const code = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!code) return DEFAULT_LOGI_LANGUAGE;
  // Accept BCP-47 prefixes (e.g. en-US → en, pt-BR → pt, zh-CN → zh)
  const base = code.split(/[-_]/)[0] || code;
  if (LOGI_LANGUAGE_CODES.includes(base)) return base;
  if (LOGI_LANGUAGE_CODES.includes(code)) return code;
  return DEFAULT_LOGI_LANGUAGE;
}

/**
 * @param {string} code
 * @returns {LogiLanguageOption}
 */
export function getLogiLanguageOption(code) {
  const normalized = normalizeLogiLanguage(code);
  return LOGI_LANGUAGES.find((l) => l.code === normalized) || LOGI_LANGUAGES[0];
}

/**
 * Label for settings UI: "Español — Spanish"
 * @param {LogiLanguageOption} lang
 */
export function formatLogiLanguageLabel(lang) {
  if (!lang) return 'English';
  if (lang.nativeName === lang.nameEn) return lang.nameEn;
  return `${lang.nativeName} — ${lang.nameEn}`;
}
