import { discoverActiveTabContext, getSidForCookieDomain, resolveSidForSavedOrg, buildHostCandidatesForOrg } from '../shared/orgDiscovery.js';
import { probeApiVersion, getOrganizationInfo } from '../shared/salesforceApi.js';
import { ALLOWED_SF_SUFFIXES } from '../shared/sfDomains.js';
import { authStatusCache, versionCache } from './caches.js';

export { ALLOWED_SF_SUFFIXES };

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

/** SID para API/SOAP: mismos criterios que la pestaña Salesforce abierta. */
export async function resolveSidForOrg(org) {
  return resolveSidForSavedOrg(org, getSidForOrgId);
}

export async function getSidForOrgId(orgId, cookieStoreId = '') {
  if (!orgId) return '';
  try {
    const all = await chrome.cookies.getAll({
      name: 'sid',
      secure: true,
      ...(cookieStoreId ? { storeId: cookieStoreId } : {})
    });
    const filtered = all.filter((c) => ALLOWED_SF_SUFFIXES.some((sfx) => (c.domain || '').endsWith(sfx)));
    const match = filtered.find((c) => typeof c.value === 'string' && c.value.startsWith(orgId + '!'));
    if (match) return match.value;
  } catch {}
  return '';
}

/** Devuelve el almacén de cookies al que pertenece una pestaña, incluido incógnito. */
export async function getCookieStoreIdForTab(tabId) {
  if (tabId == null || typeof chrome.cookies?.getAllCookieStores !== 'function') return '';
  try {
    const stores = await chrome.cookies.getAllCookieStores();
    const store = stores.find((item) => Array.isArray(item?.tabIds) && item.tabIds.includes(tabId));
    return typeof store?.id === 'string' ? store.id : '';
  } catch {}
  return '';
}

async function tabUsesCurrentExtensionCookieContext(tabId) {
  if (tabId == null || typeof chrome.tabs?.get !== 'function') return false;
  if (typeof chrome.extension?.inIncognitoContext !== 'boolean') return false;
  try {
    const tab = await chrome.tabs.get(tabId);
    return !!tab && Boolean(tab.incognito) === chrome.extension.inIncognitoContext;
  } catch {
    return false;
  }
}

async function resolveSidInCurrentCookieContext(org) {
  const sid = await getSidForOrgId(org?.id);
  if (sid) return sid;
  for (const host of buildHostCandidatesForOrg(org)) {
    try {
      const cookie = await chrome.cookies.get({ url: 'https://' + host + '/', name: 'sid' });
      if (cookie?.value) return cookie.value;
    } catch {}
  }
  return '';
}

/**
 * Resuelve la sesión de una organización en el mismo perfil de la pestaña de
 * origen. Evita reutilizar la cookie de una ventana normal al operar desde
 * incógnito (y viceversa).
 */
export async function resolveSidForOrgInTab(
  org,
  tabId,
  { strictStore = false, allowCurrentContextFallback = false } = {}
) {
  const cookieStoreId = await getCookieStoreIdForTab(tabId);
  if (cookieStoreId) {
    const sid = await getSidForOrgId(org?.id, cookieStoreId);
    if (sid) return sid;
    if (strictStore) {
      // A saved-org key need not be Organization.Id. Resolve by domain in the
      // identified store, never fall back to a different browser profile.
      for (const host of buildHostCandidatesForOrg(org)) {
        try {
          const cookie = await chrome.cookies.get({ url: 'https://' + host + '/', name: 'sid', storeId: cookieStoreId });
          if (cookie?.value) return cookie.value;
        } catch {}
      }
      return '';
    }
  }
  if (strictStore) {
    // With incognito=split, each service worker only handles tabs from its own
    // profile. The default store is safe only when the tab matches that process.
    if (
      allowCurrentContextFallback &&
      !cookieStoreId &&
      await tabUsesCurrentExtensionCookieContext(tabId)
    ) {
      return resolveSidInCurrentCookieContext(org);
    }
    return '';
  }
  return resolveSidForOrg(org);
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

    const sid = await resolveSidForOrg(org);
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
