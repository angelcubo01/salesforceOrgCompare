import { POSTHOG_API_KEY, POSTHOG_CSAT_SURVEY_ID, POSTHOG_HOST } from './telemetryConfig.js';

/** API key + host válidos (eventos de uso y errores). */
export function isPosthogApiConfigured() {
  return (
    typeof POSTHOG_API_KEY === 'string' &&
    POSTHOG_API_KEY.startsWith('phc_') &&
    !POSTHOG_API_KEY.includes('REPLACE') &&
    typeof POSTHOG_HOST === 'string' &&
    POSTHOG_HOST.length > 0
  );
}

/** Encuesta CSAT en cliente (opcional para error tracking). */
export function isPosthogCsatConfigured() {
  return (
    isPosthogApiConfigured() &&
    typeof POSTHOG_CSAT_SURVEY_ID === 'string' &&
    POSTHOG_CSAT_SURVEY_ID.length > 0 &&
    !POSTHOG_CSAT_SURVEY_ID.includes('REPLACE')
  );
}
