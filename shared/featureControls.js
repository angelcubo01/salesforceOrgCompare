/** @typedef {'info' | 'warn' | 'error'} FeatureControlSeverity */

/**
 * @typedef {object} FeatureControlMessage
 * @property {string} [es]
 * @property {string} [en]
 * @property {FeatureControlSeverity} [severity]
 * @property {boolean} [blocking]
 * @property {string} [url]
 */

/**
 * @typedef {object} FeatureControlEntry
 * @property {boolean} [hidden]
 * @property {FeatureControlMessage} [message]
 */

/**
 * @typedef {object} FeatureControlActionEntry
 * @property {boolean} [disabled]
 * @property {FeatureControlMessage} [message]
 */

/**
 * @typedef {object} FeatureControlsConfig
 * @property {number} version
 * @property {{ message?: FeatureControlMessage } | null} global
 * @property {Record<string, FeatureControlEntry>} modes
 * @property {Record<string, FeatureControlEntry>} tools
 * @property {Record<string, FeatureControlEntry>} metadataTypes
 * @property {Record<string, FeatureControlActionEntry>} actions
 */

export const FEATURE_CONTROL_MODES = Object.freeze([
  'comparator',
  'development',
  'analysis',
  'monitoring',
  'manifests'
]);

export const FEATURE_CONTROL_ACTIONS = Object.freeze([
  'deploy',
  'retrieve',
  'compare_run',
  'apex_test_run',
  'anonymous_apex_execute',
  'quick_edit_save'
]);

/** @type {FeatureControlsConfig} */
export const DEFAULT_FEATURE_CONTROLS = Object.freeze({
  version: 1,
  global: null,
  modes: {},
  tools: {},
  metadataTypes: {},
  actions: {}
});

const VALID_SEVERITIES = new Set(['info', 'warn', 'error']);

/**
 * @param {unknown} raw
 * @returns {FeatureControlMessage | null}
 */
export function parseFeatureControlMessage(raw) {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const o = /** @type {Record<string, unknown>} */ (value);
  const es = typeof o.es === 'string' ? o.es.trim() : '';
  const en = typeof o.en === 'string' ? o.en.trim() : '';
  if (!es && !en) return null;
  const severityRaw = typeof o.severity === 'string' ? o.severity : 'warn';
  const severity = VALID_SEVERITIES.has(severityRaw)
    ? /** @type {FeatureControlSeverity} */ (severityRaw)
    : 'warn';
  const url = typeof o.url === 'string' && o.url.trim() ? o.url.trim() : undefined;
  return {
    es: es || en,
    en: en || es,
    severity,
    blocking: o.blocking === true,
    ...(url ? { url } : {})
  };
}

/**
 * @param {unknown} raw
 * @returns {FeatureControlEntry}
 */
function parseFeatureControlEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = /** @type {Record<string, unknown>} */ (raw);
  const message = parseFeatureControlMessage(o.message);
  return {
    ...(o.hidden === true ? { hidden: true } : {}),
    ...(message ? { message } : {})
  };
}

/**
 * @param {unknown} raw
 * @returns {FeatureControlActionEntry}
 */
function parseFeatureControlActionEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = /** @type {Record<string, unknown>} */ (raw);
  const message = parseFeatureControlMessage(o.message);
  return {
    ...(o.disabled === true ? { disabled: true } : {}),
    ...(message ? { message } : {})
  };
}

/**
 * @param {unknown} raw
 * @returns {Record<string, FeatureControlEntry>}
 */
function parseEntryMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = /** @type {Record<string, FeatureControlEntry>} */ ({});
  for (const [key, value] of Object.entries(raw)) {
    if (!key) continue;
    const entry = parseFeatureControlEntry(value);
    if (entry.hidden || entry.message) out[key] = entry;
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, FeatureControlActionEntry>}
 */
function parseActionMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = /** @type {Record<string, FeatureControlActionEntry>} */ ({});
  for (const [key, value] of Object.entries(raw)) {
    if (!key) continue;
    const entry = parseFeatureControlActionEntry(value);
    if (entry.disabled || entry.message) out[key] = entry;
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {FeatureControlsConfig}
 */
export function parseFeatureControlsPayload(raw) {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return { ...DEFAULT_FEATURE_CONTROLS, modes: {}, tools: {}, metadataTypes: {}, actions: {} };
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_FEATURE_CONTROLS, modes: {}, tools: {}, metadataTypes: {}, actions: {} };
  }
  const o = /** @type {Record<string, unknown>} */ (value);
  let global = null;
  if (o.global && typeof o.global === 'object' && !Array.isArray(o.global)) {
    const g = /** @type {Record<string, unknown>} */ (o.global);
    const message = parseFeatureControlMessage(g.message);
    if (message) global = { message };
  }
  return {
    version: typeof o.version === 'number' ? o.version : 1,
    global,
    modes: parseEntryMap(o.modes),
    tools: parseEntryMap(o.tools),
    metadataTypes: parseEntryMap(o.metadataTypes),
    actions: parseActionMap(o.actions)
  };
}

/**
 * @param {FeatureControlMessage} message
 * @param {string} [lang]
 */
export function resolveFeatureControlMessageText(message, lang) {
  if (!message) return '';
  const code = String(lang || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
  return (code === 'en' ? message.en : message.es) || message.en || message.es || '';
}

/**
 * @param {FeatureControlsConfig} config
 * @param {string} mode
 */
export function isModeVisible(config, mode) {
  if (!config || !mode) return true;
  return config.modes[mode]?.hidden !== true;
}

/**
 * @param {FeatureControlsConfig} config
 * @param {string} tool
 */
export function isToolVisible(config, tool) {
  if (!config || !tool) return true;
  return config.tools[tool]?.hidden !== true;
}

/**
 * @param {FeatureControlsConfig} config
 * @param {string} artType
 */
export function isMetadataTypeVisible(config, artType) {
  if (!config || !artType) return true;
  return config.metadataTypes[artType]?.hidden !== true;
}

/**
 * @param {FeatureControlsConfig} config
 * @param {string} actionId
 */
export function isActionDisabled(config, actionId) {
  if (!config || !actionId) return false;
  return config.actions[actionId]?.disabled === true;
}

/**
 * @param {FeatureControlsConfig} config
 * @param {string} tool
 * @param {string} [lang]
 * @returns {{ message: string, severity: FeatureControlSeverity, blocking: boolean, url?: string } | null}
 */
export function getToolNotice(config, tool, lang) {
  if (!config || !tool) return null;
  const message = config.tools[tool]?.message;
  if (!message) return null;
  const text = resolveFeatureControlMessageText(message, lang);
  if (!text) return null;
  return {
    message: text,
    severity: message.severity || 'warn',
    blocking: message.blocking === true,
    ...(message.url ? { url: message.url } : {})
  };
}

/**
 * @param {FeatureControlsConfig} config
 * @param {string} [lang]
 */
export function getGlobalNotice(config, lang) {
  if (!config?.global?.message) return null;
  const message = config.global.message;
  const text = resolveFeatureControlMessageText(message, lang);
  if (!text) return null;
  return {
    message: text,
    severity: message.severity || 'warn',
    blocking: message.blocking === true,
    ...(message.url ? { url: message.url } : {})
  };
}

/**
 * @param {FeatureControlsConfig} config
 * @param {string} actionId
 * @param {string} [lang]
 */
export function getActionNotice(config, actionId, lang) {
  if (!config || !actionId) return null;
  const entry = config.actions[actionId];
  if (!entry?.message) return null;
  const text = resolveFeatureControlMessageText(entry.message, lang);
  if (!text) return null;
  return {
    message: text,
    severity: entry.message.severity || 'error',
    blocking: true,
    ...(entry.message.url ? { url: entry.message.url } : {})
  };
}

/**
 * @param {FeatureControlsConfig} config
 * @param {string} mode
 * @param {string} [lang]
 */
export function getModeNotice(config, mode, lang) {
  if (!config || !mode) return null;
  const message = config.modes[mode]?.message;
  if (!message) return null;
  const text = resolveFeatureControlMessageText(message, lang);
  if (!text) return null;
  return {
    message: text,
    severity: message.severity || 'warn',
    blocking: message.blocking === true,
    ...(message.url ? { url: message.url } : {})
  };
}
