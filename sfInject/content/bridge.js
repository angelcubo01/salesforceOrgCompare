/**
 * Puente tipado content script → service worker.
 */

/** @param {object} message */
export function sfInjectSend(message) {
  return chrome.runtime.sendMessage(message);
}

/** @returns {Promise<{ ok: boolean, settings?: object, lang?: string, reason?: string }>} */
export async function fetchSfInjectBootstrap() {
  try {
    return await sfInjectSend({ type: 'sfInject:getSettings' });
  } catch {
    return { ok: false, reason: 'MESSAGE_FAILED' };
  }
}

/**
 * @param {string} instanceUrl
 * @returns {Promise<{ ok: boolean, orgId?: string, org?: object, reason?: string }>}
 */
export async function resolveActiveSavedOrg(instanceUrl) {
  try {
    return await sfInjectSend({ type: 'sfInject:resolveActiveOrg', instanceUrl });
  } catch {
    return { ok: false, reason: 'MESSAGE_FAILED' };
  }
}

/**
 * @param {string} orgId
 * @returns {Promise<{ ok: boolean, logs?: Array<{ id: string }>, reason?: string }>}
 */
export async function fetchDebugLogCatalog(orgId) {
  try {
    return await sfInjectSend({ type: 'sfInject:listDebugLogs', orgId, hours: 48, limit: 200 });
  } catch {
    return { ok: false, reason: 'MESSAGE_FAILED' };
  }
}

/**
 * @param {string} orgId
 * @param {string} logId
 * @returns {Promise<{ ok: boolean, opened?: boolean, reason?: string, error?: string }>}
 */
export async function openApexLogInViewer(orgId, logId) {
  try {
    return await sfInjectSend({ type: 'sfInject:openApexLog', orgId, logId });
  } catch {
    return { ok: false, reason: 'MESSAGE_FAILED' };
  }
}
