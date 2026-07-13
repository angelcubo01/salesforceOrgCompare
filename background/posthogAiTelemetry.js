import { getOrCreateTelemetryInstallId } from '../shared/telemetryInstallId.js';

/**
 * @param {object} opts
 */
export async function captureAiGeneration(opts) {
  const {
    model,
    latencyMs,
    usage,
    cost,
    inputMessages,
    outputContent,
    toolCalls,
    logId,
    iteration
  } = opts;

  try {
    const { sendPosthogAiGeneration } = await import('./posthogTelemetry.js');
    const installId = await getOrCreateTelemetryInstallId();
    await sendPosthogAiGeneration({
      distinctId: installId,
      model: String(model || ''),
      latencySec: latencyMs ? latencyMs / 1000 : 0,
      promptTokens: usage?.prompt_tokens,
      completionTokens: usage?.completion_tokens,
      totalCostUsd: cost,
      input: truncateJson(inputMessages, 4000),
      outputChoices: truncateJson(
        [{ content: outputContent, tool_calls: toolCalls }],
        4000
      ),
      logId: logId ? String(logId) : '',
      iteration: iteration ?? 0
    });
  } catch {
    /* telemetry optional */
  }
}

/**
 * @param {unknown} value
 * @param {number} max
 */
function truncateJson(value, max) {
  try {
    const s = JSON.stringify(value);
    if (s.length <= max) return s;
    return `${s.slice(0, max - 1)}…`;
  } catch {
    return '';
  }
}
