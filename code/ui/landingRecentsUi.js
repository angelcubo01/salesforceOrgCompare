import { t } from '../../shared/i18n.js';
import {
  loadToolRecents,
  getToolRecentsSnapshot,
  toggleToolPin,
  isToolPinned
} from '../core/toolRecents.js';
import { navigateToModeAndTool, toolToMode } from './appModeNav.js';
import { ALL_ONBOARDING_TOOLS } from '../../shared/helpToolIds.js';

/** Map tool id → i18n key for display label */
const TOOL_LABEL_KEYS = Object.freeze({
  Comparator: 'code.appModeComparator',
  ApexTests: 'code.optgroupApexTests',
  QuickEdit: 'quickEdit.title',
  LightningQuickEdit: 'lightningQuickEdit.title',
  AnonymousApex: 'anonymousApex.title',
  QueryExplorer: 'queryExplorer.title',
  DebugLogBrowser: 'debugLogs.title',
  ApexCoverageCompare: 'coverageCompare.title',
  FieldDependency: 'fieldDep.title',
  DependencyExplorer: 'depExplorer.title',
  PermissionDiff: 'permDiff.title',
  CustomSettingsCompare: 'customSettingsCompare.title',
  CustomMetadataCompare: 'customMetadataCompare.title',
  RecordCompare: 'recordCompare.title',
  EnvironmentStatus: 'envStatus.title',
  OrgLimits: 'orgLimits.title',
  DeployStatus: 'deployStatus.title',
  SetupAuditTrail: 'setupAudit.title',
  FieldHistory: 'fieldHistory.title',
  GeneratePackageXml: 'genPkg.title',
  MetadataTypeCompare: 'metadataTypeCompare.title',
  ObjectDescribe: 'objectDescribe.title',
  DataWorkbench: 'dataWorkbench.title',
  RestExplorer: 'restExplorer.title',
  EventMonitor: 'eventMonitor.title',
  BulkJobMonitor: 'bulkJobMonitor.title'
});

function toolLabel(toolId) {
  const key = TOOL_LABEL_KEYS[toolId] || `code.optgroup${toolId}`;
  const label = t(key);
  return label !== key ? label : toolId;
}

function renderToolList(container, toolIds, emptyKey) {
  if (!container) return;
  container.innerHTML = '';
  if (!toolIds.length) {
    const empty = document.createElement('p');
    empty.className = 'sfoc-empty app-landing-tools-empty';
    empty.textContent = t(emptyKey);
    container.appendChild(empty);
    return;
  }
  const list = document.createElement('div');
  list.className = 'app-landing-tools-list';
  for (const toolId of toolIds) {
    if (!ALL_ONBOARDING_TOOLS.includes(toolId) && toolId !== 'Comparator') continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sfoc-btn sfoc-btn--secondary app-landing-tool-btn';
    btn.textContent = toolLabel(toolId);
    btn.addEventListener('click', () => {
      const mode = toolToMode(toolId);
      if (!mode) return;
      void navigateToModeAndTool(mode, toolId, { userInitiated: true });
    });
    list.appendChild(btn);
  }
  container.appendChild(list);
}

export async function refreshLandingToolRecents() {
  await loadToolRecents();
  const { recents, pins } = getToolRecentsSnapshot();
  renderToolList(document.getElementById('appLandingRecentsList'), recents, 'code.landingNoRecents');
  renderToolList(document.getElementById('appLandingPinnedList'), pins, 'code.landingNoPinned');
}

export { isToolPinned, toggleToolPin, toolLabel };
