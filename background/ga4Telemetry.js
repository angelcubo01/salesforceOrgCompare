import {
  GA4_API_SECRET,
  GA4_DEBUG_MODE,
  GA4_MEASUREMENT_ID
} from '../shared/telemetryConfig.js';
import {
  getOrCreateTelemetryInstallId,
  getOrCreateTelemetrySessionId
} from '../shared/telemetryInstallId.js';
import { usageEntryToGa4Event, telemetryOptOutGa4Event } from '../shared/ga4EventMap.js';
import {
  audienceParamsForEvent,
  buildGa4UserProperties,
  getTelemetryAudienceContext
} from '../shared/telemetryAudienceContext.js';

const GA4_COLLECT_URL = 'https://www.google-analytics.com/mp/collect';
const GA4_COLLECT_DEBUG_URL = 'https://www.google-analytics.com/debug/mp/collect';
const GA4_COLLECT_REGIONAL = 'https://region1.google-analytics.com/mp/collect';

function ga4DebugLog(...args) {
  if (GA4_DEBUG_MODE) console.log('[ga4]', ...args);
}

function isGa4Configured() {
  return (
    typeof GA4_MEASUREMENT_ID === 'string' &&
    GA4_MEASUREMENT_ID.startsWith('G-') &&
    typeof GA4_API_SECRET === 'string' &&
    GA4_API_SECRET.length > 0
  );
}

function buildCollectUrl(base) {
  const q = new URLSearchParams({
    measurement_id: GA4_MEASUREMENT_ID,
    api_secret: GA4_API_SECRET
  });
  return `${base}?${q.toString()}`;
}

/**
 * @param {string} name
 * @param {Record<string, string | number>} params
 * @param {{ installId: string, debug?: boolean, audience?: Record<string, string> }} opts
 */
async function postGa4Payload(name, params, opts) {
  if (!isGa4Configured()) {
    ga4DebugLog(
      'no enviado: falta GA4_API_SECRET en shared/telemetryConfig.js (debe ser el secret del flujo',
      GA4_MEASUREMENT_ID + ')'
    );
    return false;
  }

  const audience = opts.audience || {};
  const eventParams = {
    ...audienceParamsForEvent(audience),
    ...params,
    sfoc_install_id: opts.installId,
    /** Requerido por GA4 para DebugView / engagement con Measurement Protocol. */
    engagement_time_msec: 100
  };
  if (opts.debug || GA4_DEBUG_MODE) {
    eventParams.debug_mode = 1;
  }
  const pageLocation =
    typeof params.page_location === 'string' && params.page_location.startsWith('chrome-extension://')
      ? params.page_location
      : `chrome-extension://${chrome.runtime.id}/code/code.html`;
  eventParams.page_location = pageLocation.slice(0, 420);

  const sessionId = await getOrCreateTelemetrySessionId();

  const userProperties = buildGa4UserProperties(audience);

  const body = {
    client_id: opts.installId,
    user_id: opts.installId,
    session_id: sessionId,
    ...(Object.keys(userProperties).length ? { user_properties: userProperties } : {}),
    events: [
      {
        name: name.slice(0, 40),
        params: eventParams,
        timestamp_micros: String(Date.now() * 1000)
      }
    ]
  };

  const useDebugValidation = !!(opts.debug || GA4_DEBUG_MODE);
  const bodyJson = JSON.stringify(body);

  // /debug/mp/collect solo valida; NO aparece en DebugView ni informes.
  if (useDebugValidation) {
    try {
      const debugRes = await fetch(buildCollectUrl(GA4_COLLECT_DEBUG_URL), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyJson,
        keepalive: true
      });
      const text = await debugRes.text().catch(() => '');
      if (text) {
        try {
          const parsed = JSON.parse(text);
          if (parsed?.validationMessages?.length) {
            ga4DebugLog('validationMessages', parsed.validationMessages);
          }
        } catch {
          ga4DebugLog('debug validate', debugRes.status, text.slice(0, 500));
        }
      }
    } catch (e) {
      ga4DebugLog('debug validate failed', String(e || 'unknown'));
    }
  }

  // Producción: con debug_mode=1 en params → DebugView; sin él → informes normales.
  const urls = [buildCollectUrl(GA4_COLLECT_URL), buildCollectUrl(GA4_COLLECT_REGIONAL)];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bodyJson,
        keepalive: true
      });
      if (res.ok || res.status === 204) {
        ga4DebugLog('evento enviado', name, {
          status: res.status,
          debugView: useDebugValidation
        });
        return true;
      }
      ga4DebugLog('HTTP error', res.status, res.statusText, url.split('?')[0]);
    } catch (e) {
      ga4DebugLog('fetch failed', String(e || 'unknown'), url.split('?')[0]);
    }
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

/**
 * @param {Record<string, unknown>} entry Entrada ya pasada por pickUsageLogEntry.
 */
export async function sendGa4UsageEvent(entry) {
  if (!isGa4Configured()) return;
  const ctx = await telemetryContext();
  const mapped = usageEntryToGa4Event(entry, ctx);
  if (!mapped) return;
  const installId = await getOrCreateTelemetryInstallId();
  const pageFromUrl =
    typeof entry.comparisonUrl === 'string' && entry.comparisonUrl.startsWith('chrome-extension://')
      ? { page_location: entry.comparisonUrl.slice(0, 420) }
      : {};
  await postGa4Payload(
    mapped.name,
    { ...mapped.params, ...pageFromUrl },
    {
      installId,
      debug: GA4_DEBUG_MODE,
      audience: ctx.audience
    }
  );
}

/** Ping de prueba para DebugView (mensaje `telemetry:test-ga4`). */
export async function sendGa4TestPing() {
  if (!isGa4Configured()) {
    ga4DebugLog('test ping: GA4 no configurado');
    return false;
  }
  const installId = await getOrCreateTelemetryInstallId();
  const ctx = await telemetryContext();
  return postGa4Payload(
    'sfoc_test_ping',
    {
      sfoc_source: 'extension',
      artifact_type: 'TestPing',
      extension_version: ctx.extensionVersion || '',
      ui_language: ctx.uiLanguage || ''
    },
    { installId, debug: true, audience: ctx.audience }
  );
}

/** Un evento al desactivar telemetría en Ajustes (no respeta telemetryEnabled). */
export async function sendGa4TelemetryOptOut() {
  if (!isGa4Configured()) return;
  const ctx = await telemetryContext();
  const mapped = telemetryOptOutGa4Event(ctx);
  const installId = await getOrCreateTelemetryInstallId();
  await postGa4Payload(mapped.name, mapped.params, {
    installId,
    debug: GA4_DEBUG_MODE,
    audience: ctx.audience
  });
}
