import { createChatCompletion } from '../shared/aiTransport.js';
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
  isIterationAllowed,
  recordLogiUsage
} from './logiAdvisorUsage.js';

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
${hasOrg ? '- Puedes proponer org_query (solo lectura); el usuario debe aprobarla.' : '- No hay org conectada: no uses org_query.'}`;

  const en = `You are ${persona}, an expert in Salesforce Apex and debug logs. Be direct and practical.
- Explain with examples citing log line numbers when possible.
- Never invent org data; use org_query only when you need to verify something in Salesforce.
- If the user writes in another language, reply in that language.
- Use fetch_log_lines and fetch_parsed_section tools to dig deeper before assuming.
${hasOrg ? '- You may propose org_query (read-only); the user must approve it.' : '- No org connected: do not use org_query.'}`;

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

  const iteration = Number(message.iteration) || 1;
  if (!isIterationAllowed(iteration, parsedConfig)) {
    return { ok: false, reason: 'MAX_ITERATIONS' };
  }

  if (message.isNewChat) {
    const limitCheck = await checkLogiUsageLimits({ isNewChat: true });
    if (!limitCheck.ok) {
      return { ok: false, reason: limitCheck.reason };
    }
    await recordLogiUsage({ isNewChat: true });
  }

  const lang = message.lang === 'en' ? 'en' : 'es';
  const hasOrg = Boolean(message.orgId);
  const allowOrgQuery = parsedConfig.allowedOrgQuery && hasOrg;

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
    const result = await createChatCompletion(parsedConfig, {
      model: parsedConfig.model,
      messages: apiMessages,
      tools: buildLogiToolDefinitions({ allowOrgQuery }),
      max_tokens: 2048
    });

    await recordLogiUsage({ llmCalls: 1 });
    await captureAiGeneration({
      model: parsedConfig.model,
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
      iterationsRemaining: Math.max(0, parsedConfig.maxIterationsPerChat - iteration)
    };
  } catch (e) {
    return {
      ok: false,
      reason: 'LLM_ERROR',
      error: String(e?.message || e || 'Unknown error')
    };
  }
}
