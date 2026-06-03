/** Eventos `comparison_run` enviados antes de mostrar la encuesta CSAT. */
export const POSTHOG_CSAT_MIN_COMPARISON_EVENTS = 7;

export const POSTHOG_COMPARISON_RUN_COUNT_KEY = 'sfoc_posthog_comparison_run_count';

/** Usuario ya vio/completó/descartó la encuesta CSAT (no volver a lanzar). */
export const POSTHOG_CSAT_COMPLETED_KEY = 'sfoc_posthog_csat_completed';

/**
 * @returns {Promise<number>}
 */
export async function getComparisonRunCount() {
  try {
    const r = await chrome.storage.local.get(POSTHOG_COMPARISON_RUN_COUNT_KEY);
    const n = Number(r[POSTHOG_COMPARISON_RUN_COUNT_KEY]);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * @returns {Promise<number>}
 */
export async function incrementComparisonRunCount() {
  const next = (await getComparisonRunCount()) + 1;
  try {
    await chrome.storage.local.set({ [POSTHOG_COMPARISON_RUN_COUNT_KEY]: next });
  } catch {
    /* ignore */
  }
  return next;
}

/**
 * @returns {Promise<boolean>}
 */
export async function isCsatSurveyCompletedLocally() {
  try {
    const r = await chrome.storage.local.get(POSTHOG_CSAT_COMPLETED_KEY);
    return r[POSTHOG_CSAT_COMPLETED_KEY] === true;
  } catch {
    return false;
  }
}

export async function markCsatSurveyCompletedLocally() {
  try {
    await chrome.storage.local.set({ [POSTHOG_CSAT_COMPLETED_KEY]: true });
  } catch {
    /* ignore */
  }
}
