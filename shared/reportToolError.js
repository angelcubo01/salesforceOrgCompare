/**
 * Enrutador de errores de herramientas UI → bug ($exception) u operational (analytics).
 */
import { classifyError, toError } from './errorTelemetryPolicy.js';

/**
 * @typedef {Object} ToolErrorContext
 * @property {string} artifact_type
 * @property {string} [phase]
 * @property {string} [reason]
 * @property {boolean} [ok]
 * @property {Record<string, unknown>} [res]
 * @property {string} [comparisonUrl]
 * @property {string} [leftOrgId]
 * @property {string} [rightOrgId]
 * @property {Record<string, unknown>} [descriptor]
 */

/**
 * @param {Record<string, unknown>} ctx
 * @param {Record<string, unknown>} [res]
 */
function mergeResponseContext(ctx, res) {
  if (!res || typeof res !== 'object') return ctx;
  const reason = String(res.reason || ctx.reason || '').trim();
  const error = String(res.error || '').trim();
  return {
    ...ctx,
    ok: res.ok === false ? false : ctx.ok,
    reason: reason || undefined,
    sfoc_reason_code: reason || undefined,
    error_message: error || undefined
  };
}

/**
 * @param {unknown} error
 * @param {ToolErrorContext} context
 */
export async function handleToolError(error, context) {
  const err = toError(error);
  const merged = mergeResponseContext(
    {
      artifact_type: context.artifact_type,
      phase: context.phase || '',
      reason: context.reason,
      ok: context.ok,
      error_handled: 1
    },
    context.res
  );

  const category = classifyError(err, merged);
  if (category === 'benign') return { category, reported: false };

  if (category === 'operational') {
    const { reportOperationalFailure } = await import('./posthogClient.js');
    void reportOperationalFailure({
      artifactType: context.artifact_type,
      phase: context.phase || '',
      reason: merged.reason || err.message,
      error: String(merged.error_message || err.message || '').slice(0, 200),
      comparisonUrl: context.comparisonUrl,
      leftOrgId: context.leftOrgId,
      rightOrgId: context.rightOrgId,
      descriptor: context.descriptor
    });
    return { category, reported: true };
  }

  const { reportBug } = await import('./posthogClient.js');
  void reportBug(err, {
    artifact_type: context.artifact_type,
    phase: context.phase || '',
    sfoc_reason_code: String(merged.reason || '').slice(0, 64),
    error_handled: 1
  });
  return { category, reported: true };
}

/**
 * Atajo para respuestas `{ ok: false }` del bridge.
 * @param {Record<string, unknown>} res
 * @param {ToolErrorContext} context
 */
export function handleToolResponseFailure(res, context) {
  const msg = String(res?.error || res?.reason || 'operation failed');
  return handleToolError(new Error(msg), { ...context, res, ok: false });
}
