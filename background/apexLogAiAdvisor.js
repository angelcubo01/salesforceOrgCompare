import { createChatCompletion, classifyLlmTransportFailure } from '../shared/aiTransport.js';
import {
  beginLogiRequest,
  cancelLogiRequest,
  finishLogiRequest
} from './logiAdvisorRequests.js';
import { buildLogiToolDefinitions } from '../shared/apexLogAiContext.js';
import {
  isLogiAdvisorOperational,
  parseLogiAdvisorConfig
} from '../shared/apexLogAiAdvisorConfig.js';
import { readLogiAdvisorCache } from '../shared/logiAdvisorCache.js';
import { getTelemetryEnabled } from '../shared/extensionSettings.js';
import { captureAiGeneration } from './posthogAiTelemetry.js';
import {
  checkLogiUsageLimits,
  readSessionIterationByKey,
  recordLogiUsage,
  reserveSessionIterationByKey
} from './logiAdvisorUsage.js';
import { buildLogiSessionKey } from '../shared/logiAdvisorSession.js';
import { getOrCreateTelemetryInstallId } from '../shared/telemetryInstallId.js';

const DML_DDL_RE =
  /\b(INSERT|UPDATE|DELETE|UPSERT|MERGE|UNDELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i;

/**
 * @param {'es' | 'en'} lang
 * @param {import('../shared/apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @param {boolean} hasOrg
 */
export function buildLogiSystemPrompt(lang, config, hasOrg) {
  const persona = config.personaName || 'Logi';
  const es = `Eres ${persona}, experto en Salesforce Apex y debug logs. Eres directo y práctico.
- Explica con ejemplos citando números de línea del log cuando sea posible.
- Nunca inventes datos de la org; usa org_query solo si necesitas verificar algo en Salesforce.
- Si el usuario escribe en otro idioma, responde en ese idioma.
- Usa herramientas fetch_log_lines y fetch_parsed_section para profundizar antes de suponer.
- Si una herramienta devuelve error, retryable, insufficient o datos vacíos, NO respondas todavía al usuario: corrige parámetros o la consulta y vuelve a llamar a la herramienta (hasta 2-3 reintentos razonables).
- org_query fallida: analiza el error de Salesforce, corrige SOQL/SOSL (objeto, campos, variant) y propón org_query de nuevo.
- fetch_log_lines / fetch_parsed_section insuficientes: amplía rango, prueba sección o líneas adyacentes, luego reintenta.
- Solo responde al usuario cuando tengas evidencia suficiente o hayas agotado reintentos útiles; entonces explica qué probaste.
${hasOrg ? '- Puedes proponer org_query (solo lectura); el usuario debe aprobarla en pantalla antes de ejecutar nada.' : '- No hay org conectada: no uses org_query. Responde solo con el log y el contexto disponible.'}`;

  const en = `You are ${persona}, an expert in Salesforce Apex and debug logs. Be direct and practical.
- Explain with examples citing log line numbers when possible.
- Never invent org data; use org_query only when you need to verify something in Salesforce.
- If the user writes in another language, reply in that language.
- Use fetch_log_lines and fetch_parsed_section tools to dig deeper before assuming.
- If a tool returns error, retryable, insufficient, or empty data, do NOT answer the user yet: fix parameters or the query and call the tool again (up to 2-3 reasonable retries).
- Failed org_query: read the Salesforce error, fix SOQL/SOSL (object, fields, variant), and propose org_query again.
- Insufficient fetch_log_lines / fetch_parsed_section: widen the range, try another section or adjacent lines, then retry.
- Only answer when you have enough evidence or useful retries are exhausted; then explain what you tried.
${hasOrg ? '- You may propose org_query (read-only); the user must approve it on screen before anything runs.' : '- No org connected: do not use org_query. Answer using only the log and available context.'}`;

  return lang === 'en' ? en : es;
}

/**
 * @param {string} queryText
 */
export function isReadOnlySalesforceQuery(queryText) {
  const q = String(queryText || '').trim();
  if (!q) return false;
  const upper = q.toUpperCase();
  if (upper.startsWith('FIND ') || upper.includes(' IN ')) {
    return !DML_DDL_RE.test(q);
  }
  if (!upper.startsWith('SELECT ')) return false;
  return !DML_DDL_RE.test(q);
}

/**
 * @param {import('../shared/apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 */
export function sanitizeConfigForUi(config) {
  return {
    enabled: config.enabled,
    beta: config.beta,
    showButton: config.showButton,
    requireTelemetry: config.requireTelemetry,
    maxIterationsPerChat: config.maxIterationsPerChat,
    maxChatsPerDay: config.maxChatsPerDay,
    maxChatsPerMonth: config.maxChatsPerMonth,
    model: config.model,
    personaName: config.personaName,
    allowedOrgQuery: config.allowedOrgQuery,
    quickActions: config.quickActions,
    operational: isLogiAdvisorOperational(config)
  };
}

/**
 * @param {object} message
 */
export async function handleLogiAdvisorGetConfig() {
  const config = await readLogiAdvisorCache();
  const telemetryEnabled = await getTelemetryEnabled();
  if (config.requireTelemetry && !telemetryEnabled) {
    return {
      ok: true,
      config: sanitizeConfigForUi({ ...config, enabled: false, showButton: false }),
      telemetryRequired: true
    };
  }
  return { ok: true, config: sanitizeConfigForUi(config), telemetryRequired: false };
}

/**
 * @param {object} message
 */
export async function handleLogiAdvisorChat(message) {
  const config = await readLogiAdvisorCache();
  const parsedConfig = parseLogiAdvisorConfig(config);

  if (!isLogiAdvisorOperational(parsedConfig)) {
    return { ok: false, reason: 'LOGI_DISABLED' };
  }

  const telemetryEnabled = await getTelemetryEnabled();
  if (parsedConfig.requireTelemetry && !telemetryEnabled) {
    return { ok: false, reason: 'TELEMETRY_REQUIRED' };
  }

  const orgId = String(message.orgId || '').trim();
  const logId = String(message.logId || '').trim();
  const sessionKey =
    typeof message.sessionKey === 'string' && message.sessionKey.trim()
      ? message.sessionKey.trim()
      : buildLogiSessionKey({
          orgId,
          logId,
          title: message.title,
          instanceUrl: message.instanceUrl
        });
  const skipIterationReserve = message.skipIterationReserve === true;
  const maxIterations = parsedConfig.maxIterationsPerChat;

  if (message.isNewChat) {
    const limitCheck = await checkLogiUsageLimits({ isNewChat: true });
    if (!limitCheck.ok) {
      return { ok: false, reason: limitCheck.reason };
    }
  }

  /** @type {number} */
  let iteration;
  /** @type {number} */
  let iterationsRemaining;

  if (skipIterationReserve) {
    iteration = await readSessionIterationByKey(sessionKey);
    iterationsRemaining = Math.max(0, maxIterations - iteration);
  } else {
    const reserved = await reserveSessionIterationByKey(sessionKey, maxIterations);
    if (!reserved.ok) {
      return {
        ok: false,
        reason: 'MAX_ITERATIONS',
        iteration: reserved.iteration,
        iterationsRemaining: 0
      };
    }
    iteration = reserved.iteration;
    iterationsRemaining = reserved.iterationsRemaining;
  }

  if (message.isNewChat) {
    await recordLogiUsage({ isNewChat: true });
  }

  const lang = message.lang === 'en' ? 'en' : 'es';
  const hasOrg = Boolean(message.orgId);
  const allowOrgQuery = parsedConfig.allowedOrgQuery && hasOrg;
  const requestId = typeof message.requestId === 'string' ? message.requestId.trim() : '';
  const signal = beginLogiRequest(requestId);

  /** @type {object[]} */
  const messages = Array.isArray(message.messages) ? message.messages : [];
  const systemContent = buildLogiSystemPrompt(lang, parsedConfig, hasOrg);
  const contextBlock =
    message.initialContext != null
      ? `\n\nLog context (structured summary):\n${JSON.stringify(message.initialContext)}`
      : '';

  const apiMessages = [
    { role: 'system', content: systemContent + contextBlock },
    ...messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'tool'))
      .map((m) => {
        if (m.role === 'tool') {
          return {
            role: 'tool',
            tool_call_id: m.tool_call_id,
            content: m.content != null ? String(m.content) : ''
          };
        }
        const out = {
          role: m.role,
          content: m.content != null ? String(m.content) : ''
        };
        if (m.tool_calls) out.tool_calls = m.tool_calls;
        return out;
      })
  ];

  try {
    const installId = await getOrCreateTelemetryInstallId();
    const result = await withServiceWorkerKeepalive(() =>
      createChatCompletion(
        parsedConfig,
        {
          messages: apiMessages,
          tools: buildLogiToolDefinitions({ allowOrgQuery }),
          max_tokens: 2048
        },
        { signal, installId }
      )
    );

    await recordLogiUsage({ llmCalls: 1 });
    await captureAiGeneration({
      model: result.model || parsedConfig.model,
      latencyMs: result.latencyMs,
      usage: result.usage,
      cost: result.cost,
      inputMessages: apiMessages,
      outputContent: result.content,
      toolCalls: result.tool_calls,
      logId: message.logId,
      iteration
    });

    /** @type {object | null} */
    let pendingOrgQuery = null;
    const localToolCalls = [];
    const orgToolCalls = [];

    for (const tc of result.tool_calls || []) {
      const name = tc?.function?.name;
      if (name === 'org_query') {
        orgToolCalls.push(tc);
      } else {
        localToolCalls.push(tc);
      }
    }

    if (orgToolCalls.length > 0) {
      const tc = orgToolCalls[0];
      let args = {};
      try {
        args = JSON.parse(tc.function?.arguments || '{}');
      } catch {
        args = {};
      }
      pendingOrgQuery = {
        toolCallId: tc.id,
        variant: args.variant || 'rest-soql',
        queryText: String(args.query_text || ''),
        reason: String(args.reason || '')
      };
    }

    return {
      ok: true,
      content: result.content || '',
      tool_calls: [...localToolCalls, ...orgToolCalls],
      localToolCalls,
      pendingOrgQuery,
      finishReason: result.finish_reason,
      iteration,
      iterationsRemaining
    };
  } catch (e) {
    return {
      ok: false,
      reason: classifyLlmTransportFailure(e),
      error: String(e?.message || e || 'Unknown error'),
      iteration,
      iterationsRemaining
    };
  } finally {
    finishLogiRequest(requestId);
  }
}

/**
 * @param {object} message
 */
export async function handleLogiAdvisorCheckUsageLimits() {
  const limitCheck = await checkLogiUsageLimits({ isNewChat: true });
  if (!limitCheck.ok) {
    return { ok: false, reason: limitCheck.reason };
  }
  return { ok: true };
}

/**
 * @param {object} message
 */
export async function handleLogiAdvisorGetSessionIteration(message) {
  const sessionKey =
    typeof message.sessionKey === 'string' && message.sessionKey.trim()
      ? message.sessionKey.trim()
      : buildLogiSessionKey({
          orgId: message.orgId,
          logId: message.logId,
          title: message.title,
          instanceUrl: message.instanceUrl
        });
  const config = await readLogiAdvisorCache();
  const parsedConfig = parseLogiAdvisorConfig(config);
  const iteration = await readSessionIterationByKey(sessionKey);
  const max = parsedConfig.maxIterationsPerChat;
  return {
    ok: true,
    iteration,
    iterationsRemaining: Math.max(0, max - iteration)
  };
}

/**
 * @param {object} message
 */
export function handleLogiAdvisorCancel(message) {
  const requestId = typeof message.requestId === 'string' ? message.requestId.trim() : '';
  if (!requestId) return { ok: false, reason: 'NO_REQUEST_ID' };
  return { ok: cancelLogiRequest(requestId) };
}

/**
 * Evita que el service worker MV3 se suspenda durante llamadas LLM largas.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withServiceWorkerKeepalive(fn) {
  const ping = () => {
    try {
      void chrome.storage?.local?.get?.('sfoc_sw_keepalive');
    } catch {
      /* ignore */
    }
  };
  ping();
  const timer = setInterval(ping, 12_000);
  try {
    return await fn();
  } finally {
    clearInterval(timer);
  }
}
