import { escapeHtml } from '../../../shared/htmlEscape.js';
import {
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
export function renderDebugView(mount, parsed, onJump, t) {
  if (!mount) return;
  const rows = parsed?.userDebug || [];
  mount.innerHTML = `
    ${panelSectionHeading('debug', t('apexLogViewer.tab.debug'))}
    <div class="apex-log-panel-toolbar apex-log-panel-toolbar--stack">
      <input type="search" class="apex-log-filter" id="apexLogDebugFilter"
        placeholder="${escapeHtml(t('apexLogViewer.filter.debugPlaceholder'))}" />
      <div class="apex-log-summary-chips" id="apexLogDebugSummary"></div>
    </div>
    <div class="apex-log-table-wrap">
      <table class="apex-log-data-table" id="apexLogDebugTable">
        <thead>
          <tr>
            <th>${escapeHtml(t('apexLogViewer.col.line'))}</th>
            <th>${escapeHtml(t('apexLogViewer.col.timestamp'))}</th>
            <th>${escapeHtml(t('apexLogViewer.col.apexLine'))}</th>
            <th>${escapeHtml(t('apexLogViewer.col.message'))}</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>`;

  const tbody = mount.querySelector('#apexLogDebugTable tbody');
  const filter = mount.querySelector('#apexLogDebugFilter');
  const summary = mount.querySelector('#apexLogDebugSummary');

  function paint(list) {
    if (!tbody) return;
    renderSummaryChips(summary, [
      { label: t('apexLogViewer.summary.debugCount'), value: String(list.length) }
    ]);
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="apex-log-empty">${escapeHtml(t('apexLogViewer.empty.debug'))}</td></tr>`;
      return;
    }
    tbody.innerHTML = list
      .map(
        (r) => `<tr data-line="${r.line}" tabindex="0" role="button">
          <td>${r.line}</td>
          <td>${escapeHtml(r.timestamp)}</td>
          <td>${r.apexLine !== '' ? r.apexLine : '—'}</td>
          <td class="apex-log-cell-message">${escapeHtml(r.message)}</td>
        </tr>`
      )
      .join('');
    bindLogTableRowNavigation(tbody.querySelectorAll('tr[data-line]'), onJump);
  }

  function applyFilter() {
    const filtered = filterRowsByQuery(
      rows,
      filter?.value,
      (r) => `${r.line} ${r.message} ${r.apexLine} ${r.timestamp}`
    );
    paint(filtered);
  }

  wireSearchFilter(filter, applyFilter);
  applyFilter();
}
