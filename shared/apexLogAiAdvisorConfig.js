/** @typedef {'openrouter_direct' | 'proxy'} LogiTransportMode */
/** @typedef {'free' | 'byok'} LogiUserMode */

import { isEncryptedPosthogPayload } from './posthogFlagPayload.js';
import { normalizeLogiUserMode } from './logiUserSettings.js';

/**
 * @typedef {object} LogiModeLabel
 * @property {string} [es]
 * @property {string} [en]
 */

/**
 * @typedef {object} LogiFreeModeConfig
 * @property {boolean} enabled
 * @property {boolean} default
 * @property {LogiModeLabel} [label]
 */

/**
 * @typedef {object} LogiByokModeConfig
 * @property {boolean} enabled
 * @property {boolean} [default]
 * @property {string[]} allowedModels
 * @property {number} maxModelsInChain
 * @property {boolean} allowCustomModelId
 * @property {boolean} allowModelPickerInChat
 */

/**
 * @typedef {object} LogiModesConfig
 * @property {LogiFreeModeConfig} free
 * @property {LogiByokModeConfig} byok
 */

/**
 * @typedef {object} LogiAdvisorConfig
 * @property {boolean} enabled
 * @property {boolean} beta
 * @property {boolean} showButton
 * @property {boolean} showLogiSettings
 * @property {boolean} requireTelemetry
 * @property {number} maxIterationsPerChat
 * @property {number} maxChatsPerUser
 * @property {number} maxChatsPerDay
 * @property {number} maxChatsPerMonth
 * @property {string} model
 * @property {string[]} models
 * @property {LogiModesConfig} modes
 * @property {LogiTransportMode} transport
 * @property {string | null} openRouterApiKey
 * @property {string | null} proxyUrl
 * @property {string | null} proxyAuthToken
 * @property {number} systemPromptVersion
 * @property {string} personaName
 * @property {boolean} allowedOrgQuery
 * @property {string[]} quickActions
 */

/**
 * @typedef {object} LogiRuntime
 * @property {LogiUserMode} mode
 * @property {LogiUserMode} requestedMode
 * @property {string[]} models
 * @property {LogiTransportMode} transport
 * @property {'platform' | 'user' | 'none'} apiKeySource
 * @property {string | null} openRouterApiKey
 * @property {boolean} premiumActive
 * @property {boolean} modeFallback
 * @property {string | null} fallbackReason
 * @property {string | null} selectedModel
 */

export const LOGI_ADVISOR_FLAG = 'sfoc_apex_log_ai_advisor';

export const LOGI_PROXY_BOOTSTRAP_URL =
  'https://sfoc-logi-proxy.angelpicadocuadrado.workers.dev/v1/chat';

export const LOGI_QUICK_ACTION_IDS = Object.freeze([
  'debug_errors',
  'explain_flow',
  'soql_dml',
  'test_failure',
  'limits',
  'suggest_fix'
]);

export const OPENROUTER_MAX_MODELS_PER_REQUEST = 3;

export const DEFAULT_LOGI_MODELS = Object.freeze([
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-26b-a4b-it:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'cohere/north-mini-code:free',
  'poolside/laguna-m.1:free',
  'openai/gpt-oss-20b:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'tencent/hy3:free',
  'openai/gpt-oss-120b:free',
  'qwen/qwen3-coder:free',
  'meta-llama/llama-3.3-70b-instruct:free'
]);

export const DEFAULT_LOGI_BYOK_MODELS = Object.freeze([
  'anthropic/claude-opus-4',
  'anthropic/claude-sonnet-4',
  'anthropic/claude-3.7-sonnet',
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3.5-haiku',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'openai/gpt-4-turbo',
  'openai/o1',
  'openai/o3-mini',
  'google/gemini-2.5-pro-preview',
  'qwen/qwen3-coder'
]);

/** @type {LogiModesConfig} */
export const DEFAULT_LOGI_MODES = Object.freeze({
  free: {
    enabled: true,
    default: true,
    label: { es: 'Gratuito', en: 'Free' }
  },
  byok: {
    enabled: false,
    default: false,
    allowedModels: [...DEFAULT_LOGI_BYOK_MODELS],
    maxModelsInChain: 8,
    allowCustomModelId: false,
    allowModelPickerInChat: true
  }
});

/** @type {LogiAdvisorConfig} */
export const DEFAULT_LOGI_ADVISOR_CONFIG = Object.freeze({
  enabled: false,
  beta: true,
  showButton: false,
  showLogiSettings: false,
  requireTelemetry: true,
  maxIterationsPerChat: 10,
  maxChatsPerUser: 20,
  maxChatsPerDay: 5,
  maxChatsPerMonth: 50,
  model: DEFAULT_LOGI_MODELS[0],
  models: [...DEFAULT_LOGI_MODELS],
  modes: structuredClone(DEFAULT_LOGI_MODES),
  transport: 'openrouter_direct',
  openRouterApiKey: null,
  proxyUrl: null,
  proxyAuthToken: null,
  systemPromptVersion: 1,
  personaName: 'Logi',
  allowedOrgQuery: true,
  quickActions: [...LOGI_QUICK_ACTION_IDS]
});

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 */
function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function parseModelChain(raw, fallback) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const record = /** @type {Record<string, unknown>} */ (o);
  const hasModelsArray = Array.isArray(record.models);
  let chain = hasModelsArray
    ? record.models.map((x) => String(x).trim()).filter(Boolean)
    : [...fallback];
  if (!chain.length) chain = [...fallback];

  const explicit =
    hasModelsArray && typeof record.model === 'string' && record.model.trim()
      ? record.model.trim()
      : '';
  const seen = new Set();
  const deduped = [];
  for (const id of [explicit, ...chain]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push(id);
  }
  return deduped.length ? deduped : [...fallback];
}

/**
 * @param {unknown} raw
 * @param {string[]} fallback
 * @returns {string[]}
 */
function parseStringList(raw, fallback, max = 20) {
  if (!Array.isArray(raw)) return [...fallback];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const id = String(item || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id.slice(0, 120));
    if (out.length >= max) break;
  }
  return out.length ? out : [...fallback];
}

/**
 * @param {unknown} raw
 * @returns {LogiModesConfig}
 */
export function parseLogiModesConfig(raw) {
  const base = structuredClone(DEFAULT_LOGI_MODES);
  if (!raw || typeof raw !== 'object') return base;
  const o = /** @type {Record<string, unknown>} */ (raw);

  if (o.free && typeof o.free === 'object') {
    const f = /** @type {Record<string, unknown>} */ (o.free);
    base.free.enabled = f.enabled !== false;
    base.free.default = f.default === true;
    if (f.label && typeof f.label === 'object') {
      const l = /** @type {Record<string, unknown>} */ (f.label);
      base.free.label = {
        es: typeof l.es === 'string' ? l.es : base.free.label?.es,
        en: typeof l.en === 'string' ? l.en : base.free.label?.en
      };
    }
  }

  if (o.byok && typeof o.byok === 'object') {
    const b = /** @type {Record<string, unknown>} */ (o.byok);
    base.byok.enabled = b.enabled === true;
    base.byok.default = b.default === true;
    base.byok.allowedModels = parseStringList(b.allowedModels, DEFAULT_LOGI_BYOK_MODELS, 15);
    base.byok.maxModelsInChain = clampInt(b.maxModelsInChain, 5, 1, 10);
    base.byok.allowCustomModelId = b.allowCustomModelId === true;
    base.byok.allowModelPickerInChat = b.allowModelPickerInChat !== false;
  }

  const defaults = [base.free, base.byok].filter((m) => m.default);
  if (defaults.length !== 1) {
    base.free.default = true;
    base.byok.default = false;
  }

  return base;
}

/**
 * @param {Pick<LogiAdvisorConfig, 'model' | 'models'>} config
 * @param {string} [reqModel]
 * @returns {string[]}
 */
export function resolveLogiModelChain(config, reqModel) {
  const explicit = typeof reqModel === 'string' && reqModel.trim() ? reqModel.trim() : '';
  const base = Array.isArray(config.models) && config.models.length ? config.models : [...DEFAULT_LOGI_MODELS];
  const seen = new Set();
  const chain = [];
  for (const id of [explicit, config.model, ...base]) {
    const m = String(id || '').trim();
    if (!m || seen.has(m)) continue;
    seen.add(m);
    chain.push(m);
  }
  return chain.length ? chain : [...DEFAULT_LOGI_MODELS];
}

/**
 * @param {LogiAdvisorConfig} config
 * @returns {LogiUserMode[]}
 */
export function resolveAllowedLogiModes(config) {
  /** @type {LogiUserMode[]} */
  const allowed = [];
  const modes = config?.modes || DEFAULT_LOGI_MODES;
  if (modes.free?.enabled !== false) allowed.push('free');
  if (modes.byok?.enabled) allowed.push('byok');
  return allowed;
}

/**
 * @param {LogiAdvisorConfig} config
 * @returns {LogiUserMode}
 */
export function resolveDefaultLogiMode(config) {
  const modes = config?.modes || DEFAULT_LOGI_MODES;
  if (modes.free?.default && modes.free?.enabled !== false) return 'free';
  if (modes.byok?.default && modes.byok?.enabled) return 'byok';
  const allowed = resolveAllowedLogiModes(config);
  return allowed[0] || 'free';
}

/**
 * @param {LogiAdvisorConfig} config
 * @param {LogiUserMode} requested
 * @returns {LogiUserMode}
 */
export function coerceLogiUserMode(config, requested) {
  const mode = normalizeLogiUserMode(requested);
  const allowed = resolveAllowedLogiModes(config);
  if (allowed.includes(mode)) return mode;
  return resolveDefaultLogiMode(config);
}

/**
 * @param {LogiAdvisorConfig} config
 * @param {string | null | undefined} modelId
 * @returns {string | null}
 */
export function validateLogiSelectedModel(config, modelId) {
  const id = typeof modelId === 'string' ? modelId.trim() : '';
  if (!id) return null;
  const modes = config?.modes || DEFAULT_LOGI_MODES;
  const allowlist = modes.byok?.allowedModels || DEFAULT_LOGI_BYOK_MODELS;
  if (allowlist.includes(id)) return id;
  if (modes.byok?.allowCustomModelId) return id.slice(0, 120);
  return null;
}

/**
 * @param {LogiAdvisorConfig} config
 * @param {import('./logiUserSettings.js').ReturnType<typeof import('./logiUserSettings.js').normalizeLogiUserSettings>} userSettings
 * @param {string | null} [selectedModelOverride]
 * @returns {LogiRuntime}
 */
export function resolveLogiRuntime(config, userSettings, selectedModelOverride = null) {
  const requestedMode = coerceLogiUserMode(config, userSettings?.logiMode);
  const modes = config?.modes || DEFAULT_LOGI_MODES;
  /** @type {LogiUserMode} */
  let mode = requestedMode;
  let modeFallback = false;
  let fallbackReason = null;
  let premiumActive = false;

  if (mode === 'byok') {
    if (!userSettings?.logiByokOpenRouterKey) {
      mode = 'free';
      modeFallback = true;
      fallbackReason = 'BYOK_NO_KEY';
    } else {
      premiumActive = true;
    }
  }

  const selectedRaw =
    selectedModelOverride != null ? selectedModelOverride : userSettings?.logiSelectedPremiumModel;
  let selectedModel = null;
  /** @type {string[]} */
  let modelChain;

  if (mode === 'byok' && premiumActive) {
    const userModels =
      userSettings?.logiByokModels?.length > 0
        ? userSettings.logiByokModels.slice(0, modes.byok.maxModelsInChain)
        : modes.byok.allowedModels.slice(0, modes.byok.maxModelsInChain);
    selectedModel = validateLogiSelectedModel(config, selectedRaw);
    modelChain = selectedModel
      ? resolveLogiModelChain({ model: selectedModel, models: userModels }, selectedModel)
      : userModels.length
        ? userModels
        : [...modes.byok.allowedModels];
  } else {
    modelChain = resolveLogiModelChain(config);
  }

  /** @type {LogiTransportMode} */
  let transport = config.transport === 'proxy' ? 'proxy' : 'openrouter_direct';
  /** @type {'platform' | 'user' | 'none'} */
  let apiKeySource = 'none';
  let openRouterApiKey = null;

  if (requestedMode === 'byok' && userSettings?.logiByokOpenRouterKey && mode === 'byok') {
    transport = 'openrouter_direct';
    apiKeySource = 'user';
    openRouterApiKey = userSettings.logiByokOpenRouterKey;
  } else if (config.openRouterApiKey) {
    transport = config.transport === 'proxy' && config.proxyUrl ? 'proxy' : 'openrouter_direct';
    apiKeySource = 'platform';
    openRouterApiKey = config.openRouterApiKey;
  } else if (config.proxyUrl) {
    transport = 'proxy';
    apiKeySource = 'platform';
  }

  return {
    mode,
    requestedMode,
    models: modelChain,
    transport,
    apiKeySource,
    openRouterApiKey,
    premiumActive,
    modeFallback,
    fallbackReason,
    selectedModel
  };
}

/**
 * @param {LogiAdvisorConfig} config
 * @param {LogiUserMode} mode
 * @returns {boolean}
 */
export function isLogiModelPickerAllowed(config, mode, runtime) {
  const modes = config?.modes || DEFAULT_LOGI_MODES;
  if (mode !== 'byok') return false;
  return Boolean(modes.byok?.enabled && modes.byok?.allowModelPickerInChat && runtime?.premiumActive);
}

/**
 * @param {LogiAdvisorConfig} config
 * @param {LogiUserMode} mode
 * @param {LogiRuntime} [runtime]
 * @returns {string[]}
 */
export function getLogiModelPickerOptions(config, mode, runtime) {
  if (!isLogiModelPickerAllowed(config, mode, runtime)) return [];
  const modes = config?.modes || DEFAULT_LOGI_MODES;
  const userModels = runtime?.models?.length ? runtime.models : modes.byok.allowedModels;
  return userModels.slice(0, modes.byok.maxModelsInChain);
}

/**
 * @param {unknown} raw
 * @returns {LogiAdvisorConfig}
 */
export function parseLogiAdvisorConfig(raw) {
  let value = raw;
  if (typeof value === 'string') {
    if (isEncryptedPosthogPayload(value)) {
      return structuredClone(DEFAULT_LOGI_ADVISOR_CONFIG);
    }
    try {
      value = JSON.parse(value);
    } catch {
      return structuredClone(DEFAULT_LOGI_ADVISOR_CONFIG);
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return structuredClone(DEFAULT_LOGI_ADVISOR_CONFIG);
  }
  const o = /** @type {Record<string, unknown>} */ (value);
  const transportRaw = typeof o.transport === 'string' ? o.transport.trim() : 'openrouter_direct';
  const transport = transportRaw === 'proxy' ? 'proxy' : 'openrouter_direct';
  const quickRaw = Array.isArray(o.quickActions) ? o.quickActions : DEFAULT_LOGI_ADVISOR_CONFIG.quickActions;
  const quickActions = quickRaw
    .map((x) => String(x).trim())
    .filter((id) => LOGI_QUICK_ACTION_IDS.includes(id));
  const apiKey =
    typeof o.openRouterApiKey === 'string' && o.openRouterApiKey.trim()
      ? o.openRouterApiKey.trim()
      : null;
  const proxyUrl =
    typeof o.proxyUrl === 'string' && o.proxyUrl.trim() ? o.proxyUrl.trim() : null;
  const proxyAuthToken = null;
  const models = parseModelChain(o, DEFAULT_LOGI_MODELS);
  const modes = parseLogiModesConfig(o.modes);

  return {
    enabled: o.enabled === true,
    beta: o.beta !== false,
    showButton: o.showButton === true,
    showLogiSettings: o.showLogiSettings === true,
    requireTelemetry: o.requireTelemetry !== false,
    maxIterationsPerChat: clampInt(o.maxIterationsPerChat, 10, 1, 50),
    maxChatsPerUser: clampInt(o.maxChatsPerUser, 20, 1, 1000),
    maxChatsPerDay: clampInt(o.maxChatsPerDay, 5, 1, 100),
    maxChatsPerMonth: clampInt(o.maxChatsPerMonth, 50, 1, 500),
    model: models[0],
    models,
    modes,
    transport,
    openRouterApiKey: apiKey,
    proxyUrl,
    proxyAuthToken,
    systemPromptVersion: clampInt(o.systemPromptVersion, 1, 1, 99),
    personaName:
      typeof o.personaName === 'string' && o.personaName.trim()
        ? o.personaName.trim()
        : 'Logi',
    allowedOrgQuery: o.allowedOrgQuery !== false,
    quickActions: quickActions.length ? quickActions : [...LOGI_QUICK_ACTION_IDS]
  };
}

/**
 * @param {LogiAdvisorConfig} config
 * @returns {boolean}
 */
export function isLogiAdvisorOperational(config) {
  if (!config?.enabled || !config.showButton) return false;
  const allowed = resolveAllowedLogiModes(config);
  if (!allowed.length) return false;
  if (config.transport === 'proxy') {
    return Boolean(config.proxyUrl);
  }
  return Boolean(config.openRouterApiKey || config.proxyUrl);
}

/**
 * @param {LogiAdvisorConfig} config
 * @returns {boolean}
 */
export function isLogiSettingsSectionVisible(config) {
  if (!config?.enabled || !config.showLogiSettings) return false;
  return resolveAllowedLogiModes(config).length > 0;
}

/**
 * @param {LogiAdvisorConfig} config
 */
export function sanitizeLogiModesForUi(config) {
  const modes = config?.modes || DEFAULT_LOGI_MODES;
  return {
    free: {
      enabled: modes.free?.enabled !== false,
      default: modes.free?.default === true,
      label: modes.free?.label || DEFAULT_LOGI_MODES.free.label
    },
    byok: {
      enabled: modes.byok?.enabled === true,
      default: modes.byok?.default === true,
      allowedModels: [...(modes.byok?.allowedModels || DEFAULT_LOGI_BYOK_MODELS)],
      allowModelPickerInChat: modes.byok?.allowModelPickerInChat !== false
    }
  };
}
