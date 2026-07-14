import { fetchOrganizationStatus } from '../shared/salesforceApi.js';
import {
  isOrgReadOnly,
  shouldBlockProductionDeploy,
  shouldUpdateStoredSandboxFlag
} from '../shared/orgWritePolicy.js';
import { appendAuditEntry, AUDIT_TRAIL_STORAGE_KEY } from '../shared/localAuditTrail.js';
import { loadSavedOrgs, saveSavedOrgs } from './orgHelpers.js';

export const ORG_READ_ONLY_STORAGE_KEY = 'sfocOrgReadOnlyById';

/** @returns {Promise<Record<string, boolean>>} */
export async function loadOrgReadOnlyMap() {
  const data = await chrome.storage.local.get(ORG_READ_ONLY_STORAGE_KEY);
  const map = data[ORG_READ_ONLY_STORAGE_KEY];
  return map && typeof map === 'object' ? /** @type {Record<string, boolean>} */ (map) : {};
}

/**
 * @param {Record<string, unknown>} org
 * @param {string} sid
 */
export async function verifyOrgIsSandbox(org, sid) {
  const apiVersion = org.apiVersion || '59.0';
  const sf = await fetchOrganizationStatus(String(org.instanceUrl), sid, String(apiVersion));
  return !!sf.isSandbox;
}

/**
 * @param {Record<string, unknown>} org
 * @param {string} sid
 */
export async function syncOrgSandboxFlagIfNeeded(org, sid) {
  try {
    const verified = await verifyOrgIsSandbox(org, sid);
    if (shouldUpdateStoredSandboxFlag(org.isSandbox, verified)) {
      const saved = await loadSavedOrgs();
      const id = String(org.id || '');
      if (saved[id]) {
        saved[id] = { ...saved[id], isSandbox: verified };
        await saveSavedOrgs(saved);
      }
    }
    return verified;
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, unknown>} org
 * @param {string} sid
 * @param {{ checkOnly?: boolean, action?: string }} [opts]
 */
export async function assertOrgWriteAllowed(org, sid, opts = {}) {
  const orgId = String(org?.id || '');
  const readOnlyMap = await loadOrgReadOnlyMap();
  if (isOrgReadOnly(readOnlyMap, orgId)) {
    return { ok: false, reason: 'ORG_READ_ONLY', error: 'This org is read-only' };
  }
  let verified = null;
  try {
    verified = await syncOrgSandboxFlagIfNeeded(org, sid);
  } catch {
    verified = null;
  }
  if (shouldBlockProductionDeploy(org, verified, !!opts.checkOnly, String(opts.action || ''))) {
    return { ok: false, reason: 'PROD_DEPLOY_BLOCKED', error: 'Deploy to production is blocked' };
  }
  return { ok: true, verifiedIsSandbox: verified };
}

/**
 * @param {{ action: string, orgId?: string, detail?: string }} entry
 */
export async function recordLocalAudit(entry) {
  const data = await chrome.storage.local.get(AUDIT_TRAIL_STORAGE_KEY);
  const prev = data[AUDIT_TRAIL_STORAGE_KEY];
  const list = appendAuditEntry(Array.isArray(prev) ? prev : [], entry);
  await chrome.storage.local.set({ [AUDIT_TRAIL_STORAGE_KEY]: list });
}
