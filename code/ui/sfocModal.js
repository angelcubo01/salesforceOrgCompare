import { t } from '../../shared/i18n.js';
import { createIcon, STATE_ICONS } from '../workbench/iconRegistry.js';
import { state } from '../core/state.js';

const READ_ONLY_STORAGE_KEY = 'sfocOrgReadOnlyById';

/** @type {HTMLElement | null} */
let openModalEl = null;
/** @type {HTMLElement | null} */
let previousFocus = null;
/** @type {(() => void) | null} */
let activeOnClose = null;
let closing = false;

const VARIANT_ICONS = Object.freeze({
  standard: STATE_ICONS.info,
  destructive: STATE_ICONS.warning,
  production: STATE_ICONS.production,
  form: 'settings',
  result: STATE_ICONS.success,
  error: STATE_ICONS.error,
  session: 'lock',
  permission: STATE_ICONS.permission
});

function focusableElements(root) {
  return [...root.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
}

function appendBody(target, body) {
  if (typeof body === 'string') target.textContent = body;
  else if (body) target.appendChild(body);
}

/**
 * Modal común con foco contenido, restauración de foco y confirmación tipada opcional.
 *
 * @param {{
 *   id?: string;
 *   title: string;
 *   body?: HTMLElement | string;
 *   description?: HTMLElement | string;
 *   confirmLabel?: string;
 *   cancelLabel?: string;
 *   variant?: 'standard'|'destructive'|'production'|'form'|'result'|'error'|'session'|'permission';
 *   icon?: string;
 *   danger?: boolean;
 *   hideConfirm?: boolean;
 *   escapeSafe?: boolean;
 *   dismissOnBackdrop?: boolean;
 *   requiredText?: string;
 *   requiredTextLabel?: string;
 *   onConfirm?: () => void | boolean | Promise<void | boolean>;
 *   onClose?: () => void;
 * }} opts
 */
export function openSfocModal(opts) {
  closeSfocModal();
  previousFocus = /** @type {HTMLElement | null} */ (document.activeElement);
  activeOnClose = opts.onClose || null;
  const variant = opts.variant || (opts.danger ? 'destructive' : 'standard');
  const escapeSafe = opts.escapeSafe !== false;
  const dismissOnBackdrop = opts.dismissOnBackdrop ?? escapeSafe;
  const modalId = opts.id || `sfocModal-${Date.now()}`;
  const titleId = `${modalId}-title`;
  const descriptionId = `${modalId}-description`;

  const backdrop = document.createElement('div');
  backdrop.className = `modal-backdrop sfoc-modal-backdrop sfoc-modal-backdrop--${variant}`;
  backdrop.setAttribute('data-sfoc-modal-backdrop', '1');

  const panel = document.createElement('div');
  panel.className = `modal-panel sfoc-modal-panel sfoc-modal-panel--${variant}`;
  panel.setAttribute('role', variant === 'destructive' || variant === 'production' || variant === 'error' ? 'alertdialog' : 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', titleId);
  panel.setAttribute('aria-describedby', descriptionId);
  panel.id = modalId;

  const heading = document.createElement('div');
  heading.className = 'sfoc-modal-heading';
  const iconWrap = document.createElement('span');
  iconWrap.className = 'sfoc-modal-semantic-icon';
  iconWrap.appendChild(createIcon(opts.icon || VARIANT_ICONS[variant] || STATE_ICONS.info, { size: 24 }));
  const titleEl = document.createElement('h2');
  titleEl.id = titleId;
  titleEl.className = 'sfoc-modal-title';
  titleEl.textContent = opts.title;
  heading.append(iconWrap, titleEl);

  const bodyEl = document.createElement('div');
  bodyEl.id = descriptionId;
  bodyEl.className = 'sfoc-modal-body';
  appendBody(bodyEl, opts.description ?? opts.body ?? '');

  let requiredInput = null;
  if (opts.requiredText) {
    const field = document.createElement('label');
    field.className = 'sfoc-modal-confirm-field';
    const label = document.createElement('span');
    label.textContent = opts.requiredTextLabel || t('modal.typeToConfirm', { value: opts.requiredText });
    requiredInput = document.createElement('input');
    requiredInput.type = 'text';
    requiredInput.autocomplete = 'off';
    requiredInput.spellcheck = false;
    requiredInput.setAttribute('aria-describedby', descriptionId);
    field.append(label, requiredInput);
    bodyEl.appendChild(field);
  }

  const errorEl = document.createElement('p');
  errorEl.className = 'sfoc-modal-error hidden';
  errorEl.setAttribute('role', 'alert');
  bodyEl.appendChild(errorEl);

  const actions = document.createElement('div');
  actions.className = 'sfoc-modal-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'sfoc-btn sfoc-btn--secondary';
  cancelBtn.textContent = opts.cancelLabel || t('common.cancel');
  cancelBtn.addEventListener('click', () => closeSfocModal());
  actions.appendChild(cancelBtn);

  let confirmBtn = null;
  if (!opts.hideConfirm) {
    confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = variant === 'destructive' || variant === 'production' || opts.danger
      ? 'sfoc-btn sfoc-btn--danger'
      : 'sfoc-btn sfoc-btn--primary';
    confirmBtn.textContent = opts.confirmLabel || t('modal.continue');
    confirmBtn.disabled = !!opts.requiredText;
    confirmBtn.addEventListener('click', async () => {
      if (confirmBtn.disabled) return;
      confirmBtn.disabled = true;
      cancelBtn.disabled = true;
      panel.setAttribute('aria-busy', 'true');
      errorEl.classList.add('hidden');
      try {
        const result = await opts.onConfirm?.();
        if (result !== false) closeSfocModal({ notify: false });
      } catch (error) {
        errorEl.textContent = error instanceof Error ? error.message : String(error || t('state.error.description'));
        errorEl.classList.remove('hidden');
      } finally {
        if (openModalEl === backdrop) {
          confirmBtn.disabled = !!opts.requiredText && requiredInput?.value !== opts.requiredText;
          cancelBtn.disabled = false;
          panel.removeAttribute('aria-busy');
        }
      }
    });
    actions.appendChild(confirmBtn);
  }

  if (requiredInput && confirmBtn) {
    requiredInput.addEventListener('input', () => {
      confirmBtn.disabled = requiredInput.value !== opts.requiredText;
    });
  }

  panel.append(heading, bodyEl, actions);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
  openModalEl = backdrop;

  backdrop.addEventListener('click', (event) => {
    if (dismissOnBackdrop && event.target === backdrop) closeSfocModal();
  });
  panel.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusable = focusableElements(panel);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  document.addEventListener('keydown', onEscape, true);

  queueMicrotask(() => {
    if (requiredInput) requiredInput.focus();
    else if (confirmBtn && variant !== 'destructive' && variant !== 'production') confirmBtn.focus();
    else cancelBtn.focus();
  });

  function onEscape(event) {
    if (event.key !== 'Escape' || openModalEl !== backdrop || !escapeSafe) return;
    event.preventDefault();
    closeSfocModal();
  }
  backdrop.__sfocEscapeHandler = onEscape;
  return { backdrop, panel, confirmButton: confirmBtn, cancelButton: cancelBtn, requiredInput };
}

/**
 * @param {{
 *   title: string;
 *   description: string | HTMLElement;
 *   confirmLabel: string;
 *   cancelLabel?: string;
 *   variant?: 'standard'|'destructive'|'production';
 *   icon?: string;
 *   requiredText?: string;
 *   requiredTextLabel?: string;
 *   escapeSafe?: boolean;
 * }} opts
 */
export function confirmSfocAction(opts) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    openSfocModal({
      ...opts,
      onConfirm: () => {
        settle(true);
      },
      onClose: () => settle(false)
    });
  });
}

/** Atajo para sustituir confirmaciones nativas manteniendo un CTA específico. */
export function confirmSfocToolAction(description, confirmLabel, options = {}) {
  return confirmSfocAction({
    title: options.title || confirmLabel,
    description,
    confirmLabel,
    variant: options.variant || 'destructive',
    icon: options.icon,
    requiredText: options.requiredText,
    requiredTextLabel: options.requiredTextLabel,
    escapeSafe: options.escapeSafe
  });
}

export function resolveSfocOrgConfirmationContext(orgId, orgs = state.orgsList || []) {
  const id = String(orgId || '');
  const org = (orgs || []).find((item) => String(item?.id || '') === id) || null;
  let hostname = '';
  try {
    hostname = org?.instanceUrl ? new URL(org.instanceUrl).hostname : '';
  } catch {
    hostname = '';
  }
  const label = String(org?.alias || org?.displayName || org?.label || org?.name || org?.username || hostname || id || t('modal.unknownOrg'));
  const environment = org?.isSandbox === true
    ? { label: t('workbench.environment.sandbox'), icon: STATE_ICONS.sandbox, productionLike: false }
    : org?.isSandbox === false
      ? { label: t('workbench.environment.production'), icon: STATE_ICONS.production, productionLike: true }
      : { label: t('workbench.environment.unknown'), icon: STATE_ICONS.unknownEnvironment, productionLike: true };
  return { id, org, label, environment };
}

export function requiresTypedOrgConfirmation(isSandbox, risk) {
  return isSandbox !== true && (risk === 'write' || risk === 'destructive');
}

/**
 * Confirmación de escritura con org, entorno y read-only visibles. Producción y
 * entornos desconocidos requieren escribir el nombre visible de la org.
 */
export async function confirmSfocOrgAction({
  orgId,
  description,
  confirmLabel,
  title = confirmLabel,
  risk = 'write',
  variant = 'destructive'
}) {
  const context = resolveSfocOrgConfirmationContext(orgId);
  let readOnly = false;
  try {
    const stored = await chrome.storage.local.get(READ_ONLY_STORAGE_KEY);
    readOnly = !!stored?.[READ_ONLY_STORAGE_KEY]?.[context.id];
  } catch {
    readOnly = false;
  }

  const body = document.createElement('div');
  const orgLine = document.createElement('div');
  orgLine.className = 'sfoc-modal-org-context';
  orgLine.appendChild(createIcon(context.environment.icon, { size: 20 }));
  const orgText = document.createElement('strong');
  orgText.textContent = `${context.label} · ${context.environment.label} · ${readOnly ? t('workbench.org.readOnly') : t('modal.accessWritable')}`;
  orgLine.appendChild(orgText);
  const descriptionEl = document.createElement('p');
  if (typeof description === 'string') descriptionEl.textContent = description;
  else if (description) descriptionEl.appendChild(description);
  body.append(orgLine, descriptionEl);

  if (readOnly) {
    const warning = document.createElement('p');
    warning.className = 'sfoc-modal-read-only-warning';
    warning.textContent = t('modal.readOnlyDescription');
    body.appendChild(warning);
    return new Promise((resolve) => {
      openSfocModal({
        title,
        body,
        variant: 'permission',
        hideConfirm: true,
        cancelLabel: t('common.close'),
        onClose: () => resolve(false)
      });
    });
  }

  const needsTypedConfirmation = requiresTypedOrgConfirmation(context.org?.isSandbox, risk);
  return confirmSfocAction({
    title,
    description: body,
    confirmLabel,
    variant: context.environment.productionLike ? 'production' : variant,
    requiredText: needsTypedConfirmation ? context.label : undefined,
    requiredTextLabel: needsTypedConfirmation
      ? t('modal.typeOrgToConfirm', { org: context.label })
      : undefined
  });
}

/** @param {{ notify?: boolean }} [options] */
export function closeSfocModal(options = {}) {
  if (closing) return;
  closing = true;
  const modal = openModalEl;
  const focusTarget = previousFocus;
  const onClose = activeOnClose;
  openModalEl = null;
  previousFocus = null;
  activeOnClose = null;
  if (modal?.__sfocEscapeHandler) document.removeEventListener('keydown', modal.__sfocEscapeHandler, true);
  modal?.remove();
  if (options.notify !== false) onClose?.();
  if (focusTarget?.focus) {
    try {
      focusTarget.focus();
    } catch {
      /* El origen pudo desmontarse mientras el modal estaba abierto. */
    }
  }
  closing = false;
}
