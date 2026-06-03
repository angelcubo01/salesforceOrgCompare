import { decodeTelemetryPathValue } from './posthogEventMap.js';
import { hostnameMatchesSfCloud } from './sfDomains.js';

/** Campos permitidos en telemetría anónima (usage:log). */
const USAGE_LOG_ALLOWED_KEYS = new Set([
  'kind',
  'artifactType',
  'phase',
  'action',
  'leftOrgId',
  'rightOrgId',
  'leftCompanyName',
  'rightCompanyName',
  'leftInstanceUrl',
  'rightInstanceUrl',
  'leftEnvLabel',
  'rightEnvLabel',
  'viaRetrieveZip',
  'descriptor',
  'comparisonUrl',
  'ok',
  'success',
  'reason',
  'error',
  'errorMessage',
  'leftFilesCount',
  'rightFilesCount',
  'leftChars',
  'rightChars',
  'diffBlocks',
  'diffLines',
  'typesCount',
  'xmlChars',
  'rowCount'
]);

const USAGE_LOG_NUMBER_KEYS = new Set([
  'leftFilesCount',
  'rightFilesCount',
  'leftChars',
  'rightChars',
  'diffBlocks',
  'diffLines',
  'typesCount',
  'xmlChars',
  'rowCount'
]);

const USAGE_LOG_BOOLEAN_KEYS = new Set(['ok', 'success', 'viaRetrieveZip', 'leftIsSandbox', 'rightIsSandbox']);

const USAGE_LOG_STRING_KEYS = new Set([
  'kind',
  'artifactType',
  'phase',
  'action',
  'leftOrgId',
  'rightOrgId',
  'leftCompanyName',
  'rightCompanyName',
  'leftInstanceUrl',
  'rightInstanceUrl',
  'leftEnvLabel',
  'rightEnvLabel',
  'reason',
  'error',
  'errorMessage'
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
    if (key === 'leftInstanceUrl' || key === 'rightInstanceUrl') {
      const u = normalizeTelemetryInstanceUrl(src[key]);
      if (u) out[key] = u;
      continue;
    }
    if (USAGE_LOG_BOOLEAN_KEYS.has(key)) {
      out[key] = !!src[key];
      continue;
    }
    if (USAGE_LOG_NUMBER_KEYS.has(key)) {
      const n = Number(src[key]);
      if (Number.isFinite(n)) out[key] = n;
      continue;
    }
    if (USAGE_LOG_STRING_KEYS.has(key)) {
      const s = String(src[key] ?? '').trim();
      if (!s) continue;
      const max =
        key === 'errorMessage'
          ? 500
          : key === 'leftInstanceUrl' || key === 'rightInstanceUrl'
            ? 256
            : 256;
      out[key] = s.slice(0, max);
    }
  }
  return out;
}

/** @param {unknown} raw */
function normalizeTelemetryInstanceUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    if (!hostnameMatchesSfCloud(u.hostname)) return '';
    return u.origin.slice(0, 256);
  } catch {
    return '';
  }
}

/** @param {unknown} raw */
function sanitizeUsageDescriptor(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  /** @type {Record<string, unknown>} */
  const d = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).slice(0, 64);
    if (typeof v === 'string') {
      const raw = v.slice(0, 200);
      const pathLike = ['key', 'fileName', 'name', 'parentKey', 'relativePath', 'originalFileName'].includes(key);
      d[key] = pathLike ? decodeTelemetryPathValue(raw).slice(0, 200) : raw;
    }
    else if (typeof v === 'number' && Number.isFinite(v)) d[key] = v;
    else if (typeof v === 'boolean') d[key] = v;
    else if (Array.isArray(v)) {
      d[key] = v
        .slice(0, 20)
        .map((x) => String(x).slice(0, 120))
        .filter(Boolean);
    }
  }
  return d;
}

/**
 * Descriptor enriquecido para telemetría (nombre, key, fileName del ítem).
 * @param {{ type?: string, key?: string, fileName?: string, descriptor?: Record<string, unknown> } | null | undefined} item
 */
export function usageDescriptorFromItem(item) {
  if (!item) return {};
  /** @type {Record<string, unknown>} */
  const d = item.descriptor && typeof item.descriptor === 'object' ? { ...item.descriptor } : {};
  if (item.key) d.key = decodeTelemetryPathValue(String(item.key)).slice(0, 200);
  if (item.fileName) d.fileName = decodeTelemetryPathValue(String(item.fileName)).slice(0, 200);
  if (item.type && !d.name && item.key) {
    const leaf = decodeTelemetryPathValue(String(item.key)).split('/').filter(Boolean).pop();
    if (leaf) d.name = leaf.slice(0, 200);
  }
  return d;
}
