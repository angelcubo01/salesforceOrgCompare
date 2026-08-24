import { CATEGORY_ICONS, TOOL_ICONS } from './iconRegistry.js';

/**
 * Arquitectura de información exclusiva de UI v2.
 * `workspaceIds` define orden y pertenencia sin acoplar la presentación al DOM.
 */
export const WORKBENCH_CATEGORIES = Object.freeze([
  {
    id: 'home', labelKey: 'workbench.category.home', icon: CATEGORY_ICONS.home,
    direct: true, workspaceIds: Object.freeze([])
  },
  {
    id: 'comparator', labelKey: 'workbench.category.comparator', icon: CATEGORY_ICONS.comparator,
    directWorkspaceId: 'comparator', workspaceIds: Object.freeze(['comparator'])
  },
  {
    id: 'development', labelKey: 'workbench.category.development', icon: CATEGORY_ICONS.development,
    workspaceIds: Object.freeze([
      'apex-quality', 'code-studio', 'anonymous-apex', 'query-explorer',
      'rest-explorer'
    ])
  },
  {
    id: 'analysis', labelKey: 'workbench.category.analysis', icon: CATEGORY_ICONS.analysis,
    workspaceIds: Object.freeze([
      'field-dependency', 'dependencies', 'security-access', 'data-compare',
      'object-describe', 'data-workbench'
    ])
  },
  {
    id: 'monitoring', labelKey: 'workbench.category.monitoring', icon: CATEGORY_ICONS.operations,
    workspaceIds: Object.freeze([
      'diagnostics', 'event-monitor', 'org-environments', 'org-limits', 'deploy-status', 'bulk-job-monitor',
      'setup-audit', 'field-history'
    ])
  },
  {
    id: 'manifests', labelKey: 'workbench.category.manifests', icon: CATEGORY_ICONS.metadata,
    workspaceIds: Object.freeze(['generate-package', 'metadata-type-compare'])
  }
]);

const tab = (id, labelKey, toolId, legacyMode, panelId, orgScope = 'single', risk = 'read') =>
  Object.freeze({ id, labelKey, toolId, legacyMode, panelId, orgScope, risk });

const workspace = ({
  id, categoryId, labelKey, descriptionKey, icon, defaultTabId = 'main',
  aliases = [], keywords = [], tabs
}) => Object.freeze({
  id,
  categoryId,
  labelKey,
  descriptionKey,
  icon,
  defaultTabId,
  aliases: Object.freeze(aliases),
  keywords: Object.freeze(keywords),
  tabs: Object.freeze(tabs)
});

export const WORKBENCH_WORKSPACES = Object.freeze([
  workspace({
    id: 'comparator', categoryId: 'comparator', labelKey: 'workbench.workspace.comparator',
    descriptionKey: 'workbench.workspace.comparatorDescription', icon: 'arrows-diff',
    aliases: ['compare', 'diff'], keywords: ['metadata', 'org'],
    tabs: [tab('main', 'workbench.tab.main', 'Comparator', 'comparator', 'standardComparePanel', 'dual')]
  }),
  workspace({
    id: 'apex-quality', categoryId: 'development', labelKey: 'workbench.workspace.apexQuality',
    descriptionKey: 'workbench.workspace.apexQualityDescription', icon: 'test-pipe', defaultTabId: 'tests',
    aliases: ['apex tests', 'coverage'], keywords: ['tests', 'coverage', 'ejecuciones', 'resultados'],
    tabs: [
      tab('tests', 'workbench.tab.tests', 'ApexTests', 'development', 'apexTestsPanel'),
      tab('runs', 'workbench.tab.runs', 'ApexTests', 'development', 'apexTestsPanel'),
      tab('results', 'workbench.tab.results', 'ApexTests', 'development', 'apexTestsPanel'),
      tab('coverage', 'workbench.tab.coverage', 'ApexCoverageCompare', 'development', 'apexCoverageComparePanel', 'dual')
    ]
  }),
  workspace({
    id: 'code-studio', categoryId: 'development', labelKey: 'workbench.workspace.codeStudio',
    descriptionKey: 'workbench.workspace.codeStudioDescription', icon: 'code', defaultTabId: 'apex-vf',
    aliases: ['quick edit', 'editor'], keywords: ['apex', 'visualforce', 'lwc', 'aura'],
    tabs: [
      tab('apex-vf', 'workbench.tab.apexVf', 'QuickEdit', 'development', 'quickEditPanel', 'single', 'write'),
      tab('lwc-aura', 'workbench.tab.lwcAura', 'LightningQuickEdit', 'development', 'lightningQuickEditPanel', 'single', 'write')
    ]
  }),
  workspace({
    id: 'anonymous-apex', categoryId: 'development', labelKey: 'workbench.workspace.anonymousApex',
    descriptionKey: 'workbench.workspace.anonymousApexDescription', icon: 'terminal-2',
    aliases: ['execute anonymous'], keywords: ['apex', 'script', 'technical'],
    tabs: [tab('main', 'workbench.tab.anonymousApex', 'AnonymousApex', 'development', 'anonymousApexPanel', 'single', 'destructive')]
  }),
  workspace({
    id: 'query-explorer', categoryId: 'development', labelKey: 'workbench.workspace.queryExplorer',
    descriptionKey: 'workbench.workspace.queryExplorerDescription', icon: 'database-search',
    aliases: ['query', 'soql', 'sosl'], keywords: ['database', 'consulta'],
    tabs: [tab('main', 'workbench.tab.query', 'QueryExplorer', 'development', 'queryExplorerPanel')]
  }),
  workspace({
    id: 'rest-explorer', categoryId: 'development', labelKey: 'workbench.workspace.restExplorer',
    descriptionKey: 'workbench.workspace.restExplorerDescription', icon: 'api',
    aliases: ['api', 'rest'], keywords: ['endpoint', 'request'],
    tabs: [tab('main', 'workbench.tab.rest', 'RestExplorer', 'development', 'restExplorerPanel', 'single', 'write')]
  }),
  workspace({
    id: 'diagnostics', categoryId: 'monitoring', labelKey: 'workbench.workspace.diagnostics',
    descriptionKey: 'workbench.workspace.diagnosticsDescription', icon: 'file-search', defaultTabId: 'logs',
    aliases: ['debug'], keywords: ['logs', 'trace flags', 'trazas'],
    tabs: [
      tab('logs', 'workbench.tab.logs', 'DebugLogBrowser', 'development', 'debugLogBrowserPanel'),
      tab('trace-flags', 'workbench.tab.traceFlags', 'DebugLogBrowser', 'development', 'debugLogBrowserPanel', 'single', 'write')
    ]
  }),
  workspace({
    id: 'event-monitor', categoryId: 'monitoring', labelKey: 'workbench.workspace.eventMonitor',
    descriptionKey: 'workbench.workspace.eventMonitorDescription', icon: 'activity',
    aliases: ['events'], keywords: ['streaming', 'platform event'],
    tabs: [tab('main', 'workbench.tab.events', 'EventMonitor', 'development', 'eventMonitorPanel')]
  }),
  workspace({
    id: 'field-dependency', categoryId: 'analysis', labelKey: 'workbench.workspace.fieldDependency',
    descriptionKey: 'workbench.workspace.fieldDependencyDescription', icon: 'list-tree',
    aliases: ['picklist'], keywords: ['fields', 'dependent picklist'],
    tabs: [tab('main', 'workbench.tab.fields', 'FieldDependency', 'analysis', 'fieldDependencyPanel', 'dual')]
  }),
  workspace({
    id: 'dependencies', categoryId: 'analysis', labelKey: 'workbench.workspace.dependencies',
    descriptionKey: 'workbench.workspace.dependenciesDescription', icon: 'hierarchy-3', defaultTabId: 'metadata',
    aliases: ['dependencies'], keywords: ['metadata', 'graph', 'grafo'],
    tabs: [
      tab('metadata', 'workbench.tab.metadata', 'DependencyExplorer', 'analysis', 'dependencyExplorerPanel'),
      tab('graph', 'workbench.tab.graph', 'DependencyExplorer', 'analysis', 'dependencyExplorerPanel')
    ]
  }),
  workspace({
    id: 'security-access', categoryId: 'analysis', labelKey: 'workbench.workspace.securityAccess',
    descriptionKey: 'workbench.workspace.securityAccessDescription', icon: 'shield-lock',
    aliases: ['security'], keywords: ['permissions', 'profiles', 'permission sets', 'access'],
    tabs: [tab('main', 'workbench.tab.permissions', 'PermissionDiff', 'analysis', 'permissionDiffPanel', 'dual')]
  }),
  workspace({
    id: 'data-compare', categoryId: 'analysis', labelKey: 'workbench.workspace.dataCompare',
    descriptionKey: 'workbench.workspace.dataCompareDescription', icon: 'table-options', defaultTabId: 'custom-settings',
    aliases: ['record compare'], keywords: ['settings', 'custom metadata', 'records'],
    tabs: [
      tab('custom-settings', 'workbench.tab.customSettings', 'CustomSettingsCompare', 'analysis', 'customSettingsComparePanel', 'dual'),
      tab('custom-metadata', 'workbench.tab.customMetadata', 'CustomMetadataCompare', 'analysis', 'customMetadataComparePanel', 'dual'),
      tab('records', 'workbench.tab.records', 'RecordCompare', 'analysis', 'recordComparePanel', 'dual')
    ]
  }),
  workspace({
    id: 'object-describe', categoryId: 'analysis', labelKey: 'workbench.workspace.objectDescribe',
    descriptionKey: 'workbench.workspace.objectDescribeDescription', icon: 'schema',
    aliases: ['schema', 'describe'], keywords: ['object', 'fields'],
    tabs: [tab('main', 'workbench.tab.schema', 'ObjectDescribe', 'analysis', 'objectDescribePanel')]
  }),
  workspace({
    id: 'data-workbench', categoryId: 'analysis', labelKey: 'workbench.workspace.dataWorkbench',
    descriptionKey: 'workbench.workspace.dataWorkbenchDescription', icon: 'database-cog',
    aliases: ['record editor', 'import'], keywords: ['data', 'csv', 'dml'],
    tabs: [tab('main', 'workbench.tab.data', 'DataWorkbench', 'analysis', 'dataWorkbenchPanel', 'single', 'write')]
  }),
  workspace({
    id: 'org-environments', categoryId: 'monitoring', labelKey: 'workbench.workspace.orgEnvironments',
    descriptionKey: 'workbench.workspace.orgEnvironmentsDescription', icon: 'heartbeat',
    aliases: ['org status'], keywords: ['health', 'environment'],
    tabs: [tab('main', 'workbench.tab.health', 'EnvironmentStatus', 'monitoring', 'environmentStatusPanel')]
  }),
  workspace({
    id: 'org-limits', categoryId: 'monitoring', labelKey: 'workbench.workspace.orgLimits',
    descriptionKey: 'workbench.workspace.orgLimitsDescription', icon: 'gauge',
    aliases: ['limits'], keywords: ['quota', 'usage'],
    tabs: [tab('main', 'workbench.tab.limits', 'OrgLimits', 'monitoring', 'orgLimitsPanel')]
  }),
  workspace({
    id: 'deploy-status', categoryId: 'monitoring', labelKey: 'workbench.workspace.deployStatus',
    descriptionKey: 'workbench.workspace.deployStatusDescription', icon: 'rocket',
    aliases: ['deployments'], keywords: ['deploy', 'deployment'],
    tabs: [tab('main', 'workbench.tab.deployments', 'DeployStatus', 'monitoring', 'deployStatusPanel')]
  }),
  workspace({
    id: 'bulk-job-monitor', categoryId: 'monitoring', labelKey: 'workbench.workspace.bulkJobMonitor',
    descriptionKey: 'workbench.workspace.bulkJobMonitorDescription', icon: 'stack-forward',
    aliases: ['bulk'], keywords: ['jobs', 'bulk api'],
    tabs: [tab('main', 'workbench.tab.bulk', 'BulkJobMonitor', 'monitoring', 'bulkJobMonitorPanel', 'single', 'write')]
  }),
  workspace({
    id: 'setup-audit', categoryId: 'monitoring', labelKey: 'workbench.workspace.setupAudit',
    descriptionKey: 'workbench.workspace.setupAuditDescription', icon: 'history',
    aliases: ['audit'], keywords: ['setup audit trail', 'changes'],
    tabs: [tab('main', 'workbench.tab.setupAudit', 'SetupAuditTrail', 'monitoring', 'setupAuditTrailPanel')]
  }),
  workspace({
    id: 'field-history', categoryId: 'monitoring', labelKey: 'workbench.workspace.fieldHistory',
    descriptionKey: 'workbench.workspace.fieldHistoryDescription', icon: 'timeline-event',
    aliases: ['history'], keywords: ['records', 'fields'],
    tabs: [tab('main', 'workbench.tab.fieldHistory', 'FieldHistory', 'monitoring', 'fieldHistoryPanel')]
  }),
  workspace({
    id: 'generate-package', categoryId: 'manifests', labelKey: 'workbench.workspace.generatePackage',
    descriptionKey: 'workbench.workspace.generatePackageDescription', icon: 'file-code-2',
    aliases: ['manifest'], keywords: ['package xml', 'metadata'],
    tabs: [tab('main', 'workbench.tab.packageXml', 'GeneratePackageXml', 'manifests', 'generatePackageXmlPanel')]
  }),
  workspace({
    id: 'metadata-type-compare', categoryId: 'manifests', labelKey: 'workbench.workspace.metadataTypeCompare',
    descriptionKey: 'workbench.workspace.metadataTypeCompareDescription', icon: 'package-export',
    aliases: ['metadata types'], keywords: ['compare', 'manifest'],
    tabs: [tab('main', 'workbench.tab.compareTypes', 'MetadataTypeCompare', 'manifests', 'metadataTypeComparePanel', 'dual')]
  })
]);

export const LEGACY_TOOL_ROUTES = Object.freeze({
  Comparator: { workspaceId: 'comparator', tabId: 'main' },
  ApexTests: { workspaceId: 'apex-quality', tabId: 'runs' },
  ApexCoverageCompare: { workspaceId: 'apex-quality', tabId: 'coverage' },
  QuickEdit: { workspaceId: 'code-studio', tabId: 'apex-vf' },
  LightningQuickEdit: { workspaceId: 'code-studio', tabId: 'lwc-aura' },
  AnonymousApex: { workspaceId: 'anonymous-apex', tabId: 'main' },
  QueryExplorer: { workspaceId: 'query-explorer', tabId: 'main' },
  RestExplorer: { workspaceId: 'rest-explorer', tabId: 'main' },
  ObjectDescribe: { workspaceId: 'object-describe', tabId: 'main' },
  DataWorkbench: { workspaceId: 'data-workbench', tabId: 'main' },
  DebugLogBrowser: { workspaceId: 'diagnostics', tabId: 'logs' },
  EventMonitor: { workspaceId: 'event-monitor', tabId: 'main' },
  FieldDependency: { workspaceId: 'field-dependency', tabId: 'main' },
  DependencyExplorer: { workspaceId: 'dependencies', tabId: 'metadata' },
  CustomSettingsCompare: { workspaceId: 'data-compare', tabId: 'custom-settings' },
  CustomMetadataCompare: { workspaceId: 'data-compare', tabId: 'custom-metadata' },
  RecordCompare: { workspaceId: 'data-compare', tabId: 'records' },
  EnvironmentStatus: { workspaceId: 'org-environments', tabId: 'main' },
  OrgLimits: { workspaceId: 'org-limits', tabId: 'main' },
  DeployStatus: { workspaceId: 'deploy-status', tabId: 'main' },
  BulkJobMonitor: { workspaceId: 'bulk-job-monitor', tabId: 'main' },
  SetupAuditTrail: { workspaceId: 'setup-audit', tabId: 'main' },
  FieldHistory: { workspaceId: 'field-history', tabId: 'main' },
  GeneratePackageXml: { workspaceId: 'generate-package', tabId: 'main' },
  MetadataTypeCompare: { workspaceId: 'metadata-type-compare', tabId: 'main' },
  PermissionDiff: { workspaceId: 'security-access', tabId: 'main' }
});

const CATEGORY_BY_ID = new Map(WORKBENCH_CATEGORIES.map((category) => [category.id, category]));
const WORKSPACE_BY_ID = new Map(WORKBENCH_WORKSPACES.map((item) => [item.id, item]));

export function getCategoryById(categoryId) {
  return CATEGORY_BY_ID.get(categoryId) || null;
}

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
  const item = getWorkspaceById(workspaceId);
  return item?.tabs.find((candidate) => candidate.id === tabId) || null;
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

export function getSearchText(item, translate = (key) => key) {
  const labels = [translate(item.labelKey), translate(item.descriptionKey), ...item.aliases, ...item.keywords];
  for (const candidate of item.tabs) {
    labels.push(translate(candidate.labelKey), candidate.toolId);
  }
  return labels.join(' ').toLocaleLowerCase();
}
