import {
  CUSTOM_METADATA_COMPARE_CONFIG,
  invalidateSetupRecordsComparePanel,
  refreshSetupRecordsComparePanel,
  setupSetupRecordsComparePanel
} from './setupRecordsComparePanelCommon.js';

const config = CUSTOM_METADATA_COMPARE_CONFIG;

export function invalidateCustomMetadataComparePanel() {
  invalidateSetupRecordsComparePanel(config);
}

export async function refreshCustomMetadataComparePanel() {
  await refreshSetupRecordsComparePanel(config);
}

export function setupCustomMetadataComparePanel() {
  setupSetupRecordsComparePanel(config);
}
