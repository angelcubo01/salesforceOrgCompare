/**
 * Transport layer for Logi LLM calls.
 * Beta: OpenRouter direct from service worker.
 * Production: proxy with subscription token (future).
 */

/**
 * @typedef {object} ChatCompletionRequest
 * @property {string} model
 * @property {object[]} messages
 * @property {object[]} [tools]
 * @property {number} [max_tokens]
 */

/**
 * @typedef {object} ChatCompletionResponse
 * @property {string} content
 * @property {object[]} [tool_calls]
 * @property {{ prompt_tokens?: number, completion_tokens?: number, total_tokens?: number }} [usage]
 * @property {number} [cost]
 * @property {string} [finish_reason]
 * @property {number} latencyMs
 */

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @param {ChatCompletionRequest} req
 * @param {{ userToken?: string }} [opts]
 * @returns {Promise<ChatCompletionResponse>}
 */
export async function createChatCompletion(config, req, opts = {}) {
  if (config.transport === 'proxy' && config.proxyUrl) {
    return proxyTransport(config, req, opts.userToken);
  }
  return openRouterDirectTransport(config, req);
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
async function openRouterDirectTransport(config, req) {
  const apiKey = config.openRouterApiKey;
  if (!apiKey) {
    throw new Error('LOGI_NO_API_KEY');
  }
  const started = Date.now();
  const body = {
    model: req.model || config.model,
    messages: req.messages,
    max_tokens: req.max_tokens ?? 2048
  };
  if (req.tools?.length) {
    body.tools = req.tools;
    body.tool_choice = 'auto';
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://salesforceorgcompare.com/',
      'X-Title': 'Salesforce Org Compare - Logi'
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`LOGI_OPENROUTER_PARSE: ${truncateErr(text)}`);
  }

  if (!res.ok) {
    const msg = data?.error?.message || data?.message || res.statusText;
    throw new Error(`LOGI_OPENROUTER_HTTP_${res.status}: ${msg}`);
  }

  const choice = data?.choices?.[0];
  const message = choice?.message || {};
  const usage = data?.usage || {};
  const cost = Number(data?.usage?.total_cost ?? data?.usage?.cost ?? 0) || undefined;

  return {
    content: String(message.content || ''),
    tool_calls: Array.isArray(message.tool_calls) ? message.tool_calls : undefined,
    usage: {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens
    },
    cost,
    finish_reason: choice?.finish_reason,
    latencyMs: Date.now() - started
  };
}

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @param {ChatCompletionRequest} req
 * @param {string} [userToken]
 */
async function proxyTransport(config, req, userToken) {
  const url = config.proxyUrl;
  if (!url) throw new Error('LOGI_NO_PROXY_URL');
  const started = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(userToken ? { Authorization: `Bearer ${userToken}` } : {})
    },
    body: JSON.stringify({
      model: req.model || config.model,
      messages: req.messages,
      tools: req.tools,
      max_tokens: req.max_tokens ?? 2048
    })
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`LOGI_PROXY_PARSE: ${truncateErr(text)}`);
  }
  if (!res.ok) {
    throw new Error(`LOGI_PROXY_HTTP_${res.status}: ${data?.error || res.statusText}`);
  }

  return {
    content: String(data.content || data?.choices?.[0]?.message?.content || ''),
    tool_calls: data.tool_calls || data?.choices?.[0]?.message?.tool_calls,
    usage: data.usage,
    cost: data.cost,
    finish_reason: data.finish_reason,
    latencyMs: Date.now() - started
  };
}

/**
 * @param {string} text
 */
function truncateErr(text) {
  return String(text || '').slice(0, 200);
}
