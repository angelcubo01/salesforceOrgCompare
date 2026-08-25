import { state } from '../core/state.js';
import { t } from '../../shared/i18n.js';
import {
  ONBOARDING_PREFS_KEY,
  normalizeOnboardingPrefs,
  hasSeenTool,
  markToolSeenInPrefs,
  markHelpOpenedInPrefs
} from '../../shared/onboardingPrefs.js';
import {
  HELP_HOME_ID,
  HELP_TOOL_IDS,
  ALL_ONBOARDING_TOOLS,
  helpToolTitleKey,
  helpToolBodyKeys
} from '../../shared/helpToolIds.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import {
  dismissDriverOnboardingForNavigation,
  getActiveDriverOnboardingTool,
  startDriverToolOnboarding,
  stopDriverToolOnboarding
} from './driverOnboarding.js';
import { waitForPosthogSurveyPopupToClose } from './posthogSurveyGate.js';
import { mountSfocOverlay, unmountSfocOverlay } from './sfocModal.js';

const APP_NAV_MODE_HOME = 'home';

let prefsCache = normalizeOnboardingPrefs(null);
let prefsLoaded = false;

/** @type {'help' | 'onboarding' | null} */
let modalKind = null;

/** @type {string | null} */
let onboardingToolId = null;

let posthogSurveyOrderingReady = false;

function ensurePosthogSurveyTourOrdering() {
  if (posthogSurveyOrderingReady || typeof window === 'undefined') return;
  posthogSurveyOrderingReady = true;
  window.addEventListener('PHSurveyShown', () => {
    const interruptedTool = getActiveDriverOnboardingTool();
    if (!interruptedTool) return;
    void (async () => {
      // No se marca como visto: el recorrido debe poder comenzar de nuevo al cerrar PostHog.
      await stopDriverToolOnboarding('cancelled');
      await waitForPosthogSurveyPopupToClose();
      if (getSelectedArtifactType() === interruptedTool) {
        await maybeShowToolOnboarding(interruptedTool);
      }
    })();
  });
}

function isV2() {
  return document.body?.dataset.uiMode === 'v2';
}

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
  const tourBtn = document.getElementById('appHelpModalTourBtn');
  const isOnboarding = modalKind === 'onboarding';
  const helpToolId = modalKind === 'help' ? resolveHelpToolId() : null;
  const canStartTour = isV2() && !!helpToolId && ALL_ONBOARDING_TOOLS.includes(helpToolId);

  footer?.classList.toggle('hidden', !isOnboarding && !canStartTour);
  if (closeBtn) {
    closeBtn.classList.toggle('hidden', isOnboarding);
  }
  if (primaryBtn) {
    primaryBtn.classList.toggle('hidden', !isOnboarding);
    primaryBtn.textContent = t('onboarding.gotIt');
  }
  if (tourBtn) {
    tourBtn.classList.toggle('hidden', !canStartTour);
    if (canStartTour) {
      tourBtn.textContent = t(hasSeenTool(prefsCache, helpToolId)
        ? 'onboarding.common.repeatTour'
        : 'onboarding.common.startTour');
    }
  }
}

/**
 * @returns {string}
 */
function resolveHelpToolId() {
  if (state.appNavMode === APP_NAV_MODE_HOME) return HELP_HOME_ID;
  const tool = getSelectedArtifactType();
  if (tool && HELP_TOOL_IDS.includes(tool)) return tool;
  return HELP_HOME_ID;
}

/**
 * @param {string} [toolId]
 */
export function refreshHelpModalContent(toolId) {
  const titleEl = document.getElementById('appHelpModalTitle');
  const bodyEl = document.getElementById('appHelpModalBody');
  if (!titleEl || !bodyEl) return;

  const resolved = toolId || resolveHelpToolId();
  const safeTool = HELP_TOOL_IDS.includes(resolved) ? resolved : HELP_HOME_ID;

  const titleKey = helpToolTitleKey(safeTool);
  const title = t(titleKey);
  titleEl.textContent = title !== titleKey ? title : t('help.title');

  const paragraphs = [];
  for (const bodyKey of helpToolBodyKeys(safeTool)) {
    const text = t(bodyKey);
    if (!text || text === bodyKey) continue;
    paragraphs.push(text);
  }
  fillModalBody(bodyEl, paragraphs);
  if (modalKind === 'help') syncModalChrome();
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
  const initialFocus = (modalKind === 'onboarding'
    ? document.getElementById('appHelpModalPrimaryBtn')
    : document.getElementById('appHelpModalCloseBtn')
  );
  mountSfocOverlay(modal, {
    initialFocus,
    onEscape: () => void closeHelpModal()
  });
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
    if (modalKind === 'help') syncModalChrome();
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
  unmountSfocOverlay(modal);
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
  (document.getElementById('workbenchHelpBtn') || document.getElementById('appHelpBtn'))?.focus();
}

/** Actualiza el modal de ayuda por herramienta si está abierto (no interrumpe onboarding). */
export function refreshHelpModalIfOpen() {
  const modal = document.getElementById('appHelpModal');
  if (!modal || modal.classList.contains('hidden') || modalKind !== 'help') return;
  refreshHelpModalContent();
}

async function markToolSeen(tool) {
  const prefs = markToolSeenInPrefs(prefsCache, tool);
  await savePrefs(prefs);
}

/**
 * Inicia el onboarding de una herramienta respetando el modo de UI actual.
 * @param {string} tool
 * @param {{ force?: boolean, manual?: boolean, focusOrigin?: HTMLElement | null }} [options]
 */
export async function startToolOnboarding(tool, options = {}) {
  if (!tool || !ALL_ONBOARDING_TOOLS.includes(tool)) return false;
  if (isV2()) ensurePosthogSurveyTourOrdering();
  if (!prefsLoaded) await loadPrefs();
  if (!options.force && hasSeenTool(prefsCache, tool)) return false;

  if (!isV2()) {
    openToolOnboardingModal(tool);
    return true;
  }

  await waitForPosthogSurveyPopupToClose();
  if (!options.manual && getSelectedArtifactType() !== tool) return false;

  return startDriverToolOnboarding(tool, {
    manual: options.manual === true,
    focusOrigin: options.focusOrigin || null,
    onSeen: markToolSeen
  });
}

/**
 * @param {string} tool
 */
export async function maybeShowToolOnboarding(tool) {
  if (isV2()) {
    await dismissDriverOnboardingForNavigation(tool || '');
    if (!tool) return;
    await startToolOnboarding(tool);
    return;
  }

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
  const tourBtn = document.getElementById('appHelpModalTourBtn');
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
  tourBtn?.addEventListener('click', () => {
    const tool = resolveHelpToolId();
    if (!ALL_ONBOARDING_TOOLS.includes(tool)) return;
    const focusOrigin = document.getElementById('workbenchHelpBtn') || document.getElementById('appHelpBtn');
    hideModal();
    void startToolOnboarding(tool, { force: true, manual: true, focusOrigin });
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

  void loadPrefs().then(() => {
    if (modalKind === 'help') syncModalChrome();
  });
}
