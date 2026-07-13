/**
 * Transport layer for Logi LLM calls.
 * Beta: OpenRouter direct from service worker (with proxy auto-fallback).
 * Production: proxy with subscription token.
 */

import {
  OPENROUTER_MAX_MODELS_PER_REQUEST,
  resolveLogiModelChain
} from './apexLogAiAdvisorConfig.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
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
 */

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @param {ChatCompletionRequest} req
 * @param {{ userToken?: string, installId?: string, signal?: AbortSignal }} [opts]
 * @returns {Promise<ChatCompletionResponse>}
 */
export async function createChatCompletion(config, req, opts = {}) {
  const signal = opts.signal;
  const chain =
    Array.isArray(req.models) && req.models.length
      ? req.models
      : resolveLogiModelChain(config, req.model);
  const baseReq = { ...req };
  delete baseReq.models;
  delete baseReq.model;

  /** @type {Error | null} */
  let lastError = null;

  for (let i = 0; i < chain.length; i += OPENROUTER_MAX_MODELS_PER_REQUEST) {
    const batch = chain.slice(i, i + OPENROUTER_MAX_MODELS_PER_REQUEST);
    const batchReq = { ...baseReq, models: batch };

    try {
      if (config.transport === 'proxy' && config.proxyUrl) {
        return await proxyTransport(config, batchReq, opts, signal);
      }

      try {
        return await openRouterDirectTransport(config, batchReq, signal);
      } catch (e) {
        if (isUserAbortError(e, signal)) throw e;
        if (config.proxyUrl && isProxyBlockError(e)) {
          return await proxyTransport(config, batchReq, opts, signal);
        }
        throw e;
      }
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
 * Beta: future subscription hook.
 * @param {string} [_userId]
 * @returns {Promise<'free' | 'pro' | 'team'>}
 */
export async function checkAiAdvisorEntitlement(_userId) {
  return 'free';
}

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @param {ChatCompletionRequest} req
 */
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

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @param {ChatCompletionRequest} req
 * @param {{ userToken?: string, installId?: string }} [opts]
 */
async function proxyTransport(config, req, opts = {}, signal) {
  const url = config.proxyUrl;
  if (!url) throw new Error('LOGI_NO_PROXY_URL');
  const authToken = opts.userToken || config.proxyAuthToken;
  if (!authToken) throw new Error('LOGI_NO_PROXY_AUTH');
  const started = Date.now();
  const body = buildRequestBody(config, req);

  const { res, text } = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${authToken}`,
        ...(opts.installId ? { 'X-SFOC-Install-Id': opts.installId } : {})
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
}

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @param {ChatCompletionRequest} req
 */
function buildRequestBody(config, req) {
  const models = (
    Array.isArray(req.models) && req.models.length
      ? req.models
      : resolveLogiModelChain(config, req.model)
  ).slice(0, OPENROUTER_MAX_MODELS_PER_REQUEST);

  const body = {
    models,
    messages: req.messages,
    max_tokens: req.max_tokens ?? 2048
  };
  if (req.tools?.length) {
    body.tools = req.tools;
    body.tool_choice = 'auto';
  }
  return body;
}

/**
 * @param {string} url
 * @param {RequestInit} init
 * @param {AbortSignal} [externalSignal]
 * @returns {Promise<{ res: Response, text: string }>}
 */
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

/**
 * @param {string} url
 * @param {RequestInit} init
 * @param {number} timeoutMs
 * @param {AbortSignal} [externalSignal]
 */
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

/**
 * @param {unknown} err
 * @param {AbortSignal} [signal]
 */
function isUserAbortError(err, signal) {
  if (signal?.aborted) return true;
  const msg = String(err?.message || err || '');
  return err?.name === 'AbortError' && msg.includes('LOGI_CANCELLED');
}

/**
 * @param {Response} res
 * @param {string} text
 * @param {number} started
 */
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

/**
 * @param {unknown} data
 * @param {number} started
 */
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

/**
 * @param {string} text
 * @param {string} code
 */
function parseJsonOrThrow(text, code) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${code}: ${truncateErr(text)}`);
  }
}

/**
 * @param {string} text
 */
function safeParseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/**
 * @param {number} status
 * @param {string} text
 * @param {string | null} contentType
 */
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

/**
 * @param {unknown} err
 */
function isProxyBlockError(err) {
  const msg = String(err?.message || err || '');
  return msg.includes('LOGI_PROXY_BLOCKED') || msg.includes('LOGI_OPENROUTER_HTTP_403');
}

/**
 * @param {unknown} err
 */
function isTimeoutError(err) {
  const msg = String(err?.message || err || '');
  return err?.name === 'AbortError' || msg.includes('LOGI_TIMEOUT') || /timeout/i.test(msg);
}

/**
 * @param {unknown} err
 */
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

/**
 * @param {unknown} err
 */
function normalizeFetchError(err) {
  if (isProxyBlockError(err)) return new Error('LOGI_PROXY_BLOCKED');
  if (isTimeoutError(err)) return new Error('LOGI_TIMEOUT');
  if (isNetworkError(err)) return new Error('LOGI_NETWORK');
  return err instanceof Error ? err : new Error(String(err || 'LOGI_NETWORK'));
}

/**
 * @param {number} status
 */
function isRetriableHttp(status) {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Errores por los que conviene probar el siguiente lote de modelos.
 * @param {unknown} err
 */
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

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} text
 */
function truncateErr(text) {
  return String(text || '').replace(/\s+/g, ' ').slice(0, 200);
}

/**
 * @param {unknown} err
 * @returns {'LLM_PROXY_BLOCKED' | 'LLM_TIMEOUT' | 'LLM_NETWORK' | 'LLM_ERROR'}
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
