const TRUST_API_BASE = 'https://api.status.salesforce.com/v1';

const CLOSED_INCIDENT_STATUSES = new Set(['RESOLVED', 'CLOSED', 'CANCELLED', 'CANCELED']);
const ACTIVE_INCIDENT_STATUSES = new Set(['ACTIVE', 'OPEN', 'IN_PROGRESS', 'INVESTIGATING', 'IDENTIFIED', 'MONITORING']);
const EXCLUDED_MAINTENANCE_STATUSES = new Set(['COMPLETED', 'COMPLETE', 'CANCELLED', 'CANCELED', 'POSTPONED', 'RESOLVED']);

function text(value) {
  return value == null ? '' : String(value).trim();
}

function normalizedStatus(value) {
  return text(value).replace(/[\s-]+/g, '_').toUpperCase();
}

function dateValue(value) {
  const time = new Date(String(value || '')).getTime();
  return Number.isFinite(time) ? time : NaN;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function asRecord(value) {
  return value && typeof value === 'object' ? value : {};
}

/** @param {string} locale */
export function normalizeTrustLocale(locale) {
  return String(locale || '').toLowerCase().startsWith('en') ? 'en' : 'es';
}

/**
 * Inferencia aproximada de instance key desde hostname (fallback si no hay InstanceName).
 * @param {string} host
 * @returns {string}
 */
export function inferInstanceKeyFromHostname(host) {
  const h = text(host).toLowerCase();
  if (!h) return '';
  const sub = h.split('.')[0] || '';
  if (sub.includes('--')) return '';
  const m = sub.match(/^([a-z]{1,3}\d+)$/i);
  return m ? m[1].toUpperCase() : '';
}

/** @param {string} path @param {Record<string, string | number | undefined>} [params] */
export function buildTrustApiUrl(path, params = {}) {
  const safePath = String(path || '').replace(/^\/+/, '');
  if (!safePath) throw new Error('Trust API path is required');
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== '') query.set(key, String(value));
  });
  const suffix = query.toString();
  return `${TRUST_API_BASE}/${safePath}${suffix ? `?${suffix}` : ''}`;
}

/** @param {string} path @param {Record<string, string | number | undefined>} [params] */
export async function fetchTrustJson(path, params = {}) {
  const res = await fetch(buildTrustApiUrl(path, params), { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const err = new Error(`Trust API: HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return await res.json();
}

function requiredInstanceKey(instanceKey) {
  const key = text(instanceKey).toUpperCase();
  if (!key) throw new Error('No instance key');
  return key;
}

/** @param {string} instanceKey @param {string} [locale] */
export function fetchTrustInstanceStatus(instanceKey, locale = 'es') {
  return fetchTrustJson(`instances/${encodeURIComponent(requiredInstanceKey(instanceKey))}/status`, {
    locale: normalizeTrustLocale(locale)
  });
}

/** @param {string} instanceKey */
export function fetchTrustInstanceMetadata(instanceKey) {
  return fetchTrustJson(`instances/${encodeURIComponent(requiredInstanceKey(instanceKey))}`);
}

/** @param {string} [locale] */
export function fetchTrustServices(locale = 'es') {
  return fetchTrustJson('services', { locale: normalizeTrustLocale(locale) });
}

/** @param {string} instanceKey @param {{ startTime?: string, limit?: number, offset?: number, locale?: string }} [options] */
export function fetchTrustIncidents(instanceKey, options = {}) {
  return fetchTrustJson('incidents', {
    instance: requiredInstanceKey(instanceKey), startTime: options.startTime, limit: options.limit || 50,
    offset: options.offset || 0, sort: 'createdAt', order: 'DESC', locale: normalizeTrustLocale(options.locale)
  });
}

/** @param {string} incidentId @param {string} [locale] */
export function fetchTrustIncidentDetail(incidentId, locale = 'es') {
  const id = text(incidentId);
  if (!id) throw new Error('No incident id');
  return fetchTrustJson(`incidents/${encodeURIComponent(id)}`, { locale: normalizeTrustLocale(locale) });
}

/** @param {string} instanceKey @param {{ startTime?: string, limit?: number, offset?: number, locale?: string }} [options] */
export function fetchTrustMaintenances(instanceKey, options = {}) {
  return fetchTrustJson('maintenances', {
    instance: requiredInstanceKey(instanceKey), startTime: options.startTime, limit: options.limit || 50,
    offset: options.offset || 0, sort: 'plannedStartTime', order: 'ASC', locale: normalizeTrustLocale(options.locale)
  });
}

/** @param {string} instanceKey @param {{ startTime: string, endTime: string }} options */
export function fetchTrustMetricValues(instanceKey, options) {
  if (!options?.startTime || !options?.endTime) throw new Error('MetricValues requires a time range');
  return fetchTrustJson('metricValues', {
    instanceKey: requiredInstanceKey(instanceKey), startTime: options.startTime, endTime: options.endTime
  });
}

/** @param {string} maintenanceId @param {string} [locale] */
export function fetchTrustMaintenanceDetail(maintenanceId, locale = 'es') {
  const id = text(maintenanceId);
  if (!id) throw new Error('No maintenance id');
  return fetchTrustJson(`maintenances/${encodeURIComponent(id)}`, { locale: normalizeTrustLocale(locale) });
}

/** @param {unknown} incident */
export function normalizeIncident(incident) {
  const raw = asRecord(incident);
  const impacts = array(raw.IncidentImpacts || raw.incidentImpacts || raw.impacts).map(asRecord);
  const instanceKeys = [...new Set([
    ...array(raw.instanceKeys || raw.InstanceKeys),
    ...impacts.flatMap((impact) => array(impact.instanceKeys || impact.InstanceKeys))
  ].map((key) => text(key).toUpperCase()).filter(Boolean))];
  const serviceKeys = [...new Set([
    ...array(raw.serviceKeys || raw.ServiceKeys),
    ...impacts.flatMap((impact) => array(impact.serviceKeys || impact.ServiceKeys))
  ].map(text).filter(Boolean))];
  const status = normalizedStatus(raw.status || raw.Status);
  const impactStarts = impacts.map((impact) => impact.startTime || impact.StartTime).filter(Boolean);
  const impactEnds = impacts.map((impact) => impact.endTime || impact.EndTime).filter(Boolean);
  const severity = normalizedStatus(raw.severity || raw.Severity || impacts.find((impact) => impact.severity || impact.Severity)?.severity || impacts.find((impact) => impact.severity || impact.Severity)?.Severity);
  return {
    ...raw,
    id: text(raw.id || raw.Id || raw.incidentId),
    status,
    type: text(raw.type || raw.eventType || raw.name),
    affectsAll: raw.affectsAll === true || raw.AffectsAll === true || impacts.some((impact) => impact.affectsAll === true || impact.AffectsAll === true),
    instanceKeys,
    serviceKeys,
    impacts,
    severity,
    core: /_CORE$/.test(normalizedStatus(raw.status || raw.Status || raw.type)) || raw.isCore === true,
    startTime: raw.startTime || raw.createdAt || impactStarts.sort()[0] || null,
    endTime: raw.endTime || raw.resolvedAt || (impactEnds.length === impacts.length ? impactEnds.sort().at(-1) : null),
    updatedAt: raw.updatedAt || raw.lastUpdatedAt || raw.createdAt || null
  };
}

/** @param {unknown} incident @param {string} [instanceKey] */
export function isIncidentActive(incident, instanceKey = '') {
  const normalized = normalizeIncident(incident);
  const requested = text(instanceKey).toUpperCase();
  const affectsInstance = !requested || normalized.affectsAll || normalized.instanceKeys.includes(requested);
  if (!affectsInstance) return false;
  if (normalized.status) return ACTIVE_INCIDENT_STATUSES.has(normalized.status) && !CLOSED_INCIDENT_STATUSES.has(normalized.status);
  return normalized.impacts.some((impact) => !!(impact.startTime || impact.StartTime) && !(impact.endTime || impact.EndTime));
}

/** @param {unknown[]} incidents @param {string} [instanceKey] */
export function selectActiveIncidents(incidents, instanceKey = '') {
  const seen = new Set();
  return array(incidents).map(normalizeIncident).filter((incident) => {
    const key = incident.id || JSON.stringify(incident);
    if (seen.has(key) || !isIncidentActive(incident, instanceKey)) return false;
    seen.add(key);
    return true;
  });
}

/** @param {unknown[]} incidents @param {string} [instanceKey] */
export function selectIncidentHistory(incidents, instanceKey = '') {
  const seen = new Set();
  return array(incidents).map(normalizeIncident).filter((incident) => {
    const key = incident.id || JSON.stringify(incident);
    const requested = text(instanceKey).toUpperCase();
    const affects = !requested || incident.affectsAll || incident.instanceKeys.includes(requested);
    if (seen.has(key) || !affects || isIncidentActive(incident, instanceKey)) return false;
    seen.add(key);
    return true;
  });
}

/** @param {unknown} maintenance */
export function normalizeMaintenance(maintenance) {
  const raw = asRecord(maintenance);
  return {
    ...raw,
    id: text(raw.id || raw.Id || raw.maintenanceId),
    status: normalizedStatus(raw.status || raw.Status),
    name: text(raw.name || raw.title || raw.type),
    plannedStartTime: raw.plannedStartTime || raw.startTime || null,
    plannedEndTime: raw.plannedEndTime || raw.endTime || null,
    serviceKeys: [...new Set(array(raw.serviceKeys || raw.ServiceKeys).map(text).filter(Boolean))],
    availability: raw.availability || raw.expectedAvailability || raw.availabilityImpact || ''
  };
}

/** @param {unknown} maintenance @param {Date | number} [now] */
export function isMaintenanceInProgress(maintenance, now = Date.now()) {
  const item = normalizeMaintenance(maintenance);
  if (EXCLUDED_MAINTENANCE_STATUSES.has(item.status)) return false;
  const current = now instanceof Date ? now.getTime() : Number(now);
  const start = dateValue(item.plannedStartTime);
  const end = dateValue(item.plannedEndTime);
  return Number.isFinite(start) && current >= start && (!Number.isFinite(end) || current <= end);
}

/** @param {unknown[]} maintenances @param {Date | number} [now] */
export function selectUpcomingMaintenances(maintenances, now = Date.now()) {
  const current = now instanceof Date ? now.getTime() : Number(now);
  return array(maintenances).map(normalizeMaintenance).filter((item) => {
    const start = dateValue(item.plannedStartTime);
    return !EXCLUDED_MAINTENANCE_STATUSES.has(item.status) && Number.isFinite(start) && start > current;
  }).sort((a, b) => dateValue(a.plannedStartTime) - dateValue(b.plannedStartTime));
}

/** @param {unknown[]} maintenances @param {Date | number} [now] */
export function selectMaintenanceHistory(maintenances, now = Date.now()) {
  const current = now instanceof Date ? now.getTime() : Number(now);
  return array(maintenances).map(normalizeMaintenance).filter((item) => {
    const start = dateValue(item.plannedStartTime);
    return EXCLUDED_MAINTENANCE_STATUSES.has(item.status) || (Number.isFinite(start) && start <= current && !isMaintenanceInProgress(item, current));
  }).sort((a, b) => dateValue(b.plannedStartTime) - dateValue(a.plannedStartTime));
}

/** @param {Record<string, unknown> | null | undefined} trustData @param {Date | number} [now] */
export function parseNextMaintenance(trustData, now = Date.now()) {
  return selectUpcomingMaintenances(array(trustData?.Maintenances || trustData?.maintenances), now)[0] || null;
}

/** @param {Record<string, unknown> | null | undefined} trustData @param {string} [instanceKey] */
export function countActiveIncidents(trustData, instanceKey = '') {
  return selectActiveIncidents(array(trustData?.Incidents || trustData?.incidents), instanceKey).length;
}

/** @param {string} status */
export function deriveTrustHealth(status) {
  const value = normalizedStatus(status);
  const map = {
    OK: ['operational', 'operational'],
    MAJOR_INCIDENT_CORE: ['major', 'majorIncident'],
    MINOR_INCIDENT_CORE: ['minor', 'minorIncident'],
    MAINTENANCE_CORE: ['maintenance', 'maintenance'],
    MAJOR_INCIDENT_NONCORE: ['major', 'majorIncident'],
    MINOR_INCIDENT_NONCORE: ['minor', 'minorIncident'],
    MAINTENANCE_NONCORE: ['maintenance', 'maintenance']
  };
  const [level, labelKey] = map[value] || ['unknown', 'noData'];
  return { status: value, level, labelKey, core: value.endsWith('_CORE') && !value.endsWith('_NONCORE') };
}

/** @param {string | null | undefined} start @param {string | null | undefined} end @param {Date | number} [now] */
export function calculateIncidentDuration(start, end, now = Date.now()) {
  const started = dateValue(start);
  const finished = end ? dateValue(end) : now instanceof Date ? now.getTime() : Number(now);
  return Number.isFinite(started) && Number.isFinite(finished) && finished >= started ? finished - started : null;
}

/** @param {unknown} services */
export function buildServiceLabelMap(services) {
  const list = array(asRecord(services).services || asRecord(services).Services || services);
  return Object.fromEntries(list.map(asRecord).map((service) => [text(service.key || service.serviceKey || service.id), text(service.name || service.label || service.key)]).filter(([key]) => key));
}

/** @param {string} [instanceKey] */
export function buildTrustPageUrl(instanceKey) {
  const key = text(instanceKey).toUpperCase();
  return key ? `https://status.salesforce.com/instances/${encodeURIComponent(key)}` : 'https://status.salesforce.com/';
}

/** @param {string} incidentId */
export function buildTrustIncidentUrl(incidentId) { return `https://status.salesforce.com/incidents/${encodeURIComponent(text(incidentId))}`; }
/** @param {string} maintenanceId */
export function buildTrustMaintenanceUrl(maintenanceId) { return `https://status.salesforce.com/maintenances/${encodeURIComponent(text(maintenanceId))}`; }

/** @param {string} instanceUrl */
export function buildCompanyInfoUrl(instanceUrl) { return `${String(instanceUrl || '').replace(/\/$/, '')}/lightning/setup/CompanyProfileInfo/home`; }

/** @param {string} [instanceKey] @param {Record<string, unknown> | null | undefined} [trustData] */
export function hasTrustAlert(instanceKey, trustData) {
  if (!instanceKey && !trustData) return false;
  const health = deriveTrustHealth(String(trustData?.status || ''));
  const rawStatus = normalizedStatus(trustData?.status);
  return (rawStatus && rawStatus !== 'OK')
    || health.level !== 'operational' && health.level !== 'unknown'
    || countActiveIncidents(trustData, instanceKey) > 0
    || array(trustData?.Maintenances || trustData?.maintenances).some((item) => isMaintenanceInProgress(item));
}
