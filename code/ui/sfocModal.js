/** @type {HTMLElement | null} */
let openModalEl = null;

/** @type {HTMLElement | null} */
let previousFocus = null;

/**
 * @param {{
 *   id?: string;
 *   title: string;
 *   body: HTMLElement | string;
 *   confirmLabel?: string;
 *   cancelLabel?: string;
 *   danger?: boolean;
 *   hideConfirm?: boolean;
 *   onConfirm?: () => void | Promise<void>;
 *   onClose?: () => void;
 * }} opts
 */
export function openSfocModal(opts) {
  closeSfocModal();
  previousFocus = /** @type {HTMLElement | null} */ (document.activeElement);

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop sfoc-modal-backdrop';
  backdrop.setAttribute('data-sfoc-modal-backdrop', '1');

  const panel = document.createElement('div');
  panel.className = 'modal-panel sfoc-modal-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  if (opts.id) panel.id = opts.id;

  const titleEl = document.createElement('h2');
  titleEl.className = 'sfoc-modal-title';
  titleEl.textContent = opts.title;

  const bodyEl = document.createElement('div');
  bodyEl.className = 'sfoc-modal-body';
  if (typeof opts.body === 'string') {
    bodyEl.textContent = opts.body;
  } else {
    bodyEl.appendChild(opts.body);
  }

  const actions = document.createElement('div');
  actions.className = 'sfoc-modal-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'sfoc-btn sfoc-btn--secondary';
  cancelBtn.textContent = opts.cancelLabel || 'Cancel';
  cancelBtn.addEventListener('click', () => {
    opts.onClose?.();
    closeSfocModal();
  });

  actions.appendChild(cancelBtn);

  if (!opts.hideConfirm) {
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = opts.danger
      ? 'sfoc-btn sfoc-btn--danger'
      : 'sfoc-btn sfoc-btn--primary';
    confirmBtn.textContent = opts.confirmLabel || 'OK';
    confirmBtn.addEventListener('click', () => {
      void Promise.resolve(opts.onConfirm?.()).then(() => closeSfocModal());
    });
    actions.appendChild(confirmBtn);
    queueMicrotask(() => confirmBtn.focus());
  } else {
    queueMicrotask(() => cancelBtn.focus());
  }

  panel.append(titleEl, bodyEl, actions);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
  openModalEl = backdrop;

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      opts.onClose?.();
      closeSfocModal();
    }
  });

  document.addEventListener('keydown', onEscape, true);
}

function onEscape(e) {
  if (e.key !== 'Escape' || !openModalEl) return;
  e.preventDefault();
  closeSfocModal();
}

export function closeSfocModal() {
  document.removeEventListener('keydown', onEscape, true);
  if (openModalEl) {
    openModalEl.remove();
    openModalEl = null;
  }
  if (previousFocus?.focus) {
    try {
      previousFocus.focus();
    } catch {
      /* ignore */
    }
  }
  previousFocus = null;
}
