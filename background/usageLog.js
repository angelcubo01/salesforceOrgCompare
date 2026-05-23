import { DEBUG_LOGS, USAGE_LOG_ENDPOINT } from './config.js';
import { loadExtensionSettings } from '../shared/extensionSettings.js';
import { getOrCreateTelemetryInstallId } from '../shared/telemetryInstallId.js';
import { sendGa4UsageEvent } from './ga4Telemetry.js';

export function escapeSoqlLiteral(value) {
  const s = String(value == null ? '' : value);
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function buildUsagePayload(entry, extra = {}) {
  const now = new Date().toISOString();
  const manifest = chrome.runtime.getManifest();
  const installId = await getOrCreateTelemetryInstallId();
  return {
    timestamp: now,
    extensionVersion: manifest.version,
    installId,
    ...entry,
    ...extra,
    userAgent: navigator.userAgent || ''
  };
}

async function postUsageLogToGas(entry) {
  const payload = await buildUsagePayload(entry);

  try {
    if (DEBUG_LOGS) console.log('[usage:log] sending (json string)', { endpoint: USAGE_LOG_ENDPOINT });
    const res = await fetch(USAGE_LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload),
      keepalive: true
    });
    if (res.ok) return;
    if (DEBUG_LOGS) console.warn('[usage:log] HTTP error (json string)', { status: res.status, statusText: res.statusText });
  } catch {
    // fallback below
  }

  try {
    if (DEBUG_LOGS) console.log('[usage:log] sending (form fallback)', { endpoint: USAGE_LOG_ENDPOINT });
    const form = new URLSearchParams();
    form.set('payload', JSON.stringify(payload));
    const res = await fetch(USAGE_LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: form.toString(),
      keepalive: true
    });
    if (!res.ok && DEBUG_LOGS) {
      console.warn('[usage:log] HTTP error (form fallback)', { status: res.status, statusText: res.statusText });
    }
  } catch (e2) {
    if (DEBUG_LOGS) console.warn('[usage:log] failed', String(e2 || 'unknown'));
  }
}

export async function appendUsageLog(entry) {
  try {
    const cfg = await loadExtensionSettings();
    if (cfg.telemetryEnabled === false) return;

    const gas = !!USAGE_LOG_ENDPOINT;
    await Promise.allSettled([
      gas ? postUsageLogToGas(entry) : Promise.resolve(),
      sendGa4UsageEvent(entry)
    ]);
  } catch {
    // no-op
  }
}

/** Registro mínimo al desactivar telemetría (ignora telemetryEnabled). */
export async function appendTelemetryOptOutLog() {
  if (!USAGE_LOG_ENDPOINT) return;
  try {
    await postUsageLogToGas({
      kind: 'telemetry',
      artifactType: 'OptOut',
      phase: 'settings'
    });
  } catch {
    // no-op
  }
}
