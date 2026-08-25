import { ALL_ONBOARDING_TOOLS } from '../../shared/helpToolIds.js';
import {
  getTabById,
  getWorkspaceById,
  getWorkspaceRouteForTool
} from '../workbench/workspaceRegistry.js';

const BLOCKED = 'blocked';
const SAFE = 'safe';

const step = (id, anchor, titleKey, descriptionKey, interaction = BLOCKED, options = {}) =>
  Object.freeze({ id, anchor, titleKey, descriptionKey, interaction, ...options });

const overview = (toolId, panel) =>
  step('overview', panel, `onboarding.tool.${toolId}.title`, `onboarding.tool.${toolId}.lead`);

const guide = (toolId, id, anchor, role, index, interaction = BLOCKED, options = {}) =>
  step(
    id,
    anchor,
    `onboarding.common.${role}Title`,
    `onboarding.tool.${toolId}.step${index}`,
    interaction,
    options
  );

const result = (toolId, anchor) =>
  step('result', anchor, 'onboarding.common.resultTitle', `help.tool.${toolId}.body3`);

const standardTour = (toolId, panel, anchors) => Object.freeze({
  toolId,
  steps: Object.freeze([
    overview(toolId, panel),
    guide(toolId, 'context', anchors.context, 'context', 1, anchors.contextInteraction || BLOCKED),
    guide(toolId, 'prepare', anchors.prepare, 'prepare', 2, anchors.prepareInteraction || BLOCKED),
    guide(toolId, 'action', anchors.action, 'action', 3, BLOCKED),
    result(toolId, anchors.result || panel)
  ])
});

export const TOOL_ONBOARDING_TOURS = Object.freeze({
  Comparator: standardTour('Comparator', '#standardComparePanel', {
    context: '#orgDropdowns', prepare: '#searchPanel', action: '#packageXmlLoadBtn', result: '#monacoContainer'
  }),
  ApexTests: Object.freeze({
    toolId: 'ApexTests',
    steps: Object.freeze([
      overview('ApexTests', '#apexTestsPanel'),
      guide('ApexTests', 'context', '#orgDropdowns', 'context', 1),
      guide('ApexTests', 'prepare', '[data-action-id="apex-select-run"]', 'prepare', 2),
      guide('ApexTests', 'action', '#apexTestsPanel', 'action', 3),
      result('ApexTests', '#apexTestsPanel')
    ])
  }),
  QuickEdit: standardTour('QuickEdit', '#quickEditPanel', {
    context: '#quickEditSearchInput', prepare: '#quickEditEditorMount',
    action: '#quickEditValidateBtn', result: '#quickEditStatus'
  }),
  LightningQuickEdit: standardTour('LightningQuickEdit', '#lightningQuickEditPanel', {
    context: '#lightningQuickEditSearchInput', prepare: '#lightningQuickEditEditorMount',
    action: '#lightningQuickEditValidateBtn', result: '#lightningQuickEditStatus'
  }),
  AnonymousApex: standardTour('AnonymousApex', '#anonymousApexPanel', {
    context: '#orgDropdowns', prepare: '#anonymousApexRunBtn',
    action: '#anonymousApexOpenScriptsModalBtn', result: '#anonymousApexExecStatus'
  }),
  QueryExplorer: standardTour('QueryExplorer', '#queryExplorerPanel', {
    context: '#queryExplorerEditorMount', prepare: '#queryExplorerQuickSaveBtn',
    action: '#queryExplorerRunBtn', result: '#queryExplorerSingleWrap'
  }),
  DebugLogBrowser: Object.freeze({
    toolId: 'DebugLogBrowser',
    steps: Object.freeze([
      overview('DebugLogBrowser', '#debugLogBrowserPanel'),
      guide('DebugLogBrowser', 'context', '#orgDropdowns', 'context', 1),
      guide('DebugLogBrowser', 'prepare', '#debugLogBrowserFilters', 'prepare', 2, SAFE),
      guide('DebugLogBrowser', 'action', '#debugLogBrowserTableWrap', 'action', 3),
      result('DebugLogBrowser', '#debugLogBrowserTableWrap')
    ])
  }),
  ApexCoverageCompare: Object.freeze({
    toolId: 'ApexCoverageCompare',
    steps: Object.freeze([
      overview('ApexCoverageCompare', '#apexCoverageComparePanel'),
      guide('ApexCoverageCompare', 'context', '#orgDropdowns', 'context', 1),
      guide('ApexCoverageCompare', 'action', '#apexCoverageCompareRefreshBtn', 'action', 2),
      guide('ApexCoverageCompare', 'result', '#apexCoverageCompareTableMount', 'result', 3)
    ])
  }),
  FieldDependency: standardTour('FieldDependency', '#fieldDependencyPanel', {
    context: '#fieldDepObjectSearch', prepare: '#fieldDepRetrieveBtn',
    action: '#fieldDepTableScreen', result: '#fieldDepCompareScreen'
  }),
  DependencyExplorer: Object.freeze({
    toolId: 'DependencyExplorer',
    steps: Object.freeze([
      overview('DependencyExplorer', '#dependencyExplorerPanel'),
      guide('DependencyExplorer', 'context', '#depExplorerTypeSelect', 'context', 1),
      guide('DependencyExplorer', 'prepare', '#depExplorerAnalyzeBtn', 'prepare', 2),
      guide('DependencyExplorer', 'action', '#depExplorerMoreBtn', 'action', 3),
      result('DependencyExplorer', '#depExplorerCategories')
    ])
  }),
  PermissionDiff: standardTour('PermissionDiff', '#permissionDiffPanel', {
    context: '#permissionDiffSectionTabs', contextInteraction: SAFE, prepare: '#permissionDiffNameInput',
    action: '#permissionDiffCompareToggle', result: '#permissionDiffTable'
  }),
  CustomSettingsCompare: standardTour('CustomSettingsCompare', '#customSettingsComparePanel', {
    context: '#orgDropdowns', prepare: '#customSettingsCompareTypeSelect',
    action: '#customSettingsCompareDiffOnly', result: '#customSettingsCompareTableMount'
  }),
  CustomMetadataCompare: standardTour('CustomMetadataCompare', '#customMetadataComparePanel', {
    context: '#orgDropdowns', prepare: '#customMetadataCompareTypeSelect',
    action: '#customMetadataCompareDiffOnly', result: '#customMetadataCompareTableMount'
  }),
  RecordCompare: standardTour('RecordCompare', '#recordComparePanel', {
    context: '#orgDropdowns', prepare: '#recordCompareBtn',
    action: '#recordCompareTableMount', result: '#recordCompareTableMount'
  }),
  EnvironmentStatus: Object.freeze({
    toolId: 'EnvironmentStatus',
    steps: Object.freeze([
      overview('EnvironmentStatus', '#environmentStatusPanel'),
      guide('EnvironmentStatus', 'context', '#environmentStatusTbody', 'context', 1),
      guide('EnvironmentStatus', 'action', '#environmentStatusRefreshBtn', 'action', 2),
      guide('EnvironmentStatus', 'result', '#environmentStatusStatus', 'result', 3)
    ])
  }),
  OrgLimits: Object.freeze({
    toolId: 'OrgLimits',
    steps: Object.freeze([
      overview('OrgLimits', '#orgLimitsPanel'),
      guide('OrgLimits', 'context', '#orgLimitsRefreshBtn', 'context', 1),
      guide('OrgLimits', 'prepare', '#orgLimitsCards', 'prepare', 2),
      guide('OrgLimits', 'action', '#orgLimitsCompareToggle', 'action', 3)
    ])
  }),
  DeployStatus: standardTour('DeployStatus', '#deployStatusPanel', {
    context: '#orgDropdowns', prepare: '#deployStatusSummaryView',
    action: '#deployStatusPendingSection', result: '#deployStatusDetailView'
  }),
  SetupAuditTrail: standardTour('SetupAuditTrail', '#setupAuditTrailPanel', {
    context: '#setupAuditUserFilter', prepare: '#setupAuditSince', action: '#setupAuditTbody', result: '#setupAuditTbody'
  }),
  FieldHistory: standardTour('FieldHistory', '#fieldHistoryPanel', {
    context: '#fieldHistoryObjectInput', prepare: '#fieldHistoryRecordId',
    action: '#fieldHistoryLoadBtn', result: '#fieldHistoryTbody'
  }),
  GeneratePackageXml: standardTour('GeneratePackageXml', '#generatePackageXmlPanel', {
    context: '#generatePkgTypeSearch', prepare: '#generatePkgMembersList',
    action: '#generatePkgDownloadXml', result: '#generatePkgXmlOutput'
  }),
  MetadataTypeCompare: standardTour('MetadataTypeCompare', '#metadataTypeComparePanel', {
    context: '#metadataTypeCompareTypeSelect', prepare: '#metadataTypeCompareRunBtn',
    action: '#metadataTypeCompareTableMount', result: '#metadataTypeCompareTableMount'
  }),
  ObjectDescribe: standardTour('ObjectDescribe', '#objectDescribePanel', {
    context: '#objectDescribeDescribeBtn', prepare: '#objectDescribeObjectSelect',
    action: '#objectDescribeSummary', result: '#objectDescribeFieldsTbody'
  }),
  DataWorkbench: standardTour('DataWorkbench', '#dataWorkbenchPanel', {
    context: '#dataWorkbenchRecordIdInput',
    prepare: '#dataWorkbenchTabImport', prepareInteraction: SAFE,
    action: '#dataWorkbenchImportRunBtn', result: '#dataWorkbenchRecordEditorTbody'
  }),
  RestExplorer: standardTour('RestExplorer', '#restExplorerPanel', {
    context: '#restExplorerUri', prepare: '#restExplorerBody',
    action: '#restExplorerSendBtn', result: '#restExplorerResponseTbody'
  }),
  EventMonitor: standardTour('EventMonitor', '#eventMonitorPanel', {
    context: '#eventMonitorLoadChannelsBtn', prepare: '#eventMonitorSubscribeBtn',
    action: '#eventMonitorEventsTbody', result: '#eventMonitorEventsTbody'
  }),
  BulkJobMonitor: standardTour('BulkJobMonitor', '#bulkJobMonitorPanel', {
    context: '#bulkJobIdInput', prepare: '#bulkJobLoadBtn',
    action: '#bulkJobBatchesTbody', result: '#bulkJobBatchesTbody'
  })
});

export function getToolOnboardingTour(toolId) {
  const definition = TOOL_ONBOARDING_TOURS[toolId];
  if (!definition) return null;
  const route = getWorkspaceRouteForTool(toolId);
  const workspace = route ? getWorkspaceById(route.workspaceId) : null;
  const tabInfo = route ? getTabById(route.workspaceId, definition.canonicalTabId || route.tabId) : null;
  return {
    ...definition,
    route: route && workspace && tabInfo
      ? Object.freeze({
          categoryId: workspace.categoryId,
          workspaceId: workspace.id,
          tabId: tabInfo.id,
          panelId: tabInfo.panelId
        })
      : null
  };
}

export function validateToolOnboardingTours() {
  const configured = Object.keys(TOOL_ONBOARDING_TOURS);
  return {
    missing: ALL_ONBOARDING_TOOLS.filter((toolId) => !configured.includes(toolId)),
    extra: configured.filter((toolId) => !ALL_ONBOARDING_TOOLS.includes(toolId)),
    duplicateCount: configured.length - new Set(configured).size
  };
}

export { BLOCKED as ONBOARDING_INTERACTION_BLOCKED, SAFE as ONBOARDING_INTERACTION_SAFE };
