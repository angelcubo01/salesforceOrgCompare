import { discoverActiveTabContext, getSidForCookieDomain } from '../shared/orgDiscovery.js';
import { probeApiVersion, getOrganizationInfo } from '../shared/salesforceApi.js';
import { authStatusCache, versionCache } from './caches.js';

/** Dominios donde aceptamos cookies `sid` al buscar sesión en segundo plano. */
export const ALLOWED_SF_SUFFIXES = [
  'salesforce.com',
  'lightning.force.com',
  'force.com',
  'salesforce-setup.com',
  'salesforce.mil',
  'force.mil',
  'sfcrmapps.cn',
  'sfcrmproducts.cn',
  'cloudforce.com',
  'cloudforce.mil',
  'visualforce.com',
  'visual.force.com'
];

/** Etiqueta corta (p. ej. sandbox) a partir del hostname del subdominio. */
export function inferEnvLabelFromHostname(host) {
  try {
    const sub = String(host || '').split('.')[0] || '';
    if (sub.includes('--')) {
      const sandbox = sub.split('--')[1] || '';
      const clean = sandbox.split('-')[0];
      return (clean || sandbox).toUpperCase();
    }
    return 'PROD';
  } catch {
    return 'ORG';
  }
}

export async function gatherSidCandidatesForHostname(activeHost) {
  const candidates = [];
  try {
    const first = await chrome.cookies.get({ url: `https://${activeHost}/`, name: 'sid' });
    if (first && first.value) candidates.push(first);
  } catch {}
  try {
    const all = await chrome.cookies.getAll({ name: 'sid', secure: true });
    const filtered = all.filter((c) => ALLOWED_SF_SUFFIXES.some((sfx) => (c.domain || '').endsWith(sfx)));
    const seen = new Set(candidates.map((c) => c.value));
    for (const c of filtered) {
      if (!seen.has(c.value)) {
        candidates.push(c);
        seen.add(c.value);
      }
    }
  } catch {}
  return candidates;
}

export async function getSidForOrgId(orgId) {
  if (!orgId) return '';
  try {
    const all = await chrome.cookies.getAll({ name: 'sid', secure: true });
    const filtered = all.filter((c) => ALLOWED_SF_SUFFIXES.some((sfx) => (c.domain || '').endsWith(sfx)));
    const match = filtered.find((c) => typeof c.value === 'string' && c.value.startsWith(orgId + '!'));
    if (match) return match.value;
  } catch {}
  return '';
}

export async function loadSavedOrgs() {
  const { savedOrgs } = await chrome.storage.sync.get('savedOrgs');
  return savedOrgs || {};
}

export async function saveSavedOrgs(savedOrgs) {
  await chrome.storage.sync.set({ savedOrgs });
}

/** @returns {Promise<string[] | null>} */
export async function loadSavedOrgOrder() {
  const { savedOrgOrder } = await chrome.storage.sync.get('savedOrgOrder');
  return Array.isArray(savedOrgOrder) ? savedOrgOrder : null;
}

/** @param {string[]} order */
export async function saveSavedOrgOrder(order) {
  await chrome.storage.sync.set({ savedOrgOrder: order });
}

/**
 * Orgs en el orden guardado (popup drag) o, si no hay orden, orden de claves del mapa.
 * Incluye al final cualquier org que exista en `savedOrgs` pero no en la lista persistida.
 */
export async function getOrderedSavedOrgs() {
  const saved = await loadSavedOrgs();
  const order = await loadSavedOrgOrder();
  const ids = order && order.length ? order : Object.keys(saved);
  const seen = new Set();
  const result = [];
  for (const id of ids) {
    if (saved[id] && !seen.has(id)) {
      result.push(saved[id]);
      seen.add(id);
    }
  }
  for (const id of Object.keys(saved)) {
    if (!seen.has(id)) {
      result.push(saved[id]);
      seen.add(id);
    }
  }
  return result;
}

/** Tras añadir una org: mantener orden existente y añadir el id al final si es nuevo. */
export async function syncOrgOrderAfterAdd(orgId) {
  if (!orgId) return;
  const saved = await loadSavedOrgs();
  let order = await loadSavedOrgOrder();
  if (!order || !order.length) {
    order = Object.keys(saved);
  } else if (!order.includes(orgId)) {
    order = [...order, orgId];
  }
  await saveSavedOrgOrder(order);
}

/** Tras eliminar una org: quitar su id de la lista de orden. */
export async function syncOrgOrderAfterRemove(orgId) {
  if (!orgId) return;
  const order = await loadSavedOrgOrder();
  if (!order || !order.length) return;
  await saveSavedOrgOrder(order.filter((id) => id !== orgId));
}

export function makeIndexKey(orgId, type, prefix) {
  return `idx:${orgId}:${type}:${(prefix || '').toLowerCase()}`;
}

export function makeSourceKey(orgId, type, descriptor) {
  return `src:${orgId}:${type}:${JSON.stringify(descriptor)}`;
}

export async function ensureVersion(instanceUrl, sid) {
  const k = `ver:${instanceUrl}`;
  const cached = versionCache.get(k);
  if (cached) return cached;
  const v = await probeApiVersion(instanceUrl, sid);
  versionCache.set(k, v);
  return v;
}

export async function checkOrgAuthStatus(org, force = false) {
  try {
    const cacheKey = `auth:${org.id}`;
    if (!force) {
      const cached = authStatusCache.get(cacheKey);
      if (cached) return cached;
    }

    let sid = await getSidForCookieDomain(org.cookieDomain);
    if (!sid) sid = await getSidForOrgId(org.id);
    if (!sid) {
      authStatusCache.set(cacheKey, 'expired');
      return 'expired';
    }
    try {
      const apiVersion = org.apiVersion || '59.0';
      await getOrganizationInfo(org.instanceUrl, sid, apiVersion);
      authStatusCache.set(cacheKey, 'active');
      return 'active';
    } catch {
      authStatusCache.set(cacheKey, 'expired');
      return 'expired';
    }
  } catch {
    return 'expired';
  }
}

export async function buildOrgFromActiveTab() {
  const ctx = await discoverActiveTabContext();
  if (!ctx.ok) return { ok: false, reason: ctx.reason };
  const { instanceUrl, cookieDomain, sid } = ctx;
  const activeHost = new URL(instanceUrl).hostname;
  const candidates = [];
  if (sid) candidates.push({ value: sid, domain: cookieDomain });
  const hostCandidates = await gatherSidCandidatesForHostname(activeHost);
  for (const c of hostCandidates) candidates.push({ value: c.value, domain: c.domain || activeHost });

  for (const cand of candidates) {
    try {
      const apiVersion = await ensureVersion(instanceUrl, cand.value);
      const org = await getOrganizationInfo(instanceUrl, cand.value, apiVersion);
      return {
        ok: true,
        org: {
          id: org.id,
          displayName: org.name,
          label: inferEnvLabelFromHostname(activeHost),
          instanceUrl,
          cookieDomain: activeHost,
          apiVersion,
          isSandbox: org.isSandbox
        }
      };
    } catch {}
  }
  return { ok: false, reason: 'NO_SID' };
}
