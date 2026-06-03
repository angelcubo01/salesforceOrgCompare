import { loadExtensionSettings } from '../shared/extensionSettings.js';
import { enrichUsageLogWithOrgContext } from '../shared/telemetryOrgContext.js';
import {
  sendPosthogUsageEvent,
  sendPosthogTelemetryOptIn,
  sendPosthogTelemetryOptOut
} from './posthogTelemetry.js';

export function escapeSoqlLiteral(value) {
  const s = String(value == null ? '' : value);
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function appendUsageLog(entry) {
  try {
    const cfg = await loadExtensionSettings();
    if (cfg.telemetryEnabled === false) return;
    const enriched = await enrichUsageLogWithOrgContext(entry);
    await sendPosthogUsageEvent(enriched);
  } catch {
    // no-op
  }
}

/** Registro al desactivar telemetría (ignora telemetryEnabled). */
export async function appendTelemetryOptOutLog() {
  try {
    await sendPosthogTelemetryOptOut();
  } catch {
    // no-op
  }
}

/** Registro al reactivar telemetría en Ajustes. */
export async function appendTelemetryOptInLog() {
  try {
    await sendPosthogTelemetryOptIn();
  } catch {
    // no-op
  }
}
