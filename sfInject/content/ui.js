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
    el.setAttribute('role', 'status');
    el.textContent = message;
    doc.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  } catch {
    /* fail silent */
  }
}
