/**
 * Comprueba si una encuesta devuelta por PostHog sigue activa en el servidor.
 * @param {Record<string, unknown> | null | undefined} survey
 * @returns {boolean}
 */
export function isCsatSurveyServerEligible(survey) {
  if (!survey || typeof survey !== 'object') return false;
  if (survey.archived === true) return false;

  const now = Date.now();
  const endRaw = survey.end_date;
  if (typeof endRaw === 'string' && endRaw) {
    const end = new Date(endRaw).getTime();
    if (!Number.isNaN(end) && end < now) return false;
  }

  const startRaw = survey.start_date;
  if (typeof startRaw === 'string' && startRaw) {
    const start = new Date(startRaw).getTime();
    if (!Number.isNaN(start) && start > now) return false;
  }

  return true;
}

/**
 * @param {unknown} result
 * @returns {{ ok: boolean, reason: string }}
 */
export function parseCanRenderSurveyResult(result) {
  if (!result || typeof result !== 'object') {
    return { ok: false, reason: 'no_result' };
  }
  const r = /** @type {Record<string, unknown>} */ (result);
  const ok = r.canRender === true || r.visible === true;
  const reason =
    (typeof r.reason === 'string' && r.reason) ||
    (typeof r.disabledReason === 'string' && r.disabledReason) ||
    (ok ? '' : 'not_renderable');
  return { ok, reason };
}

/**
 * @param {import('../vendor/posthog-js/dist/module.no-external.js').default | null | undefined} ph
 * @param {string} surveyId
 * @returns {Promise<{ ok: boolean, reason: string }>}
 */
export async function canShowCsatSurvey(ph, surveyId) {
  if (!ph || !surveyId) return { ok: false, reason: 'no_client' };

  if (typeof ph.canRenderSurveyAsync === 'function') {
    try {
      const result = await ph.canRenderSurveyAsync(surveyId, false);
      return parseCanRenderSurveyResult(result);
    } catch {
      return { ok: false, reason: 'can_render_error' };
    }
  }

  if (typeof ph.getActiveMatchingSurveys === 'function') {
    const active = await new Promise((resolve) => {
      try {
        ph.getActiveMatchingSurveys((surveys) => resolve(Array.isArray(surveys) ? surveys : []), false);
      } catch {
        resolve([]);
      }
    });
    const found = active.find((s) => s?.id === surveyId);
    if (found && isCsatSurveyServerEligible(found)) {
      return { ok: true, reason: '' };
    }
    return { ok: false, reason: 'not_active_matching' };
  }

  if (typeof ph.getSurveys === 'function') {
    const surveys = await new Promise((resolve) => {
      try {
        ph.getSurveys((list) => resolve(Array.isArray(list) ? list : []), false);
      } catch {
        resolve([]);
      }
    });
    const found = surveys.find((s) => s?.id === surveyId);
    if (found && isCsatSurveyServerEligible(found)) {
      return { ok: true, reason: '' };
    }
    return { ok: false, reason: found ? 'survey_ineligible' : 'survey_not_found' };
  }

  return { ok: false, reason: 'surveys_api_unavailable' };
}
