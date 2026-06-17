/** Persistencia de banners de primera visita por herramienta. */
export const ONBOARDING_PREFS_KEY = 'sfocOnboardingSeen';

/** Todas las herramientas con banner de onboarding (alineado con MODE_TOOLS + Comparator). */
export const ALL_ONBOARDING_TOOLS = Object.freeze([
  'Comparator',
  'ApexTests',
  'QuickEdit',
  'LightningQuickEdit',
  'AnonymousApex',
  'QueryExplorer',
  'DebugLogBrowser',
  'ApexCoverageCompare',
  'EnvironmentStatus',
  'OrgLimits',
  'DeployStatus',
  'SetupAuditTrail',
  'FieldHistory',
  'FieldDependency',
  'DependencyExplorer',
  'PermissionDiff',
  'GeneratePackageXml'
]);

/**
 * @param {unknown} raw
 * @returns {{ tools: Record<string, boolean>, helpOpened: boolean, telemetryNoticeDismissed: boolean, popupNoticeDismissedFingerprint: string | null }}
 */
export function normalizeOnboardingPrefs(raw) {
  const p = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  const toolsRaw = p.tools && typeof p.tools === 'object' ? /** @type {Record<string, unknown>} */ (p.tools) : {};
  /** @type {Record<string, boolean>} */
  const tools = {};
  for (const [k, v] of Object.entries(toolsRaw)) {
    if (v) tools[k] = true;
  }
  const fpRaw = p.popupNoticeDismissedFingerprint;
  const popupNoticeDismissedFingerprint =
    typeof fpRaw === 'string' && fpRaw.trim() ? fpRaw.trim() : null;
  return {
    tools,
    helpOpened: !!p.helpOpened,
    telemetryNoticeDismissed: !!p.telemetryNoticeDismissed,
    popupNoticeDismissedFingerprint
  };
}

/**
 * @param {{ tools: Record<string, boolean> }} prefs
 * @param {string} tool
 */
export function hasSeenTool(prefs, tool) {
  if (!tool || !ALL_ONBOARDING_TOOLS.includes(tool)) return true;
  return !!prefs.tools[tool];
}

/**
 * @param {{ tools: Record<string, boolean>, helpOpened?: boolean }} prefs
 * @param {string} tool
 */
export function markToolSeenInPrefs(prefs, tool) {
  if (!tool) return prefs;
  return {
    ...prefs,
    tools: { ...prefs.tools, [tool]: true }
  };
}

/**
 * @param {{ helpOpened?: boolean }} prefs
 */
export function markHelpOpenedInPrefs(prefs) {
  return { ...prefs, helpOpened: true };
}

/**
 * @param {{ telemetryNoticeDismissed?: boolean }} prefs
 */
export function hasSeenTelemetryNotice(prefs) {
  return !!prefs.telemetryNoticeDismissed;
}

/**
 * @param {{ tools: Record<string, boolean>, helpOpened?: boolean, telemetryNoticeDismissed?: boolean, popupNoticeDismissedFingerprint?: string | null }} prefs
 */
export function markTelemetryNoticeDismissedInPrefs(prefs) {
  return { ...prefs, telemetryNoticeDismissed: true };
}

/**
 * @param {{ popupNoticeDismissedFingerprint?: string | null }} prefs
 * @param {string} fingerprint
 */
export function hasDismissedPopupNotice(prefs, fingerprint) {
  if (!fingerprint) return false;
  return prefs.popupNoticeDismissedFingerprint === fingerprint;
}

/**
 * @param {{ tools: Record<string, boolean>, helpOpened?: boolean, telemetryNoticeDismissed?: boolean, popupNoticeDismissedFingerprint?: string | null }} prefs
 * @param {string} fingerprint
 */
export function markPopupNoticeDismissedInPrefs(prefs, fingerprint) {
  if (!fingerprint) return prefs;
  return { ...prefs, popupNoticeDismissedFingerprint: fingerprint };
}
