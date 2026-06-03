/**
 * Contexto de orgs Salesforce para telemetría (nombres de compañía e URLs de instancia).
 */

/**
 * @param {string | null | undefined} instanceUrl
 * @returns {string}
 */
export function normalizeInstanceUrlForTelemetry(instanceUrl) {
  const raw = String(instanceUrl || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return u.origin.slice(0, 256);
  } catch {
    return raw.replace(/\/$/, '').slice(0, 256);
  }
}

/**
 * @param {Record<string, unknown> | null | undefined} org
 * @returns {{
 *   companyName: string,
 *   instanceUrl: string,
 *   isSandbox: boolean,
 *   envLabel: string
 * } | null}
 */
export function orgFieldsForTelemetry(org) {
  if (!org || typeof org !== 'object') return null;
  const id = String(org.id || '').trim();
  if (!id) return null;

  const instanceUrl = normalizeInstanceUrlForTelemetry(
    typeof org.instanceUrl === 'string' ? org.instanceUrl : ''
  );
  if (!instanceUrl) return null;

  const companyName = String(org.displayName || org.label || '').trim().slice(0, 120);
  const envLabel = String(org.label || '').trim().slice(0, 64);

  return {
    companyName,
    instanceUrl,
    isSandbox: !!org.isSandbox,
    envLabel
  };
}

/**
 * @param {string | null | undefined} orgId
 * @param {Record<string, Record<string, unknown>>} savedOrgsMap
 */
function lookupOrg(orgId, savedOrgsMap) {
  if (!orgId) return null;
  const id = String(orgId).trim();
  if (!id) return null;
  return orgFieldsForTelemetry(savedOrgsMap[id]);
}

/**
 * @returns {Promise<Record<string, Record<string, unknown>>>}
 */
export async function loadSavedOrgsMapForTelemetry() {
  try {
    const r = await chrome.storage.sync.get('savedOrgs');
    const map = r.savedOrgs;
    return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  } catch {
    return {};
  }
}

/**
 * Añade nombres de compañía y URLs de instancia según leftOrgId / rightOrgId.
 * @param {Record<string, unknown>} entry
 * @param {Record<string, Record<string, unknown>>} [savedOrgsMap]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function enrichUsageLogWithOrgContext(entry, savedOrgsMap) {
  const base = entry && typeof entry === 'object' ? { ...entry } : {};
  const map = savedOrgsMap || (await loadSavedOrgsMapForTelemetry());

  const left = lookupOrg(base.leftOrgId, map);
  const right = lookupOrg(base.rightOrgId, map);

  if (left) {
    if (left.companyName) base.leftCompanyName = left.companyName;
    base.leftInstanceUrl = left.instanceUrl;
    base.leftIsSandbox = left.isSandbox;
    if (left.envLabel) base.leftEnvLabel = left.envLabel;
  }
  if (right) {
    if (right.companyName) base.rightCompanyName = right.companyName;
    base.rightInstanceUrl = right.instanceUrl;
    base.rightIsSandbox = right.isSandbox;
    if (right.envLabel) base.rightEnvLabel = right.envLabel;
  }

  return base;
}
