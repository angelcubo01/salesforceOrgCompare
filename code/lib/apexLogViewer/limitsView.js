import { escapeHtml } from '../../../shared/htmlEscape.js';
import { panelSectionHeading, wirePanelHelpButtons } from './panelSectionHeading.js';
import {
  APEX_LOG_PREVIEW,
  createPreviewController,
  mountPreviewTable,
  mountShowMoreFooter
} from './analysisTableUtils.js';

const TRACKED_LIMITS = ['SOQL', 'SOQL_ROWS', 'DML', 'DML_ROWS', 'CALLOUT', 'CPU', 'HEAP', 'AGGS'];

/**
 * @param {object[]} limits
 */
function buildLimitSeries(limits) {
  const byType = new Map();
  for (const row of limits || []) {
    if (!TRACKED_LIMITS.includes(row.type)) continue;
    if (!byType.has(row.type)) byType.set(row.type, []);
    byType.get(row.type).push(row);
  }
  return byType;
}

/**
 * @param {HTMLElement} mount
 * @param {object} parsed
 * @param {(line: number) => void} onJump
 * @param {(key: string, params?: object) => string} t
 */
export function renderLimitsView(mount, parsed, onJump, t) {
  if (!mount) return;
  const limits = parsed?.limits || [];
  const peak = parsed?.limitPeak || {};
  const series = buildLimitSeries(limits);
  const chartsCtrl = createPreviewController(APEX_LOG_PREVIEW.limitsCharts);

  const peakChips = Object.entries(peak)
    .filter(([type]) => TRACKED_LIMITS.includes(type))
    .map(([type, p]) => {
      const pct = p.max > 0 ? Math.round((p.used / p.max) * 100) : 0;
      const warn = pct >= 80 ? ' apex-log-limit-bar--warn' : '';
      return `<div class="apex-log-limit-peak${warn}">
        <span class="apex-log-limit-peak-label">${escapeHtml(type)}</span>
        <div class="apex-log-limit-bar"><div class="apex-log-limit-bar-fill" style="width:${Math.min(100, pct)}%"></div></div>
        <span class="apex-log-limit-peak-val">${p.used} / ${p.max} (${pct}%)</span>
      </div>`;
    })
    .join('');

  mount.innerHTML = `
    ${panelSectionHeading('limits', t('apexLogViewer.tab.limits'), t)}
    <div class="apex-log-summary-section">
      <h3>${escapeHtml(t('apexLogViewer.limits.peak'))}</h3>
      <div class="apex-log-limit-peaks">${peakChips || `<p class="apex-log-empty">${escapeHtml(t('apexLogViewer.empty.limits'))}</p>`}</div>
    </div>
    <div class="apex-log-summary-section" id="apexLogLimitsChartsSection">
      <h3>${escapeHtml(t('apexLogViewer.limits.progression'))}</h3>
      <div class="apex-log-limit-charts" id="apexLogLimitCharts"></div>
    </div>
    <div class="apex-log-table-wrap" id="apexLogLimitsTableWrap">
      <table class="apex-log-data-table">
        <thead><tr>
          <th>${escapeHtml(t('apexLogViewer.col.line'))}</th>
          <th>${escapeHtml(t('apexLogViewer.col.timestamp'))}</th>
          <th>${escapeHtml(t('apexLogViewer.col.type'))}</th>
          <th>${escapeHtml(t('apexLogViewer.col.used'))}</th>
          <th>${escapeHtml(t('apexLogViewer.col.max'))}</th>
        </tr></thead>
        <tbody id="apexLogLimitsBody"></tbody>
      </table>
    </div>`;
  const chartsSection = mount.querySelector('#apexLogLimitsChartsSection');
  const chartsEl = mount.querySelector('#apexLogLimitCharts');
  const tbody = mount.querySelector('#apexLogLimitsBody');
  const tableWrap = mount.querySelector('#apexLogLimitsTableWrap');
  const display = limits.filter((r) => TRACKED_LIMITS.includes(r.type));

  const seriesEntries = [...series.entries()];

  function paintCharts(repaint = false) {
    if (!chartsEl) return;
    if (!repaint) chartsCtrl.reset();
    chartsEl.innerHTML = '';
    const visible = chartsCtrl.slice(seriesEntries);
    for (const [type, rows] of visible) {
      const maxVal = rows[rows.length - 1]?.max || 1;
      const svgW = 400;
      const svgH = 60;
      const pts = rows.map((r, i) => {
        const x = rows.length > 1 ? (i / (rows.length - 1)) * svgW : svgW / 2;
        const y = svgH - (r.used / maxVal) * (svgH - 8) - 4;
        return `${x},${y}`;
      });
      const chart = document.createElement('div');
      chart.className = 'apex-log-limit-chart';
      chart.innerHTML = `
        <span class="apex-log-limit-chart-label">${escapeHtml(type)}</span>
        <svg viewBox="0 0 ${svgW} ${svgH}" class="apex-log-limit-svg" role="img" aria-label="${escapeHtml(type)}">
          <polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="2"/>
        </svg>`;
      chartsEl.appendChild(chart);
    }
    mountShowMoreFooter(
      chartsSection,
      chartsCtrl,
      seriesEntries.length,
      APEX_LOG_PREVIEW.limitsCharts,
      t,
      () => paintCharts(true)
    );
  }

  paintCharts();

  /** @type {ReturnType<typeof mountPreviewTable> | null} */
  let tablePreview = null;
  if (tbody) {
    if (!display.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="apex-log-empty">${escapeHtml(t('apexLogViewer.empty.limits'))}</td></tr>`;
    } else {
      tablePreview = mountPreviewTable(tbody, tableWrap, display, APEX_LOG_PREVIEW.limitsTableRows, {
        rowHtmlFn: (r) => `<tr data-line="${r.line}" tabindex="0" role="button">
          <td>${r.line}</td>
          <td>${escapeHtml(r.timestamp)}</td>
          <td>${escapeHtml(r.type)}</td>
          <td>${r.used}</td>
          <td>${r.max}</td>
        </tr>`,
        emptyHtml: `<tr><td colspan="5" class="apex-log-empty">${escapeHtml(t('apexLogViewer.empty.limits'))}</td></tr>`,
        t,
        onJump
      });
    }
  }

  wirePanelHelpButtons(mount, t);
}
