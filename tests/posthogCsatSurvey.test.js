import { describe, expect, it } from 'vitest';
import {
  canShowCsatSurvey,
  isCsatSurveyServerEligible,
  parseCanRenderSurveyResult
} from '../shared/posthogCsatSurvey.js';

describe('isCsatSurveyServerEligible', () => {
  it('rechaza encuestas archivadas', () => {
    expect(isCsatSurveyServerEligible({ archived: true })).toBe(false);
  });

  it('rechaza encuestas con end_date pasada', () => {
    expect(
      isCsatSurveyServerEligible({
        archived: false,
        end_date: '2020-01-01T00:00:00Z'
      })
    ).toBe(false);
  });

  it('acepta encuestas activas sin restricciones de fecha', () => {
    expect(isCsatSurveyServerEligible({ archived: false })).toBe(true);
  });
});

describe('parseCanRenderSurveyResult', () => {
  it('lee canRender', () => {
    expect(parseCanRenderSurveyResult({ canRender: true })).toEqual({ ok: true, reason: '' });
    expect(parseCanRenderSurveyResult({ canRender: false, reason: 'archived' })).toEqual({
      ok: false,
      reason: 'archived'
    });
  });

  it('lee visible/disabledReason', () => {
    expect(parseCanRenderSurveyResult({ visible: true })).toEqual({ ok: true, reason: '' });
    expect(parseCanRenderSurveyResult({ visible: false, disabledReason: 'stopped' })).toEqual({
      ok: false,
      reason: 'stopped'
    });
  });
});

describe('canShowCsatSurvey', () => {
  it('usa canRenderSurveyAsync cuando está disponible', async () => {
    const ph = {
      canRenderSurveyAsync: async () => ({ visible: false, disabledReason: 'survey_disabled' })
    };
    await expect(canShowCsatSurvey(ph, 'survey-1')).resolves.toEqual({
      ok: false,
      reason: 'survey_disabled'
    });
  });

  it('cae a getActiveMatchingSurveys', async () => {
    const ph = {
      getActiveMatchingSurveys(cb) {
        cb([{ id: 'survey-1', archived: false }]);
      }
    };
    await expect(canShowCsatSurvey(ph, 'survey-1')).resolves.toEqual({ ok: true, reason: '' });
    await expect(canShowCsatSurvey(ph, 'other')).resolves.toEqual({
      ok: false,
      reason: 'not_active_matching'
    });
  });
});
