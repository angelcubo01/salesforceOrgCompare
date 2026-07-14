import { classifyLlmTransportFailure } from './aiTransport.js';

/** @param {string} sessionKey */
export function hashLogiSessionKey(sessionKey) {
  const s = String(sessionKey || '').trim();
  if (!s) return '';
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 16);
}

/**
 * @param {object[] | undefined} toolCalls
 */
export function countLogiToolCalls(toolCalls) {
  /** @type {{ total: number, fetch_log: number, fetch_section: number, org_query: number }} */
  const counts = { total: 0, fetch_log: 0, fetch_section: 0, org_query: 0 };
  for (const tc of toolCalls || []) {
    const name = tc?.function?.name || '';
    counts.total += 1;
    if (name === 'fetch_log_lines') counts.fetch_log += 1;
    else if (name === 'fetch_parsed_section') counts.fetch_section += 1;
    else if (name === 'org_query') counts.org_query += 1;
  }
  return counts;
}

/**
 * @param {import('./aiTransport.js').ChatCompletionResponse} result
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @param {object} [context]
 * @returns {Record<string, string | number | boolean>}
 */
export function buildLogiAiMetrics(result, config, context = {}) {
  const toolCounts = countLogiToolCalls(result?.tool_calls);
  const transport =
    context.actualTransport ||
    (config?.transport === 'proxy' && config?.proxyUrl ? 'proxy' : 'direct');

  /** @type {Record<string, string | number | boolean>} */
  const out = {
    sfoc_model: String(result?.model || config?.model || '').slice(0, 120),
    sfoc_model_configured: String(config?.model || '').slice(0, 120),
    sfoc_latency_ms: Math.round(Number(result?.latencyMs) || 0),
    sfoc_transport: transport,
    sfoc_tool_calls_count: toolCounts.total,
    sfoc_tool_fetch_log: toolCounts.fetch_log,
    sfoc_tool_fetch_section: toolCounts.fetch_section,
    sfoc_tool_org_query: toolCounts.org_query
  };

  const usage = result?.usage || {};
  if (usage.prompt_tokens != null) out.sfoc_prompt_tokens = Number(usage.prompt_tokens);
  if (usage.completion_tokens != null) out.sfoc_completion_tokens = Number(usage.completion_tokens);
  if (usage.total_tokens != null) out.sfoc_total_tokens = Number(usage.total_tokens);
  if (result?.cost != null) out.sfoc_total_cost_usd = Number(result.cost);
  if (result?.finish_reason) out.sfoc_finish_reason = String(result.finish_reason).slice(0, 64);

  if (context.iteration != null) out.sfoc_iteration = Number(context.iteration);
  if (context.logId) out.sfoc_log_id = String(context.logId).slice(0, 64);
  if (context.isNewChat) out.sfoc_is_new_chat = true;
  if (context.sessionKey) out.sfoc_session_key = hashLogiSessionKey(context.sessionKey);

  return out;
}

const LIMIT_REASONS = new Set([
  'MAX_CHATS_USER',
  'MAX_CHATS_DAY',
  'MAX_CHATS_MONTH',
  'MAX_ITERATIONS'
]);

const CONFIG_REASONS = new Set(['LOGI_DISABLED', 'TELEMETRY_REQUIRED']);

/**
 * @param {string} msg
 */
function parseLogiErrorCode(msg) {
  const m = String(msg || '');
  const explicit = m.match(/\b(LOGI_[A-Z0-9_]+)\b/);
  if (explicit) return explicit[1].slice(0, 64);
  if (/model|provider|endpoint|unavailable|overloaded/i.test(m)) return 'LLM_MODEL_EXHAUSTED';
  return 'UNKNOWN';
}

/**
 * @param {string} msg
 */
function parseHttpStatus(msg) {
  const m = String(msg || '').match(/HTTP_(\d{3})/);
  return m ? Number(m[1]) : undefined;
}

/**
 * @param {string} msg
 * @param {string} [classified]
 */
function inferErrorSource(msg, classified) {
  const m = String(msg || '');
  if (m.includes('LOGI_PROXY') || m.includes('LOGI_NO_PROXY')) return 'proxy';
  if (m.includes('LOGI_OPENROUTER')) return 'openrouter';
  if (classified === 'LLM_MODEL_EXHAUSTED' || parseLogiErrorCode(m) === 'LLM_MODEL_EXHAUSTED') {
    return 'model';
  }
  if (m.includes('LOGI_TIMEOUT') || m.includes('LOGI_NETWORK') || classified === 'LLM_TIMEOUT') {
    return 'network';
  }
  if (classified === 'LLM_PROXY_BLOCKED') return 'proxy';
  return 'network';
}

/**
 * @param {unknown} err
 * @param {object} [context]
 * @returns {Record<string, string | number | boolean>}
 */
export function buildLogiErrorMetrics(err, context = {}) {
  const reason = context.reason ? String(context.reason) : '';
  const msg = String(err?.message || err || reason || '');

  if (LIMIT_REASONS.has(reason)) {
    return {
      sfoc_error_reason: reason,
      sfoc_error_code: reason,
      sfoc_error_source: 'limit',
      sfoc_limit_reason: reason
    };
  }

  if (CONFIG_REASONS.has(reason)) {
    return {
      sfoc_error_reason: reason,
      sfoc_error_code: reason,
      sfoc_error_source: 'config'
    };
  }

  if (reason === 'ORG_QUERY_FAILED' || context.errorSource === 'org_query') {
    return {
      sfoc_error_reason: 'ORG_QUERY_FAILED',
      sfoc_error_code: String(context.errorCode || 'ORG_QUERY_FAILED').slice(0, 64),
      sfoc_error_source: 'org_query',
      ...(context.orgQueryVariant
        ? { sfoc_org_query_variant: String(context.orgQueryVariant).slice(0, 32) }
        : {})
    };
  }

  if (reason === 'BOOTSTRAP_FAILED' || context.errorSource === 'bootstrap') {
    return {
      sfoc_error_reason: 'BOOTSTRAP_FAILED',
      sfoc_error_code: parseLogiErrorCode(msg),
      sfoc_error_source: 'bootstrap'
    };
  }

  const classified = reason || classifyLlmTransportFailure(err);
  const errorCode = parseLogiErrorCode(msg);
  const httpStatus = parseHttpStatus(msg);

  /** @type {Record<string, string | number | boolean>} */
  const out = {
    sfoc_error_reason: String(classified).slice(0, 64),
    sfoc_error_code: errorCode,
    sfoc_error_source: inferErrorSource(msg, String(classified))
  };

  if (httpStatus != null) out.sfoc_http_status = httpStatus;
  if (context.transport) out.sfoc_transport = String(context.transport).slice(0, 16);
  if (context.modelConfigured) {
    out.sfoc_model_configured = String(context.modelConfigured).slice(0, 120);
  }
  if (context.retryExhausted) out.sfoc_retry_exhausted = true;
  if (context.latencyMs != null) out.sfoc_latency_ms = Math.round(Number(context.latencyMs));

  return out;
}

/** @param {Record<string, unknown>} props */
export function sanitizeLogiTelemetryProps(props) {
  const forbidden = new Set([
    'content',
    'messages',
    'queryText',
    'query_text',
    'initialContext',
    '$ai_input',
    '$ai_output_choices',
    'input',
    'output',
    'outputChoices',
    'inputMessages',
    'outputContent',
    'toolCalls',
    'tool_calls',
    'arguments'
  ]);

  /** @type {Record<string, string | number | boolean>} */
  const out = {};
  for (const [key, raw] of Object.entries(props || {})) {
    if (forbidden.has(key)) continue;
    if (raw == null || raw === '') continue;
    if (typeof raw === 'boolean') out[key] = raw;
    else if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = raw;
    else if (typeof raw === 'string') out[key] = raw.slice(0, 256);
  }
  return out;
}
