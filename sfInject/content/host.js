/**
 * Bootstrap content script (fuente ES module).
 * NO referenciar en manifest.json — Chrome carga sfInject/content/bundle.js (IIFE).
 * Regenerar: npm run build:sf-inject
 */
import { SF_INJECT_CONTENT_INTEGRATIONS } from './injectors/registry.js';
import { fetchSfInjectBootstrap, resolveActiveSavedOrg } from './bridge.js';
import { setInjectStatus, showInjectToast } from './ui.js';
import { instanceUrlFromLocation } from '../lib/instanceUrl.js';
import { isSfInjectIntegrationEnabled } from '../lib/settings.js';

/** @type {Map<string, () => void>} */
const teardownById = new Map();
/** @type {ReturnType<typeof setInterval> | null} */
let retryTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let bootstrapTimer = null;
/** Evita solapar bootstraps async. */
let bootstrapRunning = false;
/** Señal para re-ejecutar tras el bootstrap en curso. */
let bootstrapQueued = false;
/** Última URL observada (SPA / hash). */
let lastHref = location.href;

function clearRetryTimer() {
  if (retryTimer != null) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
}

function teardownAll() {
  for (const teardown of teardownById.values()) teardown();
  teardownById.clear();
  clearRetryTimer();
}

function teardownIntegration(id) {
  const teardown = teardownById.get(id);
  if (teardown) {
    teardown();
    teardownById.delete(id);
  }
}

function anyParentPageActive() {
  return SF_INJECT_CONTENT_INTEGRATIONS.some((item) => item.isParentPageActive());
}

/**
 * Programa un bootstrap debounceado. Evita tormentas en SPA Lightning.
 * @param {number} [delayMs]
 */
function scheduleBootstrap(delayMs = 0) {
  if (bootstrapTimer != null) clearTimeout(bootstrapTimer);
  bootstrapTimer = setTimeout(() => {
    bootstrapTimer = null;
    void runBootstrap();
  }, delayMs);
}

async function runBootstrap() {
  if (bootstrapRunning) {
    bootstrapQueued = true;
    return;
  }
  bootstrapRunning = true;
  bootstrapQueued = false;
  try {
    await bootstrap();
  } finally {
    bootstrapRunning = false;
    if (bootstrapQueued) {
      bootstrapQueued = false;
      scheduleBootstrap(50);
    }
  }
}

async function bootstrap() {
  if (!anyParentPageActive()) {
    setInjectStatus('off-page');
    teardownAll();
    return;
  }

  // Filtrar frames irrelevantes ANTES de hablar con el service worker
  // (Lightning carga muchos iframes; sin esto cada uno hacía 2 round-trips).
  const relevantIntegrations = SF_INJECT_CONTENT_INTEGRATIONS.filter(
    (item) => item.isParentPageActive() && item.isFrameRelevant(document)
  );
  if (!relevantIntegrations.length) {
    setInjectStatus(window.top === window ? 'shell' : 'off-page');
    teardownAll();
    return;
  }

  const bootstrapRes = await fetchSfInjectBootstrap();
  if (!bootstrapRes?.ok || !bootstrapRes.settings) {
    setInjectStatus('bootstrap-failed');
    teardownAll();
    return;
  }

  const settings = bootstrapRes.settings;
  if (!settings.enabled) {
    setInjectStatus('disabled');
    teardownAll();
    return;
  }

  const enabledRelevantIntegrations = relevantIntegrations.filter((item) =>
    isSfInjectIntegrationEnabled(settings, item.id)
  );
  const allowsNoSavedOrg = enabledRelevantIntegrations.some((item) => item.requiresSavedOrg === false);
  const instanceUrl = instanceUrlFromLocation();
  const orgRes = await resolveActiveSavedOrg(instanceUrl);
  if ((!orgRes?.ok || !orgRes.orgId) && !allowsNoSavedOrg) {
    setInjectStatus('org-not-saved');
    teardownAll();
    return;
  }

  const lang = bootstrapRes.lang === 'en' ? 'en' : 'es';
  const ctx = {
    orgId: orgRes?.ok && orgRes.orgId ? orgRes.orgId : '',
    lang,
    prefs: settings.prefs || {},
    onError: (msg) => showInjectToast(msg, true)
  };

  let mountedAny = false;
  const relevantIds = new Set(relevantIntegrations.map((item) => item.id));

  for (const integration of SF_INJECT_CONTENT_INTEGRATIONS) {
    if (!relevantIds.has(integration.id)) {
      teardownIntegration(integration.id);
      continue;
    }

    if (!isSfInjectIntegrationEnabled(settings, integration.id)) {
      teardownIntegration(integration.id);
      continue;
    }

    if (!ctx.orgId && integration.requiresSavedOrg !== false) {
      teardownIntegration(integration.id);
      continue;
    }

    if (!teardownById.has(integration.id)) {
      teardownById.set(integration.id, integration.mount(document, ctx));
    }
    mountedAny = true;
  }

  if (!mountedAny) {
    setInjectStatus(window.top === window ? 'shell' : 'off-page');
    clearRetryTimer();
    return;
  }

  setInjectStatus('mounting');

  // Solo arrancar el retry si aún no hay uno activo (no reiniciarlo en cada bootstrap).
  if (retryTimer == null) {
    let attempts = 0;
    retryTimer = setInterval(() => {
      attempts += 1;
      if (attempts > 40) {
        clearRetryTimer();
        return;
      }
      for (const integration of SF_INJECT_CONTENT_INTEGRATIONS) {
        if (!relevantIds.has(integration.id)) continue;
        if (!isSfInjectIntegrationEnabled(settings, integration.id)) continue;
        integration.retryInject?.(document, ctx);
      }
    }, 1500);
  }
}

function startInitialBootstrap() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleBootstrap(0), { once: true });
  } else {
    scheduleBootstrap(0);
  }
}

startInitialBootstrap();

/**
 * Observa solo cambios de navegación SPA (URL), NO cada mutación DOM.
 * Antes: cada cambio del DOM relanzaba bootstrap() → ralentizaba Lightning.
 */
function checkHrefChanged() {
  if (location.href === lastHref) return;
  lastHref = location.href;
  teardownAll();
  scheduleBootstrap(100);
}

window.addEventListener('popstate', checkHrefChanged);
window.addEventListener('hashchange', checkHrefChanged);

// Lightning a veces cambia la URL sin popstate; muestreo barato.
setInterval(checkHrefChanged, 1000);

try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.sfoc_sf_inject) {
      teardownAll();
      scheduleBootstrap(50);
    }
  });
} catch {
  /* ignore */
}
