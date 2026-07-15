const ORG_CONFIG_EXPORT_KEYS = [
  'id',
  'displayName',
  'label',
  'instanceUrl',
  'cookieDomain',
  'apiVersion',
  'isSandbox'
];

/**
 * @param {Record<string, unknown> | null | undefined} raw
 */
export function sanitizeOrgForConfigExport(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  if (!id) return null;
  const o = { id };
  for (const k of ORG_CONFIG_EXPORT_KEYS) {
    if (k === 'id') continue;
    const v = raw[k];
    if (v === undefined || v === null) continue;
    if (k === 'isSandbox') o[k] = !!v;
    else o[k] = typeof v === 'string' ? v.slice(0, 2048) : String(v);
  }
  if (!o.instanceUrl || !o.cookieDomain) return null;
  return o;
}

/**
 * @param {Record<string, unknown> | null | undefined} raw
 * @param {string} idKey
 */
export function sanitizeOrgForConfigImport(raw, idKey) {
  return sanitizeOrgForConfigExport({ ...raw, id: raw?.id || idKey });
}

/**
 * @param {number} listLength
 * @param {{ pageBodiesOnly?: boolean, maxBodyFetches?: number, maxRows?: number }} [opts]
 */
export function resolveApexLogBodyFetchLimit(listLength, opts = {}) {
  if (opts.pageBodiesOnly === true) {
    return Math.max(0, listLength);
  }
  const explicit = Number(opts.maxBodyFetches);
  if (Number.isFinite(explicit) && explicit >= 0) {
    return Math.min(listLength, Math.floor(explicit));
  }
  const legacy = Number(opts.maxRows);
  if (Number.isFinite(legacy) && legacy >= 0) {
    return Math.min(listLength, Math.floor(legacy));
  }
  return 0;
}
