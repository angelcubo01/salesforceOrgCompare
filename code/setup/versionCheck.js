import { bg } from '../core/bridge.js';
import { EXTENSION_DISPLAY_NAME, UPDATE_PAGE_URL } from '../core/constants.js';
import { t, getCurrentLang } from '../../shared/i18n.js';

export async function maybeEnforceUpdate() {
  try {
    const res = await bg({ type: 'version:getUpdateInfo' });
    if (!res || !res.ok) return false;
    if (res.status !== 'majorUpdateRequired') return false;

    const lang = getCurrentLang();
    const targetUrl = res[`updateUrl_${lang}`] || res.updateUrl || UPDATE_PAGE_URL;
    const overlay = document.createElement('div');
    overlay.className = 'update-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'update-overlay-dialog';
    const h2 = document.createElement('h2');
    h2.textContent = t('version.mustUpdate');
    const p = document.createElement('p');
    p.textContent = t('version.mustUpdateText', {
      remoteVersion: res.remoteVersion,
      extensionName: EXTENSION_DISPLAY_NAME,
      currentVersion: res.currentVersion
    });
    const btn = document.createElement('button');
    btn.textContent = t('version.goToDownload');
    btn.addEventListener('click', () => {
      if (targetUrl && targetUrl.startsWith('https://')) {
        window.open(targetUrl, '_blank');
      }
    });
    dialog.appendChild(h2);
    dialog.appendChild(p);
    dialog.appendChild(btn);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    return true;
  } catch {
    return false;
  }
}
