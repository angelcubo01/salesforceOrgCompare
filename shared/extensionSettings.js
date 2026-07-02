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
  apexTestsExpandedMethodsPollIntervalMs: { min: 1000, max: 120_000 },
  apexTestsMaxTrackedJobs: { min: 3, max: 100 },
  /** Porcentaje mínimo (0–100) para listar clases en el modal Cobertura del hub Apex tests. */
  apexTestsCoverageMinPercent: { min: 0, max: 100 },
  /** Porcentaje de consumo (0–100) a partir del cual Org Limits marca anillos y tarjetas en rojo. */
  orgLimitsWarningPercent: { min: 0, max: 100 },
  debugLogsDefaultRangeHours: { min: 1, max: 168 },
  setupAuditDefaultRangeHours: { min: 1, max: 168 },
  fieldHistoryDefaultRangeDays: { min: 1, max: 90 },
  codeEditorMaxTabs: { min: 3, max: 30 },
  metadataRetrieveMaxAttempts: { min: 10, max: 240 },
  metadataRetrievePackageMaxAttempts: { min: 10, max: 360 },
  metadataRetrievePollIntervalMs: { min: 1000, max: 10_000 },
  metadataDeployMaxAttempts: { min: 10, max: 240 },
  metadataDeployPollIntervalMs: { min: 500, max: 10_000 },
  debugLogsListMaxRows: { min: 500, max: 50_000 },
  setupAuditQueryDefaultLimit: { min: 500, max: 50_000 },
  fieldHistoryQueryDefaultLimit: { min: 500, max: 50_000 },
  anonymousApexLogSearchMaxAttempts: { min: 1, max: 20 },
  anonymousApexLogSearchDelayMs: { min: 200, max: 5000 }
};

/** Claves del bloque diff/editor/Apex tests en Ajustes → Avanzado. */
export const EXTENSION_ADVANCED_LEGACY_KEYS = [
  'nativeDiffMaxChars',
  'maxMonacoModelChars',
  'maxDiffAlgorithmChars',
  'maxAlignedBufferChars',
  'apexTestsPollIntervalMs',
  'apexTestsExpandedMethodsPollIntervalMs',
  'apexTestsMaxTrackedJobs'
];

export const EXTENSION_ADVANCED_METADATA_KEYS = [
  'metadataRetrieveMaxAttempts',
  'metadataRetrievePackageMaxAttempts',
  'metadataRetrievePollIntervalMs',
  'metadataDeployMaxAttempts',
  'metadataDeployPollIntervalMs'
];

export const EXTENSION_ADVANCED_DATA_LIMIT_KEYS = [
  'debugLogsListMaxRows',
  'setupAuditQueryDefaultLimit',
  'fieldHistoryQueryDefaultLimit'
];

export const EXTENSION_ADVANCED_ANONYMOUS_APEX_KEYS = [
  'anonymousApexLogSearchMaxAttempts',
  'anonymousApexLogSearchDelayMs'
];

/** Secciones del formulario Avanzado (headingKey null = sin subtítulo). */
export const EXTENSION_ADVANCED_SECTIONS = [
  { headingKey: null, keys: EXTENSION_ADVANCED_LEGACY_KEYS },
  { headingKey: 'settings.adv.metadataOpsHeading', keys: EXTENSION_ADVANCED_METADATA_KEYS },
  { headingKey: 'settings.adv.dataLimitsHeading', keys: EXTENSION_ADVANCED_DATA_LIMIT_KEYS },
  { headingKey: 'settings.adv.anonymousApexHeading', keys: EXTENSION_ADVANCED_ANONYMOUS_APEX_KEYS }
];

/** Todas las claves Avanzado (aplanado, para guardar/cargar). */
export const EXTENSION_ADVANCED_FIELD_KEYS = EXTENSION_ADVANCED_SECTIONS.flatMap((s) => s.keys);

/** Claves numéricas en Ajustes → General (guardado con botón General). */
export const EXTENSION_GENERAL_NUMERIC_KEYS = [
  'debugLogsDefaultRangeHours',
  'setupAuditDefaultRangeHours',
  'fieldHistoryDefaultRangeDays',
  'codeEditorMaxTabs'
];

const LEGACY_NATIVE_DIFF_KEY = 'soc_native_diff_max_chars';

/** Temas Monaco permitidos (built-in + personalizados SFOC). */
export const MONACO_THEME_IDS = [
  'sfoc-editor-dark',
  'sfoc-editor-light',
  'vs-dark',
  'vs',
  'hc-black',
  'hc-light'
];

/** @param {unknown} raw */
export function normalizeUiTheme(raw) {
  return raw === 'light' ? 'light' : 'dark';
}

/** @param {unknown} raw */
export function normalizeMonacoThemeId(raw) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return MONACO_THEME_IDS.includes(s) ? s : 'sfoc-editor-dark';
}

/**
 * Tema Monaco SFOC acoplado a la apariencia de la aplicación.
 * @param {'dark' | 'light'} uiTheme
 */
export function defaultMonacoThemeForUiTheme(uiTheme) {
  return normalizeUiTheme(uiTheme) === 'light' ? 'sfoc-editor-light' : 'sfoc-editor-dark';
}

const DEFAULTS = {
  /** Interfaz principal: oscuro (predeterminado) o claro. */
  uiTheme: /** @type {'dark' | 'light'} */ ('dark'),
  /** Tema del editor Monaco (diff y paneles que usan Monaco). */
  monacoTheme: 'sfoc-editor-dark',
  nativeDiffMaxChars: 1_800_000,
  maxMonacoModelChars: 2_000_000,
  maxDiffAlgorithmChars: 400_000,
  maxAlignedBufferChars: 24_000_000,
  apexTestsPollIntervalMs: 4000,
  apexTestsExpandedMethodsPollIntervalMs: 4000,
  apexTestsMaxTrackedJobs: 25,
  /** Mínimo de cobertura (0–100) para incluir una clase/trigger en el modal Cobertura. */
  apexTestsCoverageMinPercent: 50,
  /** Consumo (0–100) a partir del cual Org Limits resalta límites en rojo y los prioriza arriba. */
  orgLimitsWarningPercent: 85,
  /** Patrones LIKE para SOQL (coma): qué ApexClass se consideran “de prueba” al listar. */
  apexTestsClassNameLikePatterns: '%test%',
  /** Si true, ejecuta tests sin calcular cobertura (más rápido; oculta botón Cobertura en el hub). */
  apexTestsSkipCodeCoverage: false,
  /** DeveloperName del registro DebugLevel al activar trazas USER_DEBUG antes de ejecutar tests Apex. */
  apexTestsTraceDebugLevel: 'SFDC_DevConsole',
  /** Telemetría anónima de uso (PostHog). Desactivar en Ajustes. */
  telemetryEnabled: true,
  /** Recordar pestañas y código en Quick Edit / Lightning Quick Edit (solo storage local). */
  codeEditorPersistEnabled: true,
  debugLogsDefaultRangeHours: 24,
  setupAuditDefaultRangeHours: 24,
  fieldHistoryDefaultRangeDays: 30,
  codeEditorMaxTabs: 15,
  metadataRetrieveMaxAttempts: 60,
  metadataRetrievePackageMaxAttempts: 90,
  metadataRetrievePollIntervalMs: 3500,
  metadataDeployMaxAttempts: 90,
  metadataDeployPollIntervalMs: 1500,
  debugLogsListMaxRows: 15_000,
  setupAuditQueryDefaultLimit: 15_000,
  fieldHistoryQueryDefaultLimit: 5000,
  anonymousApexLogSearchMaxAttempts: 5,
  anonymousApexLogSearchDelayMs: 800
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
    if (k === 'uiTheme') {
      next[k] = normalizeUiTheme(src[k] != null ? src[k] : next[k]);
      continue;
    }
    if (k === 'monacoTheme') {
      next[k] = normalizeMonacoThemeId(src[k] != null ? src[k] : next[k]);
      continue;
    }
    if (k === 'apexTestsTraceDebugLevel') {
      next[k] = normalizeApexTraceDebugLevel(src[k] != null ? src[k] : undefined);
      continue;
    }
    if (k === 'apexTestsClassNameLikePatterns') {
      next[k] = normalizeApexTestClassPatterns(src[k] != null ? src[k] : undefined);
      continue;
    }
    if (k === 'telemetryEnabled') {
      next[k] = src[k] !== false;
      continue;
    }
    if (k === 'codeEditorPersistEnabled') {
      next[k] = src[k] !== false;
      continue;
    }
    if (k === 'apexTestsSkipCodeCoverage') {
      next[k] = src[k] === true;
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

export function getApexTestsExpandedMethodsPollIntervalMs() {
  return cache.apexTestsExpandedMethodsPollIntervalMs;
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
 * Porcentaje de consumo (0–100) a partir del cual Org Limits marca anillos y tarjetas en rojo.
 * @returns {number}
 */
export function getOrgLimitsWarningPercent() {
  const v = cache.orgLimitsWarningPercent;
  return typeof v === 'number' && Number.isFinite(v) ? v : DEFAULTS.orgLimitsWarningPercent;
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

/** @returns {boolean} Omitir cálculo de cobertura al ejecutar tests desde el runner. */
export function getApexTestsSkipCodeCoverage() {
  return cache.apexTestsSkipCodeCoverage === true;
}

/**
 * DeveloperName del DebugLevel usado al crear TraceFlag USER_DEBUG para tests Apex.
 * @returns {string}
 */
export function getApexTestsTraceDebugLevel() {
  return cache.apexTestsTraceDebugLevel || DEFAULTS.apexTestsTraceDebugLevel;
}

/** @returns {'dark' | 'light'} */
export function getUiTheme() {
  return normalizeUiTheme(cache.uiTheme);
}

/** @returns {string} */
export function getMonacoThemeId() {
  return normalizeMonacoThemeId(cache.monacoTheme);
}

/** @returns {boolean} */
export function getTelemetryEnabled() {
  return cache.telemetryEnabled !== false;
}

/** @returns {boolean} Quick Edit y Lightning Quick Edit: guardar sesión en chrome.storage.local. */
export function getCodeEditorPersistenceEnabled() {
  return cache.codeEditorPersistEnabled !== false;
}

export function getDebugLogsDefaultRangeHours() {
  return cache.debugLogsDefaultRangeHours;
}

export function getSetupAuditDefaultRangeHours() {
  return cache.setupAuditDefaultRangeHours;
}

export function getFieldHistoryDefaultRangeDays() {
  return cache.fieldHistoryDefaultRangeDays;
}

export function getCodeEditorMaxTabs() {
  return cache.codeEditorMaxTabs;
}

export function getMetadataRetrieveMaxAttempts() {
  return cache.metadataRetrieveMaxAttempts;
}

export function getMetadataRetrievePackageMaxAttempts() {
  return cache.metadataRetrievePackageMaxAttempts;
}

export function getMetadataRetrievePollIntervalMs() {
  return cache.metadataRetrievePollIntervalMs;
}

export function getMetadataDeployMaxAttempts() {
  return cache.metadataDeployMaxAttempts;
}

export function getMetadataDeployPollIntervalMs() {
  return cache.metadataDeployPollIntervalMs;
}

export function getDebugLogsListMaxRows() {
  return cache.debugLogsListMaxRows;
}

export function getSetupAuditQueryDefaultLimit() {
  return cache.setupAuditQueryDefaultLimit;
}

export function getFieldHistoryQueryDefaultLimit() {
  return cache.fieldHistoryQueryDefaultLimit;
}

export function getAnonymousApexLogSearchMaxAttempts() {
  return cache.anonymousApexLogSearchMaxAttempts;
}

export function getAnonymousApexLogSearchDelayMs() {
  return cache.anonymousApexLogSearchDelayMs;
}

/** Expuesto para tests de normalización. */
export function normalizeExtensionConfig(partial) {
  return normalizeConfig(partial);
}

/**
 * Atributo `data-ui-theme` en la raíz del documento (pág. principal, ajustes).
 * @param {Document} [doc]
 */
export function applyUiThemeToDocument(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc?.documentElement) return;
  const t = getUiTheme();
  doc.documentElement.dataset.uiTheme = t;
  doc.documentElement.style.colorScheme = t === 'light' ? 'light' : 'dark';
}
