/**
 * Service worker (MV3): entry mínimo. Lógica en ./background/
 */
import { installApexTraceAlarmListener } from './background/apexTestTraceAlarms.js';
import { installCookieCacheInvalidation, installMessageHandlers } from './background/messageHandlers.js';
import { installExtensionLifecycleTelemetry } from './background/extensionLifecycleTelemetry.js';
import {
  maybeReportInitialTelemetryPreference,
  installServiceWorkerExceptionCapture
} from './background/posthogTelemetry.js';
import { ensureTelemetryInstallId } from './shared/telemetryInstallId.js';
import { installFeatureControlsGuard } from './background/featureControlsGuard.js';
import { hydrateLogiAdvisorCache } from './shared/logiAdvisorCache.js';
import { bootstrapLogiAdvisorViaProxy } from './shared/logiAdvisorBootstrap.js';
import { loadExtensionSettings } from './shared/extensionSettings.js';
import { sendPosthogException } from './background/posthogTelemetry.js';

try {
  installMessageHandlers();
  void installFeatureControlsGuard();
  void loadExtensionSettings()
    .then(() => hydrateLogiAdvisorCache())
    .then(() => bootstrapLogiAdvisorViaProxy());
  installCookieCacheInvalidation();
  installApexTraceAlarmListener();
  installExtensionLifecycleTelemetry();
  ensureTelemetryInstallId();
  installServiceWorkerExceptionCapture();
  void maybeReportInitialTelemetryPreference();
} catch (e) {
  console.error('[SFOC] service worker no pudo arrancar', e);
  void sendPosthogException(e, {
    error_source: 'service_worker.startup',
    error_handled: 0,
    force_bug: true
  });
}
