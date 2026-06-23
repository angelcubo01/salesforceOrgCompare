/**
 * Segmentación por versión de la extensión (semver simple: 2.13, 2.14.1).
 * Campos opcionales en payloads PostHog; sin restricciones → aplica a todas las versiones.
 */

/**
 * @typedef {object} VersionTarget
 * @property {string} [minVersion]
 * @property {string} [maxVersion]
 * @property {string[]} [versions]
 * @property {string[]} [excludeVersions]
 */

const VERSION_TARGET_KEYS = Object.freeze([
  'minVersion',
  'minExtensionVersion',
  'maxVersion',
  'maxExtensionVersion',
  'versions',
  'excludeVersions'
]);

/**
 * @param {string} raw
 * @returns {number[]}
 */
function parseVersionParts(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return [];
  return trimmed
    .split('.')
    .map((part) => {
      const match = /^(\d+)/.exec(part);
      return match ? Number(match[1]) : 0;
    });
}

/**
 * Compara versiones semver simples (solo segmentos numéricos).
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1}
 */
export function compareExtensionVersions(a, b) {
  const partsA = parseVersionParts(a);
  const partsB = parseVersionParts(b);
  if (!partsA.length && !partsB.length) return 0;
  if (!partsA.length) return -1;
  if (!partsB.length) return 1;
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const va = partsA[i] ?? 0;
    const vb = partsB[i] ?? 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

/**
 * @returns {string}
 */
export function getExtensionVersion() {
  try {
    if (typeof chrome !== 'undefined' && typeof chrome.runtime?.getManifest === 'function') {
      return String(chrome.runtime.getManifest().version || '').trim();
    }
  } catch {
    /* ignore */
  }
  return '';
}

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
export function hasVersionTargetFields(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const o = /** @type {Record<string, unknown>} */ (raw);
  return VERSION_TARGET_KEYS.some((key) => o[key] !== undefined && o[key] !== null);
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function parseVersionList(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const v = item.trim();
    if (v) out.push(v);
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {VersionTarget | null}
 */
export function parseVersionTarget(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const minRaw =
    typeof o.minVersion === 'string'
      ? o.minVersion
      : typeof o.minExtensionVersion === 'string'
        ? o.minExtensionVersion
        : '';
  const maxRaw =
    typeof o.maxVersion === 'string'
      ? o.maxVersion
      : typeof o.maxExtensionVersion === 'string'
        ? o.maxExtensionVersion
        : '';
  const minVersion = minRaw.trim();
  const maxVersion = maxRaw.trim();
  const versions = parseVersionList(o.versions);
  const excludeVersions = parseVersionList(o.excludeVersions);
  if (!minVersion && !maxVersion && !versions.length && !excludeVersions.length) return null;
  return {
    ...(minVersion ? { minVersion } : {}),
    ...(maxVersion ? { maxVersion } : {}),
    ...(versions.length ? { versions } : {}),
    ...(excludeVersions.length ? { excludeVersions } : {})
  };
}

/**
 * @param {VersionTarget | null | undefined} target
 * @param {string} extensionVersion
 * @returns {boolean}
 */
export function matchesVersionTarget(target, extensionVersion) {
  if (!target) return true;
  const current = String(extensionVersion || '').trim();
  if (!current) return true;

  if (target.excludeVersions?.length) {
    for (const excluded of target.excludeVersions) {
      if (compareExtensionVersions(current, excluded) === 0) return false;
    }
  }

  if (target.versions?.length) {
    let found = false;
    for (const allowed of target.versions) {
      if (compareExtensionVersions(current, allowed) === 0) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }

  if (target.minVersion && compareExtensionVersions(current, target.minVersion) < 0) {
    return false;
  }

  if (target.maxVersion && compareExtensionVersions(current, target.maxVersion) > 0) {
    return false;
  }

  return true;
}

/**
 * @param {unknown} raw
 * @param {string} extensionVersion
 * @returns {boolean}
 */
export function rawMatchesVersionTarget(raw, extensionVersion) {
  return matchesVersionTarget(parseVersionTarget(raw), extensionVersion);
}
