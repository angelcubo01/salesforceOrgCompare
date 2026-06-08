import { t } from '../../shared/i18n.js';
import { getTelemetryEnabled } from '../../shared/extensionSettings.js';
import { isPosthogApiConfigured } from '../../shared/posthogConfigured.js';
import { POSTHOG_DEBUG } from '../../shared/telemetryConfig.js';
import { getPosthogClient, initPosthogClient } from '../../shared/posthogClient.js';
import {
  isPosthogSupportFlagEnabled,
  SUPPORT_FLAG_READY_EVENT
} from '../../shared/posthogSupportFlag.js';
import {
  SUPPORT_READY_EVENT,
  getSupportSetupHintExtensionId,
  showPosthogSupport
} from '../../shared/posthogSupport.js';
import { showToast } from './toast.js';

async function shouldShowSupportButton() {
  if (!isPosthogApiConfigured() || !(await getTelemetryEnabled())) return false;
  const ph = getPosthogClient();
  if (!ph) return false;
  return isPosthogSupportFlagEnabled(ph);
}

/**
 * @param {{ ok: false, reason: string, extensionId?: string, configuredDomains?: string[] | null }} result
 */
function supportFailureMessage(result) {
  const extId = result.extensionId || getSupportSetupHintExtensionId();
  if (result.reason === 'flag_off') {
    return t('toolbar.supportFlagOff');
  }
  if (result.reason === 'domain_not_allowed') {
    return t('toolbar.supportDomainMismatch', { id: extId });
  }
  if (result.reason === 'not_ready') {
    return t('toolbar.supportNotReady');
  }
  return t('toolbar.supportUnavailable', { id: extId });
}

/**
 * Muestra u oculta el botón según telemetría y flag remoto.
 */
export async function refreshAppSupportUi() {
  const btn = document.getElementById('appSupportBtn');
  if (!btn) return;

  const visible = await shouldShowSupportButton();
  btn.classList.toggle('hidden', !visible);
  if (visible) {
    btn.disabled = false;
    btn.title = t('toolbar.supportTitle');
  }
}

export function setupAppSupport() {
  const btn = document.getElementById('appSupportBtn');
  if (!btn) return;

  btn.addEventListener('click', async (ev) => {
    ev.preventDefault();
    if (!(await shouldShowSupportButton())) return;

    let ph = getPosthogClient();
    if (!ph) {
      ph = await initPosthogClient();
    }
    if (!ph) {
      showToast(t('toolbar.supportUnavailable', { id: getSupportSetupHintExtensionId() }), 'warn', {
        bypassCooldown: true,
        title: t('toolbar.support')
      });
      return;
    }

    const result = await showPosthogSupport(ph);
    if (result.ok) return;

    showToast(supportFailureMessage(result), 'warn', {
      bypassCooldown: true,
      title: t('toolbar.support')
    });

    if (POSTHOG_DEBUG) {
      console.warn('[posthog] support show failed', result);
    }
  });

  document.addEventListener(SUPPORT_READY_EVENT, () => {
    void refreshAppSupportUi();
  });
  document.addEventListener(SUPPORT_FLAG_READY_EVENT, () => {
    void refreshAppSupportUi();
  });

  void refreshAppSupportUi();
}
