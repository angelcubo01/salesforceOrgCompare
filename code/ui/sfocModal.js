import { t } from '../../shared/i18n.js';
import { createIcon, STATE_ICONS } from '../workbench/iconRegistry.js';
import { state } from '../core/state.js';
import { activateDialogFocus, deactivateDialogFocus } from '../../shared/dialogFocus.js';

const READ_ONLY_STORAGE_KEY = 'sfocOrgReadOnlyById';

/** @type {HTMLElement | null} */
let openModalEl = null;
/** @type {HTMLElement | null} */
let previousFocus = null;
/** @type {(() => void) | null} */
let activeOnClose = null;
let closing = false;

const overlayEntries = [];
let backgroundSnapshot = [];
let previousBodyOverflow = '';

export function ensureSfocOverlayRoot() {
  let root = document.getElementById('sfocOverlayRoot');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'sfocOverlayRoot';
  root.setAttribute('aria-live', 'off');
  document.body.appendChild(root);
  return root;
}

function setBackgroundLocked(locked) {
  const root = document.getElementById('sfocOverlayRoot');
  if (locked) {
    if (!backgroundSnapshot.length) {
      backgroundSnapshot = [...document.body.children]
        .filter((node) => node !== root && node.id !== 'toastContainer')
        .map((node) => ({ node, inert: node.inert }));
      for (const { node } of backgroundSnapshot) node.inert = true;
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    document.body.dataset.sfocModalOpen = 'true';
    return;
  }
  for (const { node, inert } of backgroundSnapshot) {
    if (node.isConnected) node.inert = inert;
  }
  backgroundSnapshot = [];
  document.body.style.overflow = previousBodyOverflow;
  previousBodyOverflow = '';
  delete document.body.dataset.sfocModalOpen;
}

function refreshOverlayStack() {
  overlayEntries.forEach((entry, index) => {
    const top = index === overlayEntries.length - 1;
    entry.node.inert = !top;
    entry.node.dataset.overlayDepth = String(index + 1);
    entry.node.setAttribute('aria-hidden', top ? 'false' : 'true');
  });
  setBackgroundLocked(overlayEntries.length > 0);
}

function handleOverlayKeyboard(event) {
  const entry = overlayEntries.at(-1);
  if (!entry) return;
  if (event.key === 'Escape' && entry.escapeSafe) {
    event.preventDefault();
    event.stopImmediatePropagation();
    entry.onEscape?.();
    return;
  }
  if (event.key === 'F5' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

if (typeof document !== 'undefined') document.addEventListener('keydown', handleOverlayKeyboard, true);

/**
 * Monta un modal existente en el portal global. El nodo vuelve exactamente a su
 * posición original al cerrar, lo que permite reutilizarlo como vista inline.
 */
export function mountSfocOverlay(node, {
  dialog = node?.querySelector?.('[role="dialog"], [role="alertdialog"]'),
  initialFocus = null,
  restoreFocus = document.activeElement,
  onEscape = null,
  escapeSafe = true,
  restore = true
} = {}) {
  if (!node) return null;
  const existing = overlayEntries.find((entry) => entry.node === node);
  if (existing) return existing;
  document.dispatchEvent(new CustomEvent('sfoc:overlay-will-open'));
  const root = ensureSfocOverlayRoot();
  const parent = node.parentNode;
  const placeholder = restore && parent ? document.createComment(`sfoc-overlay:${node.id || 'modal'}`) : null;
  if (placeholder && parent) parent.insertBefore(placeholder, node);
  const origin = restoreFocus instanceof HTMLElement ? restoreFocus : null;
  const entry = { node, dialog, placeholder, parent, origin, onEscape, escapeSafe, restore };
  node.classList.add('sfoc-overlay-layer');
  node.classList.remove('hidden');
  node.setAttribute('aria-hidden', 'false');
  root.appendChild(node);
  overlayEntries.push(entry);
  refreshOverlayStack();
  if (dialog) {
    if (!dialog.hasAttribute('tabindex') && !dialog.querySelector('button, input, select, textarea, [href], [tabindex]')) {
      dialog.tabIndex = -1;
    }
    activateDialogFocus(dialog, { initialFocus, restoreFocus: origin });
  }
  document.dispatchEvent(new CustomEvent('sfoc:overlay-opened', { detail: { node, depth: overlayEntries.length } }));
  return entry;
}

export function unmountSfocOverlay(node, { remove = false, restoreFocus = true } = {}) {
  const index = overlayEntries.findIndex((entry) => entry.node === node);
  if (index < 0) {
    node?.classList?.add('hidden');
    node?.setAttribute?.('aria-hidden', 'true');
    return false;
  }
  if (index !== overlayEntries.length - 1) return false;
  const [entry] = overlayEntries.splice(index, 1);
  if (entry.dialog) deactivateDialogFocus(entry.dialog, { restore: false });
  entry.node.inert = false;
  entry.node.classList.remove('sfoc-overlay-layer');
  entry.node.classList.add('hidden');
  entry.node.setAttribute('aria-hidden', 'true');
  delete entry.node.dataset.overlayDepth;
  if (remove) {
    entry.node.remove();
    entry.placeholder?.remove();
  } else if (entry.restore && entry.placeholder?.parentNode) {
    entry.placeholder.parentNode.insertBefore(entry.node, entry.placeholder);
    entry.placeholder.remove();
  } else if (entry.parent?.isConnected) {
    entry.parent.appendChild(entry.node);
  }
  refreshOverlayStack();
  if (restoreFocus && entry.origin?.isConnected) {
    try { entry.origin.focus(); } catch { /* El invocador pudo quedar deshabilitado. */ }
  }
  document.dispatchEvent(new CustomEvent('sfoc:overlay-closed', { detail: { node, depth: overlayEntries.length } }));
  return true;
}

export function isSfocOverlayOpen(node = null) {
  return node ? overlayEntries.some((entry) => entry.node === node) : overlayEntries.length > 0;
}

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

export function matchesSfocConfirmationText(value, requiredText) {
  const normalize = (input) => String(input || '').normalize('NFKC').trim().toLocaleUpperCase();
  const expected = normalize(requiredText);
  return !!expected && normalize(value) === expected;
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
 *   requiredTextHint?: string;
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
    label.className = 'sfoc-modal-confirm-label';
    label.textContent = opts.requiredTextLabel || t('modal.typeToConfirm', { value: opts.requiredText });
    const token = document.createElement('strong');
    token.className = 'sfoc-modal-confirm-token';
    token.textContent = opts.requiredText;
    requiredInput = document.createElement('input');
    requiredInput.type = 'text';
    requiredInput.autocomplete = 'off';
    requiredInput.spellcheck = false;
    requiredInput.placeholder = opts.requiredText;
    requiredInput.setAttribute('aria-describedby', descriptionId);
    field.append(label, token, requiredInput);
    if (opts.requiredTextHint) {
      const hint = document.createElement('small');
      hint.className = 'sfoc-modal-confirm-hint';
      hint.textContent = opts.requiredTextHint;
      field.appendChild(hint);
    }
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
          confirmBtn.disabled = !!opts.requiredText
            && !matchesSfocConfirmationText(requiredInput?.value, opts.requiredText);
          cancelBtn.disabled = false;
          panel.removeAttribute('aria-busy');
        }
      }
    });
    actions.appendChild(confirmBtn);
  }

  if (requiredInput && confirmBtn) {
    const syncTypedConfirmation = () => {
      const matches = matchesSfocConfirmationText(requiredInput.value, opts.requiredText);
      confirmBtn.disabled = !matches;
      requiredInput.classList.toggle('is-valid', matches);
      requiredInput.setAttribute('data-confirmation-match', matches ? 'true' : 'false');
    };
    requiredInput.addEventListener('input', syncTypedConfirmation);
    requiredInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || confirmBtn.disabled) return;
      event.preventDefault();
      confirmBtn.click();
    });
  }

  panel.append(heading, bodyEl, actions);
  backdrop.appendChild(panel);
  openModalEl = backdrop;

  backdrop.addEventListener('click', (event) => {
    if (dismissOnBackdrop && event.target === backdrop) closeSfocModal();
  });
  const initialFocus = requiredInput || (
    confirmBtn && variant !== 'destructive' && variant !== 'production' ? confirmBtn : cancelBtn
  );
  mountSfocOverlay(backdrop, {
    dialog: panel,
    initialFocus,
    restoreFocus: previousFocus,
    restore: false,
    escapeSafe,
    onEscape: () => closeSfocModal()
  });
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
 *   requiredTextHint?: string;
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
    requiredTextHint: options.requiredTextHint,
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
 * entornos desconocidos requieren escribir una palabra de confirmación simple.
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
  body.className = `sfoc-modal-risk-content sfoc-modal-risk-content--${risk}`;
  const kicker = document.createElement('span');
  kicker.className = 'sfoc-modal-risk-kicker';
  kicker.textContent = t('modal.finalReview');
  const orgLine = document.createElement('div');
  orgLine.className = 'sfoc-modal-org-context';
  const orgIcon = document.createElement('span');
  orgIcon.className = 'sfoc-modal-org-icon';
  orgIcon.appendChild(createIcon(context.environment.icon, { size: 22 }));
  const orgCopy = document.createElement('span');
  orgCopy.className = 'sfoc-modal-org-copy';
  const orgCaption = document.createElement('span');
  orgCaption.className = 'sfoc-modal-org-caption';
  orgCaption.textContent = t('modal.targetEnvironment');
  const orgText = document.createElement('strong');
  orgText.textContent = context.label;
  const orgMeta = document.createElement('span');
  orgMeta.className = 'sfoc-modal-org-meta';
  orgMeta.textContent = `${context.environment.label} · ${readOnly ? t('workbench.org.readOnly') : t('modal.accessWritable')}`;
  orgCopy.append(orgCaption, orgText, orgMeta);
  orgLine.append(orgIcon, orgCopy);
  const descriptionEl = document.createElement('p');
  descriptionEl.className = 'sfoc-modal-risk-description';
  if (typeof description === 'string') descriptionEl.textContent = description;
  else if (description) descriptionEl.appendChild(description);
  const riskNote = document.createElement('p');
  riskNote.className = 'sfoc-modal-risk-note';
  riskNote.textContent = t(risk === 'destructive'
    ? 'modal.riskDestructiveNote'
    : context.environment.productionLike
      ? 'modal.riskProductionNote'
      : 'modal.riskStandardNote');
  body.append(kicker, orgLine, descriptionEl, riskNote);

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
  const confirmationWord = t('modal.confirmationWord');
  return confirmSfocAction({
    title,
    description: body,
    confirmLabel,
    variant: context.environment.productionLike ? 'production' : variant,
    requiredText: needsTypedConfirmation ? confirmationWord : undefined,
    requiredTextLabel: needsTypedConfirmation
      ? t('modal.confirmationPrompt')
      : undefined,
    requiredTextHint: needsTypedConfirmation
      ? t('modal.confirmationHint')
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
  if (modal) unmountSfocOverlay(modal, { remove: true, restoreFocus: false });
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
