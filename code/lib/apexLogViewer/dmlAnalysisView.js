import { escapeHtml } from '../../../shared/htmlEscape.js';
import { formatMs } from '../../../shared/apexLogParser.js';
import {
  avgDurationMs,
  bindLogTableRowNavigation,
  filterRowsByQuery,
  mountSegmentControl,
  normalizeDmlOperation,
  renderSummaryChips,
  wireSearchFilter
} from './analysisTableUtils.js';
import { panelSectionHeading, wirePanelHelpButtons } from './panelSectionHeading.js';

/**
 * @param {object[]} rows
 * @param {'detail'|'operation'|'object'} mode
 */
function buildDmlDisplayRows(rows, mode) {
  if (mode === 'detail') {
    return rows.map((r) => ({ kind: 'detail', row: r }));
  }
  const groups = new Map();
  for (const r of rows) {
    const key =
      mode === 'operation' ? normalizeDmlOperation(r.operation) : String(r.object || '—');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const out = [];
  for (const [key, items] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const totalRows = items.reduce((s, r) => s + (r.rows || 0), 0);
    const totalMs = items.reduce((s, r) => s + (r.durationMs || 0), 0);
    out.push({
      kind: 'group',
      key,
      count: items.length,
      totalRows,
      totalMs
    });
    for (const row of items) out.push({ kind: 'detail', row, grouped: true });
  }
  return out;
}

/**
 * @param {HTMLElement} mount
 * @param {object} parsed
 * @param {(line: number) => void} onJump
 * @param {(key: string) => string} t
 */
export function renderDmlView(mount, parsed, onJump, t) {
  if (!mount) return;
  const rows = parsed?.dml || [];
  let groupMode = 'operation';

  mount.innerHTML = `
    ${panelSectionHeading('dml', t('apexLogViewer.tab.dml'), t)}
    <div class="apex-log-panel-toolbar apex-log-panel-toolbar--stack">
      <div class="apex-log-panel-toolbar-row">
        <input type="search" class="apex-log-filter" id="apexLogDmlFilter"
          placeholder="${escapeHtml(t('apexLogViewer.filter.dmlPlaceholder'))}" />
        <div id="apexLogDmlGroup" class="apex-log-segment-host"></div>
      </div>
      <div class="apex-log-summary-chips" id="apexLogDmlSummary"></div>
    </div>
    <div class="apex-log-table-wrap">
      <table class="apex-log-data-table">
        <thead>
          <tr>
            <th>${escapeHtml(t('apexLogViewer.col.line'))}</th>
            <th>${escapeHtml(t('apexLogViewer.col.duration'))}</th>
            <th>${escapeHtml(t('apexLogViewer.col.operation'))}</th>
            <th>${escapeHtml(t('apexLogViewer.col.object'))}</th>
            <th>${escapeHtml(t('apexLogViewer.col.rows'))}</th>
          </tr>
        </thead>
        <tbody id="apexLogDmlBody"></tbody>
      </table>
    </div>`;
  const tbody = mount.querySelector('#apexLogDmlBody');
  const filter = mount.querySelector('#apexLogDmlFilter');
  const summary = mount.querySelector('#apexLogDmlSummary');
  const segmentHost = mount.querySelector('#apexLogDmlGroup');

  mountSegmentControl(
    segmentHost,
    groupMode,
    [
      { id: 'operation', label: t('apexLogViewer.dml.groupOperation') },
      { id: 'object', label: t('apexLogViewer.dml.groupObject') },
      { id: 'detail', label: t('apexLogViewer.dml.groupDetail') }
    ],
    (mode) => {
      groupMode = mode;
      applyFilter();
    }
  );

  function updateSummary(list) {
    const totalRows = list.reduce((s, r) => s + (r.rows || 0), 0);
    const totalMs = list.reduce((s, r) => s + (r.durationMs || 0), 0);
    const objects = new Set(list.map((r) => r.object || '—'));
    const ops = new Set(list.map((r) => normalizeDmlOperation(r.operation)));
    renderSummaryChips(summary, [
      { label: t('apexLogViewer.summary.dmlCount'), value: String(list.length) },
      { label: t('apexLogViewer.summary.operations'), value: String(ops.size) },
      { label: t('apexLogViewer.summary.objects'), value: String(objects.size) },
      { label: t('apexLogViewer.summary.rows'), value: String(totalRows) },
      { label: t('apexLogViewer.summary.totalDuration'), value: formatMs(totalMs) },
      { label: t('apexLogViewer.summary.avgDuration'), value: formatMs(avgDurationMs(totalMs, list.length)) }
    ]);
  }

  function paint(list) {
    if (!tbody) return;
    updateSummary(list);
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="apex-log-empty">${escapeHtml(t('apexLogViewer.empty.dml'))}</td></tr>`;
      return;
    }
    const display = buildDmlDisplayRows(list, groupMode);
    tbody.innerHTML = display
      .map((item) => {
        if (item.kind === 'group') {
          return `<tr class="apex-log-group-row">
            <td colspan="2"><strong>${escapeHtml(item.key)}</strong></td>
            <td colspan="3">${escapeHtml(t('apexLogViewer.dml.groupSummary', { count: item.count, rows: item.totalRows, duration: formatMs(item.totalMs) }))}</td>
          </tr>`;
        }
        const r = item.row;
        const indent = item.grouped ? 'apex-log-detail-row--grouped' : '';
        return `<tr class="apex-log-detail-row ${indent}" data-line="${r.line}" tabindex="0" role="button">
          <td>${r.line}</td>
          <td>${escapeHtml(formatMs(r.durationMs || 0))}</td>
          <td>${escapeHtml(normalizeDmlOperation(r.operation))}</td>
          <td>${escapeHtml(r.object)}</td>
          <td>${r.rows ?? 0}</td>
        </tr>`;
      })
      .join('');
    bindLogTableRowNavigation(tbody.querySelectorAll('tr[data-line]'), onJump);
  }

  function applyFilter() {
    const filtered = filterRowsByQuery(
      rows,
      filter?.value,
      (r) => `${r.line} ${r.operation} ${r.object} ${r.rows} ${r.durationMs}`
    );
    paint(filtered);
    mountSegmentControl(
      segmentHost,
      groupMode,
      [
        { id: 'operation', label: t('apexLogViewer.dml.groupOperation') },
        { id: 'object', label: t('apexLogViewer.dml.groupObject') },
        { id: 'detail', label: t('apexLogViewer.dml.groupDetail') }
      ],
      (mode) => {
        groupMode = mode;
        applyFilter();
      }
    );
  }

  wireSearchFilter(filter, applyFilter);
  applyFilter();
  wirePanelHelpButtons(mount, t);
}
