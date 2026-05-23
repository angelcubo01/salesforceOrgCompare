/** Campos de descriptor permitidos en GA4 (sin nombres libres de metadatos). */
const GA4_DESCRIPTOR_KEYS = new Set([
  'testLevel',
  'testsConfigured',
  'queryDirection',
  'resourceType',
  'containerType',
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

/** @param {unknown} raw */
function sanitizeDescriptorForGa4(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  /** @type {Record<string, string | number>} */
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).slice(0, 64);
    if (!GA4_DESCRIPTOR_KEYS.has(key)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    else if (typeof v === 'string') out[key] = v.slice(0, 120);
  }
  return out;
}

/**
 * Convierte entrada de usage:log (ya filtrada por pickUsageLogEntry) en evento GA4.
 * @param {Record<string, unknown>} entry
 * @param {{ extensionVersion?: string, uiLanguage?: string }} ctx
 * @returns {{ name: string, params: Record<string, string | number> } | null}
 */
export function usageEntryToGa4Event(entry, ctx = {}) {
  const kind = String(entry.kind || '').trim();
  const artifactType = String(entry.artifactType || '').trim();
  if (!kind && !artifactType) return null;

  const name = kind === 'codeComparison' || artifactType ? 'comparison_run' : 'extension_usage';

  /** @type {Record<string, string | number>} */
  const params = {
    sfoc_source: 'extension',
    kind: kind.slice(0, 64),
    artifact_type: artifactType.slice(0, 64)
  };

  const phase = String(entry.phase || '').trim();
  if (phase) params.phase = phase.slice(0, 64);

  // No enviar IDs de org Salesforce a GA4 (privacidad); solo indicar si hay dos orgs.
  const left = String(entry.leftOrgId || '').trim();
  const right = String(entry.rightOrgId || '').trim();
  if (left) params.has_left_org = 1;
  if (right) params.has_right_org = 1;
  if (left && right) params.two_orgs_selected = 1;

  if (entry.viaRetrieveZip) params.via_retrieve_zip = 1;

  const appMode = parseAppModeFromComparisonUrl(
    typeof entry.comparisonUrl === 'string' ? entry.comparisonUrl : ''
  );
  if (appMode) params.app_mode = appMode;

  const desc = sanitizeDescriptorForGa4(entry.descriptor);
  for (const [k, v] of Object.entries(desc)) {
    params[`desc_${k}`] = v;
  }

  if (ctx.extensionVersion) params.extension_version = String(ctx.extensionVersion).slice(0, 32);
  if (ctx.uiLanguage) params.ui_language = String(ctx.uiLanguage).slice(0, 16);

  return { name, params };
}

/**
 * @param {{ extensionVersion?: string, uiLanguage?: string }} [ctx]
 */
export function telemetryOptOutGa4Event(ctx = {}) {
  /** @type {Record<string, string | number>} */
  const params = { sfoc_source: 'extension' };
  if (ctx.extensionVersion) params.extension_version = String(ctx.extensionVersion).slice(0, 32);
  if (ctx.uiLanguage) params.ui_language = String(ctx.uiLanguage).slice(0, 16);
  return { name: 'telemetry_opt_out', params };
}
