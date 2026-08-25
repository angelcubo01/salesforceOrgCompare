const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

const sessions = new WeakMap();

function visibleFocusable(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => {
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  });
}

/**
 * Activa focus trap y recuerda el origen para un diálogo ya visible.
 * La gestión de Escape se mantiene en cada modal para respetar su contrato.
 */
export function activateDialogFocus(root, { initialFocus = null, restoreFocus = document.activeElement } = {}) {
  if (!root) return;
  deactivateDialogFocus(root, { restore: false });

  const origin = restoreFocus instanceof HTMLElement ? restoreFocus : null;
  const onKeyDown = (event) => {
    if (event.key !== 'Tab') return;
    const focusable = visibleFocusable(root);
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  root.addEventListener('keydown', onKeyDown, true);
  sessions.set(root, { origin, onKeyDown });
  queueMicrotask(() => {
    const target = initialFocus instanceof HTMLElement ? initialFocus : visibleFocusable(root)[0];
    target?.focus();
  });
}

export function deactivateDialogFocus(root, { restore = true } = {}) {
  if (!root) return;
  const session = sessions.get(root);
  if (!session) return;
  root.removeEventListener('keydown', session.onKeyDown, true);
  sessions.delete(root);
  if (restore && session.origin?.isConnected) {
    try {
      session.origin.focus();
    } catch {
      /* El control de origen puede dejar de ser enfocable durante el cierre. */
    }
  }
}
