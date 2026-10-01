const RELATIVE_SALESFORCE_PATH = /^\/(?!\/)/;

export const SFOC_TOOL_MODES = Object.freeze({
  Comparator: 'comparator',
  ApexTests: 'development', ApexCoverageCompare: 'development', QuickEdit: 'development',
  LightningQuickEdit: 'development', AnonymousApex: 'development', QueryExplorer: 'development',
  RestExplorer: 'development', DebugLogBrowser: 'development', EventMonitor: 'development',
  FieldDependency: 'analysis', DependencyExplorer: 'analysis',
  PermissionDiff: 'analysis', CustomSettingsCompare: 'analysis', CustomMetadataCompare: 'analysis',
  RecordCompare: 'analysis', ObjectDescribe: 'analysis', DataWorkbench: 'analysis',
  EnvironmentStatus: 'monitoring', OrgLimits: 'monitoring', DeployStatus: 'monitoring',
  BulkJobMonitor: 'monitoring', SetupAuditTrail: 'monitoring', FieldHistory: 'monitoring',
  GeneratePackageXml: 'manifests',
  MetadataTypeCompare: 'manifests', PackageXml: 'comparator'
});

/** Construye el deep link de una herramienta SFOC con el entorno indicado como origen. */
export function buildSfocQuickLinkUrl(toolId, orgId) {
  const mode = SFOC_TOOL_MODES[String(toolId || '')];
  if (!mode || !orgId) return '';
  const url = new URL(chrome.runtime.getURL('code/code.html'));
  url.searchParams.set('nav', mode);
  url.searchParams.set('op', String(toolId));
  url.searchParams.set('left', String(orgId));
  return url.href;
}

/** Convierte una ruta Salesforce relativa en una URL del entorno que está abierto. */
export function buildCustomQuickLinkUrl(path, origin = globalThis.location?.origin) {
  const relativePath = String(path || '').trim();
  if (!origin || !RELATIVE_SALESFORCE_PATH.test(relativePath)) return '';
  try {
    return new URL(relativePath, origin).href;
  } catch {
    return '';
  }
}
