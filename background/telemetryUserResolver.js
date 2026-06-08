import { fetchSessionUserInfo } from '../shared/salesforceApi.js';
import { loadSavedOrgsMapForTelemetry } from '../shared/telemetryOrgContext.js';
import {
  buildSfUserTelemetryFields,
  orgDisplayNameForUserLabel,
  readCachedTelemetryUserForOrg,
  resolveTelemetryOrgId,
  writeTelemetryUserCache
} from '../shared/telemetryUserContext.js';
import { buildOrgFromActiveTab, loadSavedOrgs, resolveSidForOrg } from './orgHelpers.js';

/**
 * @param {Record<string, unknown>} org
 * @returns {Promise<{ sfUserLabel: string } | null>}
 */
export async function resolveSfUserContextForOrg(org) {
  if (!org || typeof org !== 'object') return null;
  const orgId = String(org.id || '').trim();
  if (!orgId) return null;

  const cached = await readCachedTelemetryUserForOrg(orgId);
  if (cached) return cached;

  const sid = await resolveSidForOrg(org);
  if (!sid) return null;

  const instanceUrl = String(org.instanceUrl || '').trim();
  if (!instanceUrl) return null;

  try {
    const info = await fetchSessionUserInfo(instanceUrl, sid);
    const orgDisplayName = orgDisplayNameForUserLabel(org);
    const fields = buildSfUserTelemetryFields({
      username: info.username,
      name: info.name,
      orgDisplayName
    });
    if (!fields) return null;
    await writeTelemetryUserCache(orgId, fields);
    return fields;
  } catch {
    return null;
  }
}

/**
 * @param {{ rightOrgId?: string | null, leftOrgId?: string | null }} opts
 * @returns {Promise<{ sfUserLabel: string } | null>}
 */
export async function resolveTelemetryUserLabel(opts = {}) {
  const map = await loadSavedOrgsMapForTelemetry();
  const orgId = resolveTelemetryOrgId(
    { rightOrgId: opts.rightOrgId, leftOrgId: opts.leftOrgId },
    map
  );

  if (orgId && map[orgId]) {
    const ctx = await resolveSfUserContextForOrg(map[orgId]);
    if (ctx) return ctx;
  }

  try {
    const tabOrg = await buildOrgFromActiveTab();
    if (tabOrg.ok && tabOrg.org) {
      const saved = await loadSavedOrgs();
      const persisted = saved[tabOrg.org.id] || tabOrg.org;
      return resolveSfUserContextForOrg(persisted);
    }
  } catch {
    /* ignore */
  }

  return null;
}

/**
 * @param {Record<string, unknown>} entry
 * @returns {Promise<Record<string, unknown>>}
 */
export async function enrichEntryWithUserContext(entry) {
  const base = entry && typeof entry === 'object' ? { ...entry } : {};
  const ctx = await resolveTelemetryUserLabel({
    rightOrgId: base.rightOrgId,
    leftOrgId: base.leftOrgId
  });
  if (!ctx) return base;
  return {
    ...base,
    sfUserLabel: ctx.sfUserLabel
  };
}
