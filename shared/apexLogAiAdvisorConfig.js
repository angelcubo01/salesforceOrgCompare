/** @typedef {'openrouter_direct' | 'proxy'} LogiTransportMode */

/**
 * @typedef {object} LogiAdvisorConfig
 * @property {boolean} enabled
 * @property {boolean} beta
 * @property {boolean} showButton
 * @property {boolean} requireTelemetry
 * @property {number} maxIterationsPerChat
 * @property {number} maxChatsPerUser
 * @property {number} maxChatsPerDay
 * @property {number} maxChatsPerMonth
 * @property {string} model
 * @property {string[]} models
 * @property {LogiTransportMode} transport
 * @property {string | null} openRouterApiKey
 * @property {string | null} proxyUrl
 * @property {string | null} proxyAuthToken
 * @property {number} systemPromptVersion
 * @property {string} personaName
 * @property {boolean} allowedOrgQuery
 * @property {string[]} quickActions
 */

export const LOGI_ADVISOR_FLAG = 'sfoc_apex_log_ai_advisor';

export const LOGI_QUICK_ACTION_IDS = Object.freeze([
  'debug_errors',
  'explain_flow',
  'soql_dml',
  'test_failure',
  'limits',
  'suggest_fix'
]);

/** OpenRouter: máximo 3 modelos por petición en `models`; el resto se intenta en lotes. */
export const OPENROUTER_MAX_MODELS_PER_REQUEST = 3;

/** Cadena de modelos gratuitos OpenRouter (tool calling) en orden de prioridad. */
export const DEFAULT_LOGI_MODELS = Object.freeze([
  'openai/gpt-oss-120b:free',
  'qwen/qwen3-coder:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'google/gemma-4-26b-a4b-it:free',
  'openai/gpt-oss-20b:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'cohere/north-mini-code:free'
]);

/** @type {LogiAdvisorConfig} */
export const DEFAULT_LOGI_ADVISOR_CONFIG = Object.freeze({
  enabled: false,
  beta: true,
  showButton: false,
  requireTelemetry: true,
  maxIterationsPerChat: 10,
  maxChatsPerUser: 20,
  maxChatsPerDay: 5,
  maxChatsPerMonth: 50,
  model: DEFAULT_LOGI_MODELS[0],
  models: [...DEFAULT_LOGI_MODELS],
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
function parseModelChain(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const record = /** @type {Record<string, unknown>} */ (o);
  const hasModelsArray = Array.isArray(record.models);
  let chain = hasModelsArray
    ? record.models.map((x) => String(x).trim()).filter(Boolean)
    : [...DEFAULT_LOGI_MODELS];
  if (!chain.length) chain = [...DEFAULT_LOGI_MODELS];

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
  return deduped.length ? deduped : [...DEFAULT_LOGI_MODELS];
}

/**
 * Modelos OpenRouter en orden de prioridad (fallback transparente vía `models`).
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
 * @param {unknown} raw
 * @returns {LogiAdvisorConfig}
 */
export function parseLogiAdvisorConfig(raw) {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return { ...DEFAULT_LOGI_ADVISOR_CONFIG };
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_LOGI_ADVISOR_CONFIG };
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
  const proxyAuthToken =
    typeof o.proxyAuthToken === 'string' && o.proxyAuthToken.trim()
      ? o.proxyAuthToken.trim()
      : null;
  const models = parseModelChain(o);

  return {
    enabled: o.enabled === true,
    beta: o.beta !== false,
    showButton: o.showButton === true,
    requireTelemetry: o.requireTelemetry !== false,
    maxIterationsPerChat: clampInt(o.maxIterationsPerChat, 10, 1, 50),
    maxChatsPerUser: clampInt(o.maxChatsPerUser, 20, 1, 1000),
    maxChatsPerDay: clampInt(o.maxChatsPerDay, 5, 1, 100),
    maxChatsPerMonth: clampInt(o.maxChatsPerMonth, 50, 1, 500),
    model: models[0],
    models,
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
  if (config.transport === 'proxy') {
    return Boolean(config.proxyUrl && config.proxyAuthToken);
  }
  return Boolean(config.openRouterApiKey);
}
