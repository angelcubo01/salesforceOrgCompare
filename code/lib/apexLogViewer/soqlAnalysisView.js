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

function truncateQuery(query, max = 72) {
  const compact = String(query || '').replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 1)}…`;
}

function renderDuplicateItem(d, t) {
  const avgMs = d.count > 0 ? d.totalDurationMs / d.count : 0;
  const query = truncateQuery(d.query);
  return `<button type="button" class="apex-log-soql-dupe-item" data-dupe-key="${escapeHtml(d.key)}" title="${escapeHtml(d.query)}">
    <span class="apex-log-soql-dupe-count">${escapeHtml(t('apexLogViewer.soql.duplicateRuns', { count: d.count }))}</span>
    <span class="apex-log-soql-dupe-query">${escapeHtml(query)}</span>
    <span class="apex-log-soql-dupe-meta">${escapeHtml(
      t('apexLogViewer.soql.duplicateStats', {
        total: formatMs(d.totalDurationMs),
        avg: formatMs(avgMs)
      })
    )}</span>
  </button>`;
}

/**
 * @param {HTMLElement} mount
 * @param {object} parsed
 * @param {(line: number) => void} onJump
 * @param {(key: string) => string} t
 */
export function renderSoqlView(mount, parsed, onJump, t) {
  if (!mount) return;
  const rows = parsed?.soql || [];
  const duplicates = parsed?.soqlDuplicates || [];

  mount.innerHTML = `
    ${panelSectionHeading('soql', t('apexLogViewer.tab.soql'), t)}
    <div class="apex-log-panel-toolbar apex-log-panel-toolbar--stack">
      <input type="search" class="apex-log-filter" id="apexLogSoqlFilter"
        placeholder="${escapeHtml(t('apexLogViewer.filter.soqlPlaceholder'))}" />
      <div class="apex-log-summary-chips" id="apexLogSoqlSummary"></div>
    </div>
    ${
      duplicates.length
        ? `<div class="apex-log-soql-dupes" id="apexLogSoqlDupes">
        <h3>${escapeHtml(t('apexLogViewer.soql.duplicates'))}</h3>
        <p class="apex-log-soql-dupes-hint">${escapeHtml(t('apexLogViewer.soql.duplicatesHint'))}</p>
        <div class="apex-log-soql-dupes-list">
        ${duplicates.slice(0, 5).map((d) => renderDuplicateItem(d, t)).join('')}
        </div>
      </div>`
        : ''
    }
    <div class="apex-log-table-wrap">
      <table class="apex-log-data-table">
        <thead>
          <tr>
            <th>${escapeHtml(t('apexLogViewer.col.line'))}</th>
            <th>${escapeHtml(t('apexLogViewer.col.duration'))}</th>
            <th>${escapeHtml(t('apexLogViewer.col.rows'))}</th>
            <th>${escapeHtml(t('apexLogViewer.col.context'))}</th>
            <th>${escapeHtml(t('apexLogViewer.col.aggregations'))}</th>
            <th>${escapeHtml(t('apexLogViewer.col.query'))}</th>
            <th></th>
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
      { label: t('apexLogViewer.summary.aggregations'), value: String(withAggs) },
      { label: t('apexLogViewer.summary.duplicateGroups'), value: String(duplicates.length) }
    ]);
  }

  function paint(list) {
    if (!tbody) return;
    updateSummary(list);
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="apex-log-empty">${escapeHtml(t('apexLogViewer.empty.soql'))}</td></tr>`;
      return;
    }
    tbody.innerHTML = list
      .map(
        (r) => `<tr data-line="${r.line}" tabindex="0" role="button">
          <td>${r.line}</td>
          <td>${escapeHtml(formatMs(r.durationMs || 0))}</td>
          <td>${r.rows ?? 0}</td>
          <td class="apex-log-cell-context">${escapeHtml(r.context || '—')}</td>
          <td>${r.aggregations ?? 0}</td>
          <td class="apex-log-cell-query">${escapeHtml(r.query)}</td>
          <td><button type="button" class="apex-log-copy-btn" data-query="${escapeHtml(r.query)}">${escapeHtml(t('apexLogViewer.soql.copy'))}</button></td>
        </tr>`
      )
      .join('');
    bindLogTableRowNavigation(tbody.querySelectorAll('tr[data-line]'), onJump);
    tbody.querySelectorAll('.apex-log-copy-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(btn.getAttribute('data-query') || '').catch(() => {});
      });
    });
  }

  function applyFilter() {
    const filtered = filterRowsByQuery(
      rows,
      filter?.value,
      (r) => `${r.line} ${r.query} ${r.rows} ${r.durationMs} ${r.context}`
    );
    paint(filtered);
  }

  wireSearchFilter(filter, applyFilter);
  mount.querySelectorAll('.apex-log-soql-dupe-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-dupe-key');
      const dupe = duplicates.find((d) => d.key === key);
      if (!dupe || !filter) return;
      filter.value = truncateQuery(dupe.query, 120);
      applyFilter();
      filter.focus();
    });
  });
  applyFilter();
  wirePanelHelpButtons(mount, t);
}
