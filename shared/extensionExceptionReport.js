/**
 * Informe de excepciones vía service worker (independiente del opt-out de telemetría de uso).
 */
import { shouldDropError, toError } from './errorTelemetryPolicy.js';

/**
 * @param {unknown} error
 * @param {Record<string, string | number | boolean>} [context]
 * @returns {Promise<boolean>}
 */
export async function reportExtensionException(error, context = {}) {
  const err = toError(error);
  if (shouldDropError(err, context)) return false;

  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    return false;
  }

  /** @type {Record<string, string | number | boolean>} */
  const enriched = { ...context };
  try {
    const { getPosthogClient } = await import('./posthogClient.js');
    const { getSessionReplayUrl } = await import('./posthogSessionReplay.js');
    const replayUrl = getSessionReplayUrl(getPosthogClient());
    if (replayUrl) enriched.session_replay_url = replayUrl;
  } catch {
    /* posthog no disponible en esta página */
  }

  try {
    const res = await chrome.runtime.sendMessage({
      type: 'telemetry:exception',
      message: String(err.message || 'unknown').slice(0, 2000),
      name: String(err.name || 'Error').slice(0, 128),
      stack: typeof err.stack === 'string' ? err.stack.slice(0, 8000) : '',
      context: enriched
    });
    return res?.ok === true;
  } catch {
    return false;
  }
}
