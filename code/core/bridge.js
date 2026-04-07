import { t } from '../../shared/i18n.js';

/**
 * Mensajería con el service worker (background).
 * Las peticiones HTTP a Salesforce las hace el SW, no esta página: no aparecen en la pestaña Red de code.html.
 */
export async function bg(message) {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      return { ok: false, error: t('bridge.noExtensionApi') };
    }
    const res = await chrome.runtime.sendMessage(message);
    if (res === undefined) {
      return { ok: false, error: t('bridge.noBackgroundResponse') };
    }
    return res;
  } catch (e) {
    const msg = String(e?.message || e);
    return { ok: false, error: msg || t('bridge.noBackgroundResponse') };
  }
}
