/**
 * Transport layer for Logi LLM calls.
 * Supports free models via proxy and BYOK via OpenRouter direct.
 */

import {
  DEFAULT_LOGI_MODELS,
  OPENROUTER_MAX_MODELS_PER_REQUEST,
  resolveLogiModelChain
} from './apexLogAiAdvisorConfig.js';
import { getProxyJwt } from './logiProxySession.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_500;

/**
 * @typedef {object} ChatCompletionRequest
 * @property {string} [model]
 * @property {string[]} [models]
 * @property {object[]} messages
 * @property {object[]} [tools]
 * @property {number} [max_tokens]
 */

/**
 * @typedef {object} ChatCompletionResponse
 * @property {string} content
 * @property {string} [model]
 * @property {object[]} [tool_calls]
 * @property {{ prompt_tokens?: number, completion_tokens?: number, total_tokens?: number }} [usage]
 * @property {number} [cost]
 * @property {string} [finish_reason]
 * @property {number} latencyMs
 * @property {boolean} [modeFallback]
 * @property {string} [effectiveLogiMode]
 */

/**
 * @typedef {object} CreateChatCompletionOpts
 * @property {string} [userToken]
 * @property {string} [installId]
 * @property {AbortSignal} [signal]
 * @property {import('./apexLogAiAdvisorConfig.js').LogiRuntime} [runtime]
 * @property {boolean} [forceFreeFallback]
 * @property {(delta: string) => void} [onDelta] When set, attempts SSE streaming; falls back to non-stream on failure.
 */

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @param {ChatCompletionRequest} req
 * @param {CreateChatCompletionOpts} [opts]
 * @returns {Promise<ChatCompletionResponse>}
 */
export async function createChatCompletion(config, req, opts = {}) {
  const signal = opts.signal;
  const runtime = opts.runtime;
  const forceFree = opts.forceFreeFallback === true;
  const onDelta = typeof opts.onDelta === 'function' ? opts.onDelta : null;

  const effectiveConfig = buildEffectiveTransportConfig(config, runtime, forceFree);
  const chain =
    Array.isArray(req.models) && req.models.length
      ? req.models
      : runtime?.models?.length && !forceFree
        ? runtime.models
        : resolveLogiModelChain(effectiveConfig, req.model);

  const baseReq = { ...req };
  delete baseReq.models;
  delete baseReq.model;

  /** @type {Error | null} */
  let lastError = null;

  for (let i = 0; i < chain.length; i += OPENROUTER_MAX_MODELS_PER_REQUEST) {
    const batch = chain.slice(i, i + OPENROUTER_MAX_MODELS_PER_REQUEST);
    const batchReq = { ...baseReq, models: batch };

    try {
      let result;
      if (onDelta) {
        try {
          result = await dispatchTransportStream(
            effectiveConfig,
            batchReq,
            opts,
            signal,
            runtime,
            forceFree,
            onDelta
          );
        } catch (streamErr) {
          if (isUserAbortError(streamErr, signal)) throw streamErr;
          if (isProxyBlockError(streamErr)) throw streamErr;
          // Models/proxy may not support SSE — fall back once per batch.
          result = await dispatchTransport(effectiveConfig, batchReq, opts, signal, runtime, forceFree);
        }
      } else {
        result = await dispatchTransport(effectiveConfig, batchReq, opts, signal, runtime, forceFree);
      }
      return {
        ...result,
        modeFallback: forceFree || Boolean(runtime?.modeFallback),
        effectiveLogiMode: forceFree ? 'free' : runtime?.mode || 'free'
      };
    } catch (e) {
      if (isUserAbortError(e, signal)) throw e;

      if (isProxyBlockError(e)) throw e;

      const hasMoreBatches = i + OPENROUTER_MAX_MODELS_PER_REQUEST < chain.length;
      if (hasMoreBatches && isModelFailureError(e)) {
        lastError = e instanceof Error ? e : new Error(String(e || 'LOGI_MODEL_FAILED'));
        continue;
      }
      throw e;
    }
  }

  throw lastError || new Error('LOGI_ALL_MODELS_FAILED');
}

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @param {import('./apexLogAiAdvisorConfig.js').LogiRuntime} [runtime]
 * @param {boolean} forceFree
 */
function buildEffectiveTransportConfig(config, runtime, forceFree) {
  if (forceFree || !runtime) return config;
  if (runtime.transport === 'openrouter_direct' && runtime.openRouterApiKey) {
    return {
      ...config,
      transport: 'openrouter_direct',
      openRouterApiKey: runtime.openRouterApiKey
    };
  }
  return config;
}

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @param {ChatCompletionRequest} batchReq
 * @param {CreateChatCompletionOpts} opts
 * @param {AbortSignal | undefined} signal
 * @param {import('./apexLogAiAdvisorConfig.js').LogiRuntime | undefined} runtime
 * @param {boolean} forceFree
 */
async function dispatchTransport(config, batchReq, opts, signal, runtime, forceFree) {
  const logiModeHeader = forceFree ? 'free' : runtime?.requestedMode || runtime?.mode || 'free';

  if (config.transport === 'proxy' && config.proxyUrl) {
    return proxyTransport(config, batchReq, opts, signal, logiModeHeader);
  }

  try {
    return await openRouterDirectTransport(config, batchReq, signal);
  } catch (e) {
    if (isUserAbortError(e, signal)) throw e;
    if (config.proxyUrl && isProxyBlockError(e)) {
      return proxyTransport(config, batchReq, opts, signal, logiModeHeader);
    }
    throw e;
  }
}

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @param {ChatCompletionRequest} batchReq
 * @param {CreateChatCompletionOpts} opts
 * @param {AbortSignal | undefined} signal
 * @param {import('./apexLogAiAdvisorConfig.js').LogiRuntime | undefined} runtime
 * @param {boolean} forceFree
 * @param {(delta: string) => void} onDelta
 */
async function dispatchTransportStream(config, batchReq, opts, signal, runtime, forceFree, onDelta) {
  const logiModeHeader = forceFree ? 'free' : runtime?.requestedMode || runtime?.mode || 'free';

  if (config.transport === 'proxy' && config.proxyUrl) {
    return proxyTransportStream(config, batchReq, opts, signal, logiModeHeader, onDelta);
  }

  try {
    return await openRouterDirectTransportStream(config, batchReq, signal, onDelta);
  } catch (e) {
    if (isUserAbortError(e, signal)) throw e;
    if (config.proxyUrl && isProxyBlockError(e)) {
      return proxyTransportStream(config, batchReq, opts, signal, logiModeHeader, onDelta);
    }
    throw e;
  }
}

/**
 * @param {string} apiKey
 * @param {AbortSignal} [signal]
 */
export async function testOpenRouterApiKey(apiKey, signal) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('LOGI_BYOK_NO_KEY');
  const res = await fetchWithRetry(
    OPENROUTER_MODELS_URL,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json'
      }
    },
    signal
  );
  if (!res.res.ok) {
    throw new Error(`LOGI_BYOK_TEST_HTTP_${res.res.status}`);
  }
  return true;
}

async function openRouterDirectTransport(config, req, signal) {
  const apiKey = config.openRouterApiKey;
  if (!apiKey) {
    throw new Error('LOGI_NO_API_KEY');
  }
  const started = Date.now();
  const body = buildRequestBody(config, req);

  const { res, text } = await fetchWithRetry(
    OPENROUTER_URL,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'HTTP-Referer': 'https://salesforceorgcompare.com/',
        'X-Title': 'Salesforce Org Compare - Logi'
      },
      body: JSON.stringify(body)
    },
    signal
  );

  return parseCompletionResponse(res, text, started);
}

async function proxyTransport(config, req, opts = {}, signal, logiMode = 'free') {
  const url = config.proxyUrl;
  if (!url) throw new Error('LOGI_NO_PROXY_URL');
  const installId = String(opts.installId || '').trim();
  let authToken = opts.userToken ? String(opts.userToken).trim() : '';
  if (!authToken) {
    if (!installId) throw new Error('LOGI_NO_PROXY_AUTH');
    authToken = await getProxyJwt(url, installId, { signal });
  }

  const runOnce = async (token) => {
    const started = Date.now();
    const body = buildRequestBody(config, req, req.models);
    const { res, text } = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'X-SFOC-Logi-Mode': logiMode,
          ...(installId ? { 'X-SFOC-Install-Id': installId } : {})
        },
        body: JSON.stringify(body)
      },
      signal
    );

    const data = parseJsonOrThrow(text, 'LOGI_PROXY_PARSE');
    if (!res.ok) {
      const msg = data?.error || data?.message || res.statusText;
      if (isProxyBlockHttp(res.status, text, res.headers.get('content-type'))) {
        throw new Error('LOGI_PROXY_BLOCKED');
      }
      throw new Error(`LOGI_PROXY_HTTP_${res.status}: ${msg}`);
    }

    return normalizeCompletionPayload(data, started);
  };

  try {
    return await runOnce(authToken);
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (/LOGI_PROXY_HTTP_401/.test(msg) && installId && !opts.userToken) {
      const renewed = await getProxyJwt(url, installId, { signal, forceRenew: true });
      return runOnce(renewed);
    }
    throw e;
  }
}

function buildRequestBody(config, req, explicitModels, stream = false) {
  const models = (
    Array.isArray(explicitModels) && explicitModels.length
      ? explicitModels
      : Array.isArray(req.models) && req.models.length
        ? req.models
        : resolveLogiModelChain(config, req.model)
  ).slice(0, OPENROUTER_MAX_MODELS_PER_REQUEST);

  const body = {
    models,
    messages: req.messages,
    max_tokens: req.max_tokens ?? 2048
  };
  if (stream) body.stream = true;
  if (req.tools?.length) {
    body.tools = req.tools;
    body.tool_choice = 'auto';
  }
  return body;
}

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @param {ChatCompletionRequest} req
 * @param {AbortSignal | undefined} signal
 * @param {(delta: string) => void} onDelta
 */
async function openRouterDirectTransportStream(config, req, signal, onDelta) {
  const apiKey = config.openRouterApiKey;
  if (!apiKey) {
    throw new Error('LOGI_NO_API_KEY');
  }
  const started = Date.now();
  const body = buildRequestBody(config, req, req.models, true);

  const res = await fetchWithTimeout(
    OPENROUTER_URL,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'HTTP-Referer': 'https://salesforceorgcompare.com/',
        'X-Title': 'Salesforce Org Compare - Logi'
      },
      body: JSON.stringify(body)
    },
    DEFAULT_TIMEOUT_MS,
    signal
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (isProxyBlockHttp(res.status, text, res.headers.get('content-type'))) {
      throw new Error('LOGI_PROXY_BLOCKED');
    }
    const data = safeParseJson(text);
    const msg = data?.error?.message || data?.message || truncateErr(text);
    throw new Error(`LOGI_OPENROUTER_HTTP_${res.status}: ${msg}`);
  }

  return consumeSseCompletion(res, started, onDelta, signal);
}

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @param {ChatCompletionRequest} req
 * @param {CreateChatCompletionOpts} opts
 * @param {AbortSignal | undefined} signal
 * @param {string} logiMode
 * @param {(delta: string) => void} onDelta
 */
async function proxyTransportStream(config, req, opts, signal, logiMode, onDelta) {
  const url = config.proxyUrl;
  if (!url) throw new Error('LOGI_NO_PROXY_URL');
  const installId = String(opts.installId || '').trim();
  let authToken = opts.userToken ? String(opts.userToken).trim() : '';
  if (!authToken) {
    if (!installId) throw new Error('LOGI_NO_PROXY_AUTH');
    authToken = await getProxyJwt(url, installId, { signal });
  }

  const runOnce = async (token) => {
    const started = Date.now();
    const body = buildRequestBody(config, req, req.models, true);
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`,
          'X-SFOC-Logi-Mode': logiMode,
          ...(installId ? { 'X-SFOC-Install-Id': installId } : {})
        },
        body: JSON.stringify(body)
      },
      DEFAULT_TIMEOUT_MS,
      signal
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (isProxyBlockHttp(res.status, text, res.headers.get('content-type'))) {
        throw new Error('LOGI_PROXY_BLOCKED');
      }
      const data = safeParseJson(text);
      const msg = data?.error || data?.message || res.statusText;
      throw new Error(`LOGI_PROXY_HTTP_${res.status}: ${msg}`);
    }

    const ct = String(res.headers.get('content-type') || '');
    if (!ct.includes('text/event-stream') && !ct.includes('application/octet-stream')) {
      // Proxy returned JSON — parse as non-stream.
      const text = await res.text();
      const data = parseJsonOrThrow(text, 'LOGI_PROXY_PARSE');
      const normalized = normalizeCompletionPayload(data, started);
      if (normalized.content) onDelta(normalized.content);
      return normalized;
    }

    return consumeSseCompletion(res, started, onDelta, signal);
  };

  try {
    return await runOnce(authToken);
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (/LOGI_PROXY_HTTP_401/.test(msg) && installId && !opts.userToken) {
      const renewed = await getProxyJwt(url, installId, { signal, forceRenew: true });
      return runOnce(renewed);
    }
    throw e;
  }
}

/**
 * @param {Response} res
 * @param {number} started
 * @param {(delta: string) => void} onDelta
 * @param {AbortSignal | undefined} signal
 */
async function consumeSseCompletion(res, started, onDelta, signal) {
  if (!res.body || typeof res.body.getReader !== 'function') {
    throw new Error('LOGI_STREAM_UNSUPPORTED');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let model;
  let finishReason;
  /** @type {Map<number, { id: string, type: string, function: { name: string, arguments: string } }>} */
  const toolCalls = new Map();
  /** @type {object | undefined} */
  let usage;

  const applyDelta = (data) => {
    if (!data || typeof data !== 'object') return;
    if (typeof data.model === 'string') model = data.model;
    if (data.usage) usage = data.usage;
    const choice = data.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) finishReason = choice.finish_reason;
    const delta = choice.delta || {};
    if (typeof delta.content === 'string' && delta.content) {
      content += delta.content;
      onDelta(delta.content);
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = Number.isFinite(Number(tc.index)) ? Number(tc.index) : 0;
        const prev = toolCalls.get(idx) || {
          id: '',
          type: 'function',
          function: { name: '', arguments: '' }
        };
        if (tc.id) prev.id = String(tc.id);
        if (tc.type) prev.type = String(tc.type);
        if (tc.function?.name) prev.function.name += String(tc.function.name);
        if (tc.function?.arguments) prev.function.arguments += String(tc.function.arguments);
        toolCalls.set(idx, prev);
      }
    }
  };

  while (true) {
    if (signal?.aborted) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      throwAbortError();
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop() || '';
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        applyDelta(JSON.parse(payload));
      } catch {
        /* skip bad chunk */
      }
    }
  }

  if (buffer.trim().startsWith('data:')) {
    const payload = buffer.trim().slice(5).trim();
    if (payload && payload !== '[DONE]') {
      try {
        applyDelta(JSON.parse(payload));
      } catch {
        /* ignore */
      }
    }
  }

  const tool_calls = [...toolCalls.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, tc]) => tc)
    .filter((tc) => tc.id || tc.function?.name);

  return {
    content,
    model,
    tool_calls: tool_calls.length ? tool_calls : undefined,
    usage: usage
      ? {
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens
        }
      : undefined,
    cost: Number(usage?.total_cost ?? usage?.cost ?? 0) || undefined,
    finish_reason: finishReason,
    latencyMs: Date.now() - started
  };
}

async function fetchWithRetry(url, init, externalSignal) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    if (externalSignal?.aborted) {
      throwAbortError();
    }
    if (attempt > 0) {
      await sleep(RETRY_DELAY_MS * attempt);
    }

    try {
      const res = await fetchWithTimeout(url, init, DEFAULT_TIMEOUT_MS, externalSignal);
      const text = await res.text();

      if (isProxyBlockHttp(res.status, text, res.headers.get('content-type'))) {
        throw new Error('LOGI_PROXY_BLOCKED');
      }

      if (!res.ok && isRetriableHttp(res.status) && attempt < MAX_RETRIES) {
        lastError = new Error(`LOGI_HTTP_${res.status}`);
        continue;
      }

      return { res, text };
    } catch (e) {
      lastError = e;
      if (isUserAbortError(e, externalSignal)) {
        const err = new Error('LOGI_CANCELLED');
        err.name = 'AbortError';
        throw err;
      }
      if (isProxyBlockError(e)) throw e;
      if (isTimeoutError(e)) {
        if (attempt < MAX_RETRIES) continue;
        throw new Error('LOGI_TIMEOUT');
      }
      if (isNetworkError(e) && attempt < MAX_RETRIES) continue;
      throw normalizeFetchError(e);
    }
  }

  throw normalizeFetchError(lastError || new Error('LOGI_NETWORK'));
}

async function fetchWithTimeout(url, init, timeoutMs, externalSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      keepalive: true
    });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

function throwAbortError() {
  const err = new Error('LOGI_CANCELLED');
  err.name = 'AbortError';
  throw err;
}

function isUserAbortError(err, signal) {
  if (signal?.aborted) return true;
  const msg = String(err?.message || err || '');
  return err?.name === 'AbortError' && msg.includes('LOGI_CANCELLED');
}

function parseCompletionResponse(res, text, started) {
  if (!res.ok) {
    if (isProxyBlockHttp(res.status, text, res.headers.get('content-type'))) {
      throw new Error('LOGI_PROXY_BLOCKED');
    }
    const data = safeParseJson(text);
    const msg = data?.error?.message || data?.message || truncateErr(text);
    throw new Error(`LOGI_OPENROUTER_HTTP_${res.status}: ${msg}`);
  }

  const data = parseJsonOrThrow(text, 'LOGI_OPENROUTER_PARSE');
  return normalizeCompletionPayload(data, started);
}

function normalizeCompletionPayload(data, started) {
  const choice = data?.choices?.[0];
  const message = choice?.message || data?.message || {};
  const usage = data?.usage || {};
  const cost = Number(data?.usage?.total_cost ?? data?.usage?.cost ?? data?.cost ?? 0) || undefined;

  return {
    content: String(data.content || message.content || ''),
    model: typeof data.model === 'string' ? data.model : undefined,
    tool_calls: Array.isArray(data.tool_calls)
      ? data.tool_calls
      : Array.isArray(message.tool_calls)
        ? message.tool_calls
        : undefined,
    usage: {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens
    },
    cost,
    finish_reason: data.finish_reason || choice?.finish_reason,
    latencyMs: Date.now() - started
  };
}

function parseJsonOrThrow(text, code) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${code}: ${truncateErr(text)}`);
  }
}

function safeParseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function isProxyBlockHttp(status, text, contentType) {
  const body = String(text || '');
  const type = String(contentType || '').toLowerCase();
  if (status === 403 || status === 451) {
    if (type.includes('text/html') || body.includes('<!DOCTYPE html') || body.includes('<html')) {
      return true;
    }
  }
  return (
    /netskope/i.test(body) ||
    /zscaler/i.test(body) ||
    /\bCHK-\d+\b/i.test(body) ||
    /proxy.{0,20}block/i.test(body) ||
    /this site can.?t be reached/i.test(body)
  );
}

function isProxyBlockError(err) {
  const msg = String(err?.message || err || '');
  return msg.includes('LOGI_PROXY_BLOCKED') || msg.includes('LOGI_OPENROUTER_HTTP_403');
}

function isTimeoutError(err) {
  const msg = String(err?.message || err || '');
  return err?.name === 'AbortError' || msg.includes('LOGI_TIMEOUT') || /timeout/i.test(msg);
}

function isNetworkError(err) {
  const msg = String(err?.message || err || '');
  return (
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('ERR_CONNECTION') ||
    msg.includes('ERR_NETWORK') ||
    msg.includes('ERR_INTERNET_DISCONNECTED')
  );
}

function normalizeFetchError(err) {
  if (isProxyBlockError(err)) return new Error('LOGI_PROXY_BLOCKED');
  if (isTimeoutError(err)) return new Error('LOGI_TIMEOUT');
  if (isNetworkError(err)) return new Error('LOGI_NETWORK');
  return err instanceof Error ? err : new Error(String(err || 'LOGI_NETWORK'));
}

function isRetriableHttp(status) {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
}

function isModelFailureError(err) {
  const msg = String(err?.message || err || '');
  if (
    msg.includes('LOGI_PROXY_BLOCKED') ||
    msg.includes('LOGI_NO_') ||
    msg.includes('LOGI_CANCELLED') ||
    msg.includes('LOGI_TIMEOUT') ||
    msg.includes('LOGI_NETWORK') ||
    /HTTP_401\b/.test(msg) ||
    /HTTP_403\b/.test(msg) ||
    /HTTP_413\b/.test(msg)
  ) {
    return false;
  }

  if (/HTTP_404\b|HTTP_429\b|HTTP_502\b|HTTP_503\b|HTTP_504\b|HTTP_408\b/.test(msg)) {
    return true;
  }

  if (/HTTP_400\b/.test(msg)) {
    return /model|provider|endpoint|rate.?limit|unavailable|overloaded/i.test(msg);
  }

  return /rate.?limit|unavailable|overloaded|downtime|no endpoints|provider error/i.test(msg);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateErr(text) {
  return String(text || '').replace(/\s+/g, ' ').slice(0, 200);
}

/**
 * @param {unknown} err
 * @returns {'LLM_PROXY_BLOCKED' | 'LLM_TIMEOUT' | 'LLM_NETWORK' | 'LLM_ERROR' | 'CANCELLED'}
 */
export function classifyLlmTransportFailure(err) {
  const msg = String(err?.message || err || '');
  if (msg.includes('LOGI_CANCELLED') || (err?.name === 'AbortError' && !msg.includes('LOGI_TIMEOUT'))) {
    return 'CANCELLED';
  }
  if (msg.includes('LOGI_PROXY_BLOCKED') || msg.includes('LOGI_OPENROUTER_HTTP_403')) {
    return 'LLM_PROXY_BLOCKED';
  }
  if (msg.includes('LOGI_TIMEOUT') || err?.name === 'AbortError') {
    return 'LLM_TIMEOUT';
  }
  if (
    msg.includes('LOGI_NETWORK') ||
    msg.includes('Failed to fetch') ||
    msg.includes('ERR_CONNECTION')
  ) {
    return 'LLM_NETWORK';
  }
  return 'LLM_ERROR';
}

export { DEFAULT_LOGI_MODELS };
