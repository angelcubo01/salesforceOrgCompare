import { getCurrentLang, t } from '../../shared/i18n.js';
import { getTelemetryEnabled } from '../../shared/extensionSettings.js';
import { getPosthogClient } from '../../shared/posthogClient.js';
import {
  getGlobalNotice,
  getToolNotice,
  isActionDisabled,
  getActionNotice,
  getActionInfoNotice
} from '../../shared/featureControls.js';
import {
  FEATURE_CONTROLS_READY_EVENT,
  getCachedFeatureControlsConfig
} from '../../shared/posthogFeatureControlsFlag.js';
import { FEATURE_CONTROLS_STORAGE_KEY } from '../../shared/featureControlsCache.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import {
  applyFeatureControlsNavigation,
  syncFeatureControlsModeTabs
} from './appModeNav.js';
import { showToast } from './toast.js';

const DISMISS_PREFIX = 'sfoc_fc_dismiss_';

/** @type {string | null} */
let activeToolDismissKey = null;

/**
 * @param {string} key
 */
function isNoticeDismissed(key) {
  try {
    return sessionStorage.getItem(DISMISS_PREFIX + key) === '1';
  } catch {
    return false;
  }
}

/**
 * @param {string} key
 */
function dismissNotice(key) {
  try {
    sessionStorage.setItem(DISMISS_PREFIX + key, '1');
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} text
 */
function noticeDismissKey(text) {
  return String(text || '').slice(0, 120);
}

function langCode() {
  return getCurrentLang();
}

export function getFeatureControlsConfig() {
  return getCachedFeatureControlsConfig();
}

/**
 * @param {string} actionId
 * @returns {boolean} true si la acción está bloqueada (muestra toast)
 */
export function guardToolAction(actionId) {
  const config = getFeatureControlsConfig();
  if (!isActionDisabled(config, actionId)) return false;
  const notice = getActionNotice(config, actionId, langCode());
  showToast(
    notice?.message || t('featureControls.actionBlocked'),
    notice?.severity === 'error' ? 'error' : 'warn',
    { bypassCooldown: true, title: t('featureControls.blockedTitle') }
  );
  void maybeCaptureFeatureControlBlocked({ action: actionId });
  return true;
}

/**
 * @param {{ tool?: string, action?: string }} detail
 */
async function maybeCaptureFeatureControlBlocked(detail) {
  if (!(await getTelemetryEnabled())) return;
  const ph = getPosthogClient();
  if (!ph?.capture) return;
  try {
    ph.capture('feature_control_blocked', detail);
  } catch {
    /* ignore */
  }
}

/**
 * @param {HTMLElement} el
 * @param {{ message: string, severity: string, blocking: boolean, url?: string }} notice
 * @param {string} dismissKey
 */
function renderGlobalBanner(el, notice, dismissKey) {
  if (!el || !notice) return;
  el.className = `feature-controls-banner feature-controls-banner--${notice.severity}`;
  el.hidden = false;
  el.classList.remove('hidden');
  el.innerHTML = '';

  const text = document.createElement('span');
  text.className = 'feature-controls-banner-text';
  text.textContent = notice.message;
  el.appendChild(text);

  if (notice.url) {
    const link = document.createElement('a');
    link.className = 'feature-controls-banner-link';
    link.href = notice.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = t('featureControls.moreInfo');
    el.appendChild(link);
  }

  if (!notice.blocking) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'feature-controls-banner-dismiss';
    btn.textContent = t('featureControls.dismiss');
    btn.addEventListener('click', () => {
      dismissNotice(dismissKey);
      el.hidden = true;
      el.classList.add('hidden');
      el.innerHTML = '';
    });
    el.appendChild(btn);
  }
}

function applyGlobalBanner() {
  const el = document.getElementById('featureControlsGlobalBanner');
  if (!el) return;
  const notice = getGlobalNotice(getFeatureControlsConfig(), langCode());
  const dismissKey = notice ? `global:${noticeDismissKey(notice.message)}` : '';
  if (!notice || (!notice.blocking && isNoticeDismissed(dismissKey))) {
    el.hidden = true;
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  renderGlobalBanner(el, notice, dismissKey);
}

function hideToolModal() {
  const modal = document.getElementById('featureControlsToolModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  modal.classList.remove('feature-controls-tool-modal--blocking');
  activeToolDismissKey = null;
}

/**
 * @param {{ message: string, severity: string, blocking: boolean, url?: string }} notice
 * @param {string} dismissKey
 */
function showToolModal(notice, dismissKey) {
  const modal = document.getElementById('featureControlsToolModal');
  const backdrop = document.getElementById('featureControlsToolModalBackdrop');
  const titleEl = document.getElementById('featureControlsToolModalTitle');
  const bodyEl = document.getElementById('featureControlsToolModalBody');
  const closeBtn = document.getElementById('featureControlsToolModalCloseBtn');
  const foot = document.getElementById('featureControlsToolModalFoot');
  const link = document.getElementById('featureControlsToolModalLink');
  const dismissBtn = document.getElementById('featureControlsToolModalDismissBtn');
  if (!modal || !titleEl || !bodyEl) return;

  const blocking = notice.blocking === true;
  activeToolDismissKey = dismissKey;

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  modal.classList.toggle('feature-controls-tool-modal--blocking', blocking);
  modal.classList.remove(
    'feature-controls-tool-modal--info',
    'feature-controls-tool-modal--warn',
    'feature-controls-tool-modal--error'
  );
  modal.classList.add(`feature-controls-tool-modal--${notice.severity || 'warn'}`);

  titleEl.textContent = t(
    blocking ? 'featureControls.blockedTitle' : 'featureControls.noticeTitle'
  );
  bodyEl.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = notice.message;
  bodyEl.appendChild(p);

  if (closeBtn) {
    closeBtn.classList.toggle('hidden', blocking);
    closeBtn.textContent = t('help.close');
    closeBtn.setAttribute('aria-label', t('help.close'));
  }

  if (foot && dismissBtn) {
    const showFoot = !blocking || !!notice.url;
    foot.classList.toggle('hidden', !showFoot);
    dismissBtn.classList.toggle('hidden', blocking);
    dismissBtn.textContent = t('featureControls.dismiss');
  }

  if (link) {
    if (notice.url) {
      link.href = notice.url;
      link.textContent = t('featureControls.moreInfo');
      link.classList.remove('hidden');
    } else {
      link.classList.add('hidden');
      link.removeAttribute('href');
    }
  }

  if (backdrop) {
    backdrop.dataset.dismissible = blocking ? 'false' : 'true';
  }
}

function dismissActiveToolModal() {
  if (activeToolDismissKey) dismissNotice(activeToolDismissKey);
  hideToolModal();
}

function applyToolModal() {
  const tool = getSelectedArtifactType();
  const notice = tool ? getToolNotice(getFeatureControlsConfig(), tool, langCode()) : null;
  if (!notice) {
    hideToolModal();
    return;
  }
  const dismissKey = `tool:${tool}:${noticeDismissKey(notice.message)}`;
  if (!notice.blocking && isNoticeDismissed(dismissKey)) {
    hideToolModal();
    return;
  }
  showToolModal(notice, dismissKey);
}

/**
 * Muestra el aviso informativo de una acción (p. ej. beta en Importación masiva).
 * @param {string} actionId
 */
export function showActionInfoNotice(actionId) {
  const notice = getActionInfoNotice(getFeatureControlsConfig(), actionId, langCode());
  if (!notice) {
    hideToolModal();
    return;
  }
  const dismissKey = `action:${actionId}:${noticeDismissKey(notice.message)}`;
  if (!notice.blocking && isNoticeDismissed(dismissKey)) return;
  showToolModal(notice, dismissKey);
}

export function applyFeatureControlsUi() {
  applyGlobalBanner();
  applyToolModal();
  applyFeatureControlsNavigation();
  syncFeatureControlsModeTabs();
}

export function setupFeatureControlsUi() {
  const modal = document.getElementById('featureControlsToolModal');
  const backdrop = document.getElementById('featureControlsToolModalBackdrop');
  const closeBtn = document.getElementById('featureControlsToolModalCloseBtn');
  const dismissBtn = document.getElementById('featureControlsToolModalDismissBtn');

  closeBtn?.addEventListener('click', () => dismissActiveToolModal());
  dismissBtn?.addEventListener('click', () => dismissActiveToolModal());
  backdrop?.addEventListener('click', () => {
    if (backdrop.dataset.dismissible === 'true') dismissActiveToolModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !modal || modal.classList.contains('hidden')) return;
    if (modal.classList.contains('feature-controls-tool-modal--blocking')) return;
    dismissActiveToolModal();
  });

  document.addEventListener(FEATURE_CONTROLS_READY_EVENT, () => {
    applyFeatureControlsUi();
  });

  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[FEATURE_CONTROLS_STORAGE_KEY]) {
        applyFeatureControlsUi();
      }
    });
  }
}
