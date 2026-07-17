import '../vendor/posthog-js/dist/array.no-external.js';
import '../vendor/posthog-js/dist/surveys.js';
import '../vendor/posthog-js/dist/conversations.js';
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
import { buildSfocAiUserProperties } from './posthogAiUserContext.js';
import { getTelemetryEnabled } from './extensionSettings.js';
import { getCurrentLang } from './i18n.js';
import { pickUsageLogEntry } from './usageLogEntry.js';
import { enrichUsageLogWithOrgContext } from './telemetryOrgContext.js';
import { applyUserContextToEntry } from './telemetryUserContext.js';
import { usageEntryToPosthogEvent } from './posthogEventMap.js';
import {
  POSTHOG_CSAT_MIN_COMPARISON_EVENTS,
  getComparisonRunCount,
  incrementComparisonRunCount,
  isCsatSurveyCompletedLocally,
  markCsatSurveyCompletedLocally
} from './posthogSurveyPrefs.js';
import { reportExtensionException } from './extensionExceptionReport.js';
import { bugExceptionContext, shouldReportAsBug, toError } from './errorTelemetryPolicy.js';
import { installExtensionPageExceptionCapture as installEarlyCapture } from './installEarlyExceptionCapture.js';
import { isPosthogApiConfigured, isPosthogCsatConfigured } from './posthogConfigured.js';
import { canShowCsatSurvey } from './posthogCsatSurvey.js';
import {
  hookSessionReplayOnFeatureFlags,
  installSessionReplayDebugHook,
  maybeStartSessionReplay,
  stopSessionReplay
} from './posthogSessionReplay.js';
import { initPosthogSupport, dismissPosthogConversationsWidget, enablePosthogConversationsWidget } from './posthogSupport.js';
import { hookSupportOnFeatureFlags, isPosthogSupportFlagEnabled } from './posthogSupportFlag.js';
import {
  hookFeatureControlsOnFeatureFlags,
  loadFeatureControlsFromPosthog
} from './posthogFeatureControlsFlag.js';
import {
  hookLogiAdvisorOnFeatureFlags,
  loadLogiAdvisorFromPosthog
} from './logi/posthogLogiAdvisorFlag.js';
import {
  ensureFeatureFlagsLoaded,
  invalidateFeatureFlagsCache
} from './posthogFeatureFlagLoader.js';

const POSTHOG_UI_HOST = 'https://eu.posthog.com';

/** @type {boolean} */
let initialized = false;

/** @type {Promise<typeof posthog | null> | null} */
let clientReadyPromise = null;

/** @type {Promise<typeof posthog | null> | null} */
let initInFlight = null;

function isPosthogConfigured() {
  return isPosthogApiConfigured();
}

/** Idioma activo de la app (Ajustes / i18n), no el del navegador. */
function appLanguageCode() {
  return getCurrentLang() === 'en' ? 'en' : 'es';
}

/** Inicializa PostHog Support solo si el flag remoto `sfoc_support` está activo. */
async function maybeInitPosthogSupport(ph) {
  if (!ph) return;
  if (!(await isPosthogSupportFlagEnabled(ph))) {
    dismissPosthogConversationsWidget(ph);
    return;
  }
  await enablePosthogConversationsWidget(ph);
  await initPosthogSupport(ph);
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

/** Super + person properties del ID de IA (alineado con proxy Logi). */
async function aiUserPropsForPosthog() {
  const installId = await getOrCreateTelemetryInstallId();
  return buildSfocAiUserProperties(installId);
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
 * @param {{ rightOrgId?: string | null, leftOrgId?: string | null }} [opts]
 */
async function resolveUserLabelFromServiceWorker(opts = {}) {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return null;
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'telemetry:resolveUserLabel',
      rightOrgId: opts.rightOrgId || null,
      leftOrgId: opts.leftOrgId || null
    });
    if (res?.ok && res.sfUserLabel) return res;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Registra super properties y person properties del usuario Salesforce en posthog-js.
 * @param {{ rightOrgId?: string | null, leftOrgId?: string | null }} [opts]
 */
export async function syncPosthogSfUserContext(opts = {}) {
  if (!initialized || !isPosthogConfigured()) return;
  const telemetryEnabled = await getTelemetryEnabled();
  if (!telemetryEnabled || posthog.has_opted_out_capturing?.()) return;

  const ctx = await resolveUserLabelFromServiceWorker(opts);
  if (!ctx?.sfUserLabel) return;

  /** @type {Record<string, string>} */
  const userProps = { sf_user_label: String(ctx.sfUserLabel).slice(0, 200) };

  posthog.register(userProps);

  const installId = await getOrCreateTelemetryInstallId();
  const audience = await getTelemetryAudienceContext();
  const aiUserProps = buildSfocAiUserProperties(installId);
  posthog.register(aiUserProps);
  posthog.identify(installId, {
    ...buildPostHogPersonProperties(audience),
    ...userProps,
    ...aiUserProps,
    app_ui_language: appLanguageCode(),
    language: appLanguageCode(),
    telemetry_enabled: 'true'
  });

  if (POSTHOG_DEBUG) {
    console.log('[posthog] sf user context synced', userProps.sf_user_label);
  }
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
  installEarlyCapture();
}

export function waitForPosthogClientReady() {
  if (clientReadyPromise) return clientReadyPromise;
  return Promise.resolve(initialized ? posthog : null);
}

export async function initPosthogClient(opts = {}) {
  if (!isPosthogConfigured()) return null;

  if (initialized) {
    await waitForPosthogClientReady();
    if (opts.forceFeatureFlags) {
      await ensureFeatureFlagsLoaded(posthog, { force: true });
      await loadFeatureControlsFromPosthog(posthog, { force: true });
      await loadLogiAdvisorFromPosthog(posthog, { force: true });
    }
    return posthog;
  }

  if (initInFlight) {
    await initInFlight;
    return posthog;
  }

  const forceFeatureFlags = opts.forceFeatureFlags === true;
  let clientReadyResolve;
  clientReadyPromise = new Promise((resolve) => {
    clientReadyResolve = resolve;
  });

  initInFlight = (async () => {
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
    /** Arranque manual tras feature flags (sfoc_session_replay). */
    disable_session_recording: true,
    session_recording: {
      maskAllInputs: true,
      blockClass: 'ph-no-capture',
      blockSelector:
        '.ph-no-capture, .sfoc-no-replay, .monaco-editor, .monaco-diff-editor, .file-meta-row, .file-meta-value, .viewer-chunk-bar, .viewer-chunk-label',
      maskTextSelector: '.ph-mask-text, .monaco-editor .view-line, .file-meta-value'
    },
    /** Solo mostramos CSAT manualmente tras N comparison_run. */
    disable_surveys_automatic_display: true,
    /** Support solo tras flag remoto sfoc_support (evita burbuja flotante por defecto). */
    disable_conversations: true,
    /** Sin autocapture SDK: errores van al SW (funciona con telemetría de uso desactivada). */
    capture_exceptions: false,
    opt_out_capturing_by_default: !telemetryEnabled,
    loaded: async (ph) => {
      try {
        await ensureFeatureFlagsLoaded(ph, { force: forceFeatureFlags });
        await loadFeatureControlsFromPosthog(ph, { force: forceFeatureFlags });
        await loadLogiAdvisorFromPosthog(ph, { force: forceFeatureFlags });
        hookFeatureControlsOnFeatureFlags(ph, undefined, { skipInitialRun: true });
        hookLogiAdvisorOnFeatureFlags(ph);

        if (!telemetryEnabled) {
          ph.opt_out_capturing();
          stopSessionReplay(ph);
        } else {
          applyAppLanguageToPosthog(ph);
          dismissPosthogConversationsWidget(ph);
          hookCsatSurveyLifecycle(ph);
          hookSessionReplayOnFeatureFlags(ph);
          installSessionReplayDebugHook(ph);
          hookSupportOnFeatureFlags(ph, (enabled) => {
            if (enabled) void maybeInitPosthogSupport(ph);
            else dismissPosthogConversationsWidget(ph);
          });
          const audience = await getTelemetryAudienceContext();
          const aiUserProps = await aiUserPropsForPosthog();
          ph.register(aiUserProps);
          ph.identify(installId, {
            ...buildPostHogPersonProperties(audience),
            ...aiUserProps,
            app_ui_language: lang,
            language: lang,
            telemetry_enabled: 'true'
          });
          if (typeof ph.reloadSurveys === 'function') {
            ph.reloadSurveys();
          }
          await syncPosthogSfUserContext();
          void maybeStartSessionReplay(ph);
          void maybeInitPosthogSupport(ph);
        }
      } finally {
        clientReadyResolve?.(ph);
        clientReadyResolve = null;
        clientReadyPromise = null;
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

  if (opts.awaitReady === true) {
    await waitForPosthogClientReady();
  }
  return posthog;
  })();

  try {
    return await initInFlight;
  } finally {
    initInFlight = null;
  }
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
    const aiUserProps = buildSfocAiUserProperties(installId);
    posthog.register(aiUserProps);
    posthog.identify(installId, {
      ...buildPostHogPersonProperties(audience),
      ...aiUserProps,
      app_ui_language: appLanguageCode(),
      language: appLanguageCode(),
      telemetry_enabled: 'true'
    });
    installExtensionPageExceptionCapture();
    hookSessionReplayOnFeatureFlags(posthog);
    installSessionReplayDebugHook(posthog);
    hookFeatureControlsOnFeatureFlags(posthog);
    await ensureFeatureFlagsLoaded(posthog, { force: true });
    await syncPosthogSfUserContext();
    void maybeStartSessionReplay(posthog);
    void maybeInitPosthogSupport(posthog);
  } else {
    posthog.opt_out_capturing();
    stopSessionReplay(posthog);
    dismissPosthogConversationsWidget(posthog);
    invalidateFeatureFlagsCache();
    hookFeatureControlsOnFeatureFlags(posthog);
    await ensureFeatureFlagsLoaded(posthog, { force: true });
  }
}

/**
 * window.error / unhandledrejection → service worker → PostHog $exception.
 * La instalación real ocurre en installEarlyExceptionCapture.js (primer import de cada página).
 */
export function installExtensionPageExceptionCapture() {
  installEarlyCapture();
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
 * Reporta un bug real a PostHog Error Tracking ($exception).
 * @param {unknown} error
 * @param {Record<string, string | number | boolean>} [context]
 */
export function reportBug(error, context = {}) {
  const err = toError(error);
  if (!shouldReportAsBug(err, context)) return;
  void reportExtensionException(err, {
    sfoc_source: 'extension',
    error_handled: 1,
    ...bugExceptionContext(context),
    ...context
  });
}

/**
 * Fallo operacional esperado (analytics, respeta telemetría de uso).
 * @param {Record<string, unknown>} entry
 */
export async function reportOperationalFailure(entry) {
  /** @type {Record<string, unknown>} */
  const raw = {
    kind: 'extension_failure',
    ok: false,
    comparisonUrl: typeof window !== 'undefined' ? window.location.href : '',
    artifactType: entry.artifactType || entry.artifact_type || '',
    phase: entry.phase || '',
    reason: entry.reason || '',
    error: entry.error || entry.errorMessage || '',
    leftOrgId: entry.leftOrgId || '',
    rightOrgId: entry.rightOrgId || '',
    descriptor: entry.descriptor
  };
  const picked = pickUsageLogEntry(raw);
  if (!picked) return;

  void captureUsageLogOnClient(picked);
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
  try {
    await chrome.runtime.sendMessage({ type: 'usage:log', entry: picked });
  } catch {
    /* SW dormido o extensión recargándose */
  }
}

/**
 * @deprecated Usar reportBug o handleToolError.
 * @param {unknown} error
 * @param {Record<string, string | number | boolean>} [context]
 */
export function captureUiException(error, context = {}) {
  reportBug(error, context);
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

  const tryShow = async () => {
    const { ok, reason } = await canShowCsatSurvey(posthog, POSTHOG_CSAT_SURVEY_ID);
    if (!ok) {
      if (POSTHOG_DEBUG) {
        console.log('[posthog] CSAT skipped: server declined', {
          surveyId: POSTHOG_CSAT_SURVEY_ID,
          reason
        });
      }
      return;
    }

    if (typeof posthog.displaySurvey !== 'function') {
      if (POSTHOG_DEBUG) console.warn('[posthog] displaySurvey no disponible');
      return;
    }

    /** Respeta estado y condiciones del dashboard (no forzar con ignoreConditions). */
    posthog.displaySurvey(POSTHOG_CSAT_SURVEY_ID);

    if (POSTHOG_DEBUG) {
      console.log('[posthog] CSAT survey displayed', {
        surveyId: POSTHOG_CSAT_SURVEY_ID,
        lang: appLanguageCode(),
        comparisonRunCount: count
      });
    }
  };

  if (typeof posthog.onSurveysLoaded === 'function') {
    posthog.onSurveysLoaded(() => {
      void tryShow();
    });
    if (typeof posthog.reloadSurveys === 'function') {
      posthog.reloadSurveys();
    }
    return;
  }

  await tryShow();
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

  let enriched = await enrichUsageLogWithOrgContext(rawEntry);
  const userCtx = await resolveUserLabelFromServiceWorker({
    rightOrgId: enriched.rightOrgId,
    leftOrgId: enriched.leftOrgId
  });
  if (userCtx) {
    enriched = applyUserContextToEntry(enriched, userCtx);
  }
  const entry = pickUsageLogEntry(enriched);
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
