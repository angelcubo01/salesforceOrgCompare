/**
 * Preferencias técnicas persistidas (chrome.storage.local).
 * Consumidas por code.html, viewerLimits y hub de Apex tests.
 */

export const EXTENSION_CONFIG_KEY = 'soc_extension_config';

/** @type {Record<string, { min: number, max: number }>} */
export const EXTENSION_FIELD_BOUNDS = {
  nativeDiffMaxChars: { min: 50_000, max: 3_000_000 },
  maxMonacoModelChars: { min: 500_000, max: 3_000_000 },
  maxDiffAlgorithmChars: { min: 50_000, max: 2_000_000 },
  maxAlignedBufferChars: { min: 2_000_000, max: 64_000_000 },
  apexTestsPollIntervalMs: { min: 1000, max: 120_000 },
  apexTestsMaxTrackedJobs: { min: 3, max: 100 },
  /** Porcentaje mínimo (0–100) para listar clases en el modal Cobertura del hub Apex tests. */
  apexTestsCoverageMinPercent: { min: 0, max: 100 }
};

/** Claves ordenadas para el formulario de Ajustes → Avanzado. */
export const EXTENSION_ADVANCED_FIELD_KEYS = [
  'nativeDiffMaxChars',
  'maxMonacoModelChars',
  'maxDiffAlgorithmChars',
  'maxAlignedBufferChars',
  'apexTestsPollIntervalMs',
  'apexTestsMaxTrackedJobs',
  'apexTestsClassNameLikePatterns'
];

const LEGACY_NATIVE_DIFF_KEY = 'soc_native_diff_max_chars';

const DEFAULTS = {
  nativeDiffMaxChars: 1_800_000,
  maxMonacoModelChars: 2_000_000,
  maxDiffAlgorithmChars: 400_000,
  maxAlignedBufferChars: 24_000_000,
  apexTestsPollIntervalMs: 4000,
  apexTestsMaxTrackedJobs: 25,
  /** Mínimo de cobertura (0–100) para incluir una clase/trigger en el modal Cobertura. */
  apexTestsCoverageMinPercent: 50,
  /** Patrones LIKE para SOQL (coma): qué ApexClass se consideran “de prueba” al listar. */
  apexTestsClassNameLikePatterns: '%test%',
  /** DeveloperName del registro DebugLevel al activar trazas USER_DEBUG antes de ejecutar tests Apex. */
  apexTestsTraceDebugLevel: 'SFDC_DevConsole'
};

/** @type {typeof DEFAULTS} */
let cache = { ...DEFAULTS };

function clampField(key, value) {
  const b = EXTENSION_FIELD_BOUNDS[key];
  const d = DEFAULTS[key];
  if (!b) return d;
  const x = Math.floor(Number(value));
  if (!Number.isFinite(x)) return d;
  return Math.min(b.max, Math.max(b.min, x));
}

const APEX_TEST_PATTERN_MAX = 12;
const APEX_TEST_PATTERN_LEN = 120;

function normalizeApexTraceDebugLevel(raw) {
  const d = DEFAULTS.apexTestsTraceDebugLevel;
  if (raw == null || raw === '') return d;
  const s = typeof raw === 'string' ? raw.trim() : String(raw).trim();
  if (!s) return d;
  const safe = s.slice(0, 80).replace(/[^a-zA-Z0-9_]/g, '');
  return safe || d;
}

function normalizeApexTestClassPatterns(raw) {
  const d = DEFAULTS.apexTestsClassNameLikePatterns;
  if (raw == null) return d;
  const s = typeof raw === 'string' ? raw : String(raw);
  const parts = s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, APEX_TEST_PATTERN_MAX)
    .filter((p) => p.length <= APEX_TEST_PATTERN_LEN && !/[\x00-\x1f]/.test(p));
  return parts.length ? parts.join(',') : d;
}

function normalizeConfig(partial) {
  const next = { ...DEFAULTS };
  const src = partial && typeof partial === 'object' ? partial : {};
  for (const k of Object.keys(DEFAULTS)) {
    if (k === 'apexTestsTraceDebugLevel') {
      next[k] = normalizeApexTraceDebugLevel(src[k] != null ? src[k] : undefined);
      continue;
    }
    if (k === 'apexTestsClassNameLikePatterns') {
      next[k] = normalizeApexTestClassPatterns(src[k] != null ? src[k] : undefined);
      continue;
    }
    if (src[k] != null) next[k] = clampField(k, src[k]);
  }
  next.nativeDiffMaxChars = Math.min(next.nativeDiffMaxChars, next.maxMonacoModelChars);
  return next;
}

export async function loadExtensionSettings() {
  try {
    const r = await chrome.storage.local.get([EXTENSION_CONFIG_KEY, LEGACY_NATIVE_DIFF_KEY]);
    let data = r[EXTENSION_CONFIG_KEY];
    if (data && typeof data === 'object' && r[LEGACY_NATIVE_DIFF_KEY] != null) {
      data = { ...data, nativeDiffMaxChars: r[LEGACY_NATIVE_DIFF_KEY] };
    } else if (!data && r[LEGACY_NATIVE_DIFF_KEY] != null) {
      data = { nativeDiffMaxChars: r[LEGACY_NATIVE_DIFF_KEY] };
    }
    if (r[LEGACY_NATIVE_DIFF_KEY] != null) {
      try {
        await chrome.storage.local.remove(LEGACY_NATIVE_DIFF_KEY);
      } catch {
        /* ignore */
      }
    }
    cache = normalizeConfig(data);
    await chrome.storage.local.set({ [EXTENSION_CONFIG_KEY]: cache });
  } catch {
    cache = normalizeConfig({});
  }
  return cache;
}

/**
 * @param {Partial<typeof DEFAULTS>} partial
 */
export async function saveExtensionSettings(partial) {
  cache = normalizeConfig({ ...cache, ...partial });
  try {
    await chrome.storage.local.set({ [EXTENSION_CONFIG_KEY]: cache });
  } catch {
    /* ignore */
  }
  return cache;
}

export async function resetExtensionSettings() {
  cache = normalizeConfig({});
  try {
    await chrome.storage.local.set({ [EXTENSION_CONFIG_KEY]: cache });
  } catch {
    /* ignore */
  }
  return cache;
}

export function getExtensionSettingsSnapshot() {
  return { ...cache };
}

export function getNativeDiffMaxChars() {
  return cache.nativeDiffMaxChars;
}

export function getMaxMonacoModelChars() {
  return cache.maxMonacoModelChars;
}

export function getMaxDiffAlgorithmChars() {
  return cache.maxDiffAlgorithmChars;
}

export function getMaxAlignedBufferChars() {
  return cache.maxAlignedBufferChars;
}

export function getViewerChunkSize() {
  return Math.max(100_000, cache.maxMonacoModelChars - 900);
}

export function getApexTestsPollIntervalMs() {
  return cache.apexTestsPollIntervalMs;
}

export function getApexTestsMaxTrackedJobs() {
  return cache.apexTestsMaxTrackedJobs;
}

/**
 * Porcentaje mínimo de cobertura (0–100) para listar clases en el modal Cobertura del hub.
 * @returns {number}
 */
export function getApexTestsCoverageMinPercent() {
  const v = cache.apexTestsCoverageMinPercent;
  return typeof v === 'number' && Number.isFinite(v) ? v : DEFAULTS.apexTestsCoverageMinPercent;
}

/**
 * Patrones LIKE (coma) para filtrar clases Apex en el hub de pruebas.
 * @returns {string[]}
 */
export function getApexTestsClassNameLikePatterns() {
  const s = cache.apexTestsClassNameLikePatterns || DEFAULTS.apexTestsClassNameLikePatterns;
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * DeveloperName del DebugLevel usado al crear TraceFlag USER_DEBUG para tests Apex.
 * @returns {string}
 */
export function getApexTestsTraceDebugLevel() {
  return cache.apexTestsTraceDebugLevel || DEFAULTS.apexTestsTraceDebugLevel;
}
