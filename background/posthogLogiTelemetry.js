import { loadExtensionSettings } from '../shared/extensionSettings.js';
import { getOrCreateTelemetryInstallId } from '../shared/telemetryInstallId.js';
import { buildSfocAiUserProperties } from '../shared/posthogAiUserContext.js';
import { sanitizeLogiTelemetryProps } from '../shared/logiAiMetrics.js';
import { LOGI_FEATURE } from '../shared/logiTelemetryConstants.js';
import { POSTHOG_DEBUG } from '../shared/telemetryConfig.js';
import { readLogiUsageSnapshot } from './logiAdvisorUsage.js';
import { sendPosthogLogiUsage } from './posthogTelemetry.js';

export { LOGI_USAGE_EVENT, LOGI_FEATURE } from '../shared/logiTelemetryConstants.js';

/** @returns {Promise<boolean>} */
export async function isLogiTelemetryEnabled() {
  try {
    const cfg = await loadExtensionSettings();
    return cfg.telemetryEnabled !== false;
  } catch {
    return false;
  }
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {Promise<boolean>}
 */
function logiTelemetryDebug(...args) {
  if (POSTHOG_DEBUG) console.log('[posthog][logi]', ...args);
}

export async function captureLogiUsage(payload) {
  if (!(await isLogiTelemetryEnabled())) {
    logiTelemetryDebug('omitido: telemetría desactivada');
    return false;
  }

  try {
    const installId = await getOrCreateTelemetryInstallId();
    const action = String(payload.action || '').slice(0, 64);
    if (!action) {
      logiTelemetryDebug('omitido: action vacío', payload);
      return false;
    }

    const base = sanitizeLogiTelemetryProps({
      action,
      sfoc_feature: LOGI_FEATURE,
      ...payload
    });
    delete base.action;

    /** @type {Record<string, string>} */
    const personProperties = {
      ...buildSfocAiUserProperties(installId)
    };

    if (action === 'llm_response') {
      const snap = await readLogiUsageSnapshot();
      if (base.sfoc_model) personProperties.sfoc_ai_last_model = String(base.sfoc_model).slice(0, 120);
      personProperties.sfoc_ai_last_used_at = new Date().toISOString();
      if (snap.llmCallsTotal != null) {
        personProperties.sfoc_ai_total_llm_calls = String(snap.llmCallsTotal);
      }
    }

    if (action === 'error') {
      if (base.sfoc_error_reason) {
        personProperties.sfoc_ai_last_error_reason = String(base.sfoc_error_reason).slice(0, 64);
      }
      if (base.sfoc_error_code) {
        personProperties.sfoc_ai_last_error_code = String(base.sfoc_error_code).slice(0, 64);
      }
      personProperties.sfoc_ai_last_error_at = new Date().toISOString();
    }

    const sent = await sendPosthogLogiUsage({
      installId,
      action,
      properties: base,
      personProperties
    });
    if (!sent) logiTelemetryDebug('no enviado', action);
    return sent;
  } catch (e) {
    logiTelemetryDebug('error', String(e?.message || e));
    return false;
  }
}
