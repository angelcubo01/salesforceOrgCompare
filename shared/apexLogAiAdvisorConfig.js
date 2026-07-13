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
 * @property {LogiTransportMode} transport
 * @property {string | null} openRouterApiKey
 * @property {string | null} proxyUrl
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
  model: 'google/gemini-2.0-flash-exp:free',
  transport: 'openrouter_direct',
  openRouterApiKey: null,
  proxyUrl: null,
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

  return {
    enabled: o.enabled === true,
    beta: o.beta !== false,
    showButton: o.showButton === true,
    requireTelemetry: o.requireTelemetry !== false,
    maxIterationsPerChat: clampInt(o.maxIterationsPerChat, 10, 1, 50),
    maxChatsPerUser: clampInt(o.maxChatsPerUser, 20, 1, 1000),
    maxChatsPerDay: clampInt(o.maxChatsPerDay, 5, 1, 100),
    maxChatsPerMonth: clampInt(o.maxChatsPerMonth, 50, 1, 500),
    model:
      typeof o.model === 'string' && o.model.trim()
        ? o.model.trim()
        : DEFAULT_LOGI_ADVISOR_CONFIG.model,
    transport,
    openRouterApiKey: apiKey,
    proxyUrl,
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
    return Boolean(config.proxyUrl);
  }
  return Boolean(config.openRouterApiKey);
}
