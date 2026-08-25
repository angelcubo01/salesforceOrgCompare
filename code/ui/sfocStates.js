import { t } from '../../shared/i18n.js';
import { createIcon, STATE_ICONS } from '../workbench/iconRegistry.js';
import { openSfocModal } from './sfocModal.js';
import { showToast } from './toast.js';

const STATE_PRESENTATION = Object.freeze({
  empty: { icon: STATE_ICONS.empty, role: 'status' },
  loading: { icon: STATE_ICONS.loading, role: 'status' },
  success: { icon: STATE_ICONS.success, role: 'status' },
  info: { icon: STATE_ICONS.info, role: 'status' },
  warning: { icon: STATE_ICONS.warning, role: 'status' },
  error: { icon: STATE_ICONS.error, role: 'alert' },
  session: { icon: 'lock', role: 'alert' },
  permission: { icon: STATE_ICONS.permission, role: 'alert' }
});

function appendText(element, value) {
  if (typeof value === 'string') element.textContent = value;
  else if (value) element.appendChild(value);
}

/** Crea un banner semántico reutilizable sin interpolar HTML. */
export function createSfocBanner({ kind = 'info', title = '', description = '', dismissLabel = '', onDismiss } = {}) {
  const presentation = STATE_PRESENTATION[kind] || STATE_PRESENTATION.info;
  const banner = document.createElement('section');
  banner.className = `sfoc-banner sfoc-banner--${kind}`;
  banner.setAttribute('role', presentation.role);
  banner.appendChild(createIcon(presentation.icon, { size: 20 }));
  const copy = document.createElement('div');
  if (title) {
    const heading = document.createElement('strong');
    heading.textContent = title;
    copy.appendChild(heading);
  }
  const text = document.createElement('div');
  appendText(text, description);
  copy.appendChild(text);
  banner.appendChild(copy);
  if (onDismiss) {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'sfoc-icon-button';
    close.title = dismissLabel || t('common.close');
    close.setAttribute('aria-label', dismissLabel || t('common.close'));
    close.appendChild(createIcon('x', { size: 20 }));
    close.addEventListener('click', () => {
      banner.remove();
      onDismiss();
    });
    banner.appendChild(close);
  }
  return banner;
}

/** Renderiza empty/loading/error/session/permisos dentro de un host estable. */
export function renderSfocState(host, {
  kind = 'empty',
  title = '',
  description = '',
  actionLabel = '',
  onAction = null
} = {}) {
  if (!host) return null;
  host.replaceChildren();
  const presentation = STATE_PRESENTATION[kind] || STATE_PRESENTATION.empty;
  const state = document.createElement('section');
  state.className = `sfoc-state sfoc-state--${kind}`;
  state.setAttribute('role', presentation.role);
  state.setAttribute('aria-live', kind === 'loading' ? 'polite' : 'off');
  const icon = createIcon(presentation.icon, { size: 24 });
  if (kind === 'loading') icon.classList.add('sfoc-icon--spin');
  state.appendChild(icon);
  const heading = document.createElement('h3');
  heading.textContent = title || t(`state.${kind}.title`);
  const text = document.createElement('p');
  appendText(text, description || t(`state.${kind}.description`));
  state.append(heading, text);
  if (actionLabel && onAction) {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'sfoc-btn sfoc-btn--primary';
    action.textContent = actionLabel;
    action.addEventListener('click', onAction);
    state.appendChild(action);
  }
  host.appendChild(state);
  return state;
}

/** Skeleton accesible; no anuncia cada línea individualmente. */
export function createSfocSkeleton(lines = 3, label = t('state.loading.title')) {
  const skeleton = document.createElement('div');
  skeleton.className = 'sfoc-skeleton';
  skeleton.setAttribute('role', 'status');
  skeleton.setAttribute('aria-label', label);
  for (let index = 0; index < Math.max(1, lines); index += 1) {
    const line = document.createElement('span');
    line.className = 'sfoc-skeleton-line';
    line.setAttribute('aria-hidden', 'true');
    skeleton.appendChild(line);
  }
  return skeleton;
}

/** Drawer modal común: comparte Escape, focus trap y restauración con sfocModal. */
export function openSfocDrawer({ title, body, closeLabel = t('common.close'), onClose } = {}) {
  const modal = openSfocModal({
    title,
    body,
    hideConfirm: true,
    cancelLabel: closeLabel,
    variant: 'form',
    onClose
  });
  modal.panel.classList.add('sfoc-modal-panel--drawer');
  modal.backdrop.classList.add('sfoc-modal-backdrop--drawer');
  return modal;
}

export function showSfocStatusToast(message, kind = 'info') {
  showToast(String(message || ''), kind === 'warning' ? 'warn' : kind);
}
