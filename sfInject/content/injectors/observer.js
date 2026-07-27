/**
 * Observer compartido: debounce + suspende durante mutaciones propias.
 */

/**
 * @param {Document} doc
 * @param {() => void | Promise<void>} run
 * @param {{ debounceMs?: number, cooldownMs?: number }} [opts]
 * @returns {() => void} teardown
 */
export function mountDebouncedDomObserver(doc, run, opts = {}) {
  const debounceMs = opts.debounceMs ?? 300;
  const cooldownMs = opts.cooldownMs ?? 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let cooldownTimer = null;
  let suspended = false;

  const release = () => {
    if (cooldownTimer != null) clearTimeout(cooldownTimer);
    if (cooldownMs > 0) {
      cooldownTimer = setTimeout(() => {
        cooldownTimer = null;
        suspended = false;
      }, cooldownMs);
      return;
    }
    queueMicrotask(() => {
      suspended = false;
    });
  };

  const schedule = () => {
    if (suspended) return;
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (suspended || !doc.body) return;
      suspended = true;
      try {
        const result = run();
        if (result && typeof /** @type {Promise<void>} */ (result).then === 'function') {
          /** @type {Promise<void>} */ (result).then(release, release);
        } else {
          release();
        }
      } catch {
        suspended = false;
      }
    }, debounceMs);
  };

  const observer = new MutationObserver(() => schedule());

  const start = () => {
    if (!doc.body) return;
    run();
    observer.observe(doc.body, { childList: true, subtree: true });
  };

  if (doc.body) {
    start();
  } else {
    doc.addEventListener('DOMContentLoaded', start, { once: true });
  }

  return () => {
    if (timer != null) clearTimeout(timer);
    if (cooldownTimer != null) clearTimeout(cooldownTimer);
    observer.disconnect();
  };
}
