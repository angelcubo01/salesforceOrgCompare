import { state } from '../core/state.js';
import { t } from '../../shared/i18n.js';
import {
  ONBOARDING_PREFS_KEY,
  normalizeOnboardingPrefs,
  hasSeenTool,
  markToolSeenInPrefs,
  markHelpOpenedInPrefs
} from '../../shared/onboardingPrefs.js';

const APP_NAV_MODE_HOME = 'home';

const HELP_MODES = ['home', 'comparator', 'development', 'monitoring', 'manifests'];

/** @type {Record<string, string[]>} */
const HELP_MODE_BODY_KEYS = {
  home: [
    'help.mode.home.body1',
    'help.mode.home.body2',
    'help.mode.home.body3',
    'help.mode.home.body4'
  ],
  comparator: [
    'help.mode.comparator.body1',
    'help.mode.comparator.body2',
    'help.mode.comparator.body3',
    'help.mode.comparator.body4',
    'help.mode.comparator.body5'
  ],
  development: [
    'help.mode.development.body1',
    'help.mode.development.body2',
    'help.mode.development.body3',
    'help.mode.development.body4'
  ],
  monitoring: [
    'help.mode.monitoring.body1',
    'help.mode.monitoring.body2',
    'help.mode.monitoring.body3',
    'help.mode.monitoring.body4',
    'help.mode.monitoring.body5',
    'help.mode.monitoring.body6',
    'help.mode.monitoring.body7'
  ],
  manifests: ['help.mode.manifests.body1', 'help.mode.manifests.body2', 'help.mode.manifests.body3']
};

let prefsCache = normalizeOnboardingPrefs(null);
let prefsLoaded = false;

/** @type {'help' | 'onboarding' | null} */
let modalKind = null;

/** @type {string | null} */
let onboardingToolId = null;

async function loadPrefs() {
  try {
    const result = await chrome.storage.local.get(ONBOARDING_PREFS_KEY);
    prefsCache = normalizeOnboardingPrefs(result[ONBOARDING_PREFS_KEY]);
  } catch {
    prefsCache = normalizeOnboardingPrefs(null);
  }
  prefsLoaded = true;
  return prefsCache;
}

async function savePrefs(prefs) {
  prefsCache = prefs;
  try {
    await chrome.storage.local.set({ [ONBOARDING_PREFS_KEY]: prefs });
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} key
 * @param {number} maxSteps
 */
function collectOnboardingSteps(key, maxSteps = 4) {
  /** @type {string[]} */
  const steps = [];
  const lead = t(`${key}.lead`);
  if (lead && lead !== `${key}.lead`) steps.push(lead);
  for (let i = 1; i <= maxSteps; i++) {
    const stepKey = `${key}.step${i}`;
    const text = t(stepKey);
    if (!text || text === stepKey) break;
    steps.push(text);
  }
  return steps;
}

/**
 * @param {HTMLElement} bodyEl
 * @param {string[]} paragraphs
 */
function fillModalBody(bodyEl, paragraphs) {
  bodyEl.innerHTML = '';
  for (const text of paragraphs) {
    const p = document.createElement('p');
    p.textContent = text;
    bodyEl.appendChild(p);
  }
}

function syncModalChrome() {
  const footer = document.getElementById('appHelpModalFooter');
  const closeBtn = document.getElementById('appHelpModalCloseBtn');
  const primaryBtn = document.getElementById('appHelpModalPrimaryBtn');
  const isOnboarding = modalKind === 'onboarding';

  footer?.classList.toggle('hidden', !isOnboarding);
  if (closeBtn) {
    closeBtn.classList.toggle('hidden', isOnboarding);
  }
  if (primaryBtn) {
    primaryBtn.textContent = t('onboarding.gotIt');
  }
}

/**
 * @param {string} [mode]
 */
export function refreshHelpModalContent(mode) {
  const titleEl = document.getElementById('appHelpModalTitle');
  const bodyEl = document.getElementById('appHelpModalBody');
  if (!titleEl || !bodyEl) return;

  const resolved =
    mode ||
    (state.appNavMode === APP_NAV_MODE_HOME ? 'home' : state.appNavMode) ||
    'home';
  const safeMode = HELP_MODES.includes(resolved) ? resolved : 'home';

  const titleKey = `help.mode.${safeMode}.title`;
  const title = t(titleKey);
  titleEl.textContent = title !== titleKey ? title : t('help.title');

  const paragraphs = [];
  const keys = HELP_MODE_BODY_KEYS[safeMode] || [];
  for (const bodyKey of keys) {
    const text = t(bodyKey);
    if (!text || text === bodyKey) continue;
    paragraphs.push(text);
  }
  fillModalBody(bodyEl, paragraphs);
}

/**
 * @param {string} tool
 */
function refreshToolOnboardingModalContent(tool) {
  const titleEl = document.getElementById('appHelpModalTitle');
  const bodyEl = document.getElementById('appHelpModalBody');
  if (!titleEl || !bodyEl) return;

  const key = `onboarding.tool.${tool}`;
  const title = t(`${key}.title`);
  titleEl.textContent = title !== `${key}.title` ? title : t('help.title');
  fillModalBody(bodyEl, collectOnboardingSteps(key));
}

function showModal() {
  const modal = document.getElementById('appHelpModal');
  if (!modal) return;
  syncModalChrome();
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  (modalKind === 'onboarding'
    ? document.getElementById('appHelpModalPrimaryBtn')
    : document.getElementById('appHelpModalCloseBtn')
  )?.focus();
}

export function openHelpModal() {
  modalKind = 'help';
  onboardingToolId = null;
  refreshHelpModalContent();
  showModal();
  void (async () => {
    if (!prefsLoaded) await loadPrefs();
    const prefs = markHelpOpenedInPrefs(prefsCache);
    await savePrefs(prefs);
  })();
}

/**
 * @param {string} tool
 */
export function openToolOnboardingModal(tool) {
  modalKind = 'onboarding';
  onboardingToolId = tool;
  refreshToolOnboardingModalContent(tool);
  showModal();
}

function hideModal() {
  const modal = document.getElementById('appHelpModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  modalKind = null;
  onboardingToolId = null;
}

/**
 * @param {boolean} [markOnboardingSeen]
 */
export async function closeHelpModal(markOnboardingSeen = true) {
  const modal = document.getElementById('appHelpModal');
  if (!modal || modal.classList.contains('hidden')) return;

  if (modalKind === 'onboarding' && onboardingToolId && markOnboardingSeen) {
    const prefs = markToolSeenInPrefs(prefsCache, onboardingToolId);
    await savePrefs(prefs);
  }

  hideModal();
  document.getElementById('appHelpBtn')?.focus();
}

/** Actualiza el modal de ayuda por modo si está abierto (no interrumpe onboarding). */
export function refreshHelpModalIfOpen() {
  const modal = document.getElementById('appHelpModal');
  if (!modal || modal.classList.contains('hidden') || modalKind !== 'help') return;
  refreshHelpModalContent();
}

/**
 * @param {string} tool
 */
export async function maybeShowToolOnboarding(tool) {
  if (!tool) return;
  if (!prefsLoaded) await loadPrefs();

  if (hasSeenTool(prefsCache, tool)) {
    if (modalKind === 'onboarding') await closeHelpModal(false);
    return;
  }

  if (modalKind === 'onboarding' && onboardingToolId !== tool) {
    hideModal();
  }

  openToolOnboardingModal(tool);
}

export function setupAppHelp() {
  const helpBtn = document.getElementById('appHelpBtn');
  const modal = document.getElementById('appHelpModal');
  const closeBtn = document.getElementById('appHelpModalCloseBtn');
  const primaryBtn = document.getElementById('appHelpModalPrimaryBtn');
  const backdrop = modal?.querySelector('[data-app-help-backdrop]');

  helpBtn?.addEventListener('click', (ev) => {
    ev.preventDefault();
    openHelpModal();
  });

  closeBtn?.addEventListener('click', () => {
    void closeHelpModal();
  });
  primaryBtn?.addEventListener('click', () => {
    void closeHelpModal();
  });
  backdrop?.addEventListener('click', () => {
    void closeHelpModal();
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (modal && !modal.classList.contains('hidden')) {
      ev.preventDefault();
      void closeHelpModal();
    }
  });

  void loadPrefs();
}
