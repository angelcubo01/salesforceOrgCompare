import {
  POSTHOG_API_KEY,
  POSTHOG_DEBUG,
  POSTHOG_HOST
} from '../shared/telemetryConfig.js';
import {
  getOrCreateTelemetryInstallId,
  getOrCreateTelemetrySessionId
} from '../shared/telemetryInstallId.js';
import {
  usageEntryToPosthogEvent,
  extensionLifecyclePosthogEvent,
  telemetryEnabledPosthogEvent,
  telemetryOptOutPosthogEvent,
  telemetrySafeComparisonUrl
} from '../shared/posthogEventMap.js';
import { loadExtensionSettings } from '../shared/extensionSettings.js';
import {
  buildPosthogExceptionFingerprint,
  buildPosthogExceptionList
} from '../shared/posthogException.js';
import {
  audienceParamsForEvent,
  buildPostHogPersonProperties,
  getTelemetryAudienceContext
} from '../shared/telemetryAudienceContext.js';
import { isPosthogApiConfigured } from '../shared/posthogConfigured.js';
import {
  bugExceptionContext,
  classifyError,
  isBenignPageErrorEvent,
  isBenignPageRejectionEvent,
  shouldReportAsBug,
  toError
} from '../shared/errorTelemetryPolicy.js';
import { resolveTelemetryUserLabel, resolveSfUserContextForOrg } from './telemetryUserResolver.js';
import { orgFieldsForTelemetry } from '../shared/telemetryOrgContext.js';

function posthogDebugLog(...args) {
  if (POSTHOG_DEBUG) console.log('[posthog]', ...args);
}

function isPosthogConfigured() {
  return isPosthogApiConfigured();
}

function captureUrl() {
  const base = POSTHOG_HOST.replace(/\/$/, '');
  return `${base}/capture/`;
}

/** Ingesta de `$exception` (schema Error tracking). Ver posthog.com/docs/error-tracking/installation/manual */
function exceptionIngestUrl() {
  const base = POSTHOG_HOST.replace(/\/$/, '');
  return `${base}/i/v0/e/`;
}

/**
 * @param {string} event
 * @param {Record<string, string | number | boolean>} properties
 * @param {{ installId: string, personProperties?: Record<string, string> }} opts
 */
async function postCapture(event, properties, opts) {
  if (!isPosthogConfigured()) {
    posthogDebugLog('no enviado: falta POSTHOG_API_KEY en shared/telemetryConfig.js');
    return false;
  }

  const sessionId = await getOrCreateTelemetrySessionId();
  /** @type {Record<string, string | number | boolean>} */
  const props = {
    ...properties,
    $session_id: sessionId
  };

  const personProps = buildPostHogPersonProperties(opts.personProperties || {});
  if (Object.keys(personProps).length) {
    props.$set = personProps;
  }

  /** @type {Record<string, unknown>} */
  const body = {
    api_key: POSTHOG_API_KEY,
    event: event.slice(0, 200),
    distinct_id: opts.installId,
    properties: props
  };

  try {
    const res = await fetch(captureUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true
    });
    if (res.ok) {
      posthogDebugLog('evento enviado', event);
      return true;
    }
    posthogDebugLog('HTTP error', res.status, res.statusText);
  } catch (e) {
    posthogDebugLog('fetch failed', String(e || 'unknown'));
  }
  return false;
}

/**
 * Envía `$exception` al endpoint documentado para Error tracking (`/i/v0/e/`).
 * @param {string} distinctId
 * @param {Record<string, unknown>} properties
 */
async function postCaptureException(distinctId, properties) {
  if (!isPosthogConfigured()) {
    posthogDebugLog('no enviado: falta POSTHOG_API_KEY en shared/telemetryConfig.js');
    return false;
  }

  const sessionId = await getOrCreateTelemetrySessionId();
  const manifest = chrome.runtime.getManifest();

  /** @type {Record<string, unknown>} */
  const props = {
    distinct_id: distinctId,
    $session_id: sessionId,
    $lib: 'salesforce-org-compare',
    $lib_version: String(manifest.version || '').slice(0, 32),
    ...properties
  };

  /** @type {Record<string, unknown>} */
  const body = {
    token: POSTHOG_API_KEY,
    event: '$exception',
    properties: props
  };

  try {
    const res = await fetch(exceptionIngestUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true
    });
    if (res.ok) {
      posthogDebugLog('$exception enviada', props.$exception_type || '$exception');
      return true;
    }
    const text = await res.text().catch(() => '');
    console.warn('[posthog] $exception HTTP', res.status, text.slice(0, 400));
    posthogDebugLog('$exception HTTP error', res.status, text.slice(0, 400));

    return postCaptureExceptionViaLegacyCapture(distinctId, props);
  } catch (e) {
    console.warn('[posthog] $exception fetch failed', String(e || 'unknown'));
    posthogDebugLog('$exception fetch failed', String(e || 'unknown'));
  }
  return false;
}

/** Fallback si /i/v0/e/ falla (mismo host, formato capture clásico). */
async function postCaptureExceptionViaLegacyCapture(distinctId, exceptionProps) {
  const sessionId = await getOrCreateTelemetrySessionId();
  /** @type {Record<string, unknown>} */
  const props = {
    distinct_id: distinctId,
    $session_id: sessionId,
    ...exceptionProps
  };
  /** @type {Record<string, unknown>} */
  const body = {
    api_key: POSTHOG_API_KEY,
    event: '$exception',
    distinct_id: distinctId,
    properties: props
  };
  try {
    const res = await fetch(captureUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true
    });
    if (res.ok) {
      posthogDebugLog('$exception enviada (fallback /capture/)');
      return true;
    }
    const text = await res.text().catch(() => '');
    console.warn('[posthog] $exception fallback HTTP', res.status, text.slice(0, 300));
  } catch (e) {
    console.warn('[posthog] $exception fallback fetch failed', String(e));
  }
  return false;
}

async function telemetryContext() {
  const audience = await getTelemetryAudienceContext();
  return {
    extensionVersion: audience.extension_version || '',
    uiLanguage: audience.ui_language || '',
    audience
  };
}

/** @param {Record<string, string>} audience @param {boolean} enabled */
function personPropsWithTelemetryPreference(audience, enabled) {
  return {
    ...buildPostHogPersonProperties(audience),
    telemetry_enabled: enabled ? 'true' : 'false'
  };
}

/**
 * @param {{ sfUserLabel?: string } | null} ctx
 * @returns {Record<string, string>}
 */
function sfUserPersonProps(ctx) {
  if (!ctx?.sfUserLabel) return {};
  return { sf_user_label: String(ctx.sfUserLabel).slice(0, 200) };
}

/**
 * @param {{ rightOrgId?: string | null, leftOrgId?: string | null }} [opts]
 */
async function resolveSfUserForTelemetry(opts = {}) {
  try {
    return await resolveTelemetryUserLabel(opts);
  } catch {
    return null;
  }
}

/**
 * @param {{ name: string, properties: Record<string, string | number> }} mapped
 * @param {boolean} telemetryEnabled
 */
async function sendTelemetryPreferenceEvent(mapped, telemetryEnabled) {
  if (!isPosthogConfigured()) return;
  const ctx = await telemetryContext();
  const installId = await getOrCreateTelemetryInstallId();
  const sfUser = await resolveSfUserForTelemetry();
  const sfProps = sfUserPersonProps(sfUser);
  await postCapture(
    mapped.name,
    { ...mapped.properties, ...sfProps },
    {
      installId,
      personProperties: {
        ...personPropsWithTelemetryPreference(ctx.audience, telemetryEnabled),
        ...sfProps
      }
    }
  );
}

/**
 * @param {Record<string, unknown>} entry Entrada ya pasada por pickUsageLogEntry.
 */
export async function sendPosthogUsageEvent(entry) {
  if (!isPosthogConfigured()) return;
  const ctx = await telemetryContext();
  const mapped = usageEntryToPosthogEvent(entry, ctx);
  if (!mapped) return;
  const installId = await getOrCreateTelemetryInstallId();
  const sfUser = await resolveSfUserForTelemetry({
    rightOrgId: entry.rightOrgId,
    leftOrgId: entry.leftOrgId
  });
  const sfProps = sfUserPersonProps(sfUser);
  const safeUrl =
    typeof entry.comparisonUrl === 'string' && entry.comparisonUrl.startsWith('chrome-extension://')
      ? telemetrySafeComparisonUrl(entry.comparisonUrl)
      : '';
  const pageFromUrl = safeUrl
    ? { $current_url: safeUrl }
    : { $current_url: `chrome-extension://${chrome.runtime.id}/code/code.html` };
  await postCapture(
    mapped.name,
    {
      ...audienceParamsForEvent(ctx.audience),
      ...mapped.properties,
      ...sfProps,
      ...pageFromUrl
    },
    { installId, personProperties: { ...buildPostHogPersonProperties(ctx.audience), ...sfProps } }
  );
}

/** Un evento al desactivar telemetría en Ajustes (no respeta telemetryEnabled). */
export async function sendPosthogTelemetryOptOut() {
  const ctx = await telemetryContext();
  await sendTelemetryPreferenceEvent(telemetryOptOutPosthogEvent(ctx), false);
}

/** Un evento al reactivar telemetría en Ajustes. */
export async function sendPosthogTelemetryOptIn() {
  const ctx = await telemetryContext();
  await sendTelemetryPreferenceEvent(telemetryEnabledPosthogEvent(ctx, 'settings'), true);
}

/**
 * Eventos de ciclo de vida (install, active, update). Respeta telemetryEnabled salvo force.
 * @param {string} eventName
 * @param {Record<string, string | number | boolean>} [extra]
 * @param {{ force?: boolean, personSet?: Record<string, string>, resolveUserOrgIds?: { leftOrgId?: string | null, rightOrgId?: string | null } }} [opts]
 */
export async function sendPosthogLifecycleEvent(eventName, extra = {}, opts = {}) {
  if (!isPosthogConfigured()) return false;
  if (!opts.force) {
    try {
      const cfg = await loadExtensionSettings();
      if (cfg.telemetryEnabled === false) return false;
    } catch {
      return false;
    }
  }

  const ctx = await telemetryContext();
  const mapped = extensionLifecyclePosthogEvent(eventName, ctx, extra);
  const installId = await getOrCreateTelemetryInstallId();
  const sfUser = await resolveSfUserForTelemetry(opts.resolveUserOrgIds || {});
  const sfProps = sfUserPersonProps(sfUser);
  const personProps = {
    ...buildPostHogPersonProperties(ctx.audience),
    ...(opts.personSet || {}),
    ...sfProps
  };
  await postCapture(
    mapped.name,
    { ...mapped.properties, ...sfProps },
    { installId, personProperties: personProps }
  );
  posthogDebugLog('lifecycle', eventName, extra);
  return true;
}

const INITIAL_PREFERENCE_REPORT_KEY = 'sfoc_telemetry_initial_preference_reported';
export const FIRST_ORG_CONNECTED_KEY = 'sfoc_first_org_connected_sent';

/**
 * Una vez por instalación: primera org añadida desde el popup con sesión y SF_User_Label.
 * @param {Record<string, unknown>} org Org recién guardada desde el popup.
 */
export async function maybeSendFirstOrgConnectedTelemetry(org) {
  if (!isPosthogConfigured()) return false;
  if (!org?.id) return false;
  try {
    const r = await chrome.storage.local.get(FIRST_ORG_CONNECTED_KEY);
    if (r[FIRST_ORG_CONNECTED_KEY]) return false;
    const cfg = await loadExtensionSettings();
    if (cfg.telemetryEnabled === false) return false;
  } catch {
    return false;
  }

  const sfUser = await resolveSfUserContextForOrg(org);
  if (!sfUser?.sfUserLabel) return false;

  const orgId = String(org.id || '').trim();
  /** @type {Record<string, string | number | boolean>} */
  const extra = {
    org_connection_source: 'popup'
  };
  if (orgId) extra.org_id = orgId.slice(0, 18);
  const fields = orgFieldsForTelemetry(org);
  if (fields) {
    if (fields.companyName) extra.org_company_name = fields.companyName;
    if (fields.instanceUrl) extra.instance_url = fields.instanceUrl;
    if (fields.isSandbox) extra.is_sandbox = 1;
    if (fields.envLabel) extra.env_label = fields.envLabel;
  }

  const sent = await sendPosthogLifecycleEvent('first_org_connected', extra, {
    personSet: { sf_user_label: sfUser.sfUserLabel },
    resolveUserOrgIds: { leftOrgId: orgId }
  });

  if (sent) {
    try {
      await chrome.storage.local.set({ [FIRST_ORG_CONNECTED_KEY]: true });
    } catch {
      /* ignore */
    }
  }
  return sent;
}

/**
 * Registra una vez por instalación si el usuario tiene telemetría activa (opt-in por defecto).
 */
export async function maybeReportInitialTelemetryPreference() {
  if (!isPosthogConfigured()) return;
  try {
    const r = await chrome.storage.local.get(INITIAL_PREFERENCE_REPORT_KEY);
    if (r[INITIAL_PREFERENCE_REPORT_KEY]) return;
    const cfg = await loadExtensionSettings();
    const enabled = cfg.telemetryEnabled !== false;
    if (!enabled) {
      await chrome.storage.local.set({ [INITIAL_PREFERENCE_REPORT_KEY]: true });
      return;
    }
    const ctx = await telemetryContext();
    await sendTelemetryPreferenceEvent(telemetryEnabledPosthogEvent(ctx, 'default'), true);
    await chrome.storage.local.set({ [INITIAL_PREFERENCE_REPORT_KEY]: true });
  } catch {
    /* ignore */
  }
}

/**
 * Envía `$exception` al Capture API (service worker).
 * @param {unknown} error
 * @param {Record<string, string | number | boolean>} [context]
 */
export async function sendPosthogException(error, context = {}) {
  if (!isPosthogConfigured()) return false;

  const err = toError(error);
  if (!shouldReportAsBug(err, context)) {
    posthogDebugLog('exception skipped', classifyError(err, context), err.message);
    return false;
  }

  const ctx = await telemetryContext();
  const installId = await getOrCreateTelemetryInstallId();
  const handled = context.error_handled === 1 || context.error_handled === true;

  return postCaptureException(installId, {
    ...audienceParamsForEvent(ctx.audience),
    sfoc_source: 'extension',
    $exception_type: String(err.name || 'Error').slice(0, 128),
    $exception_message: String(err.message || 'unknown').slice(0, 2000),
    $exception_level: 'error',
    $exception_fingerprint: buildPosthogExceptionFingerprint(err),
    $exception_list: buildPosthogExceptionList(err, { handled }),
    ...bugExceptionContext(context),
    ...context
  });
}

/**
 * Fallo operacional (analytics, respeta telemetryEnabled).
 * @param {Record<string, unknown>} entry
 */
export async function sendPosthogOperationalFailure(entry) {
  try {
    const cfg = await loadExtensionSettings();
    if (cfg.telemetryEnabled === false) return false;
  } catch {
    return false;
  }

  const ctx = await telemetryContext();
  const mapped = usageEntryToPosthogEvent(
    { kind: 'extension_failure', ok: false, ...entry },
    ctx
  );
  if (!mapped) return false;

  const installId = await getOrCreateTelemetryInstallId();
  const sfUser = await resolveSfUserForTelemetry();
  const sfProps = sfUserPersonProps(sfUser);
  return postCapture(
    mapped.name,
    { ...mapped.properties, ...sfProps },
    { installId, personProperties: { ...buildPostHogPersonProperties(ctx.audience), ...sfProps } }
  );
}

/** Errores no capturados en el service worker → PostHog `$exception`. */
export function installServiceWorkerExceptionCapture() {
  if (globalThis.__sfocSwExceptionHooked) return;
  globalThis.__sfocSwExceptionHooked = true;

  self.addEventListener('error', (event) => {
    if (isBenignPageErrorEvent(event)) return;
    const err =
      event.error instanceof Error ? event.error : new Error(String(event.message || 'unknown'));
    void sendPosthogException(err, {
      error_source: 'service_worker.error',
      error_handled: 0,
      filename: String(event.filename || '').slice(0, 256),
      lineno: Number(event.lineno) || 0,
      colno: Number(event.colno) || 0
    });
  });

  self.addEventListener('unhandledrejection', (event) => {
    if (isBenignPageRejectionEvent(event)) return;
    const reason = event.reason;
    const err = reason instanceof Error ? reason : new Error(String(reason || 'unhandled rejection'));
    void sendPosthogException(err, {
      error_source: 'service_worker.unhandledrejection',
      error_handled: 0
    });
  });
}
