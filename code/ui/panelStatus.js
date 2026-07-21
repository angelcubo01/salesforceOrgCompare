/** @typedef {'info' | 'success' | 'warn' | 'error'} PanelStatusTone */

/**
 * Actualiza el footer de status de un panel con tono semántico unificado.
 * @param {string | HTMLElement | null | undefined} elOrId
 * @param {string} message
 * @param {PanelStatusTone} [tone='info']
 */
export function setPanelStatus(elOrId, message, tone = 'info') {
  const el =
    typeof elOrId === 'string'
      ? document.getElementById(elOrId)
      : elOrId;
  if (!el || !(el instanceof HTMLElement)) return;
  el.textContent = message || '';
  if (message) {
    el.dataset.tone = tone;
  } else {
    delete el.dataset.tone;
  }
}
