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

/**
 * @param {Partial<{ userTraceFlagsActiveOnly: boolean }>} prefs
 * @returns {Promise<{ ok: boolean, settings?: object, reason?: string }>}
 */
export async function saveSfInjectPrefsRemote(prefs) {
  try {
    return await sfInjectSend({ type: 'sfInject:savePrefs', prefs });
  } catch {
    return { ok: false, reason: 'MESSAGE_FAILED' };
  }
}

/**
 * @param {string} orgId
 * @returns {Promise<{ ok: boolean, traces?: Array<Record<string, unknown>>, reason?: string, error?: string }>}
 */
export async function fetchUserTraceFlags(orgId) {
  try {
    return await sfInjectSend({ type: 'sfInject:listTraceFlags', orgId });
  } catch {
    return { ok: false, reason: 'MESSAGE_FAILED' };
  }
}

/** @param {string} orgId @param {string} asyncId */
export async function fetchDeployStatusInlineDetail(orgId, asyncId) {
  try {
    return await sfInjectSend({ type: 'sfInject:getDeployStatusDetail', orgId, asyncId });
  } catch {
    return { ok: false, reason: 'MESSAGE_FAILED' };
  }
}

/** @param {{ orgId: string, classId?: string, className: string, initialLine?: number }} opts */
export async function openDeployStatusApexSource(opts) {
  try {
    return await sfInjectSend({
      type: 'sfInject:openApexSource',
      orgId: opts.orgId,
      classId: opts.classId,
      className: opts.className,
      initialLine: opts.initialLine
    });
  } catch {
    return { ok: false, reason: 'MESSAGE_FAILED' };
  }
}

/** @returns {Promise<{ ok: boolean, orgs?: Array<{ id: string, label: string }>, reason?: string }>} */
export async function fetchActiveSavedOrgsForDeployDetail() {
  try {
    return await sfInjectSend({ type: 'sfInject:listActiveSavedOrgsForDeployDetail' });
  } catch {
    return { ok: false, reason: 'MESSAGE_FAILED' };
  }
}

/**
 * @param {object} opts
 * @param {string} opts.orgId
 * @param {string} opts.traceFlagId
 * @param {boolean} [opts.allowReactivate]
 * @param {string} [opts.startIso]
 * @param {string} [opts.expirationIso]
 * @returns {Promise<{ ok: boolean, expirationIso?: string, startIso?: string, reactivated?: boolean, reason?: string, error?: string }>}
 */
export async function extendUserTraceFlag(opts) {
  try {
    return await sfInjectSend({
      type: 'sfInject:extendTraceFlag',
      orgId: opts.orgId,
      traceFlagId: opts.traceFlagId,
      allowReactivate: opts.allowReactivate,
      startIso: opts.startIso,
      expirationIso: opts.expirationIso
    });
  } catch {
    return { ok: false, reason: 'MESSAGE_FAILED' };
  }
}
