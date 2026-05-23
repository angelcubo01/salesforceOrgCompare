import { t } from '../shared/i18n.js';

const POPUP_HELP_BODY_KEYS = [
  'popup.help.body1',
  'popup.help.body2',
  'popup.help.body3',
  'popup.help.body4',
  'popup.help.body5',
  'popup.help.body6'
];

export function refreshPopupHelpModalContent() {
  const titleEl = document.getElementById('popupHelpModalTitle');
  const bodyEl = document.getElementById('popupHelpModalBody');
  if (!titleEl || !bodyEl) return;

  titleEl.textContent = t('popup.help.title');
  bodyEl.innerHTML = '';
  for (const key of POPUP_HELP_BODY_KEYS) {
    const text = t(key);
    if (!text || text === key) continue;
    const p = document.createElement('p');
    p.textContent = text;
    bodyEl.appendChild(p);
  }
}

export function openPopupHelpModal() {
  const modal = document.getElementById('popupHelpModal');
  if (!modal) return;
  refreshPopupHelpModalContent();
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('popupHelpModalCloseBtn')?.focus();
}

export function closePopupHelpModal() {
  const modal = document.getElementById('popupHelpModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.getElementById('openPopupHelpBtn')?.focus();
}

export function setupPopupHelp() {
  const helpBtn = document.getElementById('openPopupHelpBtn');
  const modal = document.getElementById('popupHelpModal');
  const closeBtn = document.getElementById('popupHelpModalCloseBtn');
  const backdrop = modal?.querySelector('[data-popup-help-backdrop]');

  helpBtn?.addEventListener('click', (ev) => {
    ev.preventDefault();
    openPopupHelpModal();
  });
  closeBtn?.addEventListener('click', () => closePopupHelpModal());
  backdrop?.addEventListener('click', () => closePopupHelpModal());

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (modal && !modal.classList.contains('hidden')) {
      ev.preventDefault();
      closePopupHelpModal();
    }
  });
}
