/**
 * Observer compartido: debounce + suspende durante mutaciones propias.
 */

/**
 * @param {Document} doc
 * @param {() => void} run
 * @param {{ debounceMs?: number }} [opts]
 * @returns {() => void} teardown
 */
export function mountDebouncedDomObserver(doc, run, opts = {}) {
  const debounceMs = opts.debounceMs ?? 300;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  let suspended = false;

  const schedule = () => {
    if (suspended) return;
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (suspended || !doc.body) return;
      suspended = true;
      try {
        run();
      } finally {
        // Liberar tras el microtask para no reaccionar a mutaciones propias.
        queueMicrotask(() => {
          suspended = false;
        });
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
    observer.disconnect();
  };
}
