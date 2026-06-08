import { POSTHOG_API_KEY, POSTHOG_DEBUG, POSTHOG_HOST } from './telemetryConfig.js';
import { getTelemetryEnabled } from './extensionSettings.js';
import { isPosthogApiConfigured } from './posthogConfigured.js';

/** @type {boolean} */
let supportReady = false;

/** @type {ReturnType<typeof setTimeout> | null} */
let waitTimer = null;

const SUPPORT_READY_EVENT = 'sfoc:posthog-support-ready';
const SUPPORT_BUBBLE_STYLE_ID = 'sfoc-ph-support-bubble-style';
const MAX_WAIT_ATTEMPTS = 60;
const WAIT_MS = 500;

export function isPosthogSupportReady() {
  return supportReady;
}

export function resetPosthogSupport() {
  supportReady = false;
  if (waitTimer) {
    clearTimeout(waitTimer);
    waitTimer = null;
  }
}

/** Quita la burbuja flotante de PostHog y bloquea auto-carga hasta activar el flag. */
export function dismissPosthogConversationsWidget(ph) {
  resetPosthogSupport();
  try {
    if (typeof ph?.set_config === 'function') {
      ph.set_config({ disable_conversations: true });
    }
  } catch {
    /* ignore */
  }
  try {
    ph?.conversations?.hide?.();
  } catch {
    /* ignore */
  }
  try {
    document.getElementById('ph-conversations-widget-container')?.remove();
  } catch {
    /* ignore */
  }
}

/** Permite cargar conversations tras evaluar el flag sfoc_support. */
export async function enablePosthogConversationsWidget(ph) {
  if (!ph) return;
  try {
    if (typeof ph.set_config === 'function') {
      ph.set_config({ disable_conversations: false });
    }
  } catch {
    /* ignore */
  }
  if (typeof ph.reloadFeatureFlags === 'function') {
    ph.reloadFeatureFlags();
  }
  if (typeof ph.conversations?.loadIfEnabled === 'function') {
    ph.conversations.loadIfEnabled();
  }
}

function markSupportReady() {
  if (supportReady) return;
  supportReady = true;
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent(SUPPORT_READY_EVENT));
  }
  if (POSTHOG_DEBUG) {
    console.log('[posthog] support widget ready');
  }
}

/** Oculta la burbuja flotante; el chat se abre desde la toolbar. */
function hideDefaultSupportBubble() {
  if (typeof document === 'undefined' || document.getElementById(SUPPORT_BUBBLE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SUPPORT_BUBBLE_STYLE_ID;
  style.textContent = `
    #ph-conversations-widget-container > div > div > button[aria-label*="Open chat"] {
      display: none !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(style);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForNextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

/** @returns {string} */
export function getSupportExtensionHostname() {
  try {
    if (typeof location !== 'undefined' && location.hostname) return location.hostname;
  } catch {
    /* ignore */
  }
  return getSupportSetupHintExtensionId();
}

/**
 * Réplica del matcher de dominios de posthog-js/conversations.
 * @param {string[] | undefined | null} domains
 * @param {string} [hostname]
 */
export function extensionMatchesSupportDomains(domains, hostname = getSupportExtensionHostname()) {
  if (!domains?.length) return true;
  if (!hostname) return false;
  return domains.some((entry) => {
    const parsed = String(entry || '')
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .split('?')[0]
      .split(':')[0];
    if (!parsed) return false;
    if (parsed.startsWith('*.')) {
      const suffix = parsed.slice(2);
      return hostname.endsWith(`.${suffix}`) || hostname === suffix;
    }
    return hostname === parsed;
  });
}

/**
 * @param {import('../vendor/posthog-js/dist/module.no-external.js').default} ph
 * @returns {Promise<string[] | null>}
 */
export async function fetchRemoteConversationsDomains(ph) {
  if (!ph || !POSTHOG_API_KEY) return null;
  try {
    const res = await fetch(`${POSTHOG_HOST}/flags?v=2&config=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_API_KEY,
        distinct_id: typeof ph.get_distinct_id === 'function' ? ph.get_distinct_id() : 'sfoc-support'
      })
    });
    if (!res.ok) return null;
    const json = await res.json();
    return Array.isArray(json?.conversations?.domains) ? json.conversations.domains : [];
  } catch {
    return null;
  }
}

function openSupportChatPanel() {
  const container = document.getElementById('ph-conversations-widget-container');
  if (!container) return false;

  const launcher = container.querySelector('button[aria-label*="Open chat"]');
  if (launcher instanceof HTMLButtonElement) {
    launcher.click();
    return true;
  }

  return Boolean(container.querySelector('textarea, form input[type="email"]'));
}

/**
 * @param {import('../vendor/posthog-js/dist/module.no-external.js').default} ph
 * @param {number} [attempt]
 */
function pollConversationsReady(ph, attempt = 0) {
  if (ph?.conversations?.isAvailable?.()) {
    hideDefaultSupportBubble();
    markSupportReady();
    return;
  }
  if (attempt >= MAX_WAIT_ATTEMPTS) {
    if (POSTHOG_DEBUG) {
      console.warn('[posthog] support widget not available after timeout');
    }
    return;
  }
  waitTimer = setTimeout(() => pollConversationsReady(ph, attempt + 1), WAIT_MS);
}

/**
 * @param {import('../vendor/posthog-js/dist/module.no-external.js').default} ph
 * @param {number} [attempt]
 * @returns {Promise<boolean>}
 */
export async function waitForConversationsAvailable(ph, attempt = 0) {
  if (ph?.conversations?.isAvailable?.()) {
    hideDefaultSupportBubble();
    markSupportReady();
    return true;
  }

  if (typeof ph?.reloadFeatureFlags === 'function' && attempt === 0) {
    ph.reloadFeatureFlags();
  }

  if (attempt >= MAX_WAIT_ATTEMPTS) return false;
  await sleep(WAIT_MS);
  return waitForConversationsAvailable(ph, attempt + 1);
}

/**
 * Prepara PostHog Support: espera remote config y oculta la burbuja flotante.
 * @param {import('../vendor/posthog-js/dist/module.no-external.js').default} ph
 */
export async function initPosthogSupport(ph) {
  if (!ph || !isPosthogApiConfigured()) return;

  const telemetryEnabled = await getTelemetryEnabled();
  if (!telemetryEnabled) {
    resetPosthogSupport();
    return;
  }

  resetPosthogSupport();
  pollConversationsReady(ph);
}

/**
 * @param {import('../vendor/posthog-js/dist/module.no-external.js').default | null | undefined} ph
 * @returns {Promise<
 *   { ok: true }
 *   | { ok: false, reason: string, extensionId?: string, configuredDomains?: string[] | null }
 * >}
 */
export async function showPosthogSupport(ph) {
  if (!ph?.conversations?.show) {
    return { ok: false, reason: 'api_unavailable' };
  }

  const { isPosthogSupportFlagEnabled } = await import('./posthogSupportFlag.js');
  if (!(await isPosthogSupportFlagEnabled(ph))) {
    return { ok: false, reason: 'flag_off' };
  }

  const ready = await waitForConversationsAvailable(ph);
  if (!ready) {
    return { ok: false, reason: 'not_ready' };
  }

  const extensionId = getSupportExtensionHostname();
  const configuredDomains = await fetchRemoteConversationsDomains(ph);
  if (configuredDomains && !extensionMatchesSupportDomains(configuredDomains, extensionId)) {
    return {
      ok: false,
      reason: 'domain_not_allowed',
      extensionId,
      configuredDomains
    };
  }

  ph.conversations.show();
  hideDefaultSupportBubble();
  await waitForNextFrame();

  if (openSupportChatPanel()) {
    return { ok: true };
  }

  if (ph.conversations.isVisible?.()) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: 'widget_not_found',
    extensionId,
    configuredDomains
  };
}

/** @returns {string} */
export function getSupportSetupHintExtensionId() {
  try {
    return typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.id : '';
  } catch {
    return '';
  }
}

export { SUPPORT_READY_EVENT };
