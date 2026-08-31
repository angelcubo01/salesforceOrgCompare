import { ACTION_ICONS, CATEGORY_ICONS, TOOL_ICONS } from './iconRegistry.js';

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
    id: 'favorites', labelKey: 'workbench.category.favorites', icon: CATEGORY_ICONS.favorites,
    direct: false, favorites: true, workspaceIds: Object.freeze([])
  },
  {
    id: 'comparator', labelKey: 'workbench.category.comparator', icon: CATEGORY_ICONS.comparator,
    directWorkspaceId: 'comparator', workspaceIds: Object.freeze(['comparator'])
  },
  {
    id: 'development', labelKey: 'workbench.category.development', icon: CATEGORY_ICONS.development,
    workspaceIds: Object.freeze([
      'apex-quality', 'apex-coverage', 'code-studio', 'anonymous-apex', 'query-explorer',
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

const action = ({
  id, labelKey, icon, targetId, variant = 'secondary', risk = 'read', priority = 50,
  allowOverflow = true, visibleWhen = 'always', disabledReasonKey = ''
}) => Object.freeze({
  id,
  labelKey,
  icon,
  variant,
  risk,
  priority,
  allowOverflow,
  visibleWhen,
  disabledReasonKey,
  state: Object.freeze({ sourceId: targetId, disabled: 'source', loading: 'source' }),
  handler: Object.freeze({ type: 'dispatch-click', targetId })
});

/**
 * Acciones generales de UI v2. Las etiquetas y los iconos son declarativos y no
 * se obtienen del DOM legacy. `handler.targetId` reutiliza el handler de negocio
 * ya registrado por cada herramienta; la presentación permanece desacoplada.
 */
export const WORKBENCH_HEADER_ACTIONS = Object.freeze({
  apexRun: action({ id: 'apex-run', labelKey: 'apexTests.runButton', icon: ACTION_ICONS.run, targetId: 'apexTestsRunBtn', variant: 'primary', risk: 'write', priority: 1, allowOverflow: false, visibleWhen: 'source-context' }),
  apexSelectRun: action({ id: 'apex-select-run', labelKey: 'apexTests.openRunner', icon: ACTION_ICONS.run, targetId: 'apexTestsOpenRunnerBtn', variant: 'primary', priority: 1, allowOverflow: false, visibleWhen: 'source-context' }),
  apexClearRuns: action({ id: 'apex-clear-runs', labelKey: 'apexTests.runsClearHistory', icon: ACTION_ICONS.delete, targetId: 'apexTestsClearRunsBtn', variant: 'destructive', risk: 'destructive', priority: 90, visibleWhen: 'source-context' }),
  apexProfiles: action({ id: 'apex-profiles', labelKey: 'apexTests.profilesBtn', icon: 'file-code', targetId: 'apexTestsProfilesBtn', priority: 70, visibleWhen: 'source-context' }),
  apexRunnerSettings: action({ id: 'apex-runner-settings', labelKey: 'apexTests.runnerSettingsBtn', icon: ACTION_ICONS.settings, targetId: 'apexTestsRunnerSettingsBtn', priority: 80, visibleWhen: 'source-context' }),
  coverageRefresh: action({ id: 'coverage-refresh', labelKey: 'coverageCompare.refresh', icon: ACTION_ICONS.refresh, targetId: 'apexCoverageCompareRefreshBtn', variant: 'primary', priority: 1, allowOverflow: false }),
  quickEditSave: action({ id: 'quick-edit-save', labelKey: 'quickEdit.saveLocal', icon: ACTION_ICONS.save, targetId: 'quickEditSaveBtn', priority: 20 }),
  quickEditRevert: action({ id: 'quick-edit-revert', labelKey: 'quickEdit.revertLocal', icon: ACTION_ICONS.refresh, targetId: 'quickEditRevertBtn', priority: 30 }),
  quickEditRetrieve: action({ id: 'quick-edit-retrieve', labelKey: 'quickEdit.retrieveFromOrg', icon: ACTION_ICONS.download, targetId: 'quickEditRetrieveBtn', priority: 40 }),
  quickEditValidate: action({ id: 'quick-edit-validate', labelKey: 'quickEdit.validate', icon: 'circle-check', targetId: 'quickEditValidateBtn', priority: 50 }),
  quickEditDeploy: action({ id: 'quick-edit-deploy', labelKey: 'quickEdit.deploy', icon: ACTION_ICONS.export, targetId: 'quickEditDeployBtn', variant: 'primary', risk: 'write', priority: 1, allowOverflow: false }),
  quickEditClear: action({ id: 'quick-edit-clear', labelKey: 'codeEditor.clearAll', icon: ACTION_ICONS.delete, targetId: 'quickEditClearBtn', variant: 'destructive', risk: 'destructive', priority: 90 }),
  lightningQuickEditSave: action({ id: 'lightning-quick-edit-save', labelKey: 'quickEdit.saveLocal', icon: ACTION_ICONS.save, targetId: 'lightningQuickEditSaveBtn', priority: 20 }),
  lightningQuickEditRevert: action({ id: 'lightning-quick-edit-revert', labelKey: 'quickEdit.revertLocal', icon: ACTION_ICONS.refresh, targetId: 'lightningQuickEditRevertBtn', priority: 30 }),
  lightningQuickEditRetrieve: action({ id: 'lightning-quick-edit-retrieve', labelKey: 'quickEdit.retrieveFromOrg', icon: ACTION_ICONS.download, targetId: 'lightningQuickEditRetrieveBtn', priority: 40 }),
  lightningQuickEditValidate: action({ id: 'lightning-quick-edit-validate', labelKey: 'quickEdit.validate', icon: 'circle-check', targetId: 'lightningQuickEditValidateBtn', priority: 50 }),
  lightningQuickEditDeploy: action({ id: 'lightning-quick-edit-deploy', labelKey: 'quickEdit.deploy', icon: ACTION_ICONS.export, targetId: 'lightningQuickEditDeployBtn', variant: 'primary', risk: 'write', priority: 1, allowOverflow: false }),
  lightningQuickEditClear: action({ id: 'lightning-quick-edit-clear', labelKey: 'codeEditor.clearAll', icon: ACTION_ICONS.delete, targetId: 'lightningQuickEditClearBtn', variant: 'destructive', risk: 'destructive', priority: 90 }),
  anonymousRun: action({ id: 'anonymous-run', labelKey: 'anonymousApex.run', icon: ACTION_ICONS.run, targetId: 'anonymousApexRunBtn', variant: 'primary', risk: 'destructive', priority: 1, allowOverflow: false }),
  anonymousScripts: action({ id: 'anonymous-scripts', labelKey: 'anonymousApex.savedScripts', icon: 'file-code', targetId: 'anonymousApexOpenScriptsModalBtn', priority: 40 }),
  anonymousSave: action({ id: 'anonymous-save', labelKey: 'anonymousApex.saveCurrentScript', icon: ACTION_ICONS.save, targetId: 'anonymousApexQuickSaveBtn', priority: 50 }),
  queryRun: action({ id: 'query-run', labelKey: 'queryExplorer.run', icon: ACTION_ICONS.run, targetId: 'queryExplorerRunBtn', variant: 'primary', priority: 1, allowOverflow: false }),
  querySaved: action({ id: 'query-saved', labelKey: 'queryExplorer.openSavedQueries', icon: 'database-search', targetId: 'queryExplorerOpenSavedModalBtn', priority: 40 }),
  queryCopyLink: action({ id: 'query-copy-link', labelKey: 'queryExplorer.copyLink', icon: ACTION_ICONS.copy, targetId: 'queryExplorerCopyLinkBtn', priority: 60 }),
  querySave: action({ id: 'query-save', labelKey: 'queryExplorer.saveCurrentQuery', icon: ACTION_ICONS.save, targetId: 'queryExplorerQuickSaveBtn', priority: 50 }),
  restSend: action({ id: 'rest-send', labelKey: 'restExplorer.send', icon: ACTION_ICONS.forward, targetId: 'restExplorerSendBtn', variant: 'primary', risk: 'write', priority: 1, allowOverflow: false }),
  fieldDependenciesLoad: action({ id: 'field-dependencies-load', labelKey: 'fieldDep.getDependencies', icon: ACTION_ICONS.search, targetId: 'fieldDepRetrieveBtn', variant: 'primary', priority: 1, allowOverflow: false }),
  dependenciesAnalyze: action({ id: 'dependencies-analyze', labelKey: 'depExplorer.analyze', icon: ACTION_ICONS.search, targetId: 'depExplorerAnalyzeBtn', variant: 'primary', priority: 1, allowOverflow: false }),
  customSettingsRefresh: action({ id: 'custom-settings-refresh', labelKey: 'customSettingsCompare.refresh', icon: ACTION_ICONS.refresh, targetId: 'customSettingsCompareRefreshBtn', variant: 'primary', priority: 1, allowOverflow: false }),
  customMetadataRefresh: action({ id: 'custom-metadata-refresh', labelKey: 'customMetadataCompare.refresh', icon: ACTION_ICONS.refresh, targetId: 'customMetadataCompareRefreshBtn', variant: 'primary', priority: 1, allowOverflow: false }),
  recordsCompare: action({ id: 'records-compare', labelKey: 'recordCompare.compare', icon: 'arrows-diff', targetId: 'recordCompareBtn', variant: 'primary', priority: 1, allowOverflow: false }),
  objectDescribe: action({ id: 'object-describe', labelKey: 'objectDescribe.describe', icon: 'schema', targetId: 'objectDescribeDescribeBtn', variant: 'primary', priority: 1, allowOverflow: false }),
  dataLoadRecord: action({ id: 'data-load-record', labelKey: 'dataWorkbench.loadRecord', icon: ACTION_ICONS.download, targetId: 'dataWorkbenchLoadRecordBtn', variant: 'primary', priority: 1, allowOverflow: false, visibleWhen: 'source-context' }),
  dataCreateRecord: action({ id: 'data-create-record', labelKey: 'dataWorkbench.create', icon: 'database-cog', targetId: 'dataWorkbenchCreateBtn', risk: 'write', priority: 50, visibleWhen: 'source-context' }),
  dataImportRun: action({ id: 'data-import-run', labelKey: 'dataImport.run', icon: ACTION_ICONS.run, targetId: 'dataWorkbenchImportRunBtn', variant: 'primary', risk: 'write', priority: 2, allowOverflow: false, visibleWhen: 'source-context' }),
  eventLoadChannels: action({ id: 'event-load-channels', labelKey: 'eventMonitor.loadChannels', icon: ACTION_ICONS.refresh, targetId: 'eventMonitorLoadChannelsBtn', variant: 'primary', priority: 1, allowOverflow: false }),
  environmentRefresh: action({ id: 'environment-refresh', labelKey: 'envStatus.refresh', icon: ACTION_ICONS.refresh, targetId: 'environmentStatusRefreshBtn', variant: 'primary', priority: 1, allowOverflow: false }),
  limitsRefresh: action({ id: 'limits-refresh', labelKey: 'orgLimits.refresh', icon: ACTION_ICONS.refresh, targetId: 'orgLimitsRefreshBtn', variant: 'primary', priority: 1, allowOverflow: false }),
  deployRefresh: action({ id: 'deploy-refresh', labelKey: 'deployStatus.refresh', icon: ACTION_ICONS.refresh, targetId: 'deployStatusRefreshBtn', variant: 'primary', priority: 1, allowOverflow: false }),
  bulkLoad: action({ id: 'bulk-load', labelKey: 'bulkJob.load', icon: ACTION_ICONS.download, targetId: 'bulkJobLoadBtn', variant: 'primary', priority: 1, allowOverflow: false }),
  logsRefresh: action({ id: 'logs-refresh', labelKey: 'debugLogs.refresh', icon: ACTION_ICONS.refresh, targetId: 'debugLogBrowserRefreshBtn', variant: 'primary', priority: 1, allowOverflow: false }),
  logsViewTraces: action({ id: 'logs-view-traces', labelKey: 'debugLogs.viewTraces', icon: 'timeline-event', targetId: 'debugLogBrowserViewTracesBtn', priority: 30 }),
  logsAnalyzeLocal: action({ id: 'logs-analyze-local', labelKey: 'debugLogs.analyzeLocal', icon: 'file-search', targetId: 'debugLogBrowserAnalyzeLocalBtn', priority: 40 }),
  logsDeleteAll: action({ id: 'logs-delete-all', labelKey: 'debugLogs.deleteAll', icon: ACTION_ICONS.delete, targetId: 'debugLogBrowserDeleteAllBtn', variant: 'destructive', risk: 'destructive', priority: 90 }),
  packageDownload: action({ id: 'package-download', labelKey: 'genPkg.download', icon: ACTION_ICONS.download, targetId: 'generatePkgDownloadXml', variant: 'primary', priority: 1, allowOverflow: false }),
  packageRetrieve: action({ id: 'package-retrieve', labelKey: 'genPkg.retrieveBtn', icon: 'package-export', targetId: 'generatePkgRetrieveBtn', priority: 30 }),
  metadataCompare: action({ id: 'metadata-compare', labelKey: 'metadataTypeCompare.compareBtn', icon: 'arrows-diff', targetId: 'metadataTypeCompareRunBtn', variant: 'primary', priority: 1, allowOverflow: false })
});

const tab = (id, labelKey, toolId, legacyMode, panelId, orgScope = 'single', risk = 'read', actions = []) =>
  Object.freeze({ id, labelKey, toolId, legacyMode, panelId, orgScope, risk, actions: Object.freeze(actions) });

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
    descriptionKey: 'workbench.workspace.apexQualityDescription', icon: 'test-pipe',
    aliases: ['apex tests'], keywords: ['tests', 'ejecuciones', 'resultados'],
    tabs: [tab('main', 'workbench.tab.tests', 'ApexTests', 'development', 'apexTestsPanel', 'single', 'write', [
      WORKBENCH_HEADER_ACTIONS.apexRun,
      WORKBENCH_HEADER_ACTIONS.apexSelectRun,
      WORKBENCH_HEADER_ACTIONS.apexProfiles,
      WORKBENCH_HEADER_ACTIONS.apexRunnerSettings,
      WORKBENCH_HEADER_ACTIONS.apexClearRuns
    ])]
  }),
  workspace({
    id: 'apex-coverage', categoryId: 'development', labelKey: 'workbench.workspace.apexCoverage',
    descriptionKey: 'workbench.workspace.apexCoverageDescription', icon: 'chart-donut',
    aliases: ['coverage'], keywords: ['apex', 'coverage', 'cobertura'],
    tabs: [tab('main', 'workbench.tab.coverage', 'ApexCoverageCompare', 'development', 'apexCoverageComparePanel', 'dual', 'read', [WORKBENCH_HEADER_ACTIONS.coverageRefresh])]
  }),
  workspace({
    id: 'code-studio', categoryId: 'development', labelKey: 'workbench.workspace.codeStudio',
    descriptionKey: 'workbench.workspace.codeStudioDescription', icon: 'code', defaultTabId: 'apex-vf',
    aliases: ['quick edit', 'editor'], keywords: ['apex', 'visualforce', 'lwc', 'aura'],
    tabs: [
      tab('apex-vf', 'workbench.tab.apexVf', 'QuickEdit', 'development', 'quickEditPanel', 'single', 'write', [
        WORKBENCH_HEADER_ACTIONS.quickEditDeploy,
        WORKBENCH_HEADER_ACTIONS.quickEditSave,
        WORKBENCH_HEADER_ACTIONS.quickEditRevert,
        WORKBENCH_HEADER_ACTIONS.quickEditRetrieve,
        WORKBENCH_HEADER_ACTIONS.quickEditValidate,
        WORKBENCH_HEADER_ACTIONS.quickEditClear
      ]),
      tab('lwc-aura', 'workbench.tab.lwcAura', 'LightningQuickEdit', 'development', 'lightningQuickEditPanel', 'single', 'write', [
        WORKBENCH_HEADER_ACTIONS.lightningQuickEditDeploy,
        WORKBENCH_HEADER_ACTIONS.lightningQuickEditSave,
        WORKBENCH_HEADER_ACTIONS.lightningQuickEditRevert,
        WORKBENCH_HEADER_ACTIONS.lightningQuickEditRetrieve,
        WORKBENCH_HEADER_ACTIONS.lightningQuickEditValidate,
        WORKBENCH_HEADER_ACTIONS.lightningQuickEditClear
      ])
    ]
  }),
  workspace({
    id: 'anonymous-apex', categoryId: 'development', labelKey: 'workbench.workspace.anonymousApex',
    descriptionKey: 'workbench.workspace.anonymousApexDescription', icon: 'terminal-2',
    aliases: ['execute anonymous'], keywords: ['apex', 'script', 'technical'],
    tabs: [tab('main', 'workbench.tab.anonymousApex', 'AnonymousApex', 'development', 'anonymousApexPanel', 'single', 'destructive', [WORKBENCH_HEADER_ACTIONS.anonymousRun, WORKBENCH_HEADER_ACTIONS.anonymousScripts, WORKBENCH_HEADER_ACTIONS.anonymousSave])]
  }),
  workspace({
    id: 'query-explorer', categoryId: 'development', labelKey: 'workbench.workspace.queryExplorer',
    descriptionKey: 'workbench.workspace.queryExplorerDescription', icon: 'database-search',
    aliases: ['query', 'soql', 'sosl'], keywords: ['database', 'consulta'],
    tabs: [tab('main', 'workbench.tab.query', 'QueryExplorer', 'development', 'queryExplorerPanel', 'single', 'read', [WORKBENCH_HEADER_ACTIONS.queryRun, WORKBENCH_HEADER_ACTIONS.querySaved, WORKBENCH_HEADER_ACTIONS.querySave, WORKBENCH_HEADER_ACTIONS.queryCopyLink])]
  }),
  workspace({
    id: 'rest-explorer', categoryId: 'development', labelKey: 'workbench.workspace.restExplorer',
    descriptionKey: 'workbench.workspace.restExplorerDescription', icon: 'api',
    aliases: ['api', 'rest'], keywords: ['endpoint', 'request'],
    tabs: [tab('main', 'workbench.tab.rest', 'RestExplorer', 'development', 'restExplorerPanel', 'single', 'write', [WORKBENCH_HEADER_ACTIONS.restSend])]
  }),
  workspace({
    id: 'diagnostics', categoryId: 'monitoring', labelKey: 'workbench.workspace.diagnostics',
    descriptionKey: 'workbench.workspace.diagnosticsDescription', icon: 'file-search',
    aliases: ['debug'], keywords: ['logs', 'trace flags', 'trazas'],
    tabs: [tab('main', 'workbench.tab.logs', 'DebugLogBrowser', 'development', 'debugLogBrowserPanel', 'single', 'write', [
      WORKBENCH_HEADER_ACTIONS.logsRefresh,
      WORKBENCH_HEADER_ACTIONS.logsViewTraces,
      WORKBENCH_HEADER_ACTIONS.logsAnalyzeLocal,
      WORKBENCH_HEADER_ACTIONS.logsDeleteAll
    ])]
  }),
  workspace({
    id: 'event-monitor', categoryId: 'monitoring', labelKey: 'workbench.workspace.eventMonitor',
    descriptionKey: 'workbench.workspace.eventMonitorDescription', icon: 'activity',
    aliases: ['events'], keywords: ['streaming', 'platform event'],
    tabs: [tab('main', 'workbench.tab.events', 'EventMonitor', 'development', 'eventMonitorPanel', 'single', 'read', [WORKBENCH_HEADER_ACTIONS.eventLoadChannels])]
  }),
  workspace({
    id: 'field-dependency', categoryId: 'analysis', labelKey: 'workbench.workspace.fieldDependency',
    descriptionKey: 'workbench.workspace.fieldDependencyDescription', icon: 'list-tree',
    aliases: ['picklist'], keywords: ['fields', 'dependent picklist'],
    tabs: [tab('main', 'workbench.tab.fields', 'FieldDependency', 'analysis', 'fieldDependencyPanel', 'dual', 'read', [WORKBENCH_HEADER_ACTIONS.fieldDependenciesLoad])]
  }),
  workspace({
    id: 'dependencies', categoryId: 'analysis', labelKey: 'workbench.workspace.dependencies',
    descriptionKey: 'workbench.workspace.dependenciesDescription', icon: 'hierarchy-3',
    aliases: ['dependencies'], keywords: ['metadata', 'dependencias'],
    tabs: [tab('main', 'workbench.tab.metadata', 'DependencyExplorer', 'analysis', 'dependencyExplorerPanel', 'single', 'read', [WORKBENCH_HEADER_ACTIONS.dependenciesAnalyze])]
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
      tab('custom-settings', 'workbench.tab.customSettings', 'CustomSettingsCompare', 'analysis', 'customSettingsComparePanel', 'dual', 'read', [WORKBENCH_HEADER_ACTIONS.customSettingsRefresh]),
      tab('custom-metadata', 'workbench.tab.customMetadata', 'CustomMetadataCompare', 'analysis', 'customMetadataComparePanel', 'dual', 'read', [WORKBENCH_HEADER_ACTIONS.customMetadataRefresh]),
      tab('records', 'workbench.tab.records', 'RecordCompare', 'analysis', 'recordComparePanel', 'dual', 'read', [WORKBENCH_HEADER_ACTIONS.recordsCompare])
    ]
  }),
  workspace({
    id: 'object-describe', categoryId: 'analysis', labelKey: 'workbench.workspace.objectDescribe',
    descriptionKey: 'workbench.workspace.objectDescribeDescription', icon: 'schema',
    aliases: ['schema', 'describe'], keywords: ['object', 'fields'],
    tabs: [tab('main', 'workbench.tab.schema', 'ObjectDescribe', 'analysis', 'objectDescribePanel', 'single', 'read', [WORKBENCH_HEADER_ACTIONS.objectDescribe])]
  }),
  workspace({
    id: 'data-workbench', categoryId: 'analysis', labelKey: 'workbench.workspace.dataWorkbench',
    descriptionKey: 'workbench.workspace.dataWorkbenchDescription', icon: 'database-cog', defaultTabId: 'record-editor',
    aliases: ['record editor', 'import'], keywords: ['data', 'csv', 'dml'],
    tabs: [
      tab('record-editor', 'dataWorkbench.tabRecordEditor', 'DataWorkbench', 'analysis', 'dataWorkbenchPanel', 'single', 'write', [
        WORKBENCH_HEADER_ACTIONS.dataLoadRecord,
        WORKBENCH_HEADER_ACTIONS.dataCreateRecord
      ]),
      tab('bulk-import', 'dataWorkbench.tabImport', 'DataWorkbench', 'analysis', 'dataWorkbenchPanel', 'single', 'write', [
        WORKBENCH_HEADER_ACTIONS.dataImportRun
      ])
    ]
  }),
  workspace({
    id: 'org-environments', categoryId: 'monitoring', labelKey: 'workbench.workspace.orgEnvironments',
    descriptionKey: 'workbench.workspace.orgEnvironmentsDescription', icon: 'heartbeat',
    aliases: ['org status'], keywords: ['health', 'environment'],
    tabs: [tab('main', 'workbench.tab.health', 'EnvironmentStatus', 'monitoring', 'environmentStatusPanel', 'single', 'read', [WORKBENCH_HEADER_ACTIONS.environmentRefresh])]
  }),
  workspace({
    id: 'org-limits', categoryId: 'monitoring', labelKey: 'workbench.workspace.orgLimits',
    descriptionKey: 'workbench.workspace.orgLimitsDescription', icon: 'gauge',
    aliases: ['limits'], keywords: ['quota', 'usage'],
    tabs: [tab('main', 'workbench.tab.limits', 'OrgLimits', 'monitoring', 'orgLimitsPanel', 'single', 'read', [WORKBENCH_HEADER_ACTIONS.limitsRefresh])]
  }),
  workspace({
    id: 'deploy-status', categoryId: 'monitoring', labelKey: 'workbench.workspace.deployStatus',
    descriptionKey: 'workbench.workspace.deployStatusDescription', icon: 'rocket',
    aliases: ['deployments'], keywords: ['deploy', 'deployment'],
    tabs: [tab('main', 'workbench.tab.deployments', 'DeployStatus', 'monitoring', 'deployStatusPanel', 'single', 'read', [WORKBENCH_HEADER_ACTIONS.deployRefresh])]
  }),
  workspace({
    id: 'bulk-job-monitor', categoryId: 'monitoring', labelKey: 'workbench.workspace.bulkJobMonitor',
    descriptionKey: 'workbench.workspace.bulkJobMonitorDescription', icon: 'stack-forward',
    aliases: ['bulk'], keywords: ['jobs', 'bulk api'],
    tabs: [tab('main', 'workbench.tab.bulk', 'BulkJobMonitor', 'monitoring', 'bulkJobMonitorPanel', 'single', 'write', [WORKBENCH_HEADER_ACTIONS.bulkLoad])]
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
    tabs: [tab('main', 'workbench.tab.packageXml', 'GeneratePackageXml', 'manifests', 'generatePackageXmlPanel', 'single', 'read', [WORKBENCH_HEADER_ACTIONS.packageDownload, WORKBENCH_HEADER_ACTIONS.packageRetrieve])]
  }),
  workspace({
    id: 'metadata-type-compare', categoryId: 'manifests', labelKey: 'workbench.workspace.metadataTypeCompare',
    descriptionKey: 'workbench.workspace.metadataTypeCompareDescription', icon: 'package-export',
    aliases: ['metadata types'], keywords: ['compare', 'manifest'],
    tabs: [tab('main', 'workbench.tab.compareTypes', 'MetadataTypeCompare', 'manifests', 'metadataTypeComparePanel', 'dual', 'read', [WORKBENCH_HEADER_ACTIONS.metadataCompare])]
  })
]);

export const LEGACY_TOOL_ROUTES = Object.freeze({
  Comparator: { workspaceId: 'comparator', tabId: 'main' },
  ApexTests: { workspaceId: 'apex-quality', tabId: 'main' },
  ApexCoverageCompare: { workspaceId: 'apex-coverage', tabId: 'main' },
  QuickEdit: { workspaceId: 'code-studio', tabId: 'apex-vf' },
  LightningQuickEdit: { workspaceId: 'code-studio', tabId: 'lwc-aura' },
  AnonymousApex: { workspaceId: 'anonymous-apex', tabId: 'main' },
  QueryExplorer: { workspaceId: 'query-explorer', tabId: 'main' },
  RestExplorer: { workspaceId: 'rest-explorer', tabId: 'main' },
  ObjectDescribe: { workspaceId: 'object-describe', tabId: 'main' },
  DataWorkbench: { workspaceId: 'data-workbench', tabId: 'record-editor' },
  DebugLogBrowser: { workspaceId: 'diagnostics', tabId: 'main' },
  EventMonitor: { workspaceId: 'event-monitor', tabId: 'main' },
  FieldDependency: { workspaceId: 'field-dependency', tabId: 'main' },
  DependencyExplorer: { workspaceId: 'dependencies', tabId: 'main' },
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
