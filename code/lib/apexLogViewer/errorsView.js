import { escapeHtml } from '../../../shared/htmlEscape.js';
import { formatMs } from '../../../shared/apexLogParser.js';
import {
  APEX_LOG_PREVIEW,
  createPreviewController,
  filterRowsByQuery,
  mountShowMoreFooter,
  mountPreviewTable,
  renderSummaryChips,
  wireSearchFilter
} from './analysisTableUtils.js';
import { panelSectionHeading, wirePanelHelpButtons } from './panelSectionHeading.js';

/**
 * @param {object} parsed
 */
function collectExecutionErrors(parsed) {
  return (parsed?.issues || []).filter((i) => i.type === 'error');
}

/**
 * @param {object} parsed
 */
function collectHttpErrors(parsed) {
  return (parsed?.callouts || []).filter((c) => c.statusCode >= 400);
}

/**
 * @param {object} parsed
 */
function collectValidationFails(parsed) {
  return (parsed?.validations || []).filter((v) => v.result === 'fail' || v.kind === 'fail');
}

/**
 * @param {HTMLElement} mount
 * @param {object} parsed
 * @param {(line: number) => void} onJump
 * @param {(key: string, params?: object) => string} t
 */
export function renderErrorsView(mount, parsed, onJump, t) {
  if (!mount) return;

  const executionErrors = collectExecutionErrors(parsed);
  const httpErrors = collectHttpErrors(parsed);
  const validationFails = collectValidationFails(parsed);
  const totalCount = executionErrors.length + httpErrors.length + validationFails.length;

  mount.innerHTML = `
    ${panelSectionHeading('errors', t('apexLogViewer.tab.errors'), t)}
    <div class="apex-log-panel-toolbar apex-log-panel-toolbar--stack">
      <input type="search" class="apex-log-filter" id="apexLogErrorsFilter"
        placeholder="${escapeHtml(t('apexLogViewer.filter.errorsPlaceholder'))}" />
      <div class="apex-log-summary-chips" id="apexLogErrorsSummary"></div>
    </div>
    ${
      totalCount
        ? `<div id="apexLogErrorsContent" class="apex-log-panel-content">
        <section class="apex-log-errors-section" id="apexLogErrorsExecutionSection">
          <h3>${escapeHtml(t('apexLogViewer.errors.execution'))}</h3>
          <div id="apexLogErrorsExecutionList"></div>
        </section>
        <section class="apex-log-errors-section" id="apexLogErrorsHttpSection">
          <h3>${escapeHtml(t('apexLogViewer.errors.http'))}</h3>
          <div class="apex-log-table-wrap" id="apexLogErrorsHttpWrap">
            <table class="apex-log-data-table">
              <thead><tr>
                <th>${escapeHtml(t('apexLogViewer.col.line'))}</th>
                <th>${escapeHtml(t('apexLogViewer.col.status'))}</th>
                <th>${escapeHtml(t('apexLogViewer.col.method'))}</th>
                <th>${escapeHtml(t('apexLogViewer.col.duration'))}</th>
                <th>${escapeHtml(t('apexLogViewer.col.endpoint'))}</th>
              </tr></thead>
              <tbody id="apexLogErrorsHttpBody"></tbody>
            </table>
          </div>
        </section>
        <section class="apex-log-errors-section" id="apexLogErrorsValidationSection">
          <h3>${escapeHtml(t('apexLogViewer.errors.validations'))}</h3>
          <div class="apex-log-table-wrap" id="apexLogErrorsValidationWrap">
            <table class="apex-log-data-table">
              <thead><tr>
                <th>${escapeHtml(t('apexLogViewer.col.line'))}</th>
                <th>${escapeHtml(t('apexLogViewer.col.name'))}</th>
                <th>${escapeHtml(t('apexLogViewer.col.type'))}</th>
                <th>${escapeHtml(t('apexLogViewer.col.result'))}</th>
              </tr></thead>
              <tbody id="apexLogErrorsValidationBody"></tbody>
            </table>
          </div>
        </section>
      </div>`
        : `<p class="apex-log-empty">${escapeHtml(t('apexLogViewer.empty.errors'))}</p>`
    }`;

  if (!totalCount) {
    wirePanelHelpButtons(mount, t);
    return;
  }

  const filter = mount.querySelector('#apexLogErrorsFilter');
  const summary = mount.querySelector('#apexLogErrorsSummary');
  const execList = mount.querySelector('#apexLogErrorsExecutionList');
  const execSection = mount.querySelector('#apexLogErrorsExecutionSection');
  const httpSection = mount.querySelector('#apexLogErrorsHttpSection');
  const httpBody = mount.querySelector('#apexLogErrorsHttpBody');
  const httpWrap = mount.querySelector('#apexLogErrorsHttpWrap');
  const valSection = mount.querySelector('#apexLogErrorsValidationSection');
  const valBody = mount.querySelector('#apexLogErrorsValidationBody');
  const valWrap = mount.querySelector('#apexLogErrorsValidationWrap');

  const execCtrl = createPreviewController(APEX_LOG_PREVIEW.errorsExecution);
  /** @type {ReturnType<typeof mountPreviewTable> | null} */
  let httpPreview = null;
  /** @type {ReturnType<typeof mountPreviewTable> | null} */
  let valPreview = null;

  function paintExecution(list, repaint = false) {
    if (!execList || !execSection) return;
    if (!repaint) execCtrl.reset();
    if (!list.length) {
      execSection.hidden = true;
      execList.innerHTML = '';
      execList.parentElement?.querySelector('.apex-log-show-more-wrap')?.remove();
      return;
    }
    execSection.hidden = false;
    const visible = execCtrl.slice(list);
    execList.innerHTML = visible
      .map(
        (err) => `<article class="apex-log-error-card" data-line="${err.line}">
        <header class="apex-log-error-card-head">
          <span class="apex-log-error-card-title">${escapeHtml(err.summary || t('apexLogViewer.errors.unknown'))}</span>
          ${err.line ? `<span class="apex-log-error-card-line">L${err.line}</span>` : ''}
          ${err.line ? `<button type="button" class="apex-log-summary-link-btn" data-line="${err.line}">${escapeHtml(t('apexLogViewer.summary.viewLine'))}</button>` : ''}
        </header>
        <p class="apex-log-error-card-desc">${escapeHtml(err.description || '—')}</p>
      </article>`
      )
      .join('');
    execList.querySelectorAll('[data-line]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('button')) {
          onJump(Number(el.getAttribute('data-line')));
          return;
        }
        const line = Number(el.getAttribute('data-line'));
        if (line) onJump(line);
      });
    });
    mountShowMoreFooter(execSection, execCtrl, list.length, APEX_LOG_PREVIEW.errorsExecution, t, () =>
      paintExecution(list, true)
    );
  }

  function paintHttp(list) {
    if (!httpBody || !httpSection) return;
    if (!list.length) {
      httpSection.hidden = true;
      return;
    }
    httpSection.hidden = false;
    if (!httpPreview) {
      httpPreview = mountPreviewTable(httpBody, httpWrap, list, APEX_LOG_PREVIEW.tableRows, {
        rowHtmlFn: (r) => `<tr data-line="${r.requestLine}" tabindex="0" role="button">
          <td>${r.requestLine}</td>
          <td class="apex-log-text--error">${r.statusCode} ${escapeHtml(r.status || '')}</td>
          <td>${escapeHtml(r.method || '—')}</td>
          <td>${escapeHtml(formatMs(r.durationMs || 0))}</td>
          <td class="apex-log-cell-query">${escapeHtml(r.endpoint)}</td>
        </tr>`,
        emptyHtml: '',
        t,
        onJump
      });
    } else {
      httpPreview.setRows(list);
    }
  }

  function paintValidations(list) {
    if (!valBody || !valSection) return;
    if (!list.length) {
      valSection.hidden = true;
      return;
    }
    valSection.hidden = false;
    if (!valPreview) {
      valPreview = mountPreviewTable(valBody, valWrap, list, APEX_LOG_PREVIEW.tableRows, {
        rowHtmlFn: (v) => `<tr data-line="${v.line}" tabindex="0" role="button">
          <td>${v.line}</td>
          <td>${escapeHtml(v.name || v.ruleId || '—')}</td>
          <td>${escapeHtml(v.kind)}</td>
          <td class="apex-log-text--error">${escapeHtml(v.result || 'fail')}</td>
        </tr>`,
        emptyHtml: '',
        t,
        onJump
      });
    } else {
      valPreview.setRows(list);
    }
  }

  function applyFilter() {
    const needle = filter?.value || '';
    const filteredExec = filterRowsByQuery(
      executionErrors,
      needle,
      (e) => `${e.summary} ${e.description} ${e.line}`
    );
    const filteredHttp = filterRowsByQuery(
      httpErrors,
      needle,
      (r) => `${r.endpoint} ${r.method} ${r.status} ${r.statusCode}`
    );
    const filteredVal = filterRowsByQuery(
      validationFails,
      needle,
      (v) => `${v.name} ${v.ruleId} ${v.kind} ${v.result}`
    );
    const visibleTotal = filteredExec.length + filteredHttp.length + filteredVal.length;
    renderSummaryChips(summary, [
      { label: t('apexLogViewer.summary.errors'), value: String(visibleTotal) },
      { label: t('apexLogViewer.errors.execution'), value: String(filteredExec.length) },
      { label: t('apexLogViewer.errors.http'), value: String(filteredHttp.length) },
      { label: t('apexLogViewer.errors.validations'), value: String(filteredVal.length) }
    ]);
    execCtrl.reset();
    paintExecution(filteredExec);
    paintHttp(filteredHttp);
    paintValidations(filteredVal);
  }

  wireSearchFilter(filter, applyFilter);
  applyFilter();
  wirePanelHelpButtons(mount, t);
}

/**
 * @param {HTMLElement | null} root
 * @param {number} line
 * @returns {boolean}
 */
export function highlightErrorsPanelRow(root, line) {
  if (!root || !line) return false;
  root.querySelectorAll('.apex-log-row-highlight').forEach((el) => {
    el.classList.remove('apex-log-row-highlight');
  });
  const row =
    root.querySelector(`tr[data-line="${line}"]`) ||
    root.querySelector(`.apex-log-error-card[data-line="${line}"]`);
  if (!row) return false;
  row.classList.add('apex-log-row-highlight');
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  window.setTimeout(() => row.classList.remove('apex-log-row-highlight'), 2500);
  return true;
}
