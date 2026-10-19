import { loadSfInjectSettings, saveSfInjectSettings } from '../lib/settings.js';
import {
  DEFAULT_RECORD_VIEWER_SHORTCUT,
  normalizeRecordViewerShortcut,
  recordViewerShortcutFromKeyboardEvent
} from '../content/recordViewerShortcutUtils.js';
import { openSfocModal } from '../../code/ui/sfocModal.js';

/** Configuración de teclado para View All Data & Editor. */
export async function openRecordViewerSettingsModal(translate) {
  const cfg = await loadSfInjectSettings();
  let shortcut = normalizeRecordViewerShortcut(cfg.prefs?.recordViewerShortcut);
  const body = document.createElement('div');
  body.className = 'settings-quick-links-modal-body';
  const hint = document.createElement('p');
  hint.textContent = translate('settings.sfInjectRecordViewerShortcutHint');
  const capture = document.createElement('input');
  capture.type = 'text'; capture.readOnly = true; capture.className = 'settings-input';
  capture.value = shortcut || DEFAULT_RECORD_VIEWER_SHORTCUT;
  capture.setAttribute('aria-label', translate('settings.sfInjectRecordViewerShortcut'));
  capture.addEventListener('keydown', (event) => {
    const next = recordViewerShortcutFromKeyboardEvent(event);
    if (!next) return;
    event.preventDefault(); event.stopPropagation();
    shortcut = normalizeRecordViewerShortcut(next); capture.value = shortcut;
  });
  const reset = document.createElement('button');
  reset.type = 'button'; reset.className = 'settings-secondary';
  reset.textContent = translate('settings.sfInjectRecordViewerShortcutReset');
  reset.addEventListener('click', () => { shortcut = DEFAULT_RECORD_VIEWER_SHORTCUT; capture.value = shortcut; capture.focus(); });
  body.append(hint, capture, reset);
  openSfocModal({
    id: 'settingsSfInjectRecordViewerModal', title: translate('settings.sfInjectRecordViewerConfigureTitle'), body,
    initialFocus: capture, confirmLabel: translate('settings.sfInjectRecordViewerShortcutSave'), cancelLabel: translate('common.cancel'), variant: 'form',
    onConfirm: () => saveSfInjectSettings({ prefs: { recordViewerShortcut: shortcut } })
  });
  queueMicrotask(() => capture.focus());
}
