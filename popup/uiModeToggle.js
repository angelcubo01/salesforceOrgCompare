import { loadUiMode, saveUiMode } from '../shared/uiMode.js';
import { t } from '../shared/i18n.js';

let currentMode = 'classic';

export function getPopupUiModeCopyKeys(mode) {
  return mode === 'v2'
    ? { status: 'popup.uiMode.statusV2', open: 'popup.uiMode.openV2' }
    : { status: 'popup.uiMode.statusClassic', open: 'popup.uiMode.openClassic' };
}

export function refreshPopupUiModeToggleText() {
  const keys = getPopupUiModeCopyKeys(currentMode);
  const status = document.getElementById('popupUiModeStatus');
  const openBtn = document.getElementById('popupUiModeOpenBtn');
  if (status) status.textContent = t(keys.status);
  if (openBtn) openBtn.textContent = t(keys.open);
}

/**
 * El cambio solo afecta a futuras aperturas. No busca ni recarga pestañas existentes.
 * @param {{ onOpen?: () => Promise<void>|void, storageArea?: { get: Function, set: Function } }} [opts]
 */
export async function setupPopupUiModeToggle(opts = {}) {
  const toggle = /** @type {HTMLInputElement | null} */ (document.getElementById('popupUiModeToggle'));
  const openBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('popupUiModeOpenBtn'));
  if (!toggle || !openBtn) return 'classic';

  currentMode = await loadUiMode(opts.storageArea);
  toggle.checked = currentMode === 'v2';
  refreshPopupUiModeToggleText();

  toggle.addEventListener('change', async () => {
    toggle.disabled = true;
    try {
      currentMode = await saveUiMode(toggle.checked ? 'v2' : 'classic', opts.storageArea);
      toggle.checked = currentMode === 'v2';
      refreshPopupUiModeToggleText();
    } finally {
      toggle.disabled = false;
      toggle.focus();
    }
  });

  openBtn.addEventListener('click', async () => {
    openBtn.disabled = true;
    try {
      await opts.onOpen?.();
    } finally {
      openBtn.disabled = false;
    }
  });
  return currentMode;
}

