/**
 * Plantilla para CI y desarrollo local. Copia a shared/telemetryConfig.js (gitignored).
 * En producción sustituye POSTHOG_API_KEY por la clave real del proyecto phc_...
 */
export const POSTHOG_API_KEY = '';

export const POSTHOG_HOST = 'https://eu.i.posthog.com';

export const POSTHOG_DEBUG = false;

/** ID encuesta CSAT en PostHog EU (opcional en tests). */
export const POSTHOG_CSAT_SURVEY_ID = '';
