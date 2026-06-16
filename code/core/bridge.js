import { t } from '../../shared/i18n.js';
import { classifyError, toError } from '../../shared/errorTelemetryPolicy.js';
import { captureUsageLogOnClient } from '../../shared/posthogClient.js';

/**
 * Mensajería con el service worker (background).
 * Las peticiones HTTP a Salesforce las hace el SW, no esta página: no aparecen en la pestaña Red de code.html.
 */
export async function bg(message) {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      return { ok: false, error: t('bridge.noExtensionApi') };
    }
    if (message?.type === 'usage:log') {
      void captureUsageLogOnClient(message.entry || {});
    }
    const res = await chrome.runtime.sendMessage(message);
    if (res === undefined) {
      return { ok: false, error: t('bridge.noBackgroundResponse') };
    }
    return res;
  } catch (e) {
    const err = toError(e);
    const msg = String(err.message || e);
    const category = classifyError(err, {});
    const phase = String(message?.type || 'sendMessage').slice(0, 64);
    try {
      if (category === 'bug') {
        const { reportBug } = await import('../../shared/posthogClient.js');
        reportBug(err, { artifact_type: 'Bridge', phase, error_handled: 1 });
      } else if (category === 'operational') {
        const { reportOperationalFailure } = await import('../../shared/posthogClient.js');
        void reportOperationalFailure({
          artifactType: 'Bridge',
          phase,
          reason: msg,
          error: msg
        });
      }
    } catch {
      /* telemetría no debe romper el bridge */
    }
    return { ok: false, error: msg || t('bridge.noBackgroundResponse') };
  }
}
