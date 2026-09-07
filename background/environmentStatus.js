import {
  probeApiVersion,
  fetchOrganizationStatus,
  fetchSessionUserInfo
} from '../shared/salesforceApi.js';
import { buildSessionDetailPayload } from '../shared/sessionInfoApi.js';
import { clearDescribeCachesForOrg } from './caches.js';
import {
  buildServiceLabelMap,
  fetchTrustIncidentDetail,
  fetchTrustInstanceMetadata,
  fetchTrustInstanceStatus,
  fetchTrustMaintenances,
  fetchTrustMetricValues,
  fetchTrustMaintenanceDetail,
  fetchTrustIncidents,
  fetchTrustServices,
  inferInstanceKeyFromHostname,
  normalizeTrustLocale,
  isMaintenanceInProgress,
  parseNextMaintenance,
  selectActiveIncidents,
  selectIncidentHistory,
  selectMaintenanceHistory,
  selectUpcomingMaintenances
} from '../shared/trustStatusApi.js';
import {
  getOrderedSavedOrgs,
  loadSavedOrgs,
  resolveSidForOrg,
  checkOrgAuthStatus
} from './orgHelpers.js';

const CONCURRENCY = 4;
const TRUST_CACHE_TTL_MS = 5 * 60 * 1000;
const INSTANCE_KEY_STORAGE = 'environmentStatusInstanceKeys';
const trustCache = new Map();
const trustInFlight = new Map();
const trustCacheVersions = new Map();
let activeTrustRequests = 0;
const trustRequestQueue = [];

/** Mantiene el límite de cuatro peticiones Trust incluso cuando varias orgs comparten refresco. */
function limitTrustRequest(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeTrustRequests += 1;
      Promise.resolve().then(fn).then(resolve, reject).finally(() => {
        activeTrustRequests -= 1;
        trustRequestQueue.shift()?.();
      });
    };
    if (activeTrustRequests < CONCURRENCY) run(); else trustRequestQueue.push(run);
  });
}

/** @template T, R @param {T[]} items @param {number} limit @param {(item: T, index: number) => Promise<R>} fn */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) { const index = next++; results[index] = await fn(items[index], index); }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, worker));
  return results;
}

function hostFor(saved) {
  if (saved?.cookieDomain) return saved.cookieDomain;
  try { return new URL(String(saved?.instanceUrl || '')).hostname; } catch { return ''; }
}

function resolveInstanceKey(sf, saved, knownKeys = {}) {
  const fromSf = String(sf?.instanceName || '').trim();
  if (fromSf) return fromSf.toUpperCase();
  const cached = String(knownKeys[String(saved?.id || '')] || '').trim();
  return cached ? cached.toUpperCase() : inferInstanceKeyFromHostname(hostFor(saved));
}

async function readKnownInstanceKeys() {
  try { return (await chrome.storage.local.get(INSTANCE_KEY_STORAGE))[INSTANCE_KEY_STORAGE] || {}; } catch { return {}; }
}

async function rememberInstanceKeys(keys) {
  if (!Object.keys(keys).length) return;
  try {
    const previous = await readKnownInstanceKeys();
    await chrome.storage.local.set({ [INSTANCE_KEY_STORAGE]: { ...previous, ...keys } });
  } catch { /* local cache is an enhancement, not a hard dependency */ }
}

function resultItems(payload) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.records) ? payload.records : [];
}

function cacheKey(kind, instanceKey, locale, range = '') { return `${kind}:${instanceKey}:${locale}:${range}`; }

async function cachedTrust(key, loader, force = false) {
  const cached = trustCache.get(key);
  if (!force && cached && Date.now() - cached.at < TRUST_CACHE_TTL_MS) return cached.value;
  if (!force && trustInFlight.has(key)) return trustInFlight.get(key);
  const version = force ? (trustCacheVersions.get(key) || 0) + 1 : (trustCacheVersions.get(key) || 0);
  if (force) trustCacheVersions.set(key, version);
  const pending = Promise.resolve().then(loader).then((value) => {
    // A response started before a manual refresh must never replace its newer cache entry.
    if ((trustCacheVersions.get(key) || 0) === version) trustCache.set(key, { at: Date.now(), value });
    return value;
  }).finally(() => trustInFlight.delete(key));
  trustInFlight.set(key, pending);
  return pending;
}

async function getServiceLabels(locale, force = false) {
  const key = cacheKey('services', 'all', locale);
  return cachedTrust(key, async () => buildServiceLabelMap(await limitTrustRequest(() => fetchTrustServices(locale))), force);
}

async function getInstanceOverview(instanceKey, locale, force = false) {
  const key = cacheKey('overview', instanceKey, locale);
  return cachedTrust(key, async () => {
    const [statusResult, metadataResult, serviceResult] = await Promise.allSettled([
      limitTrustRequest(() => fetchTrustInstanceStatus(instanceKey, locale)), limitTrustRequest(() => fetchTrustInstanceMetadata(instanceKey)), getServiceLabels(locale, force)
    ]);
    const errors = [];
    if (statusResult.status === 'rejected') errors.push(String(statusResult.reason?.message || statusResult.reason));
    if (metadataResult.status === 'rejected') errors.push(String(metadataResult.reason?.message || metadataResult.reason));
    if (serviceResult.status === 'rejected') errors.push(String(serviceResult.reason?.message || serviceResult.reason));
    return {
      trust: statusResult.status === 'fulfilled' ? statusResult.value : null,
      instance: metadataResult.status === 'fulfilled' ? metadataResult.value : null,
      serviceLabels: serviceResult.status === 'fulfilled' ? serviceResult.value : {},
      errors
    };
  }, force);
}

async function collectSalesforceState(saved, auth, knownKeys) {
  const errors = [];
  const row = {
    orgId: String(saved.id || ''), saved: {
      id: saved.id, displayName: saved.displayName, label: saved.label, instanceUrl: saved.instanceUrl,
      cookieDomain: saved.cookieDomain, apiVersion: saved.apiVersion, isSandbox: !!saved.isSandbox
    }, auth, sf: null, liveApiVersion: null, sessionUser: null, trust: null, instance: null,
    serviceLabels: {}, instanceKey: resolveInstanceKey(null, saved, knownKeys), nextMaintenance: null,
    activeIncidents: [], incidentHistory: [], activeIncidentCount: 0, historicalIncidentCount: 0, errors
  };
  if (auth !== 'active') return row;
  const sid = await resolveSidForOrg(saved);
  if (!sid) { row.auth = 'expired'; return row; }
  try {
    const apiVersion = saved.apiVersion || '63.0';
    const [sf, liveApiVersion, sessionUser] = await Promise.all([
      fetchOrganizationStatus(saved.instanceUrl, sid, apiVersion),
      probeApiVersion(saved.instanceUrl, sid).catch(() => null),
      fetchSessionUserInfo(saved.instanceUrl, sid).catch(() => null)
    ]);
    row.sf = sf; row.liveApiVersion = liveApiVersion; row.sessionUser = sessionUser;
    row.instanceKey = resolveInstanceKey(sf, saved, knownKeys);
  } catch (error) { errors.push(String(error?.message || error)); }
  return row;
}

/** @returns {Promise<{ ok: true, rows: Record<string, unknown>[], fetchedAt: string }>} */
export async function fetchAllEnvironmentStatusRows(options = {}) {
  if (options.force) trustCache.clear();
  const locale = normalizeTrustLocale(options.locale || 'es');
  const [orgs, knownKeys] = await Promise.all([getOrderedSavedOrgs(), readKnownInstanceKeys()]);
  const authEntries = await Promise.all(orgs.map(async (org) => [org.id, await checkOrgAuthStatus(org, true)]));
  const rows = await mapWithConcurrency(orgs, CONCURRENCY, (org) => collectSalesforceState(org, Object.fromEntries(authEntries)[org.id] || 'expired', knownKeys));
  await rememberInstanceKeys(Object.fromEntries(rows.filter((row) => row.instanceKey).map((row) => [row.orgId, row.instanceKey])));

  const keys = [...new Set(rows.map((row) => row.instanceKey).filter(Boolean))];
  const overviews = new Map();
  const overviewResults = await mapWithConcurrency(keys, CONCURRENCY, async (key) => [key, await getInstanceOverview(key, locale, !!options.force)]);
  overviewResults.forEach(([key, overview]) => overviews.set(key, overview));
  rows.forEach((row) => {
    const overview = overviews.get(row.instanceKey);
    if (!overview) return;
    row.trust = overview.trust; row.instance = overview.instance; row.serviceLabels = overview.serviceLabels;
    row.errors.push(...overview.errors.map((error) => `Trust: ${error}`));
    const incidents = overview.trust?.Incidents || overview.trust?.incidents || [];
    row.activeIncidents = selectActiveIncidents(incidents, row.instanceKey);
    row.incidentHistory = selectIncidentHistory(incidents, row.instanceKey);
    row.activeIncidentCount = row.activeIncidents.length;
    row.historicalIncidentCount = row.incidentHistory.length;
    row.incidentCount = row.activeIncidentCount; // compatibilidad para consumidores anteriores.
    row.nextMaintenance = parseNextMaintenance(overview.trust);
  });
  return { ok: true, rows, fetchedAt: new Date().toISOString() };
}

/** Datos Trust diferidos: el historial no se transfiere hasta abrir una org. */
export async function fetchTrustDetailForOrg(orgId, options = {}) {
  const saved = (await loadSavedOrgs())[orgId];
  if (!saved) return { ok: false, error: 'Org not saved' };
  const knownKeys = await readKnownInstanceKeys();
  const instanceKey = resolveInstanceKey(null, saved, knownKeys);
  if (!instanceKey) return { ok: false, error: 'No instance key' };
  const locale = normalizeTrustLocale(options.locale || 'es');
  const days = Number(options.days) === 90 ? 90 : 30;
  const startTime = new Date(Date.now() - days * 86400000).toISOString();
  const overview = await getInstanceOverview(instanceKey, locale, false);
  const rangeKey = `${days}:${Number(options.incidentOffset || 0)}:${Number(options.maintenanceOffset || 0)}`;
  const history = await cachedTrust(cacheKey('detail', instanceKey, locale, rangeKey), async () => {
    const [incidentsResult, maintenancesResult, metricsResult] = await Promise.allSettled([
      limitTrustRequest(() => fetchTrustIncidents(instanceKey, { startTime, limit: 50, offset: Number(options.incidentOffset || 0), locale })),
      limitTrustRequest(() => fetchTrustMaintenances(instanceKey, { startTime, limit: 50, offset: Number(options.maintenanceOffset || 0), locale })),
      limitTrustRequest(() => fetchTrustMetricValues(instanceKey, { startTime, endTime: new Date().toISOString() }))
    ]);
    return {
      incidents: incidentsResult.status === 'fulfilled' ? resultItems(incidentsResult.value) : [],
      maintenances: maintenancesResult.status === 'fulfilled' ? resultItems(maintenancesResult.value) : [],
      metricValues: metricsResult.status === 'fulfilled' ? resultItems(metricsResult.value) : [],
      errors: [
        ...(incidentsResult.status === 'rejected' ? [String(incidentsResult.reason?.message || incidentsResult.reason)] : []),
        ...(maintenancesResult.status === 'rejected' ? [String(maintenancesResult.reason?.message || maintenancesResult.reason)] : [])
      ]
    };
  });
  const current = overview.trust?.Incidents || overview.trust?.incidents || [];
  const allIncidents = [...current, ...history.incidents];
  const allMaintenances = [...(overview.trust?.Maintenances || overview.trust?.maintenances || []), ...history.maintenances];
  return {
    ok: true, instanceKey, trust: overview.trust, instance: overview.instance, serviceLabels: overview.serviceLabels,
    activeIncidents: selectActiveIncidents(allIncidents, instanceKey), incidentHistory: selectIncidentHistory(allIncidents, instanceKey),
    upcomingMaintenances: selectUpcomingMaintenances(allMaintenances), inProgressMaintenances: allMaintenances.filter((item) => isMaintenanceInProgress(item)),
    maintenanceHistory: selectMaintenanceHistory(allMaintenances), generalMessages: overview.trust?.GeneralMessages || overview.trust?.generalMessages || [],
    metricValues: history.metricValues,
    days, errors: [...overview.errors, ...history.errors]
  };
}

export async function fetchTrustIncidentDetailForOrg(orgId, incidentId, locale = 'es') {
  const saved = (await loadSavedOrgs())[orgId];
  if (!saved) return { ok: false, error: 'Org not saved' };
  return { ok: true, incident: await limitTrustRequest(() => fetchTrustIncidentDetail(incidentId, normalizeTrustLocale(locale))) };
}

export async function fetchTrustMaintenanceDetailForOrg(orgId, maintenanceId, locale = 'es') {
  const saved = (await loadSavedOrgs())[orgId];
  if (!saved) return { ok: false, error: 'Org not saved' };
  return { ok: true, maintenance: await limitTrustRequest(() => fetchTrustMaintenanceDetail(maintenanceId, normalizeTrustLocale(locale))) };
}

/** @param {string} orgId */
export async function fetchSessionDetailForOrg(orgId) {
  const saved = (await loadSavedOrgs())[orgId];
  if (!saved) return { ok: false, error: 'Org not saved' };
  const sid = await resolveSidForOrg(saved);
  if (!sid) return { ok: false, reason: 'NO_SID' };
  try {
    const apiVersion = saved.apiVersion || '63.0';
    const [sf, liveApiVersion, sessionUser] = await Promise.all([
      fetchOrganizationStatus(saved.instanceUrl, sid, apiVersion), probeApiVersion(saved.instanceUrl, sid).catch(() => null),
      fetchSessionUserInfo(saved.instanceUrl, sid).catch(() => null)
    ]);
    return { ok: true, detail: buildSessionDetailPayload(sessionUser, sf, saved, liveApiVersion) };
  } catch (error) { return { ok: false, error: String(error?.message || error) }; }
}

/** @param {string} orgId */
export function invalidateDescribeCacheForOrg(orgId) { clearDescribeCachesForOrg(orgId); return { ok: true }; }

export function clearEnvironmentStatusTrustCache() { trustCache.clear(); return { ok: true }; }
