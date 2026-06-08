/**
 * Contexto de usuario Salesforce para telemetría (Name (displayName)).
 */

const CACHE_KEY = 'sfoc_telemetry_user_cache';
const CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * @param {string} username
 * @param {string} name
 * @param {string} orgDisplayName
 * @returns {string}
 */
export function formatSfUserLabel(_username, name, orgDisplayName) {
  const n = String(name || '').trim();
  const org = String(orgDisplayName || '').trim();
  if (!n) return '';
  const label = org ? `${n} (${org})` : n;
  return label.slice(0, 200);
}

/**
 * Nombre de org para el label: displayName de Salesforce (Organization.Name).
 * @param {Record<string, unknown> | null | undefined} org
 */
export function orgDisplayNameForUserLabel(org) {
  if (!org || typeof org !== 'object') return '';
  return String(org.displayName || '').trim().slice(0, 120);
}

/**
 * Org de referencia para telemetría: derecha → izquierda → primera guardada.
 * @param {Record<string, unknown>} entry
 * @param {Record<string, Record<string, unknown>>} savedOrgsMap
 * @param {string} [fallbackOrgId]
 */
export function resolveTelemetryOrgId(entry, savedOrgsMap, fallbackOrgId = '') {
  const right = String(entry?.rightOrgId || '').trim();
  if (right && savedOrgsMap[right]) return right;

  const left = String(entry?.leftOrgId || '').trim();
  if (left && savedOrgsMap[left]) return left;

  const fb = String(fallbackOrgId || '').trim();
  if (fb && savedOrgsMap[fb]) return fb;

  const ids = Object.keys(savedOrgsMap || {});
  return ids.length ? ids[0] : '';
}

/**
 * @param {{ username?: string, name?: string, orgDisplayName?: string }} parts
 * @returns {{ sfUserLabel: string } | null}
 */
export function buildSfUserTelemetryFields(parts) {
  const sfUserName = String(parts.name || '').trim().slice(0, 120);
  const sfOrgDisplayName = String(parts.orgDisplayName || '').trim().slice(0, 120);
  const sfUserLabel = formatSfUserLabel('', sfUserName, sfOrgDisplayName);
  if (!sfUserLabel) return null;
  return { sfUserLabel };
}

/**
 * @param {Record<string, unknown>} entry
 * @param {{ sfUserLabel: string }} userCtx
 */
export function applyUserContextToEntry(entry, userCtx) {
  const base = entry && typeof entry === 'object' ? { ...entry } : {};
  if (!userCtx?.sfUserLabel) return base;
  base.sfUserLabel = userCtx.sfUserLabel;
  return base;
}

/**
 * @returns {Promise<Record<string, { fetchedAt: number, sfUserLabel: string }>>}
 */
export async function readTelemetryUserCache() {
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
 * @param {{ sfUserLabel: string }} userCtx
 */
export async function writeTelemetryUserCache(orgId, userCtx) {
  const id = String(orgId || '').trim();
  if (!id || !userCtx?.sfUserLabel) return;
  const map = await readTelemetryUserCache();
  map[id] = { fetchedAt: Date.now(), ...userCtx };
  try {
    await chrome.storage.session.set({ [CACHE_KEY]: map });
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} orgId
 * @returns {Promise<{ sfUserLabel: string } | null>}
 */
export async function readCachedTelemetryUserForOrg(orgId) {
  const id = String(orgId || '').trim();
  if (!id) return null;
  const map = await readTelemetryUserCache();
  const row = map[id];
  if (!row?.sfUserLabel) return null;
  if (Date.now() - (row.fetchedAt || 0) > CACHE_TTL_MS) return null;
  return { sfUserLabel: row.sfUserLabel };
}

/** Limpia caché (tests). */
export async function resetTelemetryUserCacheForTests() {
  try {
    await chrome.storage.session.remove(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
