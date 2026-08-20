import { loadUiMode, saveUiMode } from '../shared/uiMode.js';

/**
 * El cambio solo afecta a futuras aperturas. No busca ni recarga pestañas existentes.
 * @param {{ storageArea?: { get: Function, set: Function } }} [opts]
 */
export async function setupPopupUiModeToggle(opts = {}) {
  const toggle = /** @type {HTMLInputElement | null} */ (document.getElementById('popupUiModeToggle'));
  if (!toggle) return 'classic';

  let currentMode = await loadUiMode(opts.storageArea);
  toggle.checked = currentMode === 'v2';

  toggle.addEventListener('change', async () => {
    toggle.disabled = true;
    try {
      currentMode = await saveUiMode(toggle.checked ? 'v2' : 'classic', opts.storageArea);
      toggle.checked = currentMode === 'v2';
    } finally {
      toggle.disabled = false;
      toggle.focus();
    }
  });

  return currentMode;
}
