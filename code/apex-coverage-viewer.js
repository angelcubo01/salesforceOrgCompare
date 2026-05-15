import { loadMonaco, createSingleEditor } from './editor/monaco.js';
import { loadLang, t } from '../shared/i18n.js';
import { loadExtensionSettings, applyUiThemeToDocument } from '../shared/extensionSettings.js';

function getStorageKey() {
  const q = new URLSearchParams(window.location.search || '');
  return q.get('k') || '';
}

/**
 * @param {import('monaco-editor')} monaco
 * @param {import('monaco-editor').editor.IStandaloneCodeEditor} editor
 * @param {unknown} coveredLines
 * @param {unknown} uncoveredLines
 * @param {string} coveredClass
 * @param {string} uncoveredClass
 */
function applyCoverageDecorations(monaco, editor, coveredLines, uncoveredLines, coveredClass, uncoveredClass) {
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
        options: { isWholeLine: true, className: coveredClass }
      });
    } else if (uncovered.has(ln)) {
      decos.push({
        range: new monaco.Range(ln, 1, ln, lastCol),
        options: { isWholeLine: true, className: uncoveredClass }
      });
    }
  }
  editor.deltaDecorations([], decos);
}

/**
 * @param {import('monaco-editor').editor.IStandaloneCodeEditor} editorA
 * @param {import('monaco-editor').editor.IStandaloneCodeEditor} editorB
 */
/**
 * @param {import('monaco-editor')} monaco
 * @param {import('monaco-editor').editor.IStandaloneCodeEditor} editor
 * @param {Record<string, unknown>} side
 */
function applySplitPane(monaco, editor, side) {
  const body = side.body != null ? String(side.body) : '';
  editor.setValue(body || '—');
  monaco.editor.setModelLanguage(editor.getModel(), 'apex');
  applyCoverageDecorations(
    monaco,
    editor,
    side.coveredLines,
    side.uncoveredLines,
    'sfoc-cov-line-covered',
    'sfoc-cov-line-uncovered'
  );
}

/**
 * @param {Record<string, unknown>} side
 * @param {string} fallback
 */
function orgBadgeLabel(side, fallback) {
  return side.orgLabel != null ? String(side.orgLabel) : fallback;
}

function bindSyncedScroll(editorA, editorB) {
  let mute = false;
  const apply = (/** @type {import('monaco-editor').editor.IScrollEvent} */ e, target) => {
    if (mute) return;
    mute = true;
    try {
      target.setScrollTop(e.scrollTop);
      target.setScrollLeft(e.scrollLeft);
    } finally {
      mute = false;
    }
  };
  editorA.onDidScrollChange((e) => apply(e, editorB));
  editorB.onDidScrollChange((e) => apply(e, editorA));
}

/**
 * @param {unknown} payload
 * @returns {payload is { mode: 'split', title?: string, left: Record<string, unknown>, right: Record<string, unknown> }}
 */
function isSplitPayload(payload) {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      payload.mode === 'split' &&
      payload.left &&
      typeof payload.left === 'object' &&
      payload.right &&
      typeof payload.right === 'object'
  );
}

async function main() {
  await loadLang();
  await loadExtensionSettings();
  applyUiThemeToDocument(document);
  document.title = t('docTitle.apexCoverage');

  const backBtn = document.getElementById('apexCovViewerBack');
  const titleEl = document.getElementById('apexCovViewerTitle');
  const singleWrap = document.getElementById('apexCovSingleWrap');
  const singleMount = document.getElementById('apexCovViewerMount');
  const splitRoot = document.getElementById('apexCovSplitRoot');
  const splitLeftMount = document.getElementById('apexCovSplitLeftMount');
  const splitRightMount = document.getElementById('apexCovSplitRightMount');
  const splitLeftBadge = document.getElementById('apexCovSplitLeftBadge');
  const splitRightBadge = document.getElementById('apexCovSplitRightBadge');

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

  if (isSplitPayload(payload)) {
    document.body.classList.add('apex-cov-split-active');
    const title =
      (payload.title && String(payload.title)) ||
      `${t('coverageCompare.viewSplit')} · ${t('docTitle.apexCoverage')}`;
    if (titleEl) titleEl.textContent = title;
    if (singleWrap) singleWrap.hidden = true;
    if (splitRoot) splitRoot.hidden = false;

    /** @type {{ left: Record<string, unknown>, right: Record<string, unknown> }} */
    const splitSides = { left: payload.left, right: payload.right };

    const refreshSplitBadges = () => {
      if (splitLeftBadge) {
        splitLeftBadge.textContent = orgBadgeLabel(splitSides.left, t('coverageCompare.viewLeft'));
      }
      if (splitRightBadge) {
        splitRightBadge.textContent = orgBadgeLabel(splitSides.right, t('coverageCompare.viewRight'));
      }
    };
    refreshSplitBadges();

    if (!splitLeftMount || !splitRightMount) return;
    try {
      const monaco = await loadMonaco();
      const editorL = createSingleEditor(monaco, splitLeftMount);
      const editorR = createSingleEditor(monaco, splitRightMount);
      applySplitPane(monaco, editorL, splitSides.left);
      applySplitPane(monaco, editorR, splitSides.right);
      bindSyncedScroll(editorL, editorR);

      const swapBtn = document.getElementById('apexCovSplitSwapBtn');
      swapBtn?.addEventListener('click', () => {
        const tmp = splitSides.left;
        splitSides.left = splitSides.right;
        splitSides.right = tmp;
        refreshSplitBadges();
        applySplitPane(monaco, editorL, splitSides.left);
        applySplitPane(monaco, editorR, splitSides.right);
      });
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
    return;
  }

  const title = (payload && payload.title) || t('docTitle.apexCoverage');
  const content = (payload && payload.body) != null ? String(payload.body) : '';
  const coveredLines = payload?.coveredLines;
  const uncoveredLines = payload?.uncoveredLines;
  if (titleEl) titleEl.textContent = title;

  if (!singleMount) return;

  try {
    const monaco = await loadMonaco();
    const editor = createSingleEditor(monaco, singleMount);
    editor.setValue(content || '—');
    monaco.editor.setModelLanguage(editor.getModel(), 'apex');
    applyCoverageDecorations(
      monaco,
      editor,
      coveredLines,
      uncoveredLines,
      'sfoc-cov-line-covered',
      'sfoc-cov-line-uncovered'
    );
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
