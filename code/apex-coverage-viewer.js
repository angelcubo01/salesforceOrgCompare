import '../shared/installEarlyExceptionCapture.js';
import { loadMonaco, createSingleEditor } from './editor/monaco.js';
import { loadLang, t } from '../shared/i18n.js';
import { loadExtensionSettings, applyUiThemeToDocument } from '../shared/extensionSettings.js';
import { openStandaloneToolHelpModal } from '../shared/standaloneToolHelpModal.js';
import { renderStandaloneViewerState } from '../shared/standaloneViewerState.js';
import { renderConnectedUserBadge, applyConnectedUserTitle } from './lib/renderConnectedUserBadge.js';
import { setupStandaloneCommandPalette } from '../shared/commandPaletteBridge.js';
import { bg } from './core/bridge.js';
import { buildApexCoverageViewerPath } from './lib/apexCoverageViewerUrl.js';

function getQueryState() {
  const q = new URLSearchParams(window.location.search || '');
  return {
    key: q.get('k') || '',
    mode: q.get('mode') === 'split' ? 'split' : 'single',
    orgId: q.get('orgId') || '',
    apexId: q.get('apexId') || '',
    jobId: q.get('jobId') || '',
    leftOrgId: q.get('leftOrgId') || '',
    leftApexId: q.get('leftApexId') || '',
    rightOrgId: q.get('rightOrgId') || '',
    rightApexId: q.get('rightApexId') || '',
    className: q.get('className') || ''
  };
}

async function loadRemoteCoverage(query) {
  if (query.mode === 'split') {
    if (!query.leftOrgId || !query.leftApexId || !query.rightOrgId || !query.rightApexId) return null;
    const [left, right] = await Promise.all([
      bg({ type: 'apexCoverageCompare:getLineView', orgId: query.leftOrgId, apexClassOrTriggerId: query.leftApexId, className: query.className }),
      bg({ type: 'apexCoverageCompare:getLineView', orgId: query.rightOrgId, apexClassOrTriggerId: query.rightApexId, className: query.className })
    ]);
    if (!left?.ok || !right?.ok) return null;
    const className = query.className || left.name || right.name || '';
    return {
      mode: 'split', className, title: `${className} · ${t('coverageCompare.viewSplit')}`,
      left: { orgId: left.org?.id || query.leftOrgId, orgLabel: left.org?.label || query.leftOrgId, apexId: query.leftApexId, body: String(left.body || ''), coveredLines: left.coveredLines || [], uncoveredLines: left.uncoveredLines || [] },
      right: { orgId: right.org?.id || query.rightOrgId, orgLabel: right.org?.label || query.rightOrgId, apexId: query.rightApexId, body: String(right.body || ''), coveredLines: right.coveredLines || [], uncoveredLines: right.uncoveredLines || [] }
    };
  }
  if (!query.orgId || !query.apexId) return null;
  const request = query.jobId
    ? { type: 'apexTests:getCoverageLineView', orgId: query.orgId, jobId: query.jobId, classOrTriggerId: query.apexId, className: query.className }
    : { type: 'apexCoverageCompare:getLineView', orgId: query.orgId, apexClassOrTriggerId: query.apexId, className: query.className };
  const response = await bg(request);
  if (!response?.ok) return null;
  const className = query.className || response.name || query.apexId;
  return { title: `${className} · ${t('docTitle.apexCoverage')}`, className, body: String(response.body || ''), coveredLines: response.coveredLines || [], uncoveredLines: response.uncoveredLines || [], orgId: query.orgId, apexId: query.apexId, jobId: query.jobId };
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
  const helpBtn = document.getElementById('apexCovViewerHelp');
  const titleEl = document.getElementById('apexCovViewerTitle');
  const sourceNoticeEl = document.getElementById('apexCovViewerSourceNotice');
  const singleWrap = document.getElementById('apexCovSingleWrap');
  const singleMount = document.getElementById('apexCovViewerMount');
  const splitRoot = document.getElementById('apexCovSplitRoot');
  const splitLeftMount = document.getElementById('apexCovSplitLeftMount');
  const splitRightMount = document.getElementById('apexCovSplitRightMount');
  const splitLeftBadge = document.getElementById('apexCovSplitLeftBadge');
  const splitRightBadge = document.getElementById('apexCovSplitRightBadge');

  if (backBtn) backBtn.textContent = t('apexLogViewer.back');
  if (helpBtn) {
    helpBtn.title = t('help.openTitle');
    helpBtn.setAttribute('aria-label', t('help.open'));
  }
  helpBtn?.addEventListener('click', () => {
    openStandaloneToolHelpModal(t, 'ApexCoverageViewer');
  });

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key && key !== 'apexLogViewer.back') el.textContent = t(key);
  });

  const query = getQueryState();
  let payload = null;
  if (query.key && chrome?.storage?.local) {
    try {
      const bag = await chrome.storage.local.get(query.key);
      payload = bag[query.key];
      await chrome.storage.local.remove(query.key);
    } catch {
      payload = null;
    }
  }
  if (!payload) {
    try { payload = await loadRemoteCoverage(query); } catch { payload = null; }
  }

  if (!payload) {
    const errorTitle = query.orgId || query.leftOrgId ? t('coverageCompare.lineViewError') : t('apexLogViewer.missingPayload');
    if (titleEl) titleEl.textContent = errorTitle;
    renderStandaloneViewerState(singleMount, {
      kind: 'error',
      title: errorTitle,
      description: t('state.error.description')
    });
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
    const syncSplitShareUrl = () => {
      if (!splitSides.left?.orgId || !splitSides.left?.apexId || !splitSides.right?.orgId || !splitSides.right?.apexId) return;
      history.replaceState(null, '', chrome.runtime.getURL(buildApexCoverageViewerPath('', {
        mode: 'split', leftOrgId: splitSides.left.orgId, leftApexId: splitSides.left.apexId,
        rightOrgId: splitSides.right.orgId, rightApexId: splitSides.right.apexId,
        className: payload.className || query.className || ''
      })));
    };
    syncSplitShareUrl();

    const refreshSplitBadges = () => {
      if (splitLeftBadge) {
        splitLeftBadge.textContent = orgBadgeLabel(splitSides.left, t('coverageCompare.viewLeft'));
        void applyConnectedUserTitle(splitLeftBadge, splitSides.left?.orgId);
      }
      if (splitRightBadge) {
        splitRightBadge.textContent = orgBadgeLabel(splitSides.right, t('coverageCompare.viewRight'));
        void applyConnectedUserTitle(splitRightBadge, splitSides.right?.orgId);
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
        syncSplitShareUrl();
        refreshSplitBadges();
        applySplitPane(monaco, editorL, splitSides.left);
        applySplitPane(monaco, editorR, splitSides.right);
      });
    } catch {
      if (titleEl) titleEl.textContent = t('apexLogViewer.monacoError');
      renderStandaloneViewerState(splitRoot, {
        kind: 'error',
        title: t('apexLogViewer.monacoError'),
        description: t('state.error.description')
      });
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

  const baseTitle = (payload && payload.title) || t('docTitle.apexCoverage');
  if (payload.orgId && payload.apexId) {
    history.replaceState(null, '', chrome.runtime.getURL(buildApexCoverageViewerPath('', {
      orgId: payload.orgId, apexId: payload.apexId, jobId: payload.jobId || '',
      className: payload.className || query.className || ''
    })));
  }
  const sourceLabel = payload?.sourceLabel ? String(payload.sourceLabel) : '';
  const title = sourceLabel ? `${baseTitle} · ${sourceLabel}` : baseTitle;
  const content = (payload && payload.body) != null ? String(payload.body) : '';
  const coveredLines = payload?.coveredLines;
  const uncoveredLines = payload?.uncoveredLines;
  if (titleEl) titleEl.textContent = title;
  if (sourceNoticeEl && payload?.sourceNotice) {
    sourceNoticeEl.textContent = String(payload.sourceNotice);
    sourceNoticeEl.hidden = false;
  }
  void renderConnectedUserBadge(
    document.getElementById('apexCovViewerUser'),
    payload?.orgId
  );

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
    renderStandaloneViewerState(singleMount, {
      kind: 'error',
      title: t('apexLogViewer.monacoError'),
      description: t('state.error.description')
    });
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

setupStandaloneCommandPalette();
void main();
