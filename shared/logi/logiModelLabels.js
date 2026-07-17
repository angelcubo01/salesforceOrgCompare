/** Etiquetas legibles para IDs OpenRouter en UI. */

const LABELS = Object.freeze({
  'anthropic/claude-opus-4': 'Claude Opus 4',
  'anthropic/claude-sonnet-4': 'Claude Sonnet 4',
  'anthropic/claude-3.7-sonnet': 'Claude 3.7 Sonnet',
  'anthropic/claude-3.5-sonnet': 'Claude 3.5 Sonnet',
  'anthropic/claude-3.5-haiku': 'Claude 3.5 Haiku',
  'openai/gpt-4o': 'GPT-4o',
  'openai/gpt-4o-mini': 'GPT-4o Mini',
  'openai/gpt-4-turbo': 'GPT-4 Turbo',
  'openai/o1': 'OpenAI o1',
  'openai/o3-mini': 'OpenAI o3 Mini',
  'google/gemini-2.5-pro-preview': 'Gemini 2.5 Pro',
  'qwen/qwen3-coder': 'Qwen3 Coder',
  'meta-llama/llama-3.3-70b-instruct': 'Llama 3.3 70B',
  'openai/gpt-oss-120b:free': 'GPT-OSS 120B (free)',
  'openai/gpt-oss-20b:free': 'GPT-OSS 20B (free)',
  'nvidia/nemotron-3-super-120b-a12b:free': 'Nemotron Super 120B (free)',
  'nvidia/nemotron-3-ultra-550b-a55b:free': 'Nemotron Ultra 550B (free)',
  'nvidia/nemotron-3-nano-30b-a3b:free': 'Nemotron Nano 30B (free)',
  'google/gemma-4-26b-a4b-it:free': 'Gemma 4 26B (free)',
  'qwen/qwen3-next-80b-a3b-instruct:free': 'Qwen3 Next 80B (free)',
  'qwen/qwen3-coder:free': 'Qwen3 Coder (free)',
  'cohere/north-mini-code:free': 'Cohere North Mini Code (free)',
  'poolside/laguna-m.1:free': 'Poolside Laguna M.1 (free)',
  'tencent/hy3:free': 'Tencent Hy3 (free)',
  'meta-llama/llama-3.3-70b-instruct:free': 'Llama 3.3 70B (free)'
});

/**
 * @param {string} modelId
 * @returns {string}
 */
export function formatLogiModelLabel(modelId) {
  const id = String(modelId || '').trim();
  if (!id) return '';
  if (LABELS[id]) return LABELS[id];
  const slash = id.lastIndexOf('/');
  const base = slash >= 0 ? id.slice(slash + 1) : id;
  return base
    .replace(/:free$/i, ' (free)')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
