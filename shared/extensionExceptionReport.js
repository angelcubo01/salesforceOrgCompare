/**
 * Informe de excepciones vía service worker (independiente del opt-out de telemetría de uso).
 */

/**
 * @param {unknown} error
 * @param {Record<string, string | number | boolean>} [context]
 * @returns {Promise<boolean>}
 */
export async function reportExtensionException(error, context = {}) {
  const err = error instanceof Error ? error : new Error(String(error ?? 'unknown'));
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    return false;
  }
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'telemetry:exception',
      message: String(err.message || 'unknown').slice(0, 2000),
      name: String(err.name || 'Error').slice(0, 128),
      stack: typeof err.stack === 'string' ? err.stack.slice(0, 8000) : '',
      context
    });
    return res?.ok === true;
  } catch {
    return false;
  }
}
