import { escapeHtml } from '../../../shared/htmlEscape.js';
import { formatMs } from '../../../shared/apexLogParser.js';
import {
  avgDurationMs,
  bindLogTableRowNavigation,
  filterRowsByQuery,
  renderSummaryChips,
  wireSearchFilter
} from './analysisTableUtils.js';
import { panelSectionHeading } from './panelSectionHeading.js';

/**
 * @param {HTMLElement} mount
 * @param {object} parsed
 * @param {(line: number) => void} onJump
 * @param {(key: string) => string} t
 */
export function renderSoqlView(mount, parsed, onJump, t) {
  if (!mount) return;
  const rows = parsed?.soql || [];

  mount.innerHTML = `
    ${panelSectionHeading('soql', t('apexLogViewer.tab.soql'))}
    <div class="apex-log-panel-toolbar apex-log-panel-toolbar--stack">
      <input type="search" class="apex-log-filter" id="apexLogSoqlFilter"
        placeholder="${escapeHtml(t('apexLogViewer.filter.soqlPlaceholder'))}" />
      <div class="apex-log-summary-chips" id="apexLogSoqlSummary"></div>
    </div>
    <div class="apex-log-table-wrap">
      <table class="apex-log-data-table">
        <thead>
          <tr>
            <th>${escapeHtml(t('apexLogViewer.col.line'))}</th>
            <th>${escapeHtml(t('apexLogViewer.col.duration'))}</th>
            <th>${escapeHtml(t('apexLogViewer.col.rows'))}</th>
            <th>${escapeHtml(t('apexLogViewer.col.aggregations'))}</th>
            <th>${escapeHtml(t('apexLogViewer.col.query'))}</th>
          </tr>
        </thead>
        <tbody id="apexLogSoqlBody"></tbody>
      </table>
    </div>`;

  const tbody = mount.querySelector('#apexLogSoqlBody');
  const filter = mount.querySelector('#apexLogSoqlFilter');
  const summary = mount.querySelector('#apexLogSoqlSummary');

  function updateSummary(list) {
    const totalRows = list.reduce((s, r) => s + (r.rows || 0), 0);
    const totalMs = list.reduce((s, r) => s + (r.durationMs || 0), 0);
    const withAggs = list.filter((r) => (r.aggregations || 0) > 0).length;
    renderSummaryChips(summary, [
      { label: t('apexLogViewer.summary.soqlCount'), value: String(list.length) },
      { label: t('apexLogViewer.summary.rows'), value: String(totalRows) },
      { label: t('apexLogViewer.summary.totalDuration'), value: formatMs(totalMs) },
      { label: t('apexLogViewer.summary.avgDuration'), value: formatMs(avgDurationMs(totalMs, list.length)) },
      { label: t('apexLogViewer.summary.aggregations'), value: String(withAggs) }
    ]);
  }

  function paint(list) {
    if (!tbody) return;
    updateSummary(list);
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="apex-log-empty">${escapeHtml(t('apexLogViewer.empty.soql'))}</td></tr>`;
      return;
    }
    tbody.innerHTML = list
      .map(
        (r) => `<tr data-line="${r.line}" tabindex="0" role="button">
          <td>${r.line}</td>
          <td>${escapeHtml(formatMs(r.durationMs || 0))}</td>
          <td>${r.rows ?? 0}</td>
          <td>${r.aggregations ?? 0}</td>
          <td class="apex-log-cell-query">${escapeHtml(r.query)}</td>
        </tr>`
      )
      .join('');
    bindLogTableRowNavigation(tbody.querySelectorAll('tr[data-line]'), onJump);
  }

  function applyFilter() {
    const filtered = filterRowsByQuery(
      rows,
      filter?.value,
      (r) => `${r.line} ${r.query} ${r.rows} ${r.durationMs}`
    );
    paint(filtered);
  }

  wireSearchFilter(filter, applyFilter);
  applyFilter();
}
