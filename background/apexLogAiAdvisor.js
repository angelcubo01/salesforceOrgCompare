import {
  createChatCompletion,
  classifyLlmTransportFailure,
  testOpenRouterApiKey
} from '../shared/aiTransport.js';
import {
  beginLogiRequest,
  cancelLogiRequest,
  finishLogiRequest
} from './logiAdvisorRequests.js';
import { buildLogiToolDefinitions } from '../shared/apexLogAiContext.js';
import {
  isLogiAdvisorOperational,
  isLogiSettingsSectionVisible,
  parseLogiAdvisorConfig,
  DEFAULT_LOGI_ADVISOR_CONFIG,
  resolveLogiRuntime,
  resolveAllowedLogiModes,
  coerceLogiUserMode,
  sanitizeLogiModesForUi,
  getLogiModelPickerOptions,
  isLogiModelPickerAllowed,
  validateLogiSelectedModel
} from '../shared/apexLogAiAdvisorConfig.js';
import {
  loadLogiUserSettings,
  saveLogiUserSettings,
  sanitizeLogiUserSettingsForUi
} from '../shared/logiUserSettings.js';
import { getLogiLanguageOption, normalizeLogiLanguage } from '../shared/logiLanguages.js';
import { readLogiAdvisorCache } from '../shared/logiAdvisorCache.js';
import { bootstrapLogiAdvisorViaProxy } from '../shared/logiAdvisorBootstrap.js';
import { getTelemetryEnabled } from '../shared/extensionSettings.js';
import { captureAiGeneration } from './posthogAiTelemetry.js';
import { captureLogiUsage } from './posthogLogiTelemetry.js';
import { buildLogiAiMetrics, buildLogiErrorMetrics, hashLogiSessionKey } from '../shared/logiAiMetrics.js';
import {
  checkLogiUsageLimits,
  readLogiUsageSnapshot,
  readSessionIterationByKey,
  recordLogiUsage,
  reserveSessionIterationByKey
} from './logiAdvisorUsage.js';
import { buildLogiSessionKey } from '../shared/logiAdvisorSession.js';
import { getOrCreateTelemetryInstallId } from '../shared/telemetryInstallId.js';

const DML_DDL_RE =
  /\b(INSERT|UPDATE|DELETE|UPSERT|MERGE|UNDELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i;

/**
 * System prompt for Logi chat. Preferred reply language comes from Logi settings (not app UI lang).
 * @param {string} preferredLangCode
 * @param {import('../shared/apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @param {boolean} hasOrg
 */
export function buildLogiSystemPrompt(preferredLangCode, config, hasOrg) {
  const persona = config.personaName || 'Logi';
  const lang = getLogiLanguageOption(preferredLangCode);
  const langLabel = `${lang.nameEn} (${lang.nativeName})`;

  return `You are ${persona}, an expert in Salesforce Apex and debug logs. Be direct and practical.
- Default reply language: ${langLabel} [code=${lang.code}]. Write all user-facing answers in this language.
- If the user writes in a different language, switch and reply in the user's language for that turn (and subsequent turns in that language until they switch again).
- Explain with examples citing log line numbers when possible (e.g. L123).
- Never invent org data; use org_query / get_apex_source / describe_sobject_fields only when you need to verify something in Salesforce.
- Use local tools: fetch_log_lines, fetch_parsed_section, search_log, get_stack_around, get_hotspots, and highlight_log_lines to dig deeper before assuming.
- If a tool returns error, retryable, insufficient, or empty data, do NOT answer the user yet: fix parameters or the query and call the tool again (up to 2-3 reasonable retries).
- Failed org_query / get_apex_source / describe_sobject_fields: read the error, fix parameters, and propose again (user must approve).
- Insufficient fetch_log_lines / fetch_parsed_section / search_log / get_stack_around: widen the range, try another section or query, then retry.
- Only answer when you have enough evidence or useful retries are exhausted; then explain what you tried.
${hasOrg ? '- You may propose org_query, get_apex_source, and describe_sobject_fields (read-only); the user must approve them on screen before anything runs.' : '- No org connected: do not use org_query, get_apex_source, or describe_sobject_fields. Answer using only the log and available context.'}
- Formatting (Markdown, easy to scan):
  - Prefer short sections with ## / ### headings (e.g. Findings, Evidence, Recommendations).
  - Use bullets for lists; **bold** key terms and outcomes; \`inline code\` for API names, classes, methods, SOQL.
  - Use GFM tables for comparisons (≤5 columns). Always put the separator row immediately under the header (no blank line). Prefer leading/trailing pipes. Put SOQL or text with | inside \`backticks\` so pipes do not break the table.
  - Do not wrap the whole answer in a code fence. Use fenced code only for multi-line snippets.
  - Keep answers scannable: lead with the conclusion, then evidence with line refs, then next steps.`;
}

/**
 * @param {import('../shared/apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @param {import('../shared/apexLogAiAdvisorConfig.js').LogiRuntime} [runtime]
 */
function logiTransportLabel(config, runtime) {
  if (runtime?.transport === 'openrouter_direct' && runtime?.apiKeySource === 'user') return 'byok';
  return config?.transport === 'proxy' && config?.proxyUrl ? 'proxy' : 'direct';
}

/**
 * @param {import('../shared/apexLogAiAdvisorConfig.js').LogiAdvisorConfig} parsedConfig
 */
async function buildLogiRuntimeContext(parsedConfig) {
  const userSettings = await loadLogiUserSettings();
  const coercedMode = coerceLogiUserMode(parsedConfig, userSettings.logiMode);
  if (coercedMode !== userSettings.logiMode) {
    await saveLogiUserSettings({ logiMode: coercedMode });
    userSettings.logiMode = coercedMode;
  }

  return {
    userSettings,
    runtime: resolveLogiRuntime(parsedConfig, userSettings)
  };
}

/**
 * @param {string} action
 * @param {Record<string, unknown>} props
 */
async function trackLogi(action, props = {}) {
  await captureLogiUsage({ action, ...props });
}

/**
 * @param {string} reason
 * @param {object} ctx
 */
async function trackLogiLimit(reason, ctx) {
  await trackLogi('limit_reached', {
    sfoc_limit_reason: reason,
    ...buildLogiErrorMetrics(null, { reason }),
    ...ctx
  });
}

/**
 * @param {string} reason
 * @param {object} ctx
 */
async function trackLogiConfigError(reason, ctx) {
  await trackLogi('error', {
    ...buildLogiErrorMetrics(null, { reason }),
    ...ctx
  });
}

/**
 * @param {unknown} err
 * @param {import('../shared/apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @param {object} ctx
 */
async function trackLogiLlmError(err, config, ctx) {
  await trackLogi('error', {
    ...buildLogiErrorMetrics(err, {
      transport: logiTransportLabel(config),
      modelConfigured: config?.model
    }),
    ...ctx
  });
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
/**
 * @param {import('../shared/apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @param {object} [extras]
 */
export function sanitizeConfigForUi(config, extras = {}) {
  const runtime = /** @type {import('../shared/apexLogAiAdvisorConfig.js').LogiRuntime | undefined} */ (
    extras.runtime
  );
  const userSettings = extras.userSettings
    ? sanitizeLogiUserSettingsForUi(
        /** @type {import('./logiUserSettings.js').ReturnType<typeof import('./logiUserSettings.js').normalizeLogiUserSettings>} */ (
          extras.userSettings
        )
      )
    : null;
  const effectiveMode = runtime?.mode || 'free';
  return {
    enabled: config.enabled,
    beta: config.beta,
    showButton: config.showButton,
    showLogiSettings: isLogiSettingsSectionVisible(config),
    requireTelemetry: config.requireTelemetry,
    maxIterationsPerChat: config.maxIterationsPerChat,
    maxChatsPerUser: config.maxChatsPerUser,
    maxChatsPerDay: config.maxChatsPerDay,
    maxChatsPerMonth: config.maxChatsPerMonth,
    model: config.model,
    personaName: config.personaName,
    allowedOrgQuery: config.allowedOrgQuery,
    quickActions: config.quickActions,
    operational: isLogiAdvisorOperational(config),
    allowedModes: resolveAllowedLogiModes(config),
    modes: sanitizeLogiModesForUi(config),
    logiMode: effectiveMode,
    requestedMode: runtime?.requestedMode || effectiveMode,
    premiumActive: Boolean(runtime?.premiumActive),
    modeFallback: Boolean(runtime?.modeFallback),
    fallbackReason: runtime?.fallbackReason || null,
    modelPickerAllowed: isLogiModelPickerAllowed(config, runtime?.requestedMode || effectiveMode, runtime),
    modelPickerOptions: runtime
      ? getLogiModelPickerOptions(config, runtime.requestedMode, runtime)
      : [],
    userSettings
  };
}

export async function handleLogiAdvisorBootstrap(message = {}) {
  const force = message?.force === true;
  const config = await bootstrapLogiAdvisorViaProxy({ force });
  return {
    ok: true,
    loaded: Boolean(config?.enabled && config?.showButton && isLogiAdvisorOperational(config)),
    config: config ? sanitizeConfigForUi(config) : sanitizeConfigForUi({ ...DEFAULT_LOGI_ADVISOR_CONFIG })
  };
}

/**
 * @param {object} message
 */
export async function handleLogiAdvisorGetConfig() {
  // Read-only: entry points (settings / open log) call bootstrap with force first.
  // Avoid re-bootstrap here — it can revive a stale operational cache via canSkip.
  const config = await readLogiAdvisorCache();
  const parsedConfig = parseLogiAdvisorConfig(config);
  const telemetryEnabled = await getTelemetryEnabled();
  if (parsedConfig.requireTelemetry && !telemetryEnabled) {
    return {
      ok: true,
      config: sanitizeConfigForUi({ ...parsedConfig, enabled: false, showButton: false }),
      telemetryRequired: true
    };
  }
  if (!isLogiAdvisorOperational(parsedConfig) || parsedConfig.enabled !== true) {
    return {
      ok: true,
      config: sanitizeConfigForUi({
        ...parsedConfig,
        enabled: false,
        showButton: false
      }),
      telemetryRequired: false
    };
  }
  const ctx = await buildLogiRuntimeContext(parsedConfig);
  return {
    ok: true,
    config: sanitizeConfigForUi(parsedConfig, {
      runtime: ctx.runtime,
      userSettings: ctx.userSettings
    }),
    telemetryRequired: false
  };
}

/**
 * @param {object} message
 * @param {{ onDelta?: (text: string) => void }} [hooks]
 */
export async function handleLogiAdvisorChat(message, hooks = {}) {
  const config = await bootstrapLogiAdvisorViaProxy();
  const parsedConfig = parseLogiAdvisorConfig(config);

  if (!isLogiAdvisorOperational(parsedConfig)) {
    await trackLogiConfigError('LOGI_DISABLED', {
      sfoc_log_id: String(message.logId || '').slice(0, 64)
    });
    return { ok: false, reason: 'LOGI_DISABLED' };
  }

  const telemetryEnabled = await getTelemetryEnabled();
  if (parsedConfig.requireTelemetry && !telemetryEnabled) {
    await trackLogiConfigError('TELEMETRY_REQUIRED', {
      sfoc_log_id: String(message.logId || '').slice(0, 64)
    });
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
      await trackLogiLimit(limitCheck.reason, {
        sfoc_log_id: logId.slice(0, 64),
        sfoc_session_key: hashLogiSessionKey(sessionKey)
      });
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
      await trackLogiLimit('MAX_ITERATIONS', {
        sfoc_log_id: logId.slice(0, 64),
        sfoc_session_key: hashLogiSessionKey(sessionKey),
        sfoc_iteration: reserved.iteration
      });
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

  const telemetryCtx = {
    sfoc_log_id: logId.slice(0, 64),
    sfoc_session_key: hashLogiSessionKey(sessionKey),
    sfoc_iteration: iteration,
    sfoc_is_new_chat: message.isNewChat === true
  };

  const settingsForLang = await loadLogiUserSettings();
  const preferredLang = normalizeLogiLanguage(
    message.logiLanguage != null ? message.logiLanguage : settingsForLang.logiLanguage
  );
  const hasOrg = Boolean(message.orgId);
  const allowOrgQuery = parsedConfig.allowedOrgQuery && hasOrg;
  const requestId = typeof message.requestId === 'string' ? message.requestId.trim() : '';
  const signal = beginLogiRequest(requestId);

  /** @type {object[]} */
  const messages = Array.isArray(message.messages) ? message.messages : [];
  const systemContent = buildLogiSystemPrompt(preferredLang, parsedConfig, hasOrg);
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
    const ctx = await buildLogiRuntimeContext(parsedConfig);
    const selectedModelRaw =
      typeof message.selectedModel === 'string' ? message.selectedModel.trim() : '';
    const selectedModel =
      selectedModelRaw && selectedModelRaw !== '__auto__'
        ? validateLogiSelectedModel(parsedConfig, selectedModelRaw)
        : ctx.runtime.selectedModel;

    if (selectedModel && selectedModel !== ctx.userSettings.logiSelectedPremiumModel) {
      await saveLogiUserSettings({ logiSelectedPremiumModel: selectedModel });
    }

    const runtime = resolveLogiRuntime(parsedConfig, ctx.userSettings, selectedModel);

    const result = await withServiceWorkerKeepalive(() =>
      createChatCompletion(
        parsedConfig,
        {
          messages: apiMessages,
          tools: buildLogiToolDefinitions({ allowOrgQuery }),
          max_tokens: 2048,
          model: selectedModel || undefined,
          models: runtime.models
        },
        {
          signal,
          installId,
          runtime,
          onDelta: typeof hooks.onDelta === 'function' ? hooks.onDelta : undefined
        }
      )
    );

    await recordLogiUsage({ llmCalls: 1 });

    const aiMetrics = buildLogiAiMetrics(result, parsedConfig, {
      iteration,
      logId: message.logId,
      isNewChat: message.isNewChat === true,
      sessionKey,
      actualTransport: logiTransportLabel(parsedConfig, runtime),
      logiMode: runtime.mode,
      requestedMode: runtime.requestedMode,
      modeFallback: result.modeFallback || runtime.modeFallback,
      modelSelected: selectedModel || ''
    });

    await captureAiGeneration({
      model: result.model || parsedConfig.model,
      latencyMs: result.latencyMs,
      usage: result.usage,
      cost: result.cost,
      logId: message.logId,
      iteration,
      result,
      config: parsedConfig,
      context: { sessionKey, isNewChat: message.isNewChat === true }
    });

    /** @type {object | null} */
    let pendingOrgQuery = null;
    const localToolCalls = [];
    const orgToolCalls = [];

    for (const tc of result.tool_calls || []) {
      const name = tc?.function?.name;
      if (name === 'org_query' || name === 'get_apex_source' || name === 'describe_sobject_fields') {
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
      const toolName = tc?.function?.name || 'org_query';
      if (toolName === 'get_apex_source') {
        const apexType = args.type === 'ApexTrigger' ? 'ApexTrigger' : 'ApexClass';
        const apexName = String(args.name || '').replace(/'/g, "\\'");
        pendingOrgQuery = {
          toolCallId: tc.id,
          toolName,
          variant: 'tooling-soql',
          queryText: `SELECT Id, Name, Body FROM ${apexType} WHERE Name = '${apexName}' LIMIT 1`,
          reason: String(args.reason || ''),
          apexName: String(args.name || ''),
          apexType
        };
      } else if (toolName === 'describe_sobject_fields') {
        pendingOrgQuery = {
          toolCallId: tc.id,
          toolName,
          variant: 'describe',
          queryText: String(args.sobject || ''),
          reason: String(args.reason || ''),
          sobject: String(args.sobject || '')
        };
      } else {
        pendingOrgQuery = {
          toolCallId: tc.id,
          toolName: 'org_query',
          variant: args.variant || 'rest-soql',
          queryText: String(args.query_text || ''),
          reason: String(args.reason || '')
        };
      }
    }

    return {
      ok: true,
      content: result.content || '',
      tool_calls: [...localToolCalls, ...orgToolCalls],
      localToolCalls,
      pendingOrgQuery,
      finishReason: result.finish_reason,
      iteration,
      iterationsRemaining,
      logiMode: runtime.mode,
      requestedMode: runtime.requestedMode,
      modeFallback: result.modeFallback || runtime.modeFallback,
      modelUsed: result.model || runtime.models[0],
      aiMetrics
    };
  } catch (e) {
    const reason = classifyLlmTransportFailure(e);
    if (reason !== 'CANCELLED') {
      await trackLogiLlmError(e, parsedConfig, telemetryCtx);
    }
    return {
      ok: false,
      reason,
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
  // Do not bootstrap here — use the cache populated by settings/log force refresh.
  const config = await readLogiAdvisorCache();
  const parsed = parseLogiAdvisorConfig(config);
  const usage = await readLogiUsageSnapshot();
  const maxToday = Number(parsed.maxChatsPerDay) || 0;
  const maxMonth = Number(parsed.maxChatsPerMonth) || 0;
  const maxUser = Number(parsed.maxChatsPerUser) || 0;
  const remaining = {
    today: Math.max(0, maxToday - Number(usage.chatsToday || 0)),
    month: Math.max(0, maxMonth - Number(usage.chatsMonth || 0)),
    user: Math.max(0, maxUser - Number(usage.chatsTotal || 0))
  };
  const max = { today: maxToday, month: maxMonth, user: maxUser };
  if (!isLogiAdvisorOperational(parsed) || parsed.enabled !== true) {
    return { ok: false, reason: 'LOGI_DISABLED', usage, remaining, max };
  }
  const limitCheck = await checkLogiUsageLimits({ isNewChat: true });
  if (!limitCheck.ok) {
    return { ok: false, reason: limitCheck.reason, usage, remaining, max };
  }
  return { ok: true, usage, remaining, max };
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
 * System prompt for one-shot log summaries (no chat, no org_query).
 * @param {string} preferredLangCode
 * @param {import('../shared/apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 */
export function buildLogiSummarySystemPrompt(preferredLangCode, config) {
  const persona = config.personaName || 'Logi';
  const lang = getLogiLanguageOption(preferredLangCode);
  const langLabel = `${lang.nameEn} (${lang.nativeName})`;

  return `You are ${persona}. Write a short, human summary of a Salesforce Apex debug log for a developer or support engineer who already has the log open.

Goal: explain what this execution did and what matters — not restate fields they can already see in the UI.

Write the summary in ${langLabel} [code=${lang.code}].

Tone and style:
- Plain language, descriptive and concrete. Prefer "the queueable finished without errors in about 4 seconds" over "Outcome: No error (hasError: false)".
- Sound like a colleague briefing someone, not a status report or API dump.
- Use Markdown lightly: a short lead paragraph, then 4–8 bullets. Optional ## headings only if they help (e.g. What happened, Issues, Performance). No tables. No code fences around the whole answer.

What to cover (only when relevant):
- What ran (class / trigger / entry point) and the practical outcome (success, failure, partial).
- The interesting story: main steps, important SOQL/DML, callouts, or business logic worth noticing.
- Real problems: exceptions, failed validations, HTTP errors, risky patterns (SOQL/DML in loops, repeated queries, near governor limits) with line numbers when useful (e.g. L123).
- Duration only if it is notable (slow, unexpectedly fast for the work done, or tied to a bottleneck).

Hard avoid — do NOT include:
- An "Execution Summary" / metadata block (Execution Label, Execution Range, hasError, isTest, Outcome flags, "lines 3–17502 = entire log", "What this tells us" that only repeats the same facts).
- Restating structured context fields verbatim (booleans, JSON keys, full line ranges of the whole log).
- Padding that says nothing new ("the job completed successfully because no errors were recorded").
- Questions, CTAs, or "if you want I can…".

If the log is uneventful: 2–4 sentences saying what ran, that it completed cleanly, and one useful observation (e.g. volume of SOQL/DML or notable duration) — then stop.

Tools: do NOT use org_query. Use fetch_log_lines / fetch_parsed_section / search_log only if the structured context is insufficient to write a useful summary.`;
}

/**
 * One-shot summary turn (local tools only, counts as a new chat against usage limits).
 * @param {object} message
 */
export async function handleLogiAdvisorSummarize(message) {
  const config = await bootstrapLogiAdvisorViaProxy();
  const parsedConfig = parseLogiAdvisorConfig(config);

  if (!isLogiAdvisorOperational(parsedConfig)) {
    await trackLogiConfigError('LOGI_DISABLED', {
      sfoc_log_id: String(message.logId || '').slice(0, 64)
    });
    return { ok: false, reason: 'LOGI_DISABLED' };
  }

  const telemetryEnabled = await getTelemetryEnabled();
  if (parsedConfig.requireTelemetry && !telemetryEnabled) {
    await trackLogiConfigError('TELEMETRY_REQUIRED', {
      sfoc_log_id: String(message.logId || '').slice(0, 64)
    });
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
  const isFirstSummaryTurn = !skipIterationReserve;

  if (isFirstSummaryTurn) {
    const limitCheck = await checkLogiUsageLimits({ isNewChat: true });
    if (!limitCheck.ok) {
      await trackLogiLimit(limitCheck.reason, {
        sfoc_log_id: logId.slice(0, 64),
        sfoc_session_key: hashLogiSessionKey(sessionKey)
      });
      return { ok: false, reason: limitCheck.reason };
    }
    await recordLogiUsage({ isNewChat: true });
  }

  const settingsForLang = await loadLogiUserSettings();
  const preferredLang = normalizeLogiLanguage(
    message.logiLanguage != null ? message.logiLanguage : settingsForLang.logiLanguage
  );
  const requestId = typeof message.requestId === 'string' ? message.requestId.trim() : '';
  const signal = beginLogiRequest(requestId);

  /** @type {object[]} */
  const messages = Array.isArray(message.messages) ? message.messages : [];
  const systemContent = buildLogiSummarySystemPrompt(preferredLang, parsedConfig);
  const contextBlock =
    message.initialContext != null
      ? `\n\nLog context (structured summary):\n${JSON.stringify(message.initialContext)}`
      : '';

  const userPrompt = 'Summarize this Apex debug log now. Be concise and factual.';

  const apiMessages = [
    { role: 'system', content: systemContent + contextBlock },
    ...(messages.length
      ? messages
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
      : [{ role: 'user', content: userPrompt }])
  ];

  const telemetryCtx = {
    sfoc_log_id: logId.slice(0, 64),
    sfoc_session_key: hashLogiSessionKey(sessionKey),
    sfoc_is_new_chat: isFirstSummaryTurn,
    sfoc_mode: 'summary'
  };

  try {
    const installId = await getOrCreateTelemetryInstallId();
    const ctx = await buildLogiRuntimeContext(parsedConfig);
    const runtime = resolveLogiRuntime(parsedConfig, ctx.userSettings);

    const result = await withServiceWorkerKeepalive(() =>
      createChatCompletion(
        parsedConfig,
        {
          messages: apiMessages,
          tools: buildLogiToolDefinitions({ allowOrgQuery: false }),
          max_tokens: 1200,
          models: runtime.models
        },
        { signal, installId, runtime }
      )
    );

    await recordLogiUsage({ llmCalls: 1 });

    const aiMetrics = buildLogiAiMetrics(result, parsedConfig, {
      iteration: 0,
      logId: message.logId,
      isNewChat: isFirstSummaryTurn,
      sessionKey,
      actualTransport: logiTransportLabel(parsedConfig, runtime),
      logiMode: runtime.mode,
      requestedMode: runtime.requestedMode,
      modeFallback: result.modeFallback || runtime.modeFallback,
      modelSelected: ''
    });

    await captureAiGeneration({
      model: result.model || parsedConfig.model,
      latencyMs: result.latencyMs,
      usage: result.usage,
      cost: result.cost,
      logId: message.logId,
      iteration: 0,
      result,
      config: parsedConfig,
      context: { sessionKey, isNewChat: isFirstSummaryTurn, mode: 'summary' }
    });

    const localToolCalls = (result.tool_calls || []).filter(
      (tc) => tc?.function?.name && tc.function.name !== 'org_query'
    );

    return {
      ok: true,
      content: result.content || '',
      tool_calls: localToolCalls,
      localToolCalls,
      pendingOrgQuery: null,
      finishReason: result.finish_reason,
      logiMode: runtime.mode,
      modelUsed: result.model || runtime.models[0],
      aiMetrics: { ...aiMetrics, sfoc_summary: true }
    };
  } catch (e) {
    const reason = classifyLlmTransportFailure(e);
    if (reason !== 'CANCELLED') {
      await trackLogiLlmError(e, parsedConfig, telemetryCtx);
    }
    return {
      ok: false,
      reason,
      error: String(e?.message || e || 'Unknown error')
    };
  } finally {
    finishLogiRequest(requestId);
  }
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

/**
 * @param {object} message
 */
export async function handleLogiAdvisorSaveSettings(message) {
  const config = await bootstrapLogiAdvisorViaProxy();
  const parsedConfig = parseLogiAdvisorConfig(config);
  if (!isLogiSettingsSectionVisible(parsedConfig)) {
    return { ok: false, reason: 'LOGI_SETTINGS_DISABLED' };
  }

  /** @type {Record<string, unknown>} */
  const patch = {};
  if (message.logiMode != null) patch.logiMode = message.logiMode;
  if (message.logiLanguage != null) patch.logiLanguage = message.logiLanguage;
  if (message.logiByokOpenRouterKey !== undefined) {
    patch.logiByokOpenRouterKey = message.logiByokOpenRouterKey;
  }
  if (Array.isArray(message.logiByokModels)) patch.logiByokModels = message.logiByokModels;
  if (message.logiSelectedPremiumModel !== undefined) {
    patch.logiSelectedPremiumModel = message.logiSelectedPremiumModel;
  }

  const saved = await saveLogiUserSettings(patch);
  const coerced = coerceLogiUserMode(parsedConfig, saved.logiMode);
  if (coerced !== saved.logiMode) {
    await saveLogiUserSettings({ logiMode: coerced });
    saved.logiMode = coerced;
  }

  const ctx = await buildLogiRuntimeContext(parsedConfig);
  return {
    ok: true,
    userSettings: sanitizeLogiUserSettingsForUi(saved),
    config: sanitizeConfigForUi(parsedConfig, {
      runtime: ctx.runtime,
      userSettings: saved
    })
  };
}

/**
 * @param {object} message
 */
export async function handleLogiAdvisorTestByok(message) {
  const key =
    typeof message.apiKey === 'string' && message.apiKey.trim()
      ? message.apiKey.trim()
      : (await loadLogiUserSettings()).logiByokOpenRouterKey;
  if (!key) return { ok: false, reason: 'NO_KEY' };
  try {
    await testOpenRouterApiKey(key);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'BYOK_TEST_FAILED', error: String(e?.message || e) };
  }
}
