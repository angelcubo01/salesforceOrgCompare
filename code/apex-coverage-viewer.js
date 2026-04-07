import { loadMonaco, createSingleEditor } from './editor/monaco.js';
import { loadLang, t } from '../shared/i18n.js';

function getStorageKey() {
  const q = new URLSearchParams(window.location.search || '');
  return q.get('k') || '';
}

function applyCoverageDecorations(monaco, editor, coveredLines, uncoveredLines) {
  const model = editor.getModel();
  if (!model) return;
  const covered = new Set((coveredLines || []).map((n) => Number(n)).filter((x) => Number.isFinite(x) && x >= 1));
  const uncovered = new Set(
    (uncoveredLines || []).map((n) => Number(n)).filter((x) => Number.isFinite(x) && x >= 1)
  );
  for (const ln of covered) uncovered.delete(ln);
  const maxL = model.getLineCount();
  const decos = [];
  for (let ln = 1; ln <= maxL; ln++) {
    const lastCol = Math.max(1, model.getLineMaxColumn(ln));
    if (covered.has(ln)) {
      decos.push({
        range: new monaco.Range(ln, 1, ln, lastCol),
        options: { isWholeLine: true, className: 'sfoc-cov-line-covered' }
      });
    } else if (uncovered.has(ln)) {
      decos.push({
        range: new monaco.Range(ln, 1, ln, lastCol),
        options: { isWholeLine: true, className: 'sfoc-cov-line-uncovered' }
      });
    }
  }
  editor.deltaDecorations([], decos);
}

async function main() {
  await loadLang();
  document.title = t('docTitle.apexCoverage');

  const backBtn = document.getElementById('apexCovViewerBack');
  const titleEl = document.getElementById('apexCovViewerTitle');
  const mount = document.getElementById('apexCovViewerMount');
  if (backBtn) backBtn.textContent = t('apexLogViewer.back');

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key && key !== 'apexLogViewer.back') el.textContent = t(key);
  });

  const key = getStorageKey();
  if (!key || !chrome?.storage?.local) {
    if (titleEl) titleEl.textContent = t('apexLogViewer.missingPayload');
    return;
  }

  let payload = null;
  try {
    const bag = await chrome.storage.local.get(key);
    payload = bag[key];
    await chrome.storage.local.remove(key);
  } catch {
    if (titleEl) titleEl.textContent = t('apexLogViewer.missingPayload');
    return;
  }

  const title = (payload && payload.title) || t('docTitle.apexCoverage');
  const content = (payload && payload.body) != null ? String(payload.body) : '';
  const coveredLines = payload?.coveredLines;
  const uncoveredLines = payload?.uncoveredLines;
  if (titleEl) titleEl.textContent = title;

  if (!mount) return;

  try {
    const monaco = await loadMonaco();
    const editor = createSingleEditor(monaco, mount);
    editor.setValue(content || '—');
    monaco.editor.setModelLanguage(editor.getModel(), 'apex');
    applyCoverageDecorations(monaco, editor, coveredLines, uncoveredLines);
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
