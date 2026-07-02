const TRUST_API_BASE = 'https://api.status.salesforce.com/v1';

/**
 * Inferencia aproximada de instance key desde hostname (fallback si no hay InstanceName).
 * @param {string} host
 * @returns {string}
 */
export function inferInstanceKeyFromHostname(host) {
  const h = String(host || '').trim().toLowerCase();
  if (!h) return '';
  const sub = h.split('.')[0] || '';
  if (sub.includes('--')) return '';
  const m = sub.match(/^([a-z]{1,3}\d+)$/i);
  return m ? m[1].toUpperCase() : '';
}

/**
 * @param {string} instanceKey
 * @returns {Promise<Record<string, unknown>>}
 */
export async function fetchTrustInstanceStatus(instanceKey) {
  const key = String(instanceKey || '').trim().toUpperCase();
  if (!key) throw new Error('No instance key');
  const url = `${TRUST_API_BASE}/instances/${encodeURIComponent(key)}/status`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const err = new Error(`Trust API: HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return await res.json();
}

/**
 * @param {Record<string, unknown> | null | undefined} trustData
 * @returns {Record<string, unknown> | null}
 */
export function parseNextMaintenance(trustData) {
  const maintenances = /** @type {Array<Record<string, unknown>>} */ (trustData?.Maintenances || []);
  const now = Date.now();
  const future = maintenances
    .filter((m) => m.plannedStartTime && new Date(String(m.plannedStartTime)).getTime() > now)
    .sort(
      (a, b) =>
        new Date(String(a.plannedStartTime)).getTime() - new Date(String(b.plannedStartTime)).getTime()
    );
  return future[0] || null;
}

/**
 * @param {Record<string, unknown> | null | undefined} trustData
 * @returns {number}
 */
export function countActiveIncidents(trustData) {
  const incidents = /** @type {unknown[]} */ (trustData?.Incidents || []);
  return Array.isArray(incidents) ? incidents.length : 0;
}

/**
 * @param {string} [instanceKey]
 * @returns {string}
 */
export function buildTrustPageUrl(instanceKey) {
  const key = String(instanceKey || '').trim().toUpperCase();
  if (!key) return 'https://status.salesforce.com/';
  return `https://status.salesforce.com/instances/${encodeURIComponent(key)}`;
}

/**
 * @param {string} instanceUrl
 * @returns {string}
 */
export function buildCompanyInfoUrl(instanceUrl) {
  const base = String(instanceUrl || '').replace(/\/$/, '');
  return `${base}/lightning/setup/CompanyProfileInfo/home`;
}

/**
 * @param {string} [instanceKey]
 * @param {Record<string, unknown> | null | undefined} [trustData]
 * @returns {boolean}
 */
export function hasTrustAlert(instanceKey, trustData) {
  if (!instanceKey && !trustData) return false;
  const status = String(trustData?.status || '').trim().toUpperCase();
  if (status && status !== 'OK') return true;
  if (countActiveIncidents(trustData) > 0) return true;
  const maintenances = /** @type {Array<Record<string, unknown>>} */ (trustData?.Maintenances || []);
  const now = Date.now();
  for (const m of maintenances) {
    const start = m.plannedStartTime ? new Date(String(m.plannedStartTime)).getTime() : NaN;
    const end = m.plannedEndTime ? new Date(String(m.plannedEndTime)).getTime() : NaN;
    if (Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end) return true;
  }
  return false;
}
