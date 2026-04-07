import { loadMonaco, createSingleEditor } from './editor/monaco.js';
import { loadLang, t } from '../shared/i18n.js';
import { bg } from './core/bridge.js';
import { apexViewerIdbTake } from './lib/apexViewerIdb.js';

function getQueryKeys() {
  const q = new URLSearchParams(window.location.search || '');
  return { sid: q.get('sid') || '', k: q.get('k') || '', idb: q.get('idb') || '' };
}

async function main() {
  await loadLang();

  const backBtn = document.getElementById('apexLogViewerBack');
  const titleEl = document.getElementById('apexLogViewerTitle');
  const mount = document.getElementById('apexLogViewerMount');
  if (backBtn) backBtn.textContent = t('apexLogViewer.back');

  const { sid, k, idb } = getQueryKeys();
  let payload = null;

  if (sid) {
    const res = await bg({ type: 'apexViewer:take', id: sid });
    if (res?.ok) {
      payload = { title: res.title ?? '', content: res.content ?? '' };
    }
  } else if (idb) {
    try {
      const rec = await apexViewerIdbTake(idb);
      if (rec) payload = { title: rec.title ?? '', content: rec.content ?? '' };
    } catch {
      payload = null;
    }
  } else if (k && chrome?.storage?.local) {
    try {
      const bag = await chrome.storage.local.get(k);
      payload = bag[k];
      await chrome.storage.local.remove(k);
    } catch {
      payload = null;
    }
  }

  if (!payload) {
    if (titleEl) titleEl.textContent = t('apexLogViewer.missingPayload');
    return;
  }

  const title = (payload && payload.title) || t('docTitle.apexLog');
  document.title = title;
  const content = (payload && payload.content) != null ? String(payload.content) : '';
  if (titleEl) titleEl.textContent = title;

  if (!mount) return;

  try {
    const monaco = await loadMonaco();
    const editor = createSingleEditor(monaco, mount);
    editor.setValue(content || '—');
    monaco.editor.setModelLanguage(editor.getModel(), 'apex');
  } catch {
    if (titleEl) titleEl.textContent = t('apexLogViewer.monacoError');
  }

  backBtn?.addEventListener('click', () => {
    if (window.opener && !window.opener.closed) {
      window.close();
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.close();
  });
}

void main();
