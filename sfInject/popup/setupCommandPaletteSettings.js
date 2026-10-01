import { loadSfInjectSettings, saveSfInjectSettings } from '../lib/settings.js';
import {
  DEFAULT_SETUP_COMMAND_PALETTE_SHORTCUT,
  normalizeSetupCommandPaletteShortcut,
  shortcutFromKeyboardEvent
} from '../content/setupCommandPaletteUtils.js';
import { openSfocModal } from '../../code/ui/sfocModal.js';

const PALETTE_ANON_SCRIPTS_KEY = 'sfoc_setup_palette_anon_scripts';

async function syncSavedScriptsForPalette() {
  try {
    const raw = localStorage.getItem('sfoc_anon_apex_saved_scripts');
    const scripts = raw ? JSON.parse(raw) : [];
    const safe = (Array.isArray(scripts) ? scripts : []).map((script) => ({
      id: String(script?.id || '').slice(0, 128), name: String(script?.name || 'script').slice(0, 160)
    })).filter((script) => script.id);
    await chrome.storage.local.set({ [PALETTE_ANON_SCRIPTS_KEY]: safe });
  } catch {
    /* La paleta seguirá mostrando el acceso general a Anonymous Apex. */
  }
}

export async function openSetupCommandPaletteSettingsModal(translate) {
  void syncSavedScriptsForPalette();
  const cfg = await loadSfInjectSettings();
  let shortcut = normalizeSetupCommandPaletteShortcut(cfg.prefs?.setupCommandPaletteShortcut);
  const body = document.createElement('div');
  body.className = 'settings-quick-links-modal-body';
  const hint = document.createElement('p');
  hint.textContent = translate('settings.sfInjectSetupCommandPaletteShortcutHint');
  const capture = document.createElement('input');
  capture.type = 'text';
  capture.readOnly = true;
  capture.value = shortcut || DEFAULT_SETUP_COMMAND_PALETTE_SHORTCUT;
  capture.className = 'settings-input';
  capture.setAttribute('aria-label', translate('settings.sfInjectSetupCommandPaletteShortcut'));
  capture.addEventListener('keydown', (event) => {
    const next = shortcutFromKeyboardEvent(event);
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    shortcut = normalizeSetupCommandPaletteShortcut(next);
    capture.value = shortcut;
  });
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'settings-secondary';
  reset.textContent = translate('settings.sfInjectSetupCommandPaletteShortcutReset');
  reset.addEventListener('click', () => {
    shortcut = DEFAULT_SETUP_COMMAND_PALETTE_SHORTCUT;
    capture.value = shortcut;
    capture.focus();
  });
  body.append(hint, capture, reset);
  openSfocModal({
    id: 'settingsSfInjectSetupCommandPaletteModal',
    title: translate('settings.sfInjectSetupCommandPaletteConfigureTitle'),
    body,
    initialFocus: capture,
    confirmLabel: translate('settings.sfInjectSetupCommandPaletteShortcutSave'),
    cancelLabel: translate('common.cancel'),
    variant: 'form',
    onConfirm: () => saveSfInjectSettings({ prefs: { setupCommandPaletteShortcut: shortcut } })
  });
  queueMicrotask(() => capture.focus());
}
