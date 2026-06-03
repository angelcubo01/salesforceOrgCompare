import {
  APEX_TEST_RUN_PROFILES_MAX,
  APEX_TEST_RUN_PROFILES_STORAGE_KEY,
  mergeApexTestRunProfiles,
  normalizeApexTestRunProfileList
} from '../../shared/apexTestRunProfilesCore.js';

export const APEX_TEST_RUN_PROFILES_KEY = APEX_TEST_RUN_PROFILES_STORAGE_KEY;

export async function loadApexTestRunProfiles() {
  try {
    const res = await chrome.storage.local.get(APEX_TEST_RUN_PROFILES_KEY);
    const raw = res[APEX_TEST_RUN_PROFILES_KEY];
    return normalizeApexTestRunProfileList(Array.isArray(raw) ? raw : []);
  } catch {
    return [];
  }
}

/**
 * @param {import('../../shared/apexTestRunProfilesCore.js').ApexTestRunProfile[]} profiles
 */
export async function saveApexTestRunProfiles(profiles) {
  const next = normalizeApexTestRunProfileList(profiles).slice(0, APEX_TEST_RUN_PROFILES_MAX);
  await chrome.storage.local.set({ [APEX_TEST_RUN_PROFILES_KEY]: next });
  return next;
}
