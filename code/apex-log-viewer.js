import '../shared/installEarlyExceptionCapture.js';
import { loadMonaco, createSingleEditor } from './editor/monaco.js';
import { loadLang, t } from '../shared/i18n.js';
import { loadExtensionSettings, applyUiThemeToDocument } from '../shared/extensionSettings.js';
import { bg } from './core/bridge.js';
import { apexViewerIdbTake } from './lib/apexViewerIdb.js';
import { parseApexDebugLog, formatLogSize, formatMs } from '../shared/apexLogParser.js';
import { parseApexLogExecutionContext } from '../shared/salesforceApi.js';
import { mountApexLogTabs, setActiveApexLogTab, APEX_LOG_TABS } from './lib/apexLogViewer/tabs.js';
import { renderTreeView, layoutTreeEditor, revealTreeLogLine } from './lib/apexLogViewer/rawTreeView.js';
import { renderDebugView } from './lib/apexLogViewer/apexDebugView.js';
import { renderSoqlView } from './lib/apexLogViewer/soqlAnalysisView.js';
import { renderDmlView } from './lib/apexLogViewer/dmlAnalysisView.js';
import { renderTimelineView, revealTimelineLogLine } from './lib/apexLogViewer/timelineView.js';
import { highlightPanelRow } from './lib/apexLogViewer/analysisTableUtils.js';

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
    sid: q.get('staged') || q.get('sid') || '',
    k: q.get('k') || '',
    idb: q.get('idb') || '',
    line: Number.isFinite(lineNum) && lineNum > 0 ? lineNum : 0
  };
}

function isLightTheme() {
  return document.documentElement.getAttribute('data-ui-theme') === 'light';
}

function tabLabel(tabId) {
  const found = APEX_LOG_TABS.find((x) => x.id === tabId);
  return found ? t(found.i18n) : tabId;
}

function getFirstErrorIssue(issues) {
  return (issues || [])
    .filter((issue) => issue.type === 'error' && issue.line > 0)
    .sort((a, b) => a.line - b.line)[0] || null;
}

function renderMetaChips(metaEl, parsed) {
  if (!metaEl || !parsed) return null;
  const chips = [
    `<span class="apex-log-chip">${t('apexLogViewer.meta.size')}: ${formatLogSize(parsed.meta.sizeBytes)}</span>`,
    `<span class="apex-log-chip">${t('apexLogViewer.meta.duration')}: ${formatMs(parsed.meta.durationMs)}</span>`
  ];
  const warningCount = (parsed.issues || []).filter((issue) => issue.type !== 'error').length;
  if (warningCount > 0) {
    chips.push(
      `<span class="apex-log-chip apex-log-chip--warning">${t('apexLogViewer.meta.warnings')}: ${warningCount}</span>`
    );
  }
  const firstError = getFirstErrorIssue(parsed.issues);
  if (firstError) {
    chips.push(
      `<button type="button" class="apex-log-chip apex-log-chip--error" id="apexLogErrorChip" data-line="${firstError.line}">${t('apexLogViewer.meta.logWithErrors')}</button>`
    );
  }
  metaEl.innerHTML = chips.join('');
  metaEl.hidden = false;
  return firstError;
}

function renderContextChip(ctxEl, content) {
  if (!ctxEl) return;
  const ctx = parseApexLogExecutionContext(content);
  if (ctx.logType === 'N/A' && ctx.logName === 'N/A') {
    ctxEl.hidden = true;
    return;
  }
  const parts = [ctx.logType, ctx.logName, ctx.logMethod !== 'N/A' ? ctx.logMethod : '']
    .filter(Boolean)
    .join(' · ');
  ctxEl.innerHTML = `<span class="apex-log-chip">${parts}</span>`;
  ctxEl.hidden = false;
}

async function main() {
  await loadLang();
  await loadExtensionSettings();
  applyUiThemeToDocument(document);

  const backBtn = document.getElementById('apexLogViewerBack');
  const downloadBtn = document.getElementById('apexLogViewerDownload');
  const titleEl = document.getElementById('apexLogViewerTitle');
  const metaEl = document.getElementById('apexLogViewerMeta');
  const ctxEl = document.getElementById('apexLogViewerContext');
  const parsingEl = document.getElementById('apexLogViewerParsing');
  const tabsNav = document.getElementById('apexLogTabs');
  const mount = document.getElementById('apexLogViewerMount');

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
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

  /** @type {import('monaco-editor').editor.IStandaloneCodeEditor | null} */
  let textEditor = null;
  /** @type {import('monaco-editor') | null} */
  let monaco = null;
  /** @type {ReturnType<typeof parseApexDebugLog> | null} */
  let parsed = null;
  /** @type {Set<string>} */
  const renderedTabs = new Set(['text']);
  /** @type {import('./lib/apexLogViewer/tabs.js').ApexLogTabId} */
  let activeTabId = 'text';
  let highlightDecoIds = [];

  function getActiveTabId() {
    const active = document.querySelector('.apex-log-tab.is-active');
    return active?.dataset?.tab || activeTabId;
  }

  function highlightTextLine(line) {
    if (!textEditor || !line || !monaco) return false;
    const model = textEditor.getModel();
    const ln = Math.min(line, Math.max(1, model.getLineCount()));
    textEditor.revealLineInCenter(ln);
    textEditor.setPosition({ lineNumber: ln, column: 1 });
    textEditor.focus();
    highlightDecoIds = textEditor.deltaDecorations(highlightDecoIds, [
      {
        range: new monaco.Range(ln, 1, ln, 1),
        options: {
          isWholeLine: true,
          className: 'apex-log-line-highlight',
          overviewRuler: { color: '#f472b6', position: monaco.editor.OverviewRulerLane.Full }
        }
      }
    ]);
    setTimeout(() => {
      try {
        highlightDecoIds = textEditor.deltaDecorations(highlightDecoIds, []);
      } catch {
        /* ignore */
      }
    }, 2500);
    requestAnimationFrame(() => textEditor?.layout());
    return true;
  }

  function navigateToLineInActiveTab(line) {
    if (!line) return;
    const tabId = getActiveTabId();
    renderTab(tabId);
    let ok = false;
    switch (tabId) {
      case 'text':
        ok = highlightTextLine(line);
        break;
      case 'tree':
        ok = revealTreeLogLine(line);
        break;
      case 'timeline':
        ok = revealTimelineLogLine(line);
        break;
      case 'debug':
        ok = highlightPanelRow(document.getElementById('apexLogDebugMount'), line);
        break;
      case 'soql':
        ok = highlightPanelRow(document.getElementById('apexLogSoqlMount'), line);
        break;
      case 'dml':
        ok = highlightPanelRow(document.getElementById('apexLogDmlMount'), line);
        break;
      default:
        break;
    }
  }

  function jumpToLogLine(line) {
    if (!textEditor || !line) return;
    setActiveApexLogTab('text');
    activeTabId = 'text';
    renderedTabs.add('text');
    highlightTextLine(line);
  }

  function renderTab(tabId) {
    if (!parsed) return;
    if (renderedTabs.has(tabId)) {
      if (tabId === 'text') textEditor?.layout();
      if (tabId === 'tree') layoutTreeEditor();
      return;
    }
    renderedTabs.add(tabId);
    switch (tabId) {
      case 'tree':
        renderTreeView(monaco, document.getElementById('apexLogTreeMount'), parsed, isLightTheme(), t);
        break;
      case 'debug':
        renderDebugView(document.getElementById('apexLogDebugMount'), parsed, jumpToLogLine, t);
        break;
      case 'timeline':
        renderTimelineView(document.getElementById('apexLogTimelineMount'), parsed, jumpToLogLine, t);
        break;
      case 'soql':
        renderSoqlView(document.getElementById('apexLogSoqlMount'), parsed, jumpToLogLine, t);
        break;
      case 'dml':
        renderDmlView(document.getElementById('apexLogDmlMount'), parsed, jumpToLogLine, t);
        break;
      default:
        break;
    }
  }

  function onTabSelect(tabId) {
    activeTabId = tabId;
    setActiveApexLogTab(tabId);
    renderTab(tabId);
    requestAnimationFrame(() => {
      if (tabId === 'text') textEditor?.layout();
      if (tabId === 'tree') layoutTreeEditor();
    });
  }

  mountApexLogTabs(tabsNav, tabLabel, onTabSelect);

  try {
    monaco = await loadMonaco();
    textEditor = createSingleEditor(monaco, mount);
    textEditor.setValue(content || '—');
    monaco.editor.setModelLanguage(textEditor.getModel(), 'apex');
    if (initialLine > 0) {
      jumpToLogLine(initialLine);
    }
  } catch {
    if (titleEl) titleEl.textContent = t('apexLogViewer.monacoError');
    return;
  }

  if (parsingEl) parsingEl.hidden = false;
  await new Promise((resolve) => {
    const run = () => {
      try {
        parsed = parseApexDebugLog(content);
        const firstError = renderMetaChips(metaEl, parsed);
        renderContextChip(ctxEl, content);
        document.getElementById('apexLogErrorChip')?.addEventListener('click', () => {
          if (firstError?.line) navigateToLineInActiveTab(firstError.line);
        });
      } catch {
        parsed = null;
      }
      if (parsingEl) parsingEl.hidden = true;
      resolve();
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 120 });
    } else {
      setTimeout(run, 0);
    }
  });

  downloadBtn?.addEventListener('click', () => {
    const body = textEditor ? textEditor.getValue() : content;
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
