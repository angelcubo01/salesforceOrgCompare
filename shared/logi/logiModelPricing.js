/**
 * Precios OpenRouter (USD) para UI de preferencias BYOK.
 * La API pública expone pricing.prompt / pricing.completion como USD por token.
 */

/** @typedef {{ promptPer1M: number, completionPer1M: number, source: 'live' | 'fallback' }} LogiModelPricing */

/**
 * Fallback aproximado cuando la API no responde o el id ya no está en catálogo.
 * Valores en USD por 1M tokens (in / out).
 * @type {Readonly<Record<string, { promptPer1M: number, completionPer1M: number }>>}
 */
export const FALLBACK_LOGI_MODEL_PRICING = Object.freeze({
  'anthropic/claude-opus-4': { promptPer1M: 15, completionPer1M: 75 },
  'anthropic/claude-sonnet-4': { promptPer1M: 3, completionPer1M: 15 },
  'anthropic/claude-3.7-sonnet': { promptPer1M: 3, completionPer1M: 15 },
  'anthropic/claude-3.5-sonnet': { promptPer1M: 3, completionPer1M: 15 },
  'anthropic/claude-3.5-haiku': { promptPer1M: 0.8, completionPer1M: 4 },
  'openai/gpt-4o': { promptPer1M: 2.5, completionPer1M: 10 },
  'openai/gpt-4o-mini': { promptPer1M: 0.15, completionPer1M: 0.6 },
  'openai/gpt-4-turbo': { promptPer1M: 10, completionPer1M: 30 },
  'openai/o1': { promptPer1M: 15, completionPer1M: 60 },
  'openai/o3-mini': { promptPer1M: 1.1, completionPer1M: 4.4 },
  'google/gemini-2.5-pro-preview': { promptPer1M: 1.25, completionPer1M: 10 },
  'qwen/qwen3-coder': { promptPer1M: 0.3, completionPer1M: 1 }
});

/**
 * @param {unknown} perToken
 * @returns {number | null}
 */
export function openRouterPerTokenToPer1M(perToken) {
  const n = Number(perToken);
  if (!Number.isFinite(n) || n < 0) return null;
  return n * 1_000_000;
}

/**
 * @param {number} value
 * @returns {string}
 */
export function formatUsdPer1M(value) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '$0';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(2)}`;
}

/**
 * @param {LogiModelPricing | null | undefined} pricing
 * @param {{ freeLabel?: string, unknownLabel?: string }} [labels]
 * @returns {string}
 */
export function formatLogiModelPricingLabel(pricing, labels = {}) {
  if (!pricing) return labels.unknownLabel || '—';
  if (pricing.promptPer1M === 0 && pricing.completionPer1M === 0) {
    return labels.freeLabel || 'Free';
  }
  return `In ${formatUsdPer1M(pricing.promptPer1M)} · Out ${formatUsdPer1M(pricing.completionPer1M)} /1M`;
}

/**
 * @param {string} modelId
 * @param {Record<string, LogiModelPricing> | null | undefined} liveMap
 * @returns {LogiModelPricing | null}
 */
export function resolveLogiModelPricing(modelId, liveMap = null) {
  const id = String(modelId || '').trim();
  if (!id) return null;
  if (/:free$/i.test(id)) {
    return { promptPer1M: 0, completionPer1M: 0, source: 'live' };
  }
  const live = liveMap?.[id];
  if (live) return live;
  const fb = FALLBACK_LOGI_MODEL_PRICING[id];
  if (fb) {
    return {
      promptPer1M: fb.promptPer1M,
      completionPer1M: fb.completionPer1M,
      source: 'fallback'
    };
  }
  return null;
}

/**
 * @param {unknown} rawModels
 * @returns {Record<string, LogiModelPricing>}
 */
export function parseOpenRouterModelsPricing(rawModels) {
  /** @type {Record<string, LogiModelPricing>} */
  const out = {};
  const list = Array.isArray(rawModels)
    ? rawModels
    : rawModels && typeof rawModels === 'object' && Array.isArray(/** @type {any} */ (rawModels).data)
      ? /** @type {any} */ (rawModels).data
      : [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id) continue;
    const pricing = item.pricing && typeof item.pricing === 'object' ? item.pricing : null;
    if (!pricing) continue;
    const promptPer1M = openRouterPerTokenToPer1M(pricing.prompt);
    const completionPer1M = openRouterPerTokenToPer1M(pricing.completion);
    if (promptPer1M == null || completionPer1M == null) continue;
    out[id] = { promptPer1M, completionPer1M, source: 'live' };
  }
  return out;
}
