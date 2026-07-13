/** @type {Map<string, AbortController>} */
const activeRequests = new Map();

/**
 * @param {string} requestId
 * @returns {AbortSignal | undefined}
 */
export function beginLogiRequest(requestId) {
  if (!requestId) return undefined;
  const existing = activeRequests.get(requestId);
  existing?.abort();
  const controller = new AbortController();
  activeRequests.set(requestId, controller);
  return controller.signal;
}

/**
 * @param {string} requestId
 */
export function finishLogiRequest(requestId) {
  if (!requestId) return;
  activeRequests.delete(requestId);
}

/**
 * @param {string} requestId
 * @returns {boolean}
 */
export function cancelLogiRequest(requestId) {
  if (!requestId) return false;
  const controller = activeRequests.get(requestId);
  if (!controller) return false;
  controller.abort();
  activeRequests.delete(requestId);
  return true;
}
