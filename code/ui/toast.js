import { state } from '../core/state.js';
import { t } from '../../shared/i18n.js';
import { sanitizeUiError } from '../../shared/sanitizeUiError.js';

export function showToast(message, type = 'info', opts = {}) {
  try {
    const now = Date.now();
    const bypassCooldown =
      opts.bypassCooldown === true || type === 'error' || type === 'warn';
    if (!bypassCooldown && now - state.lastToastAt < 2500) return; // evitar spam en toasts informativos
    state.lastToastAt = now;
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const bodyText =
      type === 'error' || type === 'warn' ? sanitizeUiError(message) : String(message || '');
    const title = opts.title != null && String(opts.title).trim() ? String(opts.title).trim() : '';
    if (title) {
      const titleEl = document.createElement('div');
      titleEl.className = 'toast-title';
      titleEl.textContent = title;
      toast.appendChild(titleEl);
      const bodyEl = document.createElement('div');
      bodyEl.className = 'toast-body';
      bodyEl.textContent = bodyText;
      toast.appendChild(bodyEl);
    } else {
      toast.textContent = bodyText;
    }
    container.appendChild(toast);
    setTimeout(() => {
      try { toast.remove(); } catch {}
    }, 4000);
  } catch {}
}

/**
 * Toast con spinner hasta `dismissSpinnerToast()`.
 * @param {string} message
 * @param {{ onCancel?: () => void }} [opts]
 */
export function showToastWithSpinner(message, opts = {}) {
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
    text.className = 'toast-spinner-text';
    text.textContent = String(message || t('toast.loading'));

    toast.appendChild(icon);
    toast.appendChild(text);

    if (typeof opts.onCancel === 'function') {
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'toast-spinner-cancel';
      cancelBtn.textContent = t('toast.cancel');
      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onCancel();
      });
      toast.appendChild(cancelBtn);
    }

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
