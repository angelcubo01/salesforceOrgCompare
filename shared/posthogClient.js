import '../vendor/posthog-js/dist/array.no-external.js';
import '../vendor/posthog-js/dist/surveys.js';
import posthog from '../vendor/posthog-js/dist/module.no-external.js';
import {
  POSTHOG_API_KEY,
  POSTHOG_CSAT_SURVEY_ID,
  POSTHOG_DEBUG,
  POSTHOG_HOST
} from './telemetryConfig.js';
import { getOrCreateTelemetryInstallId } from './telemetryInstallId.js';
import {
  buildPostHogPersonProperties,
  getTelemetryAudienceContext
} from './telemetryAudienceContext.js';
import { getTelemetryEnabled } from './extensionSettings.js';
import { getCurrentLang } from './i18n.js';
import { pickUsageLogEntry } from './usageLogEntry.js';
import { enrichUsageLogWithOrgContext } from './telemetryOrgContext.js';
import { usageEntryToPosthogEvent } from './posthogEventMap.js';
import {
  POSTHOG_CSAT_MIN_COMPARISON_EVENTS,
  getComparisonRunCount,
  incrementComparisonRunCount,
  isCsatSurveyCompletedLocally,
  markCsatSurveyCompletedLocally
} from './posthogSurveyPrefs.js';
import { reportExtensionException } from './extensionExceptionReport.js';
import { isPosthogApiConfigured, isPosthogCsatConfigured } from './posthogConfigured.js';

const POSTHOG_UI_HOST = 'https://eu.posthog.com';

/** @type {boolean} */
let initialized = false;

function isPosthogConfigured() {
  return isPosthogApiConfigured();
}

/** Idioma activo de la app (Ajustes / i18n), no el del navegador. */
function appLanguageCode() {
  return getCurrentLang() === 'en' ? 'en' : 'es';
}

function applyAppLanguageToPosthog(ph = posthog) {
  const lang = appLanguageCode();
  ph.register({ $locale: lang, app_ui_language: lang, language: lang });
  if (typeof ph.set_config === 'function') {
    ph.set_config({
      locale: lang,
      /** Encuestas PostHog usan navigator.language si no se fuerza aquí. */
      override_display_language: lang
    });
  }
}

/** Sincroniza idioma de la app con PostHog (p. ej. al cambiar en Ajustes). */
export function syncPosthogAppLanguage() {
  if (!initialized || !isPosthogConfigured()) return;
  applyAppLanguageToPosthog();
}

function hookCsatSurveyLifecycle(ph = posthog) {
  if (ph.__sfocCsatHooked) return;
  ph.__sfocCsatHooked = true;
  ph.on('survey sent', () => {
    void markCsatSurveyCompletedLocally();
  });
  ph.on('survey dismissed', () => {
    void markCsatSurveyCompletedLocally();
  });
}

/**
 * Inicializa PostHog en páginas de extensión (code.html, popup).
 * @param {{ persistence?: 'localStorage' | 'memory' }} [opts]
 */
/**
 * Registra captura de errores en la página (no depende de CSAT ni de telemetría de uso).
 */
export function ensureExtensionExceptionReporting() {
  if (!isPosthogApiConfigured() || typeof window === 'undefined') return;
  installExtensionPageExceptionCapture();
}

export async function initPosthogClient(opts = {}) {
  if (initialized || !isPosthogConfigured()) return null;

  const installId = await getOrCreateTelemetryInstallId();
  const telemetryEnabled = await getTelemetryEnabled();
  const lang = appLanguageCode();

  posthog.init(POSTHOG_API_KEY, {
    api_host: POSTHOG_HOST,
    ui_host: POSTHOG_UI_HOST,
    locale: lang,
    override_display_language: lang,
    bootstrap: { distinctID: installId },
    persistence: opts.persistence || 'localStorage',
    disable_external_dependency_loading: true,
    autocapture: false,
    capture_pageview: false,
    disable_session_recording: true,
    /** Solo mostramos CSAT manualmente tras N comparison_run. */
    disable_surveys_automatic_display: true,
    /** Sin autocapture SDK: errores van al SW (funciona con telemetría de uso desactivada). */
    capture_exceptions: false,
    opt_out_capturing_by_default: !telemetryEnabled,
    loaded: async (ph) => {
      if (!telemetryEnabled) {
        ph.opt_out_capturing();
        return;
      }
      applyAppLanguageToPosthog(ph);
      hookCsatSurveyLifecycle(ph);
      const audience = await getTelemetryAudienceContext();
      ph.identify(installId, {
        ...buildPostHogPersonProperties(audience),
        app_ui_language: lang,
        language: lang,
        telemetry_enabled: 'true'
      });
      if (typeof ph.reloadSurveys === 'function') {
        ph.reloadSurveys();
      }
    }
  });

  if (!telemetryEnabled) {
    posthog.opt_out_capturing();
  }

  if (POSTHOG_DEBUG) {
    console.log('[posthog] client initialized', { installId, telemetryEnabled, lang });
  }

  ensureExtensionExceptionReporting();

  initialized = true;
  return posthog;
}

/** @returns {typeof posthog | null} */
export function getPosthogClient() {
  return initialized ? posthog : null;
}

export async function syncPosthogOptOut(enabled) {
  if (!initialized || !isPosthogConfigured()) return;
  if (enabled) {
    posthog.opt_in_capturing();
    applyAppLanguageToPosthog();
    const installId = await getOrCreateTelemetryInstallId();
    const audience = await getTelemetryAudienceContext();
    posthog.identify(installId, {
      ...buildPostHogPersonProperties(audience),
      app_ui_language: appLanguageCode(),
      language: appLanguageCode(),
      telemetry_enabled: 'true'
    });
    installExtensionPageExceptionCapture();
  } else {
    posthog.opt_out_capturing();
  }
}

/**
 * window.error / unhandledrejection → service worker → PostHog $exception.
 * Independiente del opt-out de telemetría de uso (comparison_run, etc.).
 */
export function installExtensionPageExceptionCapture() {
  if (typeof window === 'undefined' || window.__sfocPageExceptionHooked) return;
  window.__sfocPageExceptionHooked = true;

  const onError = (event) => {
    const err =
      event.error instanceof Error ? event.error : new Error(String(event.message || 'unknown'));
    void reportExtensionException(err, {
      sfoc_source: 'extension',
      error_source: 'window.error',
      error_handled: 0,
      filename: String(event.filename || '').slice(0, 256),
      lineno: event.lineno || 0,
      colno: event.colno || 0
    });
  };

  const onRejection = (event) => {
    const reason = event.reason;
    const err = reason instanceof Error ? reason : new Error(String(reason || 'unhandled rejection'));
    void reportExtensionException(err, {
      sfoc_source: 'extension',
      error_source: 'unhandledrejection',
      error_handled: 0
    });
  };

  window.__sfocOnErrorHandler = onError;
  window.__sfocOnRejectionHandler = onRejection;
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
}

/** @deprecated Usar installExtensionPageExceptionCapture. */
export function startPosthogExceptionCapture() {
  installExtensionPageExceptionCapture();
}

/** @deprecated El opt-out de uso ya no desinstala captura de errores. */
export function stopPosthogExceptionCapture() {}

/** @deprecated Usar installExtensionPageExceptionCapture. */
export function installPosthogErrorHandlers() {
  installExtensionPageExceptionCapture();
}

/**
 * Captura una excepción con contexto opcional.
 * @param {unknown} error
 * @param {Record<string, string | number | boolean>} [context]
 */
export function captureUiException(error, context = {}) {
  const err = error instanceof Error ? error : new Error(String(error || 'unknown'));
  void reportExtensionException(err, {
    sfoc_source: 'extension',
    error_handled: 1,
    ...context
  });
}

async function maybeShowCsatSurvey() {
  if (!isPosthogCsatConfigured() || (await isCsatSurveyCompletedLocally())) return;

  const count = await getComparisonRunCount();
  if (count < POSTHOG_CSAT_MIN_COMPARISON_EVENTS) {
    if (POSTHOG_DEBUG) {
      console.log('[posthog] CSAT skipped: comparison_run count', count, '<', POSTHOG_CSAT_MIN_COMPARISON_EVENTS);
    }
    return;
  }

  applyAppLanguageToPosthog();

  const show = () => {
    if (typeof posthog.displaySurvey !== 'function') {
      if (POSTHOG_DEBUG) console.warn('[posthog] displaySurvey no disponible');
      return;
    }
    posthog.displaySurvey(POSTHOG_CSAT_SURVEY_ID, {
      ignoreConditions: true,
      ignoreDelay: true
    });
    if (POSTHOG_DEBUG) {
      console.log('[posthog] CSAT survey displayed', {
        surveyId: POSTHOG_CSAT_SURVEY_ID,
        lang: appLanguageCode(),
        comparisonRunCount: count
      });
    }
  };

  if (typeof posthog.onSurveysLoaded === 'function') {
    posthog.onSurveysLoaded(() => show());
    return;
  }

  if (typeof posthog.getSurveys === 'function') {
    posthog.getSurveys((surveys) => {
      const ok = Array.isArray(surveys) && surveys.some((s) => s.id === POSTHOG_CSAT_SURVEY_ID);
      if (ok) show();
    }, false);
    return;
  }

  show();
}

/**
 * Duplica usage:log en posthog-js de la página y lanza CSAT tras N comparison_run.
 * @param {Record<string, unknown>} rawEntry
 */
export async function captureUsageLogOnClient(rawEntry) {
  if (!isPosthogConfigured()) return;
  if (!initialized) {
    await initPosthogClient();
  }
  if (!initialized || posthog.has_opted_out_capturing()) return;

  const entry = pickUsageLogEntry(await enrichUsageLogWithOrgContext(rawEntry));
  const audience = await getTelemetryAudienceContext();
  const mapped = usageEntryToPosthogEvent(entry, {
    extensionVersion: audience.extension_version || '',
    uiLanguage: appLanguageCode()
  });
  if (!mapped) return;

  applyAppLanguageToPosthog();
  posthog.capture(mapped.name, mapped.properties);

  if (POSTHOG_DEBUG) {
    console.log('[posthog] client capture', mapped.name, mapped.properties);
  }

  if (mapped.name !== 'comparison_run') return;

  const count = await incrementComparisonRunCount();
  if (POSTHOG_DEBUG) {
    console.log('[posthog] comparison_run count', count, '/', POSTHOG_CSAT_MIN_COMPARISON_EVENTS);
  }
  if (count >= POSTHOG_CSAT_MIN_COMPARISON_EVENTS) {
    await maybeShowCsatSurvey();
  }
}

export { posthog };
