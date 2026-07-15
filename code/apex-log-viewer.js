import '../shared/installEarlyExceptionCapture.js';
import { loadMonaco, createSingleEditor } from './editor/monaco.js';
import { loadLang, t } from '../shared/i18n.js';
import { loadExtensionSettings, applyUiThemeToDocument } from '../shared/extensionSettings.js';
import { bg } from './core/bridge.js';
import { apexViewerIdbTake } from './lib/apexViewerIdb.js';
import { parseApexDebugLog, formatLogSize, formatMs, sliceParsedForExecution } from '../shared/apexLogParser.js';
import { parseApexLogExecutionContext } from '../shared/salesforceApi.js';
import { mountApexLogTabs, setActiveApexLogTab, APEX_LOG_TABS } from './lib/apexLogViewer/tabs.js';
import { revealTreeLogLine } from './lib/apexLogViewer/rawTreeView.js';
import { renderTimelineView, revealTimelineLogLine } from './lib/apexLogViewer/timelineView.js';
import { renderSummaryView } from './lib/apexLogViewer/summaryView.js';
import { renderErrorsView, highlightErrorsPanelRow } from './lib/apexLogViewer/errorsView.js';
import { mountTextFilterBar } from './lib/apexLogViewer/textFilterBar.js';
import { ensurePanelSectionHeading } from './lib/apexLogViewer/panelSectionHeading.js';
import { highlightPanelRow } from './lib/apexLogViewer/analysisTableUtils.js';
import { escapeHtml } from '../shared/htmlEscape.js';
import { renderDatabaseView } from './lib/apexLogViewer/databaseView.js';
import { renderAnalysisView, layoutAnalysisTreeEditor } from './lib/apexLogViewer/analysisView.js';
import { renderNetworkView } from './lib/apexLogViewer/networkView.js';
import { renderPlatformView } from './lib/apexLogViewer/platformView.js';
import { mountFindBar } from './lib/apexLogViewer/findBar.js';
import {
  mountExecutionSelector,
  renderExecutionToolbarBadge,
  shouldShowExecutionSelector
} from './lib/apexLogViewer/executionSelector.js';
import { mountLogiAdvisor } from './lib/apexLogViewer/logiAdvisorModal.js';

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

/**
 * @param {string} fullText
 * @param {number} startLine 1-based file line
 * @param {number} endLine 1-based file line
 */
function extractLogTextSlice(fullText, startLine, endLine) {
  const lines = String(fullText || '').split(/\r?\n/);
  const start = Math.max(1, Math.floor(startLine));
  const end = Math.min(lines.length, Math.floor(endLine));
  if (start > end || !lines.length) {
    return { text: '', fileLineOffset: Math.max(0, start - 1) };
  }
  return {
    text: lines.slice(start - 1, end).join('\n'),
    fileLineOffset: start - 1
  };
}

const LOG_USER_ICON_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

function renderToolbarMeta(metaEl, parsed) {
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

function renderToolbarName(nameEl, content, selectedExecutionId, parsedFull) {
  if (!nameEl) return;
  let label = '';
  if (selectedExecutionId !== 'all' && parsedFull?.executions?.length) {
    const exec = parsedFull.executions.find((e) => String(e.id) === String(selectedExecutionId));
    label = exec?.label || '';
  } else if (!parsedFull?.executions?.length || parsedFull.executions.length <= 1) {
    const ctx = parseApexLogExecutionContext(content);
    const parts = [ctx.logType, ctx.logName, ctx.logMethod !== 'N/A' ? ctx.logMethod : '']
      .filter(Boolean)
      .join(' · ');
    label = parts;
  }
  if (!label) {
    nameEl.hidden = true;
    nameEl.innerHTML = '';
    return;
  }
  nameEl.innerHTML = `<span class="apex-log-chip apex-log-chip--name" title="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
  nameEl.hidden = false;
}

function renderLogUserBadge(el, parsed) {
  return parsed?.user?.name || '';
}

async function renderViewerUserBadge(el, _orgId, parsed) {
  if (!el) return;
  const logUser = renderLogUserBadge(null, parsed);
  if (!logUser) {
    el.hidden = true;
    el.innerHTML = '';
    el.removeAttribute('title');
    el.removeAttribute('aria-label');
    return;
  }
  el.innerHTML = LOG_USER_ICON_SVG;
  el.title = `${t('apexLogViewer.summary.user')}: ${logUser}`;
  el.setAttribute('aria-label', logUser);
  el.hidden = false;
}

function renderMetaChips(metaEl, parsed) {
  return renderToolbarMeta(metaEl, parsed);
}

async function main() {
  await loadLang();
  await loadExtensionSettings();
  applyUiThemeToDocument(document);

  const backBtn = document.getElementById('apexLogViewerBack');
  const downloadBtn = document.getElementById('apexLogViewerDownload');
  const titleEl = document.getElementById('apexLogViewerTitle');
  const metaEl = document.getElementById('apexLogViewerMeta');
  const nameEl = document.getElementById('apexLogViewerName');
  const execBadgeEl = document.getElementById('apexLogExecutionBadge');
  const userEl = document.getElementById('apexLogViewerUser');
  const parsingEl = document.getElementById('apexLogViewerParsing');
  const loadingEl = document.getElementById('apexLogViewerLoading');
  const tabsNav = document.getElementById('apexLogTabs');
  const mount = document.getElementById('apexLogViewerMount');
  const findMount = document.getElementById('apexLogFindMount');
  const executionMount = document.getElementById('apexLogExecutionMount');

  const setLoading = (visible) => {
    if (!loadingEl) return;
    loadingEl.hidden = !visible;
  };

  const setParsing = (visible) => {
    if (!parsingEl) return;
    parsingEl.textContent = t('apexLogViewer.parsing');
    parsingEl.hidden = !visible;
  };

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  if (backBtn) backBtn.textContent = t('apexLogViewer.back');
  if (downloadBtn) downloadBtn.textContent = t('apexLogViewer.download');

  setLoading(true);

  const { sid, k, idb, line: lineFromUrl } = getQueryKeys();
  let payload = null;

  if (sid) {
    const res = await bg({ type: 'apexViewer:take', id: sid });
    if (res?.ok) {
      payload = {
        title: res.title ?? '',
        content: res.content ?? '',
        ...(res.initialLine != null ? { initialLine: res.initialLine } : {}),
        ...(res.downloadFileName ? { downloadFileName: res.downloadFileName } : {}),
        ...(res.defaultTab ? { defaultTab: res.defaultTab } : {}),
        ...(res.orgId ? { orgId: res.orgId } : {}),
        ...(res.instanceUrl ? { instanceUrl: res.instanceUrl } : {}),
        ...(res.logId ? { logId: res.logId } : {})
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
          ...(rec.downloadFileName ? { downloadFileName: rec.downloadFileName } : {}),
          ...(rec.defaultTab ? { defaultTab: rec.defaultTab } : {}),
          ...(rec.orgId ? { orgId: rec.orgId } : {}),
          ...(rec.instanceUrl ? { instanceUrl: rec.instanceUrl } : {}),
          ...(rec.logId ? { logId: rec.logId } : {})
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
    setLoading(false);
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
  const viewerContext = {
    instanceUrl: payload.instanceUrl || '',
    orgId: payload.orgId || '',
    logId: payload.logId || ''
  };

  async function resolveRecords(ids) {
    if (!viewerContext.orgId || !Array.isArray(ids) || !ids.length) return {};
    try {
      const res = await bg({ type: 'apexViewer:resolveRecords', orgId: viewerContext.orgId, ids });
      if (res?.ok && res.recordsById && typeof res.recordsById === 'object') return res.recordsById;
    } catch {
      /* fallback ID */
    }
    return {};
  }

  if (titleEl) titleEl.textContent = title;
  if (downloadBtn) downloadBtn.hidden = false;

  void mountLogiAdvisor({
    getParsed: () => getScopedParsed(),
    getRawContent: () => content,
    payload: payload || {}
  });

  if (!mount) return;

  let textEditor = null;
  let monaco = null;
  let parsedFull = null;
  /** @type {string | number} */
  let selectedExecutionId = 'all';
  const renderedTabs = new Set();
  let activeTabId = payload.defaultTab || 'summary';
  let highlightDecoIds = [];
  /** @type {number} file line number shown as editor line 1 minus 1 */
  let textFileLineOffset = 0;

  function getTextEditorSlice() {
    if (!content) return { text: '', fileLineOffset: 0 };
    if (selectedExecutionId === 'all' || !parsedFull?.executions?.length) {
      return { text: content, fileLineOffset: 0 };
    }
    const exec = parsedFull.executions.find((e) => String(e.id) === String(selectedExecutionId));
    if (!exec?.startLine || !exec?.endLine) {
      return { text: content, fileLineOffset: 0 };
    }
    return extractLogTextSlice(content, exec.startLine, exec.endLine);
  }

  function getTextLineEventsForEditor() {
    const parsed = getScopedParsed();
    const events = parsed?.lineEvents || parsedFull?.lineEvents || [];
    if (!textFileLineOffset) return events;
    return events.map((e) => ({ ...e, line: e.line - textFileLineOffset }));
  }

  function fileLineToEditorLine(fileLine) {
    if (!fileLine) return 0;
    return fileLine - textFileLineOffset;
  }

  function syncTextEditorContent() {
    if (!textEditor) return;
    const { text, fileLineOffset } = getTextEditorSlice();
    textFileLineOffset = fileLineOffset;
    const model = textEditor.getModel();
    if (model && model.getValue() !== text) {
      textEditor.setValue(text || '—');
    }
    if (monaco && textEditor.getModel()) {
      mountTextFilterBar(monaco, textEditor, getTextLineEventsForEditor(), t);
    }
  }

  function refreshToolbar() {
    const scoped = getScopedParsed();
    const statsSource = scoped || parsedFull;
    let firstError = null;
    if (statsSource) {
      firstError = renderToolbarMeta(metaEl, statsSource);
    }
    renderToolbarName(nameEl, content, selectedExecutionId, parsedFull);
    void renderViewerUserBadge(userEl, viewerContext.orgId, parsedFull);
    return firstError;
  }

  function getScopedParsed() {
    if (!parsedFull) return null;
    return sliceParsedForExecution(parsedFull, selectedExecutionId);
  }

  function getActiveTabId() {
    const active = document.querySelector('.apex-log-tab.is-active');
    return active?.dataset?.tab || activeTabId;
  }

  function highlightTextLine(fileLine) {
    if (!textEditor || !fileLine || !monaco) return false;
    const model = textEditor.getModel();
    const ln = fileLineToEditorLine(fileLine);
    if (ln < 1 || ln > model.getLineCount()) return false;
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
    renderTab(tabId, true);
    let ok = false;
    switch (tabId) {
      case 'text':
        ok = highlightTextLine(line);
        break;
      case 'analysis':
        ok = revealTreeLogLine(line);
        break;
      case 'timeline':
        ok = revealTimelineLogLine(line);
        break;
      case 'network':
        ok =
          highlightPanelRow(document.getElementById('apexLogNetworkMount'), line) ||
          highlightPanelRow(document.querySelector('#apexLogNetworkSectionMount'), line);
        break;
      case 'database':
        ok =
          highlightPanelRow(document.getElementById('apexLogDatabaseMount'), line) ||
          highlightPanelRow(document.querySelector('#apexLogDatabaseSectionMount'), line);
        break;
      case 'summary':
        ok = highlightPanelRow(document.getElementById('apexLogSummaryMount'), line);
        break;
      case 'platform':
        ok =
          highlightPanelRow(document.getElementById('apexLogPlatformMount'), line) ||
          highlightPanelRow(document.querySelector('#apexLogPlatformSectionMount'), line);
        break;
      case 'errors':
        ok = highlightErrorsPanelRow(document.getElementById('apexLogErrorsMount'), line);
        break;
      default:
        break;
    }
    if (!ok && tabId !== 'text') jumpToLogLine(line);
  }

  function jumpToLogLine(line) {
    if (!textEditor || !line) return;
    setActiveApexLogTab('text');
    activeTabId = 'text';
    renderedTabs.add('text');
    highlightTextLine(line);
  }

  function invalidateRenderedTabs() {
    renderedTabs.clear();
  }

  function onExecutionSelect(id) {
    if (!shouldShowExecutionSelector(parsedFull)) return;
    selectedExecutionId = id;
    invalidateRenderedTabs();
    const scoped = getScopedParsed();
    if (scoped) {
      mountFindBar(findMount, scoped, (tab, line) => {
        onTabSelect(tab);
        requestAnimationFrame(() => navigateToLineInActiveTab(line));
      }, t);
    }
    refreshToolbar();
    mountExecutionSelector(executionMount, parsedFull, selectedExecutionId, onExecutionSelect, t);
    syncTextEditorContent();
    renderTab(activeTabId, true);
  }

  function renderTab(tabId, force = false) {
    const parsed = getScopedParsed();
    if (!parsed) return;
    if (!force && renderedTabs.has(tabId)) {
      if (tabId === 'text') textEditor?.layout();
      if (tabId === 'analysis') layoutAnalysisTreeEditor();
      return;
    }
    renderedTabs.add(tabId);
    const jump = jumpToLogLine;
    const tabOpts = { ...viewerContext, onTabSwitch: onTabSelect, resolveRecords };

    switch (tabId) {
      case 'summary':
        renderSummaryView(document.getElementById('apexLogSummaryMount'), parsed, jump, t, tabOpts);
        break;
      case 'errors':
        renderErrorsView(document.getElementById('apexLogErrorsMount'), parsed, jump, t);
        break;
      case 'timeline':
        renderTimelineView(
          document.getElementById('apexLogTimelineMount'),
          parsed,
          jump,
          t,
          document.getElementById('apexLogTimelineToolbar')
        );
        break;
      case 'database':
        renderDatabaseView(document.getElementById('apexLogDatabaseMount'), parsed, jump, t);
        break;
      case 'analysis':
        renderAnalysisView(
          document.getElementById('apexLogAnalysisMount'),
          parsed,
          jump,
          t,
          monaco,
          isLightTheme(),
          null
        );
        break;
      case 'network':
        renderNetworkView(document.getElementById('apexLogNetworkMount'), parsed, jump, t);
        break;
      case 'platform':
        renderPlatformView(document.getElementById('apexLogPlatformMount'), parsed, jump, t);
        break;
      case 'text': {
        const textPanel = document.querySelector('.apex-log-panel[data-panel="text"]');
        ensurePanelSectionHeading(textPanel, 'text', t('apexLogViewer.tab.text'), t);
        if (textEditor && monaco) {
          syncTextEditorContent();
        }
        break;
      }
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
      if (tabId === 'analysis') layoutAnalysisTreeEditor();
    });
  }

  mountApexLogTabs(tabsNav, tabLabel, onTabSelect, t);
  setActiveApexLogTab(activeTabId);

  try {
    monaco = await loadMonaco();
    textEditor = createSingleEditor(monaco, mount);
    textEditor.setValue(content || '—');
    monaco.editor.setModelLanguage(textEditor.getModel(), 'apex');
    if (initialLine > 0) jumpToLogLine(initialLine);
  } catch {
    setLoading(false);
    if (titleEl) titleEl.textContent = t('apexLogViewer.monacoError');
    return;
  }

  setParsing(true);
  await new Promise((resolve) => {
    const run = () => {
      try {
        parsedFull = parseApexDebugLog(content);
        selectedExecutionId = 'all';
        const firstError = refreshToolbar();
        renderExecutionToolbarBadge(execBadgeEl, parsedFull, t);
        if (shouldShowExecutionSelector(parsedFull)) {
          mountExecutionSelector(executionMount, parsedFull, selectedExecutionId, onExecutionSelect, t);
        } else if (executionMount) {
          executionMount.hidden = true;
          executionMount.innerHTML = '';
          executionMount.style.display = 'none';
        }
        mountFindBar(findMount, getScopedParsed() || parsedFull, (tab, line) => {
          onTabSelect(tab);
          requestAnimationFrame(() => navigateToLineInActiveTab(line));
        }, t);
        document.getElementById('apexLogErrorChip')?.addEventListener('click', () => {
          onTabSelect('errors');
          if (firstError?.line) {
            requestAnimationFrame(() => navigateToLineInActiveTab(firstError.line));
          }
        });
        renderTab(activeTabId, true);
        syncTextEditorContent();
      } catch {
        parsedFull = null;
      }
      setParsing(false);
      setLoading(false);
      resolve();
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 120 });
    } else {
      setTimeout(run, 0);
    }
  });

  downloadBtn?.addEventListener('click', () => {
    const body = content;
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
