import { state } from '../core/state.js';
import { t } from '../../shared/i18n.js';

export function showToast(message, type = 'info') {
  try {
    const now = Date.now();
    if (now - state.lastToastAt < 2500) return; // cooldown to avoid spam
    state.lastToastAt = now;
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = String(message || '');
    container.appendChild(toast);
    setTimeout(() => {
      try { toast.remove(); } catch {}
    }, 4000);
  } catch {}
}

/** Muestra un toast con spinner que permanece hasta que se llame a dismissSpinnerToast(). */
export function showToastWithSpinner(message) {
  dismissSpinnerToast();
  try {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast info toast-spinner';
    toast.setAttribute('data-spinner-toast', '1');
    const icon = document.createElement('span');
    icon.className = 'toast-spinner-icon';
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = String(message || t('toast.loading'));
    toast.appendChild(icon);
    toast.appendChild(text);
    container.appendChild(toast);
    state.spinnerToast = toast;
  } catch {}
}

export function dismissSpinnerToast() {
  try {
    if (state.spinnerToast && state.spinnerToast.parentNode) {
      state.spinnerToast.remove();
    }
    state.spinnerToast = null;
  } catch {}
}
