/**
 * Resuelve el usuario Salesforce conectado por org (para mostrar en el selector de entorno).
 * Devuelve { username, name, companyName, apiVersion } o null si la org no está conectada.
 */
import { fetchSessionUserInfo, probeApiVersion } from '../shared/salesforceApi.js';
import { checkOrgAuthStatus, loadSavedOrgs, resolveSidForOrg } from './orgHelpers.js';

const CACHE_KEY = 'sfoc_org_connected_user';
const CACHE_TTL_MS = 30 * 60 * 1000;

/** @returns {Promise<Record<string, { fetchedAt: number, user: object }>>} */
async function readCache() {
  try {
    const r = await chrome.storage.session.get(CACHE_KEY);
    const map = r[CACHE_KEY];
    return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  } catch {
    return {};
  }
}

/**
 * @param {string} orgId
 * @param {object} user
 */
async function writeCache(orgId, user) {
  const id = String(orgId || '').trim();
  if (!id || !user) return;
  const map = await readCache();
  map[id] = { fetchedAt: Date.now(), user };
  try {
    await chrome.storage.session.set({ [CACHE_KEY]: map });
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} orgId
 * @returns {Promise<object | null>}
 */
async function readCachedUser(orgId) {
  const id = String(orgId || '').trim();
  if (!id) return null;
  const map = await readCache();
  const row = map[id];
  if (!row?.user) return null;
  if (Date.now() - (row.fetchedAt || 0) > CACHE_TTL_MS) return null;
  return row.user;
}

/**
 * @param {string} orgId
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<{ username: string, name: string, companyName: string, apiVersion: string } | null>}
 */
export async function resolveOrgConnectedUser(orgId, opts = {}) {
  const id = String(orgId || '').trim();
  if (!id) return null;

  if (!opts.force) {
    const cached = await readCachedUser(id);
    if (cached) return cached;
  }

  const saved = await loadSavedOrgs();
  const org = saved[id];
  if (!org) return null;

  const auth = await checkOrgAuthStatus(org, !!opts.force);
  if (auth !== 'active') return null;

  const sid = await resolveSidForOrg(org);
  if (!sid) return null;

  const instanceUrl = String(org.instanceUrl || '').trim();
  if (!instanceUrl) return null;

  try {
    const info = await fetchSessionUserInfo(instanceUrl, sid);
    let apiVersion = String(org.apiVersion || '').trim();
    if (!apiVersion) {
      try {
        apiVersion = String((await probeApiVersion(instanceUrl, sid)) || '').trim();
      } catch {
        /* ignore */
      }
    }
    const user = {
      username: String(info.username || '').trim(),
      name: String(info.name || '').trim(),
      companyName: String(org.displayName || '').trim(),
      apiVersion
    };
    if (!user.username && !user.name) return null;
    await writeCache(id, user);
    return user;
  } catch {
    return null;
  }
}

/**
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Math.max(1, Math.min(limit, items.length || 1));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/**
 * @param {string[]} orgIds
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<Record<string, object | null>>}
 */
export async function resolveOrgConnectedUsers(orgIds, opts = {}) {
  const ids = [
    ...new Set(
      (Array.isArray(orgIds) ? orgIds : [])
        .map((x) => String(x || '').trim())
        .filter(Boolean)
    )
  ];
  if (!ids.length) return {};
  const users = await mapWithConcurrency(ids, 4, (id) => resolveOrgConnectedUser(id, opts));
  /** @type {Record<string, object | null>} */
  const out = {};
  ids.forEach((id, i) => {
    out[id] = users[i] || null;
  });
  return out;
}
