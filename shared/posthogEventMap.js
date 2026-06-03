/** Rutas/metadata en descriptor o URL: normalizar %2F → /. */
const POSTHOG_PATH_LIKE_KEYS = new Set([
  'key',
  'fileName',
  'name',
  'parentKey',
  'relativePath',
  'originalFileName'
]);

/**
 * Decodifica segmentos de ruta para telemetría (URL o valores guardados con %2F).
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function decodeTelemetryPathValue(value) {
  let s = String(value ?? '').trim();
  if (!s) return '';
  s = s.replace(/%2F/gi, '/');
  for (let i = 0; i < 2; i++) {
    if (!/%[0-9A-Fa-f]{2}/.test(s)) break;
    try {
      const next = decodeURIComponent(s.replace(/\+/g, ' '));
      if (next === s) break;
      s = next.replace(/%2F/gi, '/');
    } catch {
      break;
    }
  }
  return s;
}

/** Campos de descriptor permitidos en PostHog (identificadores de metadata, sin credenciales). */
const POSTHOG_DESCRIPTOR_KEYS = new Set([
  'name',
  'key',
  'fileName',
  'parentKey',
  'relativePath',
  'source',
  'originalFileName',
  'testLevel',
  'testsConfigured',
  'queryDirection',
  'resourceType',
  'containerType',
  'objectApiName',
  'fieldApiName',
  'controllingField',
  'dependentField',
  'section',
  'rowCount',
  'xmlChars',
  'typesCount'
]);

/**
 * Extrae modo/herramienta de una URL chrome-extension sin enviar la URL completa.
 * @param {string | undefined} comparisonUrl
 */
export function parseAppModeFromComparisonUrl(comparisonUrl) {
  const u = String(comparisonUrl || '').trim();
  if (!u.startsWith('chrome-extension://')) return '';
  try {
    const parsed = new URL(u);
    const nav = (parsed.searchParams.get('nav') || '').trim();
    const op = (parsed.searchParams.get('op') || '').trim();
    if (nav && op) return `${nav}/${op}`.slice(0, 64);
    if (op) return op.slice(0, 64);
    if (nav) return nav.slice(0, 64);
    const leaf = parsed.pathname.split('/').filter(Boolean).pop();
    return leaf ? leaf.slice(0, 64) : '';
  } catch {
    return '';
  }
}

/**
 * Parámetros de ítem en la URL del comparador (sin enviar la URL completa).
 * @param {string | undefined} comparisonUrl
 * @returns {Record<string, string>}
 */
export function parseComparisonUrlParams(comparisonUrl) {
  /** @type {Record<string, string>} */
  const out = {};
  const u = String(comparisonUrl || '').trim();
  if (!u.startsWith('chrome-extension://')) return out;
  try {
    const params = new URL(u).searchParams;
    const key = decodeTelemetryPathValue(params.get('key'));
    const type = (params.get('type') || '').trim();
    const fileName = decodeTelemetryPathValue(params.get('fileName') || params.get('file'));
    if (key) out.item_key = key.slice(0, 120);
    if (type) out.item_type = type.slice(0, 64);
    if (fileName) out.item_file = fileName.slice(0, 120);
  } catch {
    /* ignore */
  }
  return out;
}

/** @param {unknown} raw */
function sanitizeDescriptorForPosthog(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  /** @type {Record<string, string | number>} */
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).slice(0, 64);
    if (key === 'names' && Array.isArray(v)) {
      const names = v.map((x) => String(x).slice(0, 80)).filter(Boolean);
      if (names.length) {
        out.class_names_count = names.length;
        out.class_names = names.slice(0, 8).join(', ').slice(0, 200);
      }
      continue;
    }
    if (!POSTHOG_DESCRIPTOR_KEYS.has(key)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    else if (typeof v === 'string') {
      const raw = v.slice(0, 120);
      out[key] = POSTHOG_PATH_LIKE_KEYS.has(key) ? decodeTelemetryPathValue(raw).slice(0, 120) : raw;
    }
  }
  return out;
}

/** @param {Record<string, unknown>} entry @param {Record<string, string | number>} properties */
function appendOrgContext(entry, properties) {
  const leftCompany = String(entry.leftCompanyName || '').trim();
  const rightCompany = String(entry.rightCompanyName || '').trim();
  const leftUrl = String(entry.leftInstanceUrl || '').trim();
  const rightUrl = String(entry.rightInstanceUrl || '').trim();

  if (leftCompany) properties.left_company_name = leftCompany.slice(0, 120);
  if (rightCompany) properties.right_company_name = rightCompany.slice(0, 120);
  if (leftUrl) properties.left_sandbox_url = leftUrl.slice(0, 256);
  if (rightUrl) properties.right_sandbox_url = rightUrl.slice(0, 256);

  if (entry.leftIsSandbox === true || entry.leftIsSandbox === 1) properties.left_is_sandbox = 1;
  if (entry.rightIsSandbox === true || entry.rightIsSandbox === 1) properties.right_is_sandbox = 1;

  const leftEnv = String(entry.leftEnvLabel || '').trim();
  const rightEnv = String(entry.rightEnvLabel || '').trim();
  if (leftEnv) properties.left_env_label = leftEnv.slice(0, 64);
  if (rightEnv) properties.right_env_label = rightEnv.slice(0, 64);
}

/** @param {Record<string, unknown>} entry */
function appendRootMetrics(entry, properties) {
  const num = (k, prop) => {
    if (entry[k] === undefined) return;
    const n = Number(entry[k]);
    if (Number.isFinite(n)) properties[prop] = n;
  };
  num('leftFilesCount', 'left_files_count');
  num('rightFilesCount', 'right_files_count');
  num('leftChars', 'left_chars');
  num('rightChars', 'right_chars');
  num('diffBlocks', 'diff_blocks');
  num('diffLines', 'diff_lines');
  num('typesCount', 'types_count');
  num('xmlChars', 'xml_chars');
  num('rowCount', 'row_count');

  if (entry.ok !== undefined) properties.ok = entry.ok ? 1 : 0;
  if (entry.success !== undefined) properties.success = entry.success ? 1 : 0;

  const reason = String(entry.reason || entry.error || '').trim();
  if (reason) properties.result_reason = reason.slice(0, 120);

  const errMsg = String(entry.errorMessage || '').trim();
  if (errMsg) properties.error_message = errMsg.slice(0, 200);

  const action = String(entry.action || '').trim();
  if (action) properties.action = action.slice(0, 64);
}

/** @param {Record<string, string | number>} desc @param {Record<string, string | number>} properties */
function promoteElementIdentity(desc, properties) {
  const name = decodeTelemetryPathValue(String(desc.name || ''));
  if (name) properties.element_name = name.slice(0, 120);

  const metaKey = decodeTelemetryPathValue(String(desc.key || ''));
  if (metaKey) properties.metadata_key = metaKey.slice(0, 120);

  const fileName = decodeTelemetryPathValue(String(desc.fileName || ''));
  if (fileName) properties.element_file = fileName.slice(0, 120);

  if (!properties.element_name && metaKey) {
    const leaf = metaKey.split('/').filter(Boolean).pop();
    if (leaf) properties.element_name = leaf.slice(0, 120);
  }

  const compared =
    String(properties.item_key || '') ||
    metaKey ||
    name ||
    String(properties.element_file || '');
  if (compared) {
    properties.element_compared = decodeTelemetryPathValue(compared).slice(0, 120);
  }
}

/**
 * URL de contexto para PostHog sin `key`/`fileName` codificados (usar `element_compared` en su lugar).
 * @param {string | undefined} comparisonUrl
 */
export function telemetrySafeComparisonUrl(comparisonUrl) {
  const u = String(comparisonUrl || '').trim();
  if (!u.startsWith('chrome-extension://')) return '';
  try {
    const parsed = new URL(u);
    parsed.searchParams.delete('key');
    parsed.searchParams.delete('fileName');
    parsed.searchParams.delete('file');
    parsed.searchParams.delete('descriptor');
    return parsed.href.slice(0, 420);
  } catch {
    return '';
  }
}

/**
 * Convierte entrada de usage:log (ya filtrada por pickUsageLogEntry) en evento PostHog.
 * @param {Record<string, unknown>} entry
 * @param {{ extensionVersion?: string, uiLanguage?: string }} ctx
 * @returns {{ name: string, properties: Record<string, string | number> } | null}
 */
export function usageEntryToPosthogEvent(entry, ctx = {}) {
  const kind = String(entry.kind || '').trim();
  const artifactType = String(entry.artifactType || '').trim();
  if (!kind && !artifactType) return null;

  const name = kind === 'codeComparison' || artifactType ? 'comparison_run' : 'extension_usage';

  /** @type {Record<string, string | number>} */
  const properties = {
    sfoc_source: 'extension',
    kind: kind.slice(0, 64),
    artifact_type: artifactType.slice(0, 64)
  };

  const phase = String(entry.phase || '').trim();
  if (phase) properties.phase = phase.slice(0, 64);

  const left = String(entry.leftOrgId || '').trim();
  const right = String(entry.rightOrgId || '').trim();
  if (left) properties.has_left_org = 1;
  if (right) properties.has_right_org = 1;
  if (left && right) properties.two_orgs_selected = 1;

  appendOrgContext(entry, properties);

  if (entry.viaRetrieveZip) properties.via_retrieve_zip = 1;

  const comparisonUrl = typeof entry.comparisonUrl === 'string' ? entry.comparisonUrl : '';
  const appMode = parseAppModeFromComparisonUrl(comparisonUrl);
  if (appMode) properties.app_mode = appMode;

  for (const [k, v] of Object.entries(parseComparisonUrlParams(comparisonUrl))) {
    properties[k] = v;
  }

  const desc = sanitizeDescriptorForPosthog(entry.descriptor);
  promoteElementIdentity(desc, properties);
  for (const [k, v] of Object.entries(desc)) {
    properties[`desc_${k}`] = v;
  }

  appendRootMetrics(entry, properties);

  if (ctx.extensionVersion) properties.extension_version = String(ctx.extensionVersion).slice(0, 32);
  if (ctx.uiLanguage) properties.ui_language = String(ctx.uiLanguage).slice(0, 16);

  return { name, properties };
}

/** @param {Record<string, string | number>} properties */
function appendTelemetryPreferenceProps(properties, ctx = {}, source = '') {
  if (ctx.extensionVersion) properties.extension_version = String(ctx.extensionVersion).slice(0, 32);
  if (ctx.uiLanguage) properties.ui_language = String(ctx.uiLanguage).slice(0, 16);
  if (source) properties.preference_source = String(source).slice(0, 32);
}

/**
 * Usuario con telemetría activa (consentimiento por defecto o reactivación).
 * @param {{ extensionVersion?: string, uiLanguage?: string }} [ctx]
 * @param {'default' | 'settings'} [source]
 */
export function telemetryEnabledPosthogEvent(ctx = {}, source = 'default') {
  /** @type {Record<string, string | number>} */
  const properties = { sfoc_source: 'extension', telemetry_enabled: 1 };
  appendTelemetryPreferenceProps(properties, ctx, source);
  const name = source === 'settings' ? 'telemetry_opt_in' : 'telemetry_enabled';
  return { name, properties };
}

/**
 * Usuario que desactiva telemetría en Ajustes.
 * @param {{ extensionVersion?: string, uiLanguage?: string }} [ctx]
 */
export function telemetryOptOutPosthogEvent(ctx = {}) {
  /** @type {Record<string, string | number>} */
  const properties = { sfoc_source: 'extension', telemetry_enabled: 0 };
  appendTelemetryPreferenceProps(properties, ctx, 'settings');
  return { name: 'telemetry_opt_out', properties };
}

/**
 * @param {{ extensionVersion?: string, uiLanguage?: string }} ctx
 * @param {Record<string, string | number | boolean>} extra
 */
export function extensionLifecyclePosthogEvent(eventName, ctx = {}, extra = {}) {
  /** @type {Record<string, string | number | boolean>} */
  const properties = { sfoc_source: 'extension', ...extra };
  appendTelemetryPreferenceProps(properties, ctx);
  return { name: eventName, properties };
}
