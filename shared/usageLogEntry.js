/** Campos permitidos en telemetría anónima (usage:log). */
const USAGE_LOG_ALLOWED_KEYS = new Set([
  'kind',
  'artifactType',
  'phase',
  'leftOrgId',
  'rightOrgId',
  'viaRetrieveZip',
  'descriptor',
  'comparisonUrl'
]);

/**
 * @param {Record<string, unknown>} [entry]
 * @returns {Record<string, unknown>}
 */
export function pickUsageLogEntry(entry) {
  const src = entry && typeof entry === 'object' ? entry : {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of USAGE_LOG_ALLOWED_KEYS) {
    if (src[key] === undefined) continue;
    if (key === 'descriptor') {
      out.descriptor = sanitizeUsageDescriptor(src.descriptor);
      continue;
    }
    if (key === 'comparisonUrl') {
      const u = String(src.comparisonUrl || '').trim();
      if (u.startsWith('chrome-extension://')) {
        out.comparisonUrl = u.slice(0, 2048);
      }
      continue;
    }
    if (key === 'viaRetrieveZip') {
      out.viaRetrieveZip = !!src.viaRetrieveZip;
      continue;
    }
    const s = String(src[key] ?? '').trim();
    if (s) out[key] = s.slice(0, 256);
  }
  return out;
}

/** @param {unknown} raw */
function sanitizeUsageDescriptor(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  /** @type {Record<string, unknown>} */
  const d = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).slice(0, 64);
    if (typeof v === 'string') d[key] = v.slice(0, 200);
    else if (typeof v === 'number' && Number.isFinite(v)) d[key] = v;
    else if (Array.isArray(v)) {
      d[key] = v
        .slice(0, 20)
        .map((x) => String(x).slice(0, 120))
        .filter(Boolean);
    }
  }
  return d;
}
