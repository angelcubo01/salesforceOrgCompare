import { sfInjectSend } from './bridge.js';
import { showInjectToast } from './ui.js';
import { isRecordViewerShortcut, isTextEntryTarget, recordIdFromSalesforceUrl } from '../../shared/recordViewerCore.js';
import { normalizeRecordViewerShortcut } from './recordViewerShortcutUtils.js';

let lastOpenKey = '';

export function installRecordViewerShortcut(shortcut) {
  const configuredShortcut = normalizeRecordViewerShortcut(shortcut);
  const onKeyDown = (event) => {
    if (!isRecordViewerShortcut(event, configuredShortcut) || isTextEntryTarget(event.target)) return;
    const recordId = recordIdFromSalesforceUrl(location.href);
    if (!recordId) { showInjectToast('Abre un registro de Salesforce para usar View All Data & Editor.'); return; }
    const dedupeKey = `${recordId}:${Math.floor(Date.now() / 750)}`;
    if (dedupeKey === lastOpenKey) return;
    lastOpenKey = dedupeKey;
    event.preventDefault(); event.stopImmediatePropagation();
    void sfInjectSend({ type: 'sfInject:openRecordViewer', recordId, instanceUrl: location.origin })
      .then((result) => { if (!result?.ok) showInjectToast('No se pudo abrir View All Data & Editor.', true); });
  };
  document.addEventListener('keydown', onKeyDown, true);
  return () => document.removeEventListener('keydown', onKeyDown, true);
}
