import { t } from '../shared/i18n.js';
import { activateDialogFocus, deactivateDialogFocus } from '../shared/dialogFocus.js';
import {
  ONBOARDING_PREFS_KEY,
  normalizeOnboardingPrefs,
  shouldShowFirstInstallWelcome,
  markFirstInstallWelcomeDismissedInPrefs
} from '../shared/onboardingPrefs.js';

let prefsCache = normalizeOnboardingPrefs(null);
let prefsLoaded = false;

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
 */
function setText(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  const text = t(key);
  if (text && text !== key) el.textContent = text;
}

export function refreshPopupWelcomeContent() {
  setText('popupWelcomeTitle', 'popup.welcome.title');
  setText('popupWelcomeSubtitle', 'popup.welcome.subtitle');
  setText('popupWelcomeStep1Title', 'popup.welcome.step1.title');
  setText('popupWelcomeStep1Text', 'popup.welcome.step1.text');
  setText('popupWelcomeStep2Title', 'popup.welcome.step2.title');
  setText('popupWelcomeStep2Text', 'popup.welcome.step2.text');
  setText('popupWelcomeStep3Title', 'popup.welcome.step3.title');
  setText('popupWelcomeStep3Text', 'popup.welcome.step3.text');
  setText('popupWelcomeWarningText', 'popup.welcome.sessionWarning.text');
  setText('popupWelcomePrimaryBtn', 'popup.welcome.cta');

  const closeBtn = document.getElementById('popupWelcomeCloseBtn');
  if (closeBtn) {
    const closeLabel = t('popup.help.close');
    if (closeLabel && closeLabel !== 'popup.help.close') {
      closeBtn.title = closeLabel;
      closeBtn.setAttribute('aria-label', closeLabel);
    }
  }

  const logo = document.getElementById('popupWelcomeLogo');
  if (logo && !logo.getAttribute('src')) {
    logo.src = chrome.runtime.getURL('icons/icon-48.png');
    logo.alt = '';
  }
}

export function openPopupWelcomeModal() {
  const modal = document.getElementById('popupWelcomeModal');
  if (!modal) return;
  refreshPopupWelcomeContent();
  document.body.classList.add('popup-welcome-active');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  activateDialogFocus(modal, { initialFocus: document.getElementById('popupWelcomePrimaryBtn') });
}

/**
 * @param {boolean} [markSeen]
 */
export async function closePopupWelcomeModal(markSeen = true) {
  const modal = document.getElementById('popupWelcomeModal');
  if (!modal || modal.classList.contains('hidden')) return;

  if (markSeen) {
    const prefs = markFirstInstallWelcomeDismissedInPrefs(prefsCache);
    await savePrefs(prefs);
  }

  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('popup-welcome-active');
  deactivateDialogFocus(modal);
}

/**
 * @param {number} [savedOrgCount]
 */
export async function maybeShowPopupWelcome(savedOrgCount = 0) {
  await loadPrefs();
  if (!shouldShowFirstInstallWelcome(prefsCache, savedOrgCount)) {
    if (savedOrgCount > 0 && !prefsCache.firstInstallWelcomeDismissed) {
      await savePrefs(markFirstInstallWelcomeDismissedInPrefs(prefsCache));
    }
    return;
  }
  openPopupWelcomeModal();
}

export function setupPopupWelcome() {
  const modal = document.getElementById('popupWelcomeModal');
  const primaryBtn = document.getElementById('popupWelcomePrimaryBtn');
  const closeBtn = document.getElementById('popupWelcomeCloseBtn');

  const dismissWelcome = () => {
    void closePopupWelcomeModal(true);
  };

  primaryBtn?.addEventListener('click', dismissWelcome);
  closeBtn?.addEventListener('click', dismissWelcome);
  modal?.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || modal.classList.contains('hidden')) return;
    event.preventDefault();
    dismissWelcome();
  });
}
