import { buildLogiAiMetrics } from '../shared/logi/logiAiMetrics.js';

/**
 * @param {object} opts
 */
export async function captureAiGeneration(opts) {
  const { model, latencyMs, usage, cost, logId, iteration, result, config, context } = opts;

  try {
    const { sendPosthogAiGeneration } = await import('./posthogTelemetry.js');
    const { getOrCreateTelemetryInstallId } = await import('../shared/telemetryInstallId.js');
    const installId = await getOrCreateTelemetryInstallId();

    const metrics =
      result && config
        ? buildLogiAiMetrics(result, config, {
            iteration,
            logId,
            ...context
          })
        : {};

    await sendPosthogAiGeneration({
      distinctId: installId,
      model: String(model || metrics.sfoc_model || ''),
      latencySec: latencyMs ? latencyMs / 1000 : (Number(metrics.sfoc_latency_ms) || 0) / 1000,
      promptTokens: usage?.prompt_tokens ?? metrics.sfoc_prompt_tokens,
      completionTokens: usage?.completion_tokens ?? metrics.sfoc_completion_tokens,
      totalCostUsd: cost ?? metrics.sfoc_total_cost_usd,
      logId: logId ? String(logId) : '',
      iteration: iteration ?? 0,
      transport: metrics.sfoc_transport
    });
  } catch {
    /* telemetry optional */
  }
}
