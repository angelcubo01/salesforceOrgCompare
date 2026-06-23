import {
  parseFeatureControlMessage,
  resolveFeatureControlMessageText
} from './featureControls.js';
import {
  getExtensionVersion,
  matchesVersionTarget,
  parseVersionTarget
} from './versionTarget.js';

/** @typedef {'once' | 'always'} PopupNoticeFrequency */

/** @typedef {import('./versionTarget.js').VersionTarget} VersionTarget */

/**
 * @typedef {object} PopupNoticeConfig
 * @property {boolean} enabled
 * @property {string} es
 * @property {string} en
 * @property {FeatureControlSeverity} severity
 * @property {PopupNoticeFrequency} frequency
 * @property {boolean} dismissible
 * @property {{ es?: string, en?: string } | null} dismissLabel
 * @property {string} [url]
 * @property {VersionTarget} [versionTarget]
 */

/**
 * @typedef {object} PopupOpenAppConfig
 * @property {boolean} disabled
 * @property {FeatureControlMessage | null} message
 * @property {VersionTarget} [versionTarget]
 */

/**
 * @typedef {object} PopupControlsConfig
 * @property {number} version
 * @property {boolean} flagActive
 * @property {VersionTarget | null} [rootVersionTarget]
 * @property {PopupNoticeConfig | null} notice
 * @property {PopupOpenAppConfig} openApp
 */

/** @type {PopupControlsConfig} */
export const DEFAULT_POPUP_CONTROLS = Object.freeze({
  version: 1,
  flagActive: false,
  rootVersionTarget: null,
  notice: null,
  openApp: { disabled: false, message: null }
});

const VALID_SEVERITIES = new Set(['info', 'warn', 'error']);
const VALID_FREQUENCIES = new Set(['once', 'always']);

/**
 * @param {PopupControlsConfig | null | undefined} config
 * @param {string} [extensionVersion]
 * @returns {boolean}
 */
function popupConfigAppliesToVersion(config, extensionVersion) {
  if (!config) return false;
  const version = extensionVersion ?? getExtensionVersion();
  return matchesVersionTarget(config.rootVersionTarget ?? null, version);
}

/**
 * @param {{ versionTarget?: VersionTarget } | null | undefined} section
 * @param {string} [extensionVersion]
 * @returns {boolean}
 */
function popupSectionAppliesToVersion(section, extensionVersion) {
  if (!section) return false;
  const version = extensionVersion ?? getExtensionVersion();
  return matchesVersionTarget(section.versionTarget, version);
}

/**
 * @param {unknown} raw
 * @returns {{ es?: string, en?: string } | null}
 */
function parseDismissLabel(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const es = typeof o.es === 'string' ? o.es.trim() : '';
  const en = typeof o.en === 'string' ? o.en.trim() : '';
  if (!es && !en) return null;
  return { es: es || en, en: en || es };
}

/**
 * @param {unknown} raw
 * @returns {PopupNoticeConfig | null}
 */
function parseNoticeConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (o.enabled !== true) return null;

  const message = parseFeatureControlMessage(raw);
  if (!message) return null;

  const frequencyRaw = typeof o.frequency === 'string' ? o.frequency : 'once';
  const frequency = VALID_FREQUENCIES.has(frequencyRaw)
    ? /** @type {PopupNoticeFrequency} */ (frequencyRaw)
    : 'once';

  const versionTarget = parseVersionTarget(o);

  return {
    enabled: true,
    es: message.es,
    en: message.en,
    severity: message.severity || 'info',
    frequency,
    dismissible: o.dismissible !== false,
    dismissLabel: parseDismissLabel(o.dismissLabel),
    ...(message.url ? { url: message.url } : {}),
    ...(versionTarget ? { versionTarget } : {})
  };
}

/**
 * @param {unknown} raw
 * @returns {PopupOpenAppConfig}
 */
function parseOpenAppConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { disabled: false, message: null };
  }
  const o = /** @type {Record<string, unknown>} */ (raw);
  const message = parseFeatureControlMessage(o.message);
  const versionTarget = parseVersionTarget(o);
  return {
    disabled: o.disabled === true,
    ...(message ? { message } : { message: null }),
    ...(versionTarget ? { versionTarget } : {})
  };
}

/**
 * @param {unknown} raw
 * @param {{ flagActive?: boolean }} [opts]
 * @returns {PopupControlsConfig}
 */
export function parsePopupControlsPayload(raw, opts = {}) {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return { ...DEFAULT_POPUP_CONTROLS, flagActive: opts.flagActive === true };
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_POPUP_CONTROLS, flagActive: opts.flagActive === true };
  }
  const o = /** @type {Record<string, unknown>} */ (value);
  const rootVersionTarget = parseVersionTarget(o);
  const notice = parseNoticeConfig(o.notice);
  const openApp = parseOpenAppConfig(o.openApp);
  return {
    version: typeof o.version === 'number' ? o.version : 1,
    flagActive: opts.flagActive === true,
    ...(rootVersionTarget ? { rootVersionTarget } : {}),
    notice,
    openApp
  };
}

/**
 * @param {PopupNoticeConfig} notice
 * @param {string} [lang]
 */
export function resolveNoticeText(notice, lang) {
  if (!notice) return '';
  const code = String(lang || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
  return (code === 'en' ? notice.en : notice.es) || notice.en || notice.es || '';
}

/**
 * @param {PopupNoticeConfig} notice
 * @param {string} [lang]
 */
export function resolveDismissLabelText(notice, lang) {
  if (!notice?.dismissLabel) return '';
  const code = String(lang || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
  const label = notice.dismissLabel;
  return (code === 'en' ? label.en : label.es) || label.en || label.es || '';
}

/**
 * @param {PopupOpenAppConfig} openApp
 * @param {string} [lang]
 */
export function resolveOpenAppTooltip(openApp, lang) {
  if (!openApp?.message) return '';
  return resolveFeatureControlMessageText(openApp.message, lang);
}

/**
 * @param {PopupNoticeConfig} notice
 */
export function buildNoticeFingerprint(notice) {
  if (!notice) return '';
  const parts = [notice.es, notice.en, notice.severity, notice.frequency, String(notice.dismissible)];
  let hash = 0;
  const str = parts.join('\u001f');
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return `pn_${(hash >>> 0).toString(36)}`;
}

/**
 * @param {PopupControlsConfig} config
 */
export function isRemoteNoticeActive(config, extensionVersion) {
  if (!popupConfigAppliesToVersion(config, extensionVersion)) return false;
  if (!popupSectionAppliesToVersion(config.notice, extensionVersion)) return false;
  return config.flagActive === true && !!config.notice?.enabled;
}

/**
 * @param {PopupControlsConfig} config
 * @param {string} [extensionVersion]
 */
export function isOpenAppDisabled(config, extensionVersion) {
  if (!popupConfigAppliesToVersion(config, extensionVersion)) return false;
  if (!popupSectionAppliesToVersion(config.openApp, extensionVersion)) return false;
  return config.flagActive === true && config.openApp.disabled === true;
}

/**
 * @param {PopupControlsConfig} config
 * @param {{ dismissedFingerprint?: string | null, legacyTelemetryDismissed?: boolean }} prefsState
 */
export function shouldShowRemoteNotice(config, prefsState, extensionVersion) {
  const notice = config.notice;
  if (!isRemoteNoticeActive(config, extensionVersion) || !notice) return false;
  if (notice.frequency === 'always') return true;
  const fp = buildNoticeFingerprint(notice);
  if (prefsState.dismissedFingerprint === fp) return false;
  return true;
}

/**
 * Aviso i18n local cuando no hay flag remoto. Desactivado: flag OFF = sin aviso.
 * @param {PopupControlsConfig} _config
 * @param {{ dismissedFingerprint?: string | null, legacyTelemetryDismissed?: boolean }} _prefsState
 */
export function shouldShowLegacyTelemetryNotice(_config, _prefsState) {
  return false;
}
