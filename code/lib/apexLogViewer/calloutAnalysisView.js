import { escapeHtml } from '../../../shared/htmlEscape.js';
import { formatMs } from '../../../shared/apexLogParser.js';
import {
  avgDurationMs,
  bindLogTableRowNavigation,
  filterRowsByQuery,
  renderSummaryChips,
  wireSearchFilter
} from './analysisTableUtils.js';
import { panelSectionHeading, wirePanelHelpButtons } from './panelSectionHeading.js';

/**
 * @param {HTMLElement} mount
 * @param {object} parsed
 * @param {(line: number) => void} onJump
 * @param {(key: string) => string} t
 */
export function renderCalloutView(mount, parsed, onJump, t) {
  if (!mount) return;
  const rows = parsed?.callouts || [];

  mount.innerHTML = `
    ${panelSectionHeading('callouts', t('apexLogViewer.tab.callouts'), t)}
    <div class="apex-log-panel-toolbar apex-log-panel-toolbar--stack">
      <input type="search" class="apex-log-filter" id="apexLogCalloutFilter"
        placeholder="${escapeHtml(t('apexLogViewer.filter.calloutPlaceholder'))}" />
      <div class="apex-log-summary-chips" id="apexLogCalloutSummary"></div>
    </div>
    <div class="apex-log-table-wrap">
      <table class="apex-log-data-table">
        <thead><tr>
          <th>${escapeHtml(t('apexLogViewer.col.line'))}</th>
          <th>${escapeHtml(t('apexLogViewer.col.duration'))}</th>
          <th>${escapeHtml(t('apexLogViewer.col.method'))}</th>
          <th>${escapeHtml(t('apexLogViewer.col.status'))}</th>
          <th>${escapeHtml(t('apexLogViewer.col.endpoint'))}</th>
        </tr></thead>
        <tbody id="apexLogCalloutBody"></tbody>
      </table>
    </div>`;
  const tbody = mount.querySelector('#apexLogCalloutBody');
  const filter = mount.querySelector('#apexLogCalloutFilter');
  const summary = mount.querySelector('#apexLogCalloutSummary');

  function paint(list) {
    if (!tbody) return;
    const totalMs = list.reduce((s, r) => s + (r.durationMs || 0), 0);
    renderSummaryChips(summary, [
      { label: t('apexLogViewer.summary.calloutCount'), value: String(list.length) },
      { label: t('apexLogViewer.summary.totalDuration'), value: formatMs(totalMs) },
      { label: t('apexLogViewer.summary.avgDuration'), value: formatMs(avgDurationMs(totalMs, list.length)) }
    ]);
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="apex-log-empty">${escapeHtml(t('apexLogViewer.empty.callouts'))}</td></tr>`;
      return;
    }
    tbody.innerHTML = list
      .map(
        (r) => `<tr data-line="${r.requestLine}" tabindex="0" role="button">
          <td>${r.requestLine}</td>
          <td>${escapeHtml(formatMs(r.durationMs || 0))}</td>
          <td>${escapeHtml(r.method || '—')}</td>
          <td>${r.statusCode ? `${r.statusCode} ${escapeHtml(r.status || '')}` : '—'}</td>
          <td class="apex-log-cell-query">${escapeHtml(r.endpoint)}</td>
        </tr>`
      )
      .join('');
    bindLogTableRowNavigation(tbody.querySelectorAll('tr[data-line]'), onJump);
  }

  function applyFilter() {
    paint(
      filterRowsByQuery(
        rows,
        filter?.value,
        (r) => `${r.endpoint} ${r.method} ${r.status} ${r.statusCode} ${r.durationMs}`
      )
    );
  }

  wireSearchFilter(filter, applyFilter);
  applyFilter();
  wirePanelHelpButtons(mount, t);
}
