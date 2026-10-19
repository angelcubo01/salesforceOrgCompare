/** Utilidades UI compartidas del content script sfInject. */

/**
 * @param {string} status
 */
export function setInjectStatus(status) {
  try {
    document.documentElement?.setAttribute('data-sfoc-inject-status', status);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} message
 * @param {boolean} [isError]
 */
export function showInjectToast(message, isError = false) {
  try {
    const doc = document;
    if (!doc.body) return;
    const el = doc.createElement('div');
    el.className = `sfoc-inject-toast${isError ? ' sfoc-inject-toast--error' : ''}`;
    el.setAttribute('role', isError ? 'alert' : 'status');
    el.textContent = message;
    doc.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  } catch {
    /* fail silent */
  }
}

/** Muestra un aviso de progreso y devuelve una función para retirarlo. */
export function showInjectLoadingToast(message) {
  try {
    const doc = document;
    if (!doc.body) return () => {};
    const el = doc.createElement('div');
    el.className = 'sfoc-inject-toast sfoc-inject-toast--loading';
    el.setAttribute('role', 'status');
    const spinner = doc.createElement('span');
    spinner.className = 'sfoc-inject-toast-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const text = doc.createElement('span');
    text.textContent = message;
    el.append(spinner, text);
    doc.body.appendChild(el);
    return () => el.remove();
  } catch {
    return () => {};
  }
}
