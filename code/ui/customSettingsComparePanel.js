import {
  CUSTOM_SETTINGS_COMPARE_CONFIG,
  invalidateSetupRecordsComparePanel,
  refreshSetupRecordsComparePanel,
  setupSetupRecordsComparePanel
} from './setupRecordsComparePanelCommon.js';

const config = CUSTOM_SETTINGS_COMPARE_CONFIG;

export function invalidateCustomSettingsComparePanel() {
  invalidateSetupRecordsComparePanel(config);
}

export async function refreshCustomSettingsComparePanel() {
  await refreshSetupRecordsComparePanel(config);
}

export function setupCustomSettingsComparePanel() {
  setupSetupRecordsComparePanel(config);
}
