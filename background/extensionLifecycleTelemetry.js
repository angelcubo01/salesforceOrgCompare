/**
 * Telemetría de instalación, actividad (extensiones con la app «vivas») y desinstalación.
 */
import { UNINSTALL_FEEDBACK_URL } from '../code/core/constants.js';
import { loadExtensionSettings } from '../shared/extensionSettings.js';
import { getOrCreateTelemetryInstallId } from '../shared/telemetryInstallId.js';
import { sendPosthogLifecycleEvent } from './posthogTelemetry.js';

const HEARTBEAT_ALARM = 'sfoc_extension_active';
/** Mínimo entre pings `extension_active` (12 h). */
const ACTIVE_PING_MIN_MS = 12 * 60 * 60 * 1000;
const LAST_ACTIVE_KEY = 'sfoc_last_extension_active_ping';
const INSTALLED_AT_KEY = 'sfoc_extension_installed_at';

/**
 * Registra listeners de ciclo de vida (install, startup, alarm).
 */
export function installExtensionLifecycleTelemetry() {
  chrome.runtime.onInstalled.addListener((details) => {
    void handleExtensionInstalled(details);
  });

  chrome.runtime.onStartup.addListener(() => {
    void maybeSendExtensionActive('browser_startup');
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === HEARTBEAT_ALARM) {
      void maybeSendExtensionActive('scheduled_alarm');
    }
  });

  void ensureActiveHeartbeatAlarm();
  void maybeSendExtensionActive('service_worker_boot');
}

/**
 * @param {chrome.runtime.InstalledDetails} details
 */
export async function handleExtensionInstalled(details) {
  const installId = await getOrCreateTelemetryInstallId();
  await configureUninstallFeedbackUrl(installId);

  const manifest = chrome.runtime.getManifest();
  const version = manifest.version || '';
  const reason = String(details?.reason || 'install');

  if (reason === 'install') {
    const installedAt = new Date().toISOString();
    try {
      await chrome.storage.local.set({ [INSTALLED_AT_KEY]: installedAt });
    } catch {
      /* ignore */
    }
    await sendPosthogLifecycleEvent(
      'extension_installed',
      {
        install_reason: 'install',
        manifest_version: version.slice(0, 32)
      },
      {
        personSet: {
          extension_installed_at: installedAt,
          extension_last_seen_at: installedAt
        }
      }
    );
    await maybeSendExtensionActive('after_install', { force: true });
    return;
  }

  if (reason === 'update') {
    const previous = String(details?.previousVersion || '').slice(0, 32);
    await sendPosthogLifecycleEvent('extension_updated', {
      install_reason: 'update',
      manifest_version: version.slice(0, 32),
      previous_version: previous
    });
    await maybeSendExtensionActive('after_update');
  }
}

/**
 * Ping de extensión instalada y en uso (para MAU / usuarios activos en PostHog).
 * @param {string} [source]
 * @param {{ force?: boolean }} [opts]
 */
export async function maybeSendExtensionActive(source = 'unknown', opts = {}) {
  if (!opts.force) {
    try {
      const cfg = await loadExtensionSettings();
      if (cfg.telemetryEnabled === false) return;
    } catch {
      return;
    }
  }

  const now = Date.now();
  try {
    const r = await chrome.storage.local.get(LAST_ACTIVE_KEY);
    const last = Number(r[LAST_ACTIVE_KEY]);
    if (Number.isFinite(last) && now - last < ACTIVE_PING_MIN_MS) {
      return;
    }
    await chrome.storage.local.set({ [LAST_ACTIVE_KEY]: now });
  } catch {
    /* ignore throttle */
  }

  const seenAt = new Date(now).toISOString();
  const manifest = chrome.runtime.getManifest();
  await sendPosthogLifecycleEvent(
    'extension_active',
    {
      active_source: String(source).slice(0, 64),
      manifest_version: String(manifest.version || '').slice(0, 32)
    },
    {
      force: !!opts.force,
      personSet: { extension_last_seen_at: seenAt }
    }
  );
}

async function ensureActiveHeartbeatAlarm() {
  try {
    const existing = await chrome.alarms.get(HEARTBEAT_ALARM);
    if (existing) return;
    await chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 720 });
  } catch {
    /* ignore */
  }
}

/**
 * Al desinstalar, Chrome abre esta URL (allí puedes capturar `extension_uninstalled` con PostHog web).
 * @param {string} installId
 */
export async function configureUninstallFeedbackUrl(installId) {
  if (!UNINSTALL_FEEDBACK_URL || !installId) return;
  try {
    const manifest = chrome.runtime.getManifest();
    const url = new URL(UNINSTALL_FEEDBACK_URL);
    url.searchParams.set('sfoc', 'uninstall');
    url.searchParams.set('id', installId);
    url.searchParams.set('v', String(manifest.version || '').slice(0, 32));
    await chrome.runtime.setUninstallURL(url.href);
  } catch {
    /* ignore */
  }
}
