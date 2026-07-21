/** Identificador de ayuda para la pantalla de inicio (no es herramienta de menú). */
export const HELP_HOME_ID = 'home';

/** Herramientas con onboarding de primera visita (26). */
export const ALL_ONBOARDING_TOOLS = Object.freeze([
  'Comparator',
  'ApexTests',
  'QuickEdit',
  'LightningQuickEdit',
  'AnonymousApex',
  'QueryExplorer',
  'DebugLogBrowser',
  'ApexCoverageCompare',
  'FieldDependency',
  'DependencyExplorer',
  'PermissionDiff',
  'CustomSettingsCompare',
  'CustomMetadataCompare',
  'RecordCompare',
  'EnvironmentStatus',
  'OrgLimits',
  'DeployStatus',
  'SetupAuditTrail',
  'FieldHistory',
  'GeneratePackageXml',
  'MetadataTypeCompare',
  'ObjectDescribe',
  'DataWorkbench',
  'RestExplorer',
  'EventMonitor',
  'BulkJobMonitor'
]);

/** Todas las entidades con texto help.tool.* (home + herramientas + visor de cobertura). */
export const HELP_TOOL_IDS = Object.freeze([
  HELP_HOME_ID,
  ...ALL_ONBOARDING_TOOLS,
  'ApexCoverageViewer'
]);

/** @param {string} toolId */
export function helpToolTitleKey(toolId) {
  return `help.tool.${toolId}.title`;
}

/** @param {string} toolId */
export function helpToolBodyKeys(toolId) {
  const keys = [
    `help.tool.${toolId}.lead`,
    `help.tool.${toolId}.body1`,
    `help.tool.${toolId}.body2`,
    `help.tool.${toolId}.body3`
  ];
  if (toolId === HELP_HOME_ID) {
    keys.push(`help.tool.${toolId}.body4`);
  }
  return keys;
}

/** @param {string} toolId */
export function onboardingToolKeyPrefix(toolId) {
  return `onboarding.tool.${toolId}`;
}
