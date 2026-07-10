/**
 * Normaliza versiones de Metadata API / REST (p. ej. "67" → "67.0").
 * @param {string | number | null | undefined} value
 * @param {string} [fallback]
 * @returns {string}
 */
export function formatMetadataApiVersion(value, fallback = '60.0') {
  const raw = String(value ?? '').trim().replace(/^v/i, '');
  if (!raw) return fallback;
  if (/^\d+\.\d+$/.test(raw)) return raw;
  const major = Number.parseInt(raw, 10);
  if (Number.isFinite(major) && major > 0) return `${major}.0`;
  return fallback;
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareApiVersions(a, b) {
  return Number(formatMetadataApiVersion(a)) - Number(formatMetadataApiVersion(b));
}

/**
 * @param {Array<{ version?: string, label?: string } | string>} versions
 * @returns {string[]}
 */
export function sortApiVersionLabels(versions) {
  const labels = (versions || [])
    .map((v) => formatMetadataApiVersion(typeof v === 'string' ? v : (v?.version ?? v?.label)))
    .filter(Boolean);
  return [...new Set(labels)].sort((a, b) => compareApiVersions(b, a));
}

export const DEPLOY_API_VERSION_SPAN = 20;

/**
 * Ventana editable de versiones para deploy:
 * - máximo = última versión de la org (p. ej. 60.0)
 * - mínimo = máximo − 20 (p. ej. 40.0)
 * - solo editable si la org expone versiones hasta ese mínimo
 *
 * @param {string[]} allVersions
 * @param {number} [span]
 */
export function buildDeployApiVersionWindow(allVersions, span = DEPLOY_API_VERSION_SPAN) {
  const sorted = sortApiVersionLabels(allVersions);
  const maxVersion = sorted[0] || '60.0';
  const maxNum = Number(maxVersion);
  const minNum = Math.max(1, maxNum - span);
  const minVersion = `${minNum}.0`;
  const lowestOrgNum = sorted.length ? Number(sorted[sorted.length - 1]) : maxNum;
  const editable = lowestOrgNum <= minNum;

  if (!editable) {
    return {
      editable: false,
      maxVersion,
      minVersion,
      options: [maxVersion],
      defaultVersion: maxVersion
    };
  }

  const options = sorted.filter((v) => {
    const n = Number(v);
    return n >= minNum && n <= maxNum;
  });

  return {
    editable: true,
    maxVersion,
    minVersion,
    options: options.length ? options : [maxVersion],
    defaultVersion: maxVersion
  };
}

/**
 * @param {string} version
 * @param {string} minVersion
 * @param {string} maxVersion
 */
export function clampApiVersion(version, minVersion, maxVersion) {
  const v = formatMetadataApiVersion(version, maxVersion);
  const n = Number(v);
  const min = Number(formatMetadataApiVersion(minVersion, v));
  const max = Number(formatMetadataApiVersion(maxVersion, v));
  if (n < min) return formatMetadataApiVersion(minVersion, v);
  if (n > max) return formatMetadataApiVersion(maxVersion, v);
  return v;
}

/**
 * @param {string} version
 * @param {string} minVersion
 * @param {string} maxVersion
 */
export function isApiVersionInRange(version, minVersion, maxVersion) {
  const n = Number(formatMetadataApiVersion(version));
  return n >= Number(formatMetadataApiVersion(minVersion)) && n <= Number(formatMetadataApiVersion(maxVersion));
}
