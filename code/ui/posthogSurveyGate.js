export const POSTHOG_SURVEY_HOST_SELECTOR =
  '[class^="PostHogSurvey-"], [class*=" PostHogSurvey-"]';

/**
 * @param {Document | null | undefined} [doc]
 */
export function isPosthogSurveyPopupOpen(doc = globalThis.document) {
  const popup = doc?.querySelector?.(POSTHOG_SURVEY_HOST_SELECTOR);
  if (!popup || popup.hidden || popup.getAttribute?.('aria-hidden') === 'true') return false;
  return !popup.classList?.contains?.('hidden');
}

/**
 * Evita superponer Driver.js a una encuesta modal de PostHog. La encuesta se
 * considera cerrada cuando su host desaparece o queda oculto.
 * @param {Document | null | undefined} [doc]
 * @param {typeof MutationObserver | null | undefined} [Observer]
 */
export function waitForPosthogSurveyPopupToClose(
  doc = globalThis.document,
  Observer = globalThis.MutationObserver
) {
  if (!isPosthogSurveyPopupOpen(doc)) return Promise.resolve();

  return new Promise((resolve) => {
    let observer = null;
    const finishIfClosed = () => {
      if (isPosthogSurveyPopupOpen(doc)) return;
      observer?.disconnect();
      resolve();
    };

    if (typeof Observer !== 'function') {
      // MutationObserver esta disponible en las paginas de extension. Este
      // fallback evita bloquear entornos restringidos o dobles de test.
      resolve();
      return;
    }

    observer = new Observer(finishIfClosed);
    const root = doc?.documentElement || doc?.body;
    if (!root) {
      observer.disconnect();
      resolve();
      return;
    }
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'aria-hidden']
    });
    finishIfClosed();
  });
}
