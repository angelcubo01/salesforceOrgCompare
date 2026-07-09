import '../shared/installEarlyExceptionCapture.js';
import { loadMonaco, createSingleEditor } from './editor/monaco.js';
import { loadLang, t } from '../shared/i18n.js';
import { loadExtensionSettings, applyUiThemeToDocument } from '../shared/extensionSettings.js';
import { bg } from './core/bridge.js';
import { apexViewerIdbTake } from './lib/apexViewerIdb.js';

function sanitizeDownloadFilename(raw) {
  const base = String(raw || 'apex-source')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return base || 'apex-source';
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

function inferDownloadFilename(title, explicit) {
  if (explicit) return sanitizeDownloadFilename(explicit);
  const trimmed = String(title || '').trim();
  if (/\.(cls|trigger)$/i.test(trimmed)) return sanitizeDownloadFilename(trimmed);
  return `${sanitizeDownloadFilename(trimmed)}.cls`;
}

function getQueryKeys() {
  const q = new URLSearchParams(window.location.search || '');
  const lineRaw = q.get('line');
  const lineNum = lineRaw != null && lineRaw !== '' ? parseInt(lineRaw, 10) : NaN;
  return {
    sid: q.get('staged') || q.get('sid') || '',
    k: q.get('k') || '',
    idb: q.get('idb') || '',
    line: Number.isFinite(lineNum) && lineNum > 0 ? lineNum : 0
  };
}

async function loadPayload(sid, k, idb) {
  if (sid) {
    const res = await bg({ type: 'apexViewer:take', id: sid });
    if (res?.ok) {
      return {
        title: res.title ?? '',
        content: res.content ?? '',
        ...(res.initialLine != null ? { initialLine: res.initialLine } : {}),
        ...(res.downloadFileName ? { downloadFileName: res.downloadFileName } : {})
      };
    }
    return null;
  }
  if (idb) {
    try {
      const rec = await apexViewerIdbTake(idb);
      if (rec) {
        return {
          title: rec.title ?? '',
          content: rec.content ?? '',
          ...(rec.initialLine != null ? { initialLine: rec.initialLine } : {}),
          ...(rec.downloadFileName ? { downloadFileName: rec.downloadFileName } : {})
        };
      }
    } catch {
      return null;
    }
    return null;
  }
  if (k && chrome?.storage?.local) {
    try {
      const bag = await chrome.storage.local.get(k);
      const payload = bag[k];
      await chrome.storage.local.remove(k);
      return payload || null;
    } catch {
      return null;
    }
  }
  return null;
}

async function main() {
  await loadLang();
  await loadExtensionSettings();
  applyUiThemeToDocument(document);
  document.title = t('docTitle.apexSource');

  const backBtn = document.getElementById('apexSrcViewerBack');
  const downloadBtn = document.getElementById('apexSrcViewerDownload');
  const titleEl = document.getElementById('apexSrcViewerTitle');
  const mount = document.getElementById('apexSrcViewerMount');

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  if (backBtn) backBtn.textContent = t('apexLogViewer.back');
  if (downloadBtn) downloadBtn.textContent = t('apexLogViewer.download');

  const { sid, k, idb, line: lineFromUrl } = getQueryKeys();
  const payload = await loadPayload(sid, k, idb);

  if (!payload) {
    if (titleEl) titleEl.textContent = t('apexLogViewer.missingPayload');
    if (downloadBtn) downloadBtn.disabled = true;
    return;
  }

  const title = (payload.title && String(payload.title)) || t('docTitle.apexSource');
  document.title = title;
  const content = payload.content != null ? String(payload.content) : '';
  const initialLineFromPayload =
    payload.initialLine != null && Number.isFinite(Number(payload.initialLine))
      ? Math.max(1, Math.floor(Number(payload.initialLine)))
      : 0;
  const initialLine = initialLineFromPayload || lineFromUrl || 0;

  if (titleEl) titleEl.textContent = title;
  if (!mount) return;

  let editor = null;
  let monaco = null;
  let highlightDecoIds = [];

  function highlightLine(line) {
    if (!editor || !line || !monaco) return;
    const model = editor.getModel();
    const ln = Math.min(line, Math.max(1, model.getLineCount()));
    editor.revealLineInCenter(ln);
    editor.setPosition({ lineNumber: ln, column: 1 });
    editor.focus();
    highlightDecoIds = editor.deltaDecorations(highlightDecoIds, [
      {
        range: new monaco.Range(ln, 1, ln, 1),
        options: {
          isWholeLine: true,
          className: 'apex-src-line-highlight',
          overviewRuler: { color: '#f472b6', position: monaco.editor.OverviewRulerLane.Full }
        }
      }
    ]);
    setTimeout(() => {
      try {
        highlightDecoIds = editor.deltaDecorations(highlightDecoIds, []);
      } catch {
        /* ignore */
      }
    }, 2500);
    requestAnimationFrame(() => editor?.layout());
  }

  try {
    monaco = await loadMonaco();
    editor = createSingleEditor(monaco, mount);
    editor.setValue(content || '—');
    monaco.editor.setModelLanguage(editor.getModel(), 'apex');
    if (initialLine > 0) highlightLine(initialLine);
  } catch {
    if (titleEl) titleEl.textContent = t('apexLogViewer.monacoError');
    if (downloadBtn) downloadBtn.disabled = true;
    return;
  }

  downloadBtn?.addEventListener('click', () => {
    const body = editor ? editor.getValue() : content;
    const name = inferDownloadFilename(title, payload.downloadFileName);
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
