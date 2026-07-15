import { getSelectedArtifactType } from '../ui/artifactTypeUi.js';
import { refreshGeneratePackageXmlTypes } from '../ui/generatePackageXmlPanel.js';
import {
  invalidateMetadataTypeComparePanel,
  refreshMetadataTypeComparePanel
} from '../ui/metadataTypeComparePanel.js';
import { resetFieldDependencyToInitial } from '../ui/fieldDependencyPanel.js';
import { resetDependencyExplorerPanel } from '../ui/dependencyExplorerPanel.js';
import { refreshApexTestsPanel } from '../ui/apexTestsPanel.js';
import { refreshAnonymousApexPanel } from '../ui/anonymousApexPanel.js';
import { refreshQueryExplorerPanel } from '../ui/queryExplorerPanel.js';
import { refreshObjectDescribePanel } from '../ui/objectDescribePanel.js';
import { refreshDataWorkbenchPanel } from '../ui/dataWorkbenchPanel.js';
import { refreshOrgLimitsPanel } from '../ui/orgLimitsPanel.js';
import { reloadEnvironmentStatusIfActive } from '../ui/environmentStatusPanel.js';
import { refreshDebugLogBrowserPanel } from '../ui/debugLogBrowserPanel.js';
import { refreshSetupAuditTrailPanel } from '../ui/setupAuditTrailPanel.js';
import { refreshFieldHistoryPanel } from '../ui/fieldHistoryPanel.js';
import { refreshPermissionDiffPanel } from '../ui/permissionDiffPanel.js';
import { refreshQuickEditPanel } from '../ui/quickEditPanel.js';
import { refreshLightningQuickEditPanel } from '../ui/lightningQuickEditPanel.js';
import { refreshApexCoverageComparePanel } from '../ui/apexCoverageComparePanel.js';
import { refreshCustomSettingsComparePanel } from '../ui/customSettingsComparePanel.js';
import { refreshCustomMetadataComparePanel } from '../ui/customMetadataComparePanel.js';
import { refreshRecordComparePanel } from '../ui/recordComparePanel.js';
import { onDeployStatusOrgChange } from '../ui/deployStatusPanel.js';

/** @typedef {'left' | 'right'} OrgSide */

/**
 * Refresca el panel activo tras cambio de org izquierda o derecha.
 * @param {OrgSide} side
 */
export function refreshActiveToolOnOrgChange(side) {
  const type = getSelectedArtifactType();
  if (!type) return;

  if (side === 'left' && type === 'GeneratePackageXml') {
    refreshGeneratePackageXmlTypes();
  }

  const shared = {
    MetadataTypeCompare: () => {
      invalidateMetadataTypeComparePanel();
      void refreshMetadataTypeComparePanel();
    },
    ApexTests: () => void refreshApexTestsPanel(),
    FieldDependency: () => resetFieldDependencyToInitial(),
    DependencyExplorer: () => resetDependencyExplorerPanel(),
    AnonymousApex: () => void refreshAnonymousApexPanel(),
    QueryExplorer: () => void refreshQueryExplorerPanel(),
    ObjectDescribe: () => void refreshObjectDescribePanel(),
    DataWorkbench: () => void refreshDataWorkbenchPanel(),
    OrgLimits: () => void refreshOrgLimitsPanel(),
    EnvironmentStatus: () => void reloadEnvironmentStatusIfActive(),
    PermissionDiff: () => void refreshPermissionDiffPanel(),
    DebugLogBrowser: () => void refreshDebugLogBrowserPanel(),
    SetupAuditTrail: () => void refreshSetupAuditTrailPanel(),
    FieldHistory: () => void refreshFieldHistoryPanel(),
    QuickEdit: () => void refreshQuickEditPanel(),
    LightningQuickEdit: () => void refreshLightningQuickEditPanel(),
    ApexCoverageCompare: () => void refreshApexCoverageComparePanel(),
    CustomSettingsCompare: () => void refreshCustomSettingsComparePanel(),
    CustomMetadataCompare: () => void refreshCustomMetadataComparePanel(),
    RecordCompare: () => void refreshRecordComparePanel(),
    DeployStatus: () => onDeployStatusOrgChange()
  };

  if (side === 'left' && type === 'DeployStatus') {
    shared.DeployStatus();
    return;
  }

  const fn = shared[type];
  if (typeof fn === 'function') fn();
}
