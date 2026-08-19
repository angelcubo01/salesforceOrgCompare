import { CATEGORY_ICONS, TOOL_ICONS } from './iconRegistry.js';

export const WORKBENCH_CATEGORIES = Object.freeze([
  { id: 'home', labelKey: 'workbench.category.home', icon: CATEGORY_ICONS.home },
  { id: 'comparator', labelKey: 'workbench.category.comparator', icon: CATEGORY_ICONS.comparator },
  { id: 'development', labelKey: 'workbench.category.development', icon: CATEGORY_ICONS.development },
  { id: 'dataApi', labelKey: 'workbench.category.dataApi', icon: CATEGORY_ICONS.dataApi },
  { id: 'diagnostics', labelKey: 'workbench.category.diagnostics', icon: CATEGORY_ICONS.diagnostics },
  { id: 'analysis', labelKey: 'workbench.category.analysis', icon: CATEGORY_ICONS.analysis },
  { id: 'operations', labelKey: 'workbench.category.operations', icon: CATEGORY_ICONS.operations },
  { id: 'metadata', labelKey: 'workbench.category.metadata', icon: CATEGORY_ICONS.metadata },
  { id: 'security', labelKey: 'workbench.category.security', icon: CATEGORY_ICONS.security },
  { id: 'advanced', labelKey: 'workbench.category.advanced', icon: CATEGORY_ICONS.advanced }
]);

const tab = (id, labelKey, toolId, legacyMode, panelId, orgScope = 'single', risk = 'read') =>
  Object.freeze({ id, labelKey, toolId, legacyMode, panelId, orgScope, risk });

export const WORKBENCH_WORKSPACES = Object.freeze([
  {
    id: 'comparator', categoryId: 'comparator', labelKey: 'workbench.workspace.comparator',
    icon: 'arrows-diff', defaultTabId: 'main', aliases: ['compare', 'diff'], keywords: ['metadata'],
    tabs: [tab('main', 'workbench.tab.main', 'Comparator', 'comparator', 'standardComparePanel', 'dual')]
  },
  {
    id: 'apex-quality', categoryId: 'development', labelKey: 'workbench.workspace.apexQuality',
    icon: 'test-pipe', defaultTabId: 'tests', aliases: ['apex tests', 'coverage'], keywords: ['tests', 'coverage', 'ejecuciones', 'resultados'],
    tabs: [
      tab('tests', 'workbench.tab.tests', 'ApexTests', 'development', 'apexTestsPanel'),
      tab('runs', 'workbench.tab.runs', 'ApexTests', 'development', 'apexTestsPanel'),
      tab('results', 'workbench.tab.results', 'ApexTests', 'development', 'apexTestsPanel'),
      tab('coverage', 'workbench.tab.coverage', 'ApexCoverageCompare', 'development', 'apexCoverageComparePanel', 'dual')
    ]
  },
  {
    id: 'code-studio', categoryId: 'development', labelKey: 'workbench.workspace.codeStudio',
    icon: 'code', defaultTabId: 'apex-vf', aliases: ['quick edit'], keywords: ['apex', 'visualforce', 'lwc', 'aura'],
    tabs: [
      tab('apex-vf', 'workbench.tab.apexVf', 'QuickEdit', 'development', 'quickEditPanel', 'single', 'write'),
      tab('lwc-aura', 'workbench.tab.lwcAura', 'LightningQuickEdit', 'development', 'lightningQuickEditPanel', 'single', 'write')
    ]
  },
  {
    id: 'data-api', categoryId: 'dataApi', labelKey: 'workbench.workspace.dataApi',
    icon: 'database', defaultTabId: 'query', aliases: ['api workbench', 'soql'], keywords: ['query', 'rest', 'schema', 'data'],
    tabs: [
      tab('query', 'workbench.tab.query', 'QueryExplorer', 'development', 'queryExplorerPanel'),
      tab('rest', 'workbench.tab.rest', 'RestExplorer', 'development', 'restExplorerPanel', 'single', 'write'),
      tab('schema', 'workbench.tab.schema', 'ObjectDescribe', 'analysis', 'objectDescribePanel'),
      tab('data', 'workbench.tab.data', 'DataWorkbench', 'analysis', 'dataWorkbenchPanel', 'single', 'write')
    ]
  },
  {
    id: 'diagnostics', categoryId: 'diagnostics', labelKey: 'workbench.workspace.diagnostics',
    icon: 'stethoscope', defaultTabId: 'logs', aliases: ['debug'], keywords: ['logs', 'trace flags', 'events'],
    tabs: [
      tab('logs', 'workbench.tab.logs', 'DebugLogBrowser', 'development', 'debugLogBrowserPanel'),
      tab('trace-flags', 'workbench.tab.traceFlags', 'DebugLogBrowser', 'development', 'debugLogBrowserPanel', 'single', 'write'),
      tab('events', 'workbench.tab.events', 'EventMonitor', 'development', 'eventMonitorPanel')
    ]
  },
  {
    id: 'dependencies', categoryId: 'analysis', labelKey: 'workbench.workspace.dependencies',
    icon: 'hierarchy-3', defaultTabId: 'fields', aliases: ['dependencies'], keywords: ['fields', 'metadata', 'graph'],
    tabs: [
      tab('fields', 'workbench.tab.fields', 'FieldDependency', 'analysis', 'fieldDependencyPanel', 'dual'),
      tab('metadata', 'workbench.tab.metadata', 'DependencyExplorer', 'analysis', 'dependencyExplorerPanel'),
      tab('graph', 'workbench.tab.graph', 'DependencyExplorer', 'analysis', 'dependencyExplorerPanel')
    ]
  },
  {
    id: 'data-compare', categoryId: 'analysis', labelKey: 'workbench.workspace.dataCompare',
    icon: 'table-options', defaultTabId: 'custom-settings', aliases: ['record compare'], keywords: ['settings', 'custom metadata', 'records'],
    tabs: [
      tab('custom-settings', 'workbench.tab.customSettings', 'CustomSettingsCompare', 'analysis', 'customSettingsComparePanel', 'dual'),
      tab('custom-metadata', 'workbench.tab.customMetadata', 'CustomMetadataCompare', 'analysis', 'customMetadataComparePanel', 'dual'),
      tab('records', 'workbench.tab.records', 'RecordCompare', 'analysis', 'recordComparePanel', 'dual')
    ]
  },
  {
    id: 'org-operations', categoryId: 'operations', labelKey: 'workbench.workspace.orgOperations',
    icon: 'activity', defaultTabId: 'health', aliases: ['org status'], keywords: ['health', 'limits', 'deployments', 'bulk'],
    tabs: [
      tab('health', 'workbench.tab.health', 'EnvironmentStatus', 'monitoring', 'environmentStatusPanel'),
      tab('limits', 'workbench.tab.limits', 'OrgLimits', 'monitoring', 'orgLimitsPanel'),
      tab('deployments', 'workbench.tab.deployments', 'DeployStatus', 'monitoring', 'deployStatusPanel'),
      tab('bulk', 'workbench.tab.bulk', 'BulkJobMonitor', 'monitoring', 'bulkJobMonitorPanel', 'single', 'write')
    ]
  },
  {
    id: 'audit-history', categoryId: 'analysis', labelKey: 'workbench.workspace.auditHistory',
    icon: 'history', defaultTabId: 'setup-audit', aliases: ['audit'], keywords: ['history', 'setup audit trail'],
    tabs: [
      tab('setup-audit', 'workbench.tab.setupAudit', 'SetupAuditTrail', 'monitoring', 'setupAuditTrailPanel'),
      tab('field-history', 'workbench.tab.fieldHistory', 'FieldHistory', 'monitoring', 'fieldHistoryPanel')
    ]
  },
  {
    id: 'metadata-tools', categoryId: 'metadata', labelKey: 'workbench.workspace.metadataTools',
    icon: 'package', defaultTabId: 'package-xml', aliases: ['manifest'], keywords: ['package xml', 'metadata types'],
    tabs: [
      tab('package-xml', 'workbench.tab.packageXml', 'GeneratePackageXml', 'manifests', 'generatePackageXmlPanel', 'single'),
      tab('compare-types', 'workbench.tab.compareTypes', 'MetadataTypeCompare', 'manifests', 'metadataTypeComparePanel', 'dual')
    ]
  },
  {
    id: 'security-access', categoryId: 'security', labelKey: 'workbench.workspace.securityAccess',
    icon: 'shield-lock', defaultTabId: 'permissions', aliases: ['security'], keywords: ['permissions', 'profiles', 'permission sets', 'access'],
    tabs: [tab('permissions', 'workbench.tab.permissions', 'PermissionDiff', 'analysis', 'permissionDiffPanel', 'dual')]
  },
  {
    id: 'advanced', categoryId: 'advanced', labelKey: 'workbench.workspace.advanced',
    icon: 'terminal-2', defaultTabId: 'anonymous-apex', aliases: ['technical'], keywords: ['dangerous', 'apex', 'rest', 'bulk'],
    tabs: [tab('anonymous-apex', 'workbench.tab.anonymousApex', 'AnonymousApex', 'development', 'anonymousApexPanel', 'single', 'destructive')],
    toolAliases: [
      { toolId: 'RestExplorer', workspaceId: 'data-api', tabId: 'rest' },
      { toolId: 'DataWorkbench', workspaceId: 'data-api', tabId: 'data' },
      { toolId: 'BulkJobMonitor', workspaceId: 'org-operations', tabId: 'bulk' }
    ]
  }
]);

export const LEGACY_TOOL_ROUTES = Object.freeze({
  Comparator: { workspaceId: 'comparator', tabId: 'main' },
  ApexTests: { workspaceId: 'apex-quality', tabId: 'runs' },
  ApexCoverageCompare: { workspaceId: 'apex-quality', tabId: 'coverage' },
  QuickEdit: { workspaceId: 'code-studio', tabId: 'apex-vf' },
  LightningQuickEdit: { workspaceId: 'code-studio', tabId: 'lwc-aura' },
  AnonymousApex: { workspaceId: 'advanced', tabId: 'anonymous-apex' },
  QueryExplorer: { workspaceId: 'data-api', tabId: 'query' },
  RestExplorer: { workspaceId: 'data-api', tabId: 'rest' },
  ObjectDescribe: { workspaceId: 'data-api', tabId: 'schema' },
  DataWorkbench: { workspaceId: 'data-api', tabId: 'data' },
  DebugLogBrowser: { workspaceId: 'diagnostics', tabId: 'logs' },
  EventMonitor: { workspaceId: 'diagnostics', tabId: 'events' },
  FieldDependency: { workspaceId: 'dependencies', tabId: 'fields' },
  DependencyExplorer: { workspaceId: 'dependencies', tabId: 'metadata' },
  CustomSettingsCompare: { workspaceId: 'data-compare', tabId: 'custom-settings' },
  CustomMetadataCompare: { workspaceId: 'data-compare', tabId: 'custom-metadata' },
  RecordCompare: { workspaceId: 'data-compare', tabId: 'records' },
  EnvironmentStatus: { workspaceId: 'org-operations', tabId: 'health' },
  OrgLimits: { workspaceId: 'org-operations', tabId: 'limits' },
  DeployStatus: { workspaceId: 'org-operations', tabId: 'deployments' },
  BulkJobMonitor: { workspaceId: 'org-operations', tabId: 'bulk' },
  SetupAuditTrail: { workspaceId: 'audit-history', tabId: 'setup-audit' },
  FieldHistory: { workspaceId: 'audit-history', tabId: 'field-history' },
  GeneratePackageXml: { workspaceId: 'metadata-tools', tabId: 'package-xml' },
  MetadataTypeCompare: { workspaceId: 'metadata-tools', tabId: 'compare-types' },
  PermissionDiff: { workspaceId: 'security-access', tabId: 'permissions' }
});

const WORKSPACE_BY_ID = new Map(WORKBENCH_WORKSPACES.map((workspace) => [workspace.id, workspace]));

export function getWorkspaceById(workspaceId) {
  return WORKSPACE_BY_ID.get(workspaceId) || null;
}
export function getWorkspaceRouteForTool(toolId) {
  if (['Apex', 'LWC', 'Aura', 'VF', 'PermissionSet', 'Profile', 'FlexiPage', 'PackageXml'].includes(toolId)) {
    return LEGACY_TOOL_ROUTES.Comparator;
  }
  return LEGACY_TOOL_ROUTES[toolId] || null;
}

export function getTabById(workspaceId, tabId) {
  const workspace = getWorkspaceById(workspaceId);
  return workspace?.tabs.find((item) => item.id === tabId) || null;
}

export function getCanonicalToolIds() {
  return Object.keys(LEGACY_TOOL_ROUTES);
}

export function getToolIcon(toolId) {
  return TOOL_ICONS[toolId] || 'tool';
}

export function getLegacyHref(toolId) {
  const route = getWorkspaceRouteForTool(toolId);
  if (!route) return '';
  const tabInfo = getTabById(route.workspaceId, route.tabId);
  if (!tabInfo) return '';
  return `?nav=${encodeURIComponent(tabInfo.legacyMode)}&op=${encodeURIComponent(toolId)}`;
}

export function getSearchText(workspace, translate = (key) => key) {
  const labels = [translate(workspace.labelKey), ...workspace.aliases, ...workspace.keywords];
  for (const item of workspace.tabs) {
    labels.push(translate(item.labelKey), item.toolId);
  }
  return labels.join(' ').toLocaleLowerCase();
}
