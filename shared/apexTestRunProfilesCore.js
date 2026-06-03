/** @typedef {{ id: string, name: string, runBody: object }} ApexTestRunProfile */

export const APEX_TEST_RUN_PROFILES_STORAGE_KEY = 'apexTestRunProfiles';
export const APEX_TEST_RUN_PROFILES_EXPORT_VERSION = 1;
export const APEX_TEST_RUN_PROFILES_MAX = 30;

/**
 * @param {unknown} body
 * @returns {boolean}
 */
export function isValidApexTestRunBody(body) {
  if (!body || typeof body !== 'object') return false;
  const tl = /** @type {{ testLevel?: unknown }} */ (body).testLevel;
  return typeof tl === 'string' && !!String(tl).trim();
}

/**
 * @param {unknown} raw
 * @returns {ApexTestRunProfile | null}
 */
export function normalizeApexTestRunProfile(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(/** @type {{ name?: unknown }} */ (raw).name || '').trim().slice(0, 80);
  if (!name) return null;
  const runBody = /** @type {{ runBody?: unknown }} */ (raw).runBody;
  if (!isValidApexTestRunBody(runBody)) return null;
  const id = String(/** @type {{ id?: unknown }} */ (raw).id || `p_${name}`)
    .trim()
    .slice(0, 64);
  return {
    id: id || `p_${name}`,
    name,
    runBody: JSON.parse(JSON.stringify(runBody))
  };
}

/**
 * @param {unknown[]} profiles
 * @returns {ApexTestRunProfile[]}
 */
export function normalizeApexTestRunProfileList(profiles) {
  if (!Array.isArray(profiles)) return [];
  const out = [];
  for (const p of profiles) {
    const n = normalizeApexTestRunProfile(p);
    if (n) out.push(n);
  }
  return out.slice(0, APEX_TEST_RUN_PROFILES_MAX);
}

/**
 * @param {ApexTestRunProfile[]} profiles
 */
export function buildApexTestRunProfilesExport(profiles) {
  return {
    version: APEX_TEST_RUN_PROFILES_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    profiles: normalizeApexTestRunProfileList(profiles)
  };
}

/**
 * @param {string} text
 * @returns {{ ok: true, profiles: ApexTestRunProfile[] } | { ok: false, error: string }}
 */
export function parseApexTestRunProfilesImport(text) {
  let data;
  try {
    data = JSON.parse(String(text || '').trim());
  } catch {
    return { ok: false, error: 'INVALID_JSON' };
  }
  let list = [];
  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === 'object' && Array.isArray(data.profiles)) {
    list = data.profiles;
  } else {
    return { ok: false, error: 'INVALID_SHAPE' };
  }
  const profiles = normalizeApexTestRunProfileList(list);
  if (!profiles.length) return { ok: false, error: 'EMPTY' };
  return { ok: true, profiles };
}

/**
 * @param {ApexTestRunProfile[]} existing
 * @param {ApexTestRunProfile[]} incoming
 * @param {{ replace?: boolean }} [opts]
 */
export function mergeApexTestRunProfiles(existing, incoming, opts = {}) {
  const inc = normalizeApexTestRunProfileList(incoming);
  if (!inc.length) return normalizeApexTestRunProfileList(existing);
  if (opts.replace) return inc;
  const byName = new Map();
  for (const p of normalizeApexTestRunProfileList(existing)) {
    byName.set(p.name, p);
  }
  for (const p of inc) {
    byName.set(p.name, p);
  }
  return [...byName.values()].slice(0, APEX_TEST_RUN_PROFILES_MAX);
}
