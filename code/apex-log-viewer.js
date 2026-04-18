import { loadMonaco, createSingleEditor } from './editor/monaco.js';
import { loadLang, t } from '../shared/i18n.js';
import { bg } from './core/bridge.js';
import { apexViewerIdbTake } from './lib/apexViewerIdb.js';

function sanitizeLogDownloadFilename(rawTitle) {
  const base = String(rawTitle || 'apex-log')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return base || 'apex-log';
}

function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getQueryKeys() {
  const q = new URLSearchParams(window.location.search || '');
  const lineRaw = q.get('line');
  const lineNum = lineRaw != null && lineRaw !== '' ? parseInt(lineRaw, 10) : NaN;
  return {
    sid: q.get('sid') || '',
    k: q.get('k') || '',
    idb: q.get('idb') || '',
    line: Number.isFinite(lineNum) && lineNum > 0 ? lineNum : 0
  };
}

async function main() {
  await loadLang();

  const backBtn = document.getElementById('apexLogViewerBack');
  const downloadBtn = document.getElementById('apexLogViewerDownload');
  const titleEl = document.getElementById('apexLogViewerTitle');
  const mount = document.getElementById('apexLogViewerMount');
  if (backBtn) backBtn.textContent = t('apexLogViewer.back');
  if (downloadBtn) downloadBtn.textContent = t('apexLogViewer.download');

  const { sid, k, idb, line: lineFromUrl } = getQueryKeys();
  let payload = null;

  if (sid) {
    const res = await bg({ type: 'apexViewer:take', id: sid });
    if (res?.ok) {
      payload = {
        title: res.title ?? '',
        content: res.content ?? '',
        ...(res.initialLine != null ? { initialLine: res.initialLine } : {}),
        ...(res.downloadFileName ? { downloadFileName: res.downloadFileName } : {})
      };
    }
  } else if (idb) {
    try {
      const rec = await apexViewerIdbTake(idb);
      if (rec)
        payload = {
          title: rec.title ?? '',
          content: rec.content ?? '',
          ...(rec.initialLine != null ? { initialLine: rec.initialLine } : {}),
          ...(rec.downloadFileName ? { downloadFileName: rec.downloadFileName } : {})
        };
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
  const initialLineFromPayload =
    payload && payload.initialLine != null && Number.isFinite(Number(payload.initialLine))
      ? Math.max(1, Math.floor(Number(payload.initialLine)))
      : 0;
  const initialLine = initialLineFromPayload || lineFromUrl || 0;
  if (titleEl) titleEl.textContent = title;
  if (downloadBtn) downloadBtn.hidden = false;

  if (!mount) return;

  let editor = null;
  try {
    const monaco = await loadMonaco();
    editor = createSingleEditor(monaco, mount);
    editor.setValue(content || '—');
    monaco.editor.setModelLanguage(editor.getModel(), 'apex');
    if (initialLine > 0) {
      const lineCount = editor.getModel().getLineCount();
      const ln = Math.min(initialLine, Math.max(1, lineCount));
      editor.revealLineInCenter(ln);
      editor.setPosition({ lineNumber: ln, column: 1 });
    }
  } catch {
    if (titleEl) titleEl.textContent = t('apexLogViewer.monacoError');
  }

  downloadBtn?.addEventListener('click', () => {
    const body = editor ? editor.getValue() : content;
    const explicit =
      payload && payload.downloadFileName != null && String(payload.downloadFileName).trim();
    const name = explicit
      ? sanitizeLogDownloadFilename(String(payload.downloadFileName).trim())
      : `${sanitizeLogDownloadFilename(title)}.log`;
    downloadTextFile(body, name);
  });

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
