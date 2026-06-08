import { POSTHOG_DEBUG } from './telemetryConfig.js';
import { getTelemetryEnabled } from './extensionSettings.js';

/** Feature flag remoto (PostHog Remote Config). */
export const SESSION_REPLAY_FLAG = 'sfoc_session_replay';

/**
 * @typedef {{
 *   enabled?: boolean,
 *   sample_rate?: number,
 *   min_duration_ms?: number
 * }} SessionReplayConfig
 */

/** @type {boolean} */
let replayStarted = false;

/** @type {string} */
let lastSkipReason = '';

/**
 * @param {string} reason
 */
function setSkipReason(reason) {
  lastSkipReason = reason;
  if (POSTHOG_DEBUG) console.log('[posthog] session replay skipped:', reason);
}

/**
 * Espera a que posthog-js cargue feature flags (identify + reloadFeatureFlags).
 * @param {import('./posthogClient.js').posthog} ph
 * @param {number} [timeoutMs]
 */
export function waitForFeatureFlags(ph, timeoutMs = 10000) {
  return new Promise((resolve) => {
    if (!ph) {
      resolve(false);
      return;
    }
    let settled = false;
    const done = (ok = true) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    if (typeof ph.onFeatureFlags === 'function') {
      ph.onFeatureFlags(() => done(true));
    }

    try {
      if (typeof ph.reloadFeatureFlags === 'function') {
        ph.reloadFeatureFlags();
      }
    } catch {
      /* ignore */
    }

    setTimeout(() => done(false), timeoutMs);
  });
}

/**
 * Página principal de la app (comparador); no grabar ajustes ni visores Monaco dedicados.
 * @returns {boolean}
 */
export function isSessionReplayPage() {
  if (typeof location === 'undefined') return false;
  const path = String(location.pathname || '');
  return /\/code\/code\.html$/i.test(path) || path.endsWith('/code/code.html');
}

/**
 * Normaliza payload del flag remoto.
 * @param {unknown} raw
 * @returns {SessionReplayConfig}
 */
export function parseSessionReplayPayload(raw) {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return { enabled: true, sample_rate: 0.1, min_duration_ms: 8000 };
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { enabled: true, sample_rate: 0.1, min_duration_ms: 8000 };
  }
  const o = /** @type {Record<string, unknown>} */ (value);
  const enabled = o.enabled !== false;
  let sampleRate = Number(o.sample_rate);
  if (!Number.isFinite(sampleRate) || sampleRate < 0) sampleRate = 0.1;
  if (sampleRate > 1) sampleRate = 1;
  let minDuration = Number(o.min_duration_ms);
  if (!Number.isFinite(minDuration) || minDuration < 0) minDuration = 8000;
  return { enabled, sample_rate: sampleRate, min_duration_ms: minDuration };
}

/**
 * Decide si esta sesión entra en el muestreo client-side.
 * @param {number} sampleRate 0..1
 * @param {() => number} [randomFn]
 */
export function shouldSampleSessionReplay(sampleRate, randomFn = Math.random) {
  const rate = Number(sampleRate);
  if (!Number.isFinite(rate) || rate <= 0) return false;
  if (rate >= 1) return true;
  return randomFn() < rate;
}

/**
 * @param {import('./posthogClient.js').posthog | null | undefined} ph
 */
export function stopSessionReplay(ph) {
  if (!ph || typeof ph.stopSessionRecording !== 'function') return;
  try {
    ph.stopSessionRecording();
    replayStarted = false;
    if (POSTHOG_DEBUG) console.log('[posthog] session replay stopped');
  } catch {
    /* ignore */
  }
}

/**
 * Inicia grabación si telemetría activa, flag habilitado y página permitida.
 * @param {import('./posthogClient.js').posthog | null | undefined} ph
 */
export async function maybeStartSessionReplay(ph) {
  if (!ph || replayStarted) return;
  if (ph.has_opted_out_capturing?.()) {
    setSkipReason('opt_out_capturing');
    return;
  }

  const telemetryEnabled = await getTelemetryEnabled();
  if (!telemetryEnabled) {
    stopSessionReplay(ph);
    setSkipReason('telemetry_disabled');
    return;
  }

  if (!isSessionReplayPage()) {
    setSkipReason('not_code_html');
    return;
  }

  await waitForFeatureFlags(ph);

  let flagOn = true;
  let rawPayload;
  try {
    if (typeof ph.isFeatureEnabled === 'function') {
      const evaluated = ph.isFeatureEnabled(SESSION_REPLAY_FLAG);
      flagOn = evaluated === undefined || evaluated === null ? true : !!evaluated;
    }
    if (typeof ph.getFeatureFlagPayload === 'function') {
      rawPayload = ph.getFeatureFlagPayload(SESSION_REPLAY_FLAG);
    }
  } catch {
    setSkipReason('feature_flags_error');
    return;
  }
  if (!flagOn) {
    setSkipReason('flag_off');
    return;
  }

  const payload = parseSessionReplayPayload(rawPayload);
  if (!payload.enabled) {
    setSkipReason('payload_enabled_false');
    return;
  }

  if (!shouldSampleSessionReplay(payload.sample_rate ?? 0.1)) {
    setSkipReason(`sample_rate_${payload.sample_rate}`);
    return;
  }

  if (typeof ph.startSessionRecording !== 'function') {
    setSkipReason('startSessionRecording_missing');
    return;
  }

  try {
    /** Bypass sampling/linked-flag del proyecto: ya filtramos en cliente. */
    ph.startSessionRecording({ linked_flag: true, sampling: true });
    replayStarted = true;
    lastSkipReason = '';
    if (POSTHOG_DEBUG) console.log('[posthog] session replay started', payload);
  } catch (e) {
    setSkipReason(`start_failed:${String(e?.message || e)}`);
  }
}

/**
 * Diagnóstico rápido en consola (code.html): `await window.sfocDebugSessionReplay()`
 * @param {import('./posthogClient.js').posthog | null | undefined} ph
 */
export async function debugSessionReplay(ph) {
  const out = {
    page: typeof location !== 'undefined' ? location.pathname : '',
    isReplayPage: isSessionReplayPage(),
    telemetryEnabled: await getTelemetryEnabled(),
    replayStarted,
    lastSkipReason,
    optedOut: ph?.has_opted_out_capturing?.() ?? null,
    hasStartFn: typeof ph?.startSessionRecording === 'function',
    sessionRecordingStarted: ph?.sessionRecordingStarted?.() ?? null,
    flagEnabled: null,
    flagPayload: null
  };
  if (ph) {
    await waitForFeatureFlags(ph, 5000);
    try {
      out.flagEnabled = ph.isFeatureEnabled?.(SESSION_REPLAY_FLAG) ?? null;
      out.flagPayload = ph.getFeatureFlagPayload?.(SESSION_REPLAY_FLAG) ?? null;
    } catch {
      /* ignore */
    }
    out.sessionRecordingStarted = ph.sessionRecordingStarted?.() ?? null;
  }
  return out;
}

/**
 * URL de replay actual (si hay grabación activa).
 * @param {import('./posthogClient.js').posthog | null | undefined} ph
 * @returns {string}
 */
export function getSessionReplayUrl(ph) {
  if (!ph || !replayStarted) return '';
  try {
    if (typeof ph.sessionRecordingStarted === 'function' && !ph.sessionRecordingStarted()) {
      return '';
    }
    if (typeof ph.get_session_replay_url === 'function') {
      return String(
        ph.get_session_replay_url({ withTimestamp: true, timestampLookBack: 30 }) || ''
      ).slice(0, 512);
    }
  } catch {
    /* ignore */
  }
  return '';
}

/** Para tests: resetea estado interno. */
export function resetSessionReplayStateForTests() {
  replayStarted = false;
}

/** @returns {boolean} */
export function isSessionReplayStarted() {
  return replayStarted;
}

/**
 * Registra callback tras cargar feature flags.
 * @param {import('./posthogClient.js').posthog} ph
 */
export function hookSessionReplayOnFeatureFlags(ph) {
  if (!ph || ph.__sfocReplayHooked) return;
  ph.__sfocReplayHooked = true;

  const run = () => {
    void maybeStartSessionReplay(ph);
  };

  if (typeof ph.onFeatureFlags === 'function') {
    ph.onFeatureFlags(run);
  }
  if (typeof ph.onFeatureFlagsReady === 'function') {
    ph.onFeatureFlagsReady(run);
  }
}

/** Expone diagnóstico en consola de code.html. */
export function installSessionReplayDebugHook(ph) {
  if (typeof window === 'undefined' || window.__sfocReplayDebugHooked) return;
  window.__sfocReplayDebugHooked = true;
  window.sfocDebugSessionReplay = async () => debugSessionReplay(ph);
  window.sfocStartSessionReplay = async () => maybeStartSessionReplay(ph);
}
