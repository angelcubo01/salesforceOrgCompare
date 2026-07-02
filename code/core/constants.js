/** Nombre comercial único (debe coincidir con el listado de la Chrome Web Store). */
export const EXTENSION_DISPLAY_NAME = 'Salesforce Org Compare';

/**
 * Página pública de la extensión (descarga / notas). Debe ser HTTPS.
 * La misma base se puede usar para la política de privacidad en el panel de desarrollador.
 */
export const UPDATE_PAGE_URL = 'https://salesforceorgcompare.web.app/';

/**
 * URL pública de la política de privacidad: pégala en el panel → Privacidad → «Política de privacidad»
 * (no en la descripción del listado). Debe ser accesible sin login.
 */
export const PRIVACY_POLICY_URL = 'https://salesforceorgcompare.web.app/privacy-policy';

/**
 * Se abre al desinstalar la extensión (Chrome setUninstallURL).
 * Añade en esa página un ping PostHog `extension_uninstalled` con ?id= y ?v= de la URL.
 */
export const UNINSTALL_FEEDBACK_URL = 'https://salesforceorgcompare.web.app/uninstall-feedback.html';

/** Modo «Desarrollo» en la barra superior: pantalla completa sin lista lateral (test & debug). */
export const APP_NAV_DEVELOPMENT_TOOLS = Object.freeze([
  'ApexTests',
  'QuickEdit',
  'LightningQuickEdit',
  'AnonymousApex',
  'QueryExplorer',
  'DebugLogBrowser',
  'ApexCoverageCompare'
]);

/** Modo «Análisis»: dependencias, permisos y comparación de datos entre orgs. */
export const APP_NAV_ANALYSIS_TOOLS = Object.freeze([
  'FieldDependency',
  'DependencyExplorer',
  'PermissionDiff',
  'CustomSettingsCompare',
  'CustomMetadataCompare',
  'RecordCompare'
]);

/** Modo «Límites y auditoría»: salud del entorno e historiales. */
export const APP_NAV_MONITORING_TOOLS = Object.freeze([
  'EnvironmentStatus',
  'OrgLimits',
  'DeployStatus',
  'SetupAuditTrail',
  'FieldHistory'
]);
