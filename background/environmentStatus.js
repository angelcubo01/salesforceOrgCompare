import {
  probeApiVersion,
  fetchOrganizationStatus,
  fetchSessionUserInfo
} from '../shared/salesforceApi.js';
import { buildSessionDetailPayload } from '../shared/sessionInfoApi.js';
import { clearDescribeCachesForOrg } from './caches.js';
import {
  fetchTrustInstanceStatus,
  inferInstanceKeyFromHostname,
  parseNextMaintenance,
  countActiveIncidents
} from '../shared/trustStatusApi.js';
import {
  getOrderedSavedOrgs,
  loadSavedOrgs,
  resolveSidForOrg,
  checkOrgAuthStatus
} from './orgHelpers.js';

const CONCURRENCY = 4;

/**
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Math.max(1, Math.min(limit, items.length || 1));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

function resolveInstanceKey(sf, saved) {
  const fromSf = String(sf?.instanceName || '').trim();
  if (fromSf) return fromSf.toUpperCase();
  const host = saved?.cookieDomain || (() => {
    try {
      return new URL(saved.instanceUrl).hostname;
    } catch {
      return '';
    }
  })();
  return inferInstanceKeyFromHostname(host);
}

/**
 * @param {Record<string, unknown>} saved
 * @param {string} auth
 * @returns {Promise<Record<string, unknown>>}
 */
async function buildRowForOrg(saved, auth) {
  const orgId = String(saved.id || '');
  /** @type {string[]} */
  const errors = [];
  const base = {
    orgId,
    saved: {
      id: saved.id,
      displayName: saved.displayName,
      label: saved.label,
      instanceUrl: saved.instanceUrl,
      cookieDomain: saved.cookieDomain,
      apiVersion: saved.apiVersion,
      isSandbox: !!saved.isSandbox
    },
    auth,
    sf: null,
    liveApiVersion: null,
    sessionUser: null,
    trust: null,
    instanceKey: '',
    nextMaintenance: null,
    incidentCount: 0,
    errors
  };

  if (auth !== 'active') {
    const host = saved.cookieDomain || (() => {
      try {
        return new URL(saved.instanceUrl).hostname;
      } catch {
        return '';
      }
    })();
    base.instanceKey = inferInstanceKeyFromHostname(host);
    return base;
  }

  const sid = await resolveSidForOrg(saved);
  if (!sid) {
    base.auth = 'expired';
    return base;
  }

  const apiVersion = saved.apiVersion || '59.0';

  try {
    const [sf, liveApiVersion, sessionUser] = await Promise.all([
      fetchOrganizationStatus(saved.instanceUrl, sid, apiVersion),
      probeApiVersion(saved.instanceUrl, sid).catch(() => null),
      fetchSessionUserInfo(saved.instanceUrl, sid).catch(() => null)
    ]);
    base.sf = sf;
    base.liveApiVersion = liveApiVersion;
    base.sessionUser = sessionUser;
    base.instanceKey = resolveInstanceKey(sf, saved);
  } catch (e) {
    errors.push(String(e?.message || e));
  }

  if (base.instanceKey) {
    try {
      const trust = await fetchTrustInstanceStatus(base.instanceKey);
      base.trust = trust;
      base.nextMaintenance = parseNextMaintenance(trust);
      base.incidentCount = countActiveIncidents(trust);
    } catch (e) {
      errors.push(`Trust: ${String(e?.message || e)}`);
    }
  }

  return base;
}

/**
 * @returns {Promise<{ ok: true, rows: Record<string, unknown>[], fetchedAt: string }>}
 */
export async function fetchAllEnvironmentStatusRows() {
  const orgs = await getOrderedSavedOrgs();
  const authEntries = await Promise.all(
    orgs.map(async (org) => [org.id, await checkOrgAuthStatus(org, true)])
  );
  const authById = Object.fromEntries(authEntries);

  const rows = await mapWithConcurrency(orgs, CONCURRENCY, async (org) => {
    const auth = authById[org.id] || 'expired';
    return buildRowForOrg(org, auth);
  });

  return {
    ok: true,
    rows,
    fetchedAt: new Date().toISOString()
  };
}

/**
 * Detalle de sesión para una org (lazy load desde Environment Status).
 * @param {string} orgId
 * @returns {Promise<{ ok: true, detail: ReturnType<typeof buildSessionDetailPayload> } | { ok: false, reason?: string, error?: string }>}
 */
export async function fetchSessionDetailForOrg(orgId) {
  const saved = (await loadSavedOrgs())[orgId];
  if (!saved) {
    return { ok: false, error: 'Org not saved' };
  }
  const sid = await resolveSidForOrg(saved);
  if (!sid) {
    return { ok: false, reason: 'NO_SID' };
  }
  const apiVersion = saved.apiVersion || '59.0';
  try {
    const [sf, liveApiVersion, sessionUser] = await Promise.all([
      fetchOrganizationStatus(saved.instanceUrl, sid, apiVersion),
      probeApiVersion(saved.instanceUrl, sid).catch(() => null),
      fetchSessionUserInfo(saved.instanceUrl, sid).catch(() => null)
    ]);
    const detail = buildSessionDetailPayload(sessionUser, sf, saved, liveApiVersion);
    return { ok: true, detail };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * @param {string} orgId
 */
export function invalidateDescribeCacheForOrg(orgId) {
  clearDescribeCachesForOrg(orgId);
  return { ok: true };
}
