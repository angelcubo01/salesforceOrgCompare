import { escapeHtml } from '../../../shared/htmlEscape.js';
import { formatMs, formatMsPrecise } from '../../../shared/apexLogParser.js';
import { panelSectionHeading } from './panelSectionHeading.js';
import { highlightPanelRow } from './analysisTableUtils.js';
import {
  buildTimelineExportRows,
  downloadTimelineFile,
  timelineToCsv,
  timelineToJson
} from './timelineExport.js';

const TYPE_CLASS = {
  soql: 'apex-log-gantt-bar--soql',
  dml: 'apex-log-gantt-bar--dml',
  method: 'apex-log-gantt-bar--method',
  codeUnit: 'apex-log-gantt-bar--unit',
  system: 'apex-log-gantt-bar--system',
  execution: 'apex-log-gantt-bar--execution',
  flow: 'apex-log-gantt-bar--flow'
};

const LEGEND_TYPES = ['codeUnit', 'method', 'flow', 'dml', 'soql', 'system'];

const ROW_HEIGHT = 22;
const OVERVIEW_HEIGHT = 48;
const MIN_VIEW_FRAC = 0.02;

/** @type {{ revealLine: (line: number) => boolean } | null} */
let timelineController = null;

/**
 * @param {number} line
 * @returns {boolean}
 */
export function revealTimelineLogLine(line) {
  return timelineController?.revealLine(line) ?? false;
}

/**
 * @typedef {object} TimelineNode
 * @property {number} id
 * @property {string} label
 * @property {string} type
 * @property {number} depth
 * @property {number} startNs
 * @property {number} endNs
 * @property {number} durationMs
 * @property {number} rows
 * @property {number} line
 * @property {boolean} hasError
 * @property {TimelineNode[]} children
 */

/**
 * @param {object} node
 * @param {number} depth
 * @returns {TimelineNode[]}
 */
function buildTimelineForest(node, depth = 0) {
  if (!node) return [];
  if (node.kind === 'root') {
    return (node.children || []).flatMap((ch) => buildTimelineForest(ch, 0));
  }
  const children = (node.children || []).flatMap((ch) => buildTimelineForest(ch, depth + 1));
  if (node.durationMs <= 0) return children;
  return [
    {
      id: node.id,
      label: node.label,
      type: node.kind,
      depth,
      startNs: node.timestampNs,
      endNs: node.exitTimestampNs || node.timestampNs,
      durationMs: node.durationMs,
      rows: node.rows || 0,
      line: node.line,
      hasError: Boolean(node.hasError),
      children
    }
  ];
}

/**
 * @param {TimelineNode[]} forest
 * @param {Set<number>} expanded
 * @returns {TimelineNode[]}
 */
function flattenVisibleTimeline(forest, expanded) {
  /** @type {TimelineNode[]} */
  const out = [];
  function walk(nodes) {
    for (const n of nodes) {
      out.push(n);
      if (n.children.length && expanded.has(n.id)) walk(n.children);
    }
  }
  walk(forest);
  return out;
}

/**
 * @param {TimelineNode[]} forest
 * @returns {number[]}
 */
function collectExpandableIds(forest) {
  /** @type {number[]} */
  const ids = [];
  function walk(nodes) {
    for (const n of nodes) {
      if (n.children.length) {
        ids.push(n.id);
        walk(n.children);
      }
    }
  }
  walk(forest);
  return ids;
}

/**
 * @param {TimelineNode[]} forest
 * @returns {TimelineNode[]}
 */
function flattenAllTimelineNodes(forest) {
  /** @type {TimelineNode[]} */
  const out = [];
  function walk(nodes) {
    for (const n of nodes) {
      out.push(n);
      walk(n.children);
    }
  }
  walk(forest);
  return out;
}

/**
 * @param {TimelineNode[]} forest
 * @param {number} nodeId
 * @returns {number[]}
 */
function findAncestorIds(forest, nodeId) {
  /** @type {number[]} */
  const ancestors = [];
  function walk(nodes, chain) {
    for (const n of nodes) {
      const next = [...chain, n.id];
      if (n.id === nodeId) {
        ancestors.push(...chain);
        return true;
      }
      if (n.children.length && walk(n.children, next)) return true;
    }
    return false;
  }
  walk(forest, []);
  return ancestors;
}

/**
 * @param {TimelineNode[]} allNodes
 * @param {number} line
 * @returns {TimelineNode | null}
 */
function findTimelineNodeForLogLine(allNodes, line) {
  const exact = allNodes.find((n) => n.line === line);
  if (exact) return exact;
  const withError = allNodes
    .filter((n) => n.hasError)
    .sort((a, b) => Math.abs(a.line - line) - Math.abs(b.line - line));
  if (withError.length) return withError[0];
  const before = allNodes.filter((n) => n.line <= line).sort((a, b) => b.line - a.line);
  return before[0] || null;
}

/**
 * @param {number} ns
 * @param {number} minStart
 * @param {number} span
 */
function clampNs(ns, minStart, span) {
  return Math.max(minStart, Math.min(minStart + span, ns));
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {TimelineNode[]} events
 * @param {number} minStart
 * @param {number} span
 * @param {number} viewStartNs
 * @param {number} viewEndNs
 * @param {boolean} light
 */
function paintOverview(ctx, w, h, events, minStart, span, viewStartNs, viewEndNs, light) {
  const buckets = Math.max(80, Math.floor(w / 4));
  const density = new Float32Array(buckets);
  for (const e of events) {
    const a = Math.max(0, Math.floor(((e.startNs - minStart) / span) * buckets));
    const b = Math.min(buckets - 1, Math.ceil(((e.endNs - minStart) / span) * buckets));
    for (let i = a; i <= b; i++) density[i] += 1;
  }
  let max = 0;
  for (let i = 0; i < buckets; i++) if (density[i] > max) max = density[i];
  if (max <= 0) max = 1;

  ctx.clearRect(0, 0, w, h);
  const base = light ? '#e2e8f0' : '#1e293b';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  const fill = light ? 'rgba(2, 132, 199, 0.35)' : 'rgba(56, 189, 248, 0.35)';
  const stroke = light ? 'rgba(2, 132, 199, 0.7)' : 'rgba(56, 189, 248, 0.85)';
  ctx.beginPath();
  for (let i = 0; i < buckets; i++) {
    const x = (i / buckets) * w;
    const barH = (density[i] / max) * (h - 6);
    const y = h - barH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  const x1 = ((viewStartNs - minStart) / span) * w;
  const x2 = ((viewEndNs - minStart) / span) * w;
  const shade = light ? 'rgba(15, 23, 42, 0.28)' : 'rgba(0, 0, 0, 0.42)';
  ctx.fillStyle = shade;
  if (x1 > 0) ctx.fillRect(0, 0, x1, h);
  if (x2 < w) ctx.fillRect(x2, 0, w - x2, h);
  ctx.strokeStyle = light ? 'rgba(2, 132, 199, 0.95)' : 'rgba(56, 189, 248, 0.95)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x1 + 0.5, 0.5, Math.max(x2 - x1 - 1, 1), h - 1);
}

/**
 * @param {number} viewStartNs
 * @param {number} viewSpanNs
 * @param {number} logStartNs
 * @param {number} count
 */
function buildTicksForView(viewStartNs, viewSpanNs, logStartNs, count = 12) {
  const viewMs = viewSpanNs / 1_000_000;
  const offsetMs = (viewStartNs - logStartNs) / 1_000_000;
  const out = [];
  for (let i = 0; i <= count; i++) {
    const pct = i / count;
    out.push({ pct, ms: offsetMs + viewMs * pct });
  }
  return out;
}

/**
 * @param {TimelineNode} ev
 * @param {number} idx
 * @param {boolean} isExpanded
 * @param {number} viewStartNs
 * @param {number} viewSpanNs
 * @param {(key: string, params?: object) => string} t
 */
function renderTimelineRow(ev, idx, isExpanded, viewStartNs, viewSpanNs, t) {
  const clipStart = Math.max(ev.startNs, viewStartNs);
  const clipEnd = Math.min(ev.endNs, viewStartNs + viewSpanNs);
  const left = ((clipStart - viewStartNs) / viewSpanNs) * 100;
  const width = Math.max(((clipEnd - clipStart) / viewSpanNs) * 100, 0.35);
  const cls = TYPE_CLASS[ev.type] || 'apex-log-gantt-bar--default';
  const errorCls = ev.hasError ? ' apex-log-gantt-bar--error' : '';
  const rowsLabel = ev.rows > 0 ? t('apexLogViewer.timeline.rows', { n: ev.rows }) : '';
  const tip = [ev.label, formatMs(ev.durationMs), rowsLabel].filter(Boolean).join(' · ');
  const typeLabel = t(`apexLogViewer.kind.${ev.type}`) || ev.type;
  const hasChildren = ev.children.length > 0;
  const foldBtn = hasChildren
    ? `<button type="button" class="apex-log-gantt-fold" data-fold-id="${ev.id}" aria-expanded="${isExpanded ? 'true' : 'false'}" aria-label="${escapeHtml(t(isExpanded ? 'apexLogViewer.timeline.collapse' : 'apexLogViewer.timeline.expand'))}">${isExpanded ? '▼' : '▶'}</button>`
    : '<span class="apex-log-gantt-fold-spacer" aria-hidden="true"></span>';

  return `<div class="apex-log-gantt-row" data-idx="${idx}" data-log-line="${ev.line || ''}" title="${escapeHtml(tip)}" style="min-height:${ROW_HEIGHT}px">
    <span class="apex-log-gantt-label" style="padding-left:${Math.min(ev.depth, 10) * 10}px">
      ${foldBtn}
      <span class="apex-log-gantt-type">${escapeHtml(typeLabel)}</span>
      <button type="button" class="apex-log-gantt-name" data-line="${ev.line || ''}">${escapeHtml(ev.label)}</button>
    </span>
    <button type="button" class="apex-log-gantt-track" data-line="${ev.line || ''}" aria-label="${escapeHtml(tip)}">
      <span class="apex-log-gantt-bar ${cls}${errorCls}" style="left:${left.toFixed(3)}%;width:${width.toFixed(3)}%"></span>
    </button>
    <span class="apex-log-gantt-dur">${escapeHtml(formatMsPrecise(ev.durationMs))}</span>
  </div>`;
}

/**
 * @param {number} viewStartNs
 * @param {number} viewEndNs
 * @param {number} minStart
 * @param {number} span
 */
function renderTickHtml(viewStartNs, viewEndNs, minStart, span) {
  const viewSpan = Math.max(viewEndNs - viewStartNs, 1);
  return buildTicksForView(viewStartNs, viewSpan, minStart)
    .map(
      (tk) =>
        `<span class="apex-log-gantt-tick" style="left:${(tk.pct * 100).toFixed(3)}%">${escapeHtml(formatMsPrecise(tk.ms))}</span>`
    )
    .join('');
}

/**
 * @param {HTMLElement} mount
 * @param {object} parsed
 * @param {(line: number) => void} onJump
 * @param {(key: string, params?: object) => string} t
 */
export function renderTimelineView(mount, parsed, onJump, t) {
  if (!mount) return;
  const forest = buildTimelineForest(parsed?.tree);
  if (!forest.length) {
    timelineController = null;
    mount.innerHTML = `<p class="apex-log-empty">${escapeHtml(t('apexLogViewer.empty.timeline'))}</p>`;
    return;
  }

  const allNodes = flattenAllTimelineNodes(forest);
  const minStart = Math.min(...allNodes.map((e) => e.startNs));
  const maxEnd = Math.max(...allNodes.map((e) => e.endNs));
  const span = Math.max(maxEnd - minStart, 1);
  const totalMs = parsed?.meta?.durationMs || Math.round(span / 1_000_000);
  const light = document.documentElement.getAttribute('data-ui-theme') === 'light';
  const minViewNs = Math.max(span * MIN_VIEW_FRAC, 1_000_000);

  /** @type {Set<number>} */
  const expanded = new Set();
  let viewStartNs = minStart;
  let viewEndNs = maxEnd;

  const legend = [
    ...LEGEND_TYPES.map((type) => {
      const cls = TYPE_CLASS[type] || 'apex-log-gantt-bar--default';
      const label = t(`apexLogViewer.kind.${type}`);
      return `<span class="apex-log-gantt-legend-item"><span class="apex-log-gantt-legend-swatch ${cls}"></span>${escapeHtml(label)}</span>`;
    }),
    `<span class="apex-log-gantt-legend-item"><span class="apex-log-gantt-legend-swatch apex-log-gantt-bar--error"></span>${escapeHtml(t('apexLogViewer.timeline.errorFlag'))}</span>`
  ].join('');

  mount.innerHTML = `
    ${panelSectionHeading('timeline', t('apexLogViewer.tab.timeline'))}
    <div class="apex-log-gantt">
      <div class="apex-log-gantt-top">
        <div class="apex-log-gantt-top-row">
          <span class="apex-log-gantt-total" id="apexLogGanttTotal"></span>
          <div class="apex-log-gantt-actions">
            <button type="button" class="apex-log-gantt-action" id="apexLogGanttResetWindow">${escapeHtml(t('apexLogViewer.timeline.resetWindow'))}</button>
            <button type="button" class="apex-log-gantt-action" id="apexLogGanttExpandAll">${escapeHtml(t('apexLogViewer.timeline.expandAll'))}</button>
            <button type="button" class="apex-log-gantt-action" id="apexLogGanttCollapseAll">${escapeHtml(t('apexLogViewer.timeline.collapseAll'))}</button>
            <button type="button" class="apex-log-gantt-action" id="apexLogGanttExportCsv">${escapeHtml(t('apexLogViewer.timeline.exportCsv'))}</button>
            <button type="button" class="apex-log-gantt-action" id="apexLogGanttExportJson">${escapeHtml(t('apexLogViewer.timeline.exportJson'))}</button>
          </div>
        </div>
        <div class="apex-log-gantt-overview-wrap" id="apexLogGanttOverviewWrap">
          <canvas class="apex-log-gantt-overview" height="${OVERVIEW_HEIGHT}" aria-hidden="true"></canvas>
          <div class="apex-log-gantt-brush" id="apexLogGanttBrush">
            <div class="apex-log-gantt-brush-window" id="apexLogGanttBrushWindow">
              <button type="button" class="apex-log-gantt-brush-handle apex-log-gantt-brush-handle--left" aria-label="${escapeHtml(t('apexLogViewer.timeline.resizeWindowStart'))}"></button>
              <button type="button" class="apex-log-gantt-brush-handle apex-log-gantt-brush-handle--right" aria-label="${escapeHtml(t('apexLogViewer.timeline.resizeWindowEnd'))}"></button>
            </div>
          </div>
          <div class="apex-log-gantt-ruler apex-log-gantt-ruler--overlay" id="apexLogGanttRulerOverlay"></div>
        </div>
      </div>
      <div class="apex-log-gantt-ruler apex-log-gantt-ruler--main" id="apexLogGanttRulerMain" aria-hidden="true"></div>
      <div class="apex-log-gantt-body"></div>
      <div class="apex-log-gantt-legend">${legend}</div>
      <div class="apex-log-gantt-tooltip" id="apexLogGanttTooltip" hidden></div>
    </div>`;

  const canvas = mount.querySelector('.apex-log-gantt-overview');
  const overviewWrap = mount.querySelector('#apexLogGanttOverviewWrap');
  const brushWindow = mount.querySelector('#apexLogGanttBrushWindow');
  const body = mount.querySelector('.apex-log-gantt-body');
  const tooltip = mount.querySelector('#apexLogGanttTooltip');
  const ganttRoot = mount.querySelector('.apex-log-gantt');
  const totalEl = mount.querySelector('#apexLogGanttTotal');
  const rulerMain = mount.querySelector('#apexLogGanttRulerMain');
  const rulerOverlay = mount.querySelector('#apexLogGanttRulerOverlay');
  const expandAllBtn = mount.querySelector('#apexLogGanttExpandAll');
  const collapseAllBtn = mount.querySelector('#apexLogGanttCollapseAll');
  const resetWindowBtn = mount.querySelector('#apexLogGanttResetWindow');
  const exportCsvBtn = mount.querySelector('#apexLogGanttExportCsv');
  const exportJsonBtn = mount.querySelector('#apexLogGanttExportJson');

  /** @type {TimelineNode[]} */
  let visibleEvents = [];

  function viewSpanNs() {
    return Math.max(viewEndNs - viewStartNs, 1);
  }

  function isFullWindow() {
    return viewStartNs <= minStart + 1 && viewEndNs >= maxEnd - 1;
  }

  function updateTotalLabel() {
    if (!totalEl) return;
    const viewMs = viewSpanNs() / 1_000_000;
    const startMs = (viewStartNs - minStart) / 1_000_000;
    const endMs = (viewEndNs - minStart) / 1_000_000;
    if (isFullWindow()) {
      totalEl.textContent = `${t('apexLogViewer.timeline.total')}: ${formatMsPrecise(totalMs)}`;
      return;
    }
    totalEl.textContent = `${t('apexLogViewer.timeline.selection')}: ${formatMsPrecise(startMs)} – ${formatMsPrecise(endMs)} (${formatMsPrecise(viewMs)})`;
  }

  function updateBrushDom() {
    if (!brushWindow) return;
    const leftPct = ((viewStartNs - minStart) / span) * 100;
    const widthPct = ((viewEndNs - viewStartNs) / span) * 100;
    brushWindow.style.left = `${leftPct.toFixed(3)}%`;
    brushWindow.style.width = `${Math.max(widthPct, 0.2).toFixed(3)}%`;
  }

  function updateRulers() {
    const tickHtml = renderTickHtml(viewStartNs, viewEndNs, minStart, span);
    if (rulerMain) rulerMain.innerHTML = tickHtml;
    if (rulerOverlay) rulerOverlay.innerHTML = tickHtml;
  }

  function paintOverviewCanvas() {
    if (!canvas) return;
    const wrap = canvas.parentElement;
    const w = wrap?.clientWidth || 600;
    canvas.width = w;
    canvas.height = OVERVIEW_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      paintOverview(ctx, w, OVERVIEW_HEIGHT, allNodes, minStart, span, viewStartNs, viewEndNs, light);
    }
    updateBrushDom();
  }

  function bindRowInteractions() {
    if (!body) return;
    body.querySelectorAll('.apex-log-gantt-fold').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(btn.getAttribute('data-fold-id'));
        if (!Number.isFinite(id)) return;
        if (expanded.has(id)) expanded.delete(id);
        else expanded.add(id);
        refresh();
      });
    });

    body.querySelectorAll('[data-line]').forEach((btn) => {
      if (btn.classList.contains('apex-log-gantt-fold')) return;
      const ln = Number(btn.getAttribute('data-line'));
      const idx = Number(btn.closest('.apex-log-gantt-row')?.getAttribute('data-idx'));
      const ev = visibleEvents[idx];
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (ln) onJump(ln);
      });
      if (!ev || btn.classList.contains('apex-log-gantt-fold')) return;
      btn.addEventListener('mouseenter', () => {
        if (!tooltip) return;
        const rowsLabel = ev.rows > 0 ? t('apexLogViewer.timeline.rows', { n: ev.rows }) : '';
        tooltip.innerHTML = `<strong>${escapeHtml(ev.label)}</strong><br>${escapeHtml(formatMsPrecise(ev.durationMs))}${rowsLabel ? `<br>${escapeHtml(rowsLabel)}` : ''}`;
        tooltip.hidden = false;
      });
      btn.addEventListener('mousemove', (e) => {
        if (!tooltip || !ganttRoot) return;
        const rect = ganttRoot.getBoundingClientRect();
        tooltip.style.left = `${e.clientX - rect.left + 12}px`;
        tooltip.style.top = `${e.clientY - rect.top + 12}px`;
      });
      btn.addEventListener('mouseleave', () => {
        if (tooltip) tooltip.hidden = true;
      });
    });
  }

  function refresh() {
    const viewSpan = viewSpanNs();
    visibleEvents = flattenVisibleTimeline(forest, expanded).filter(
      (ev) => ev.endNs > viewStartNs && ev.startNs < viewEndNs
    );
    if (body) {
      body.innerHTML = visibleEvents
        .map((ev, idx) => renderTimelineRow(ev, idx, expanded.has(ev.id), viewStartNs, viewSpan, t))
        .join('');
      bindRowInteractions();
    }
    updateRulers();
    updateTotalLabel();
    paintOverviewCanvas();
  }

  function setViewWindow(startNs, endNs) {
    let start = clampNs(startNs, minStart, span);
    let end = clampNs(endNs, minStart, span);
    if (end < start) [start, end] = [end, start];
    if (end - start < minViewNs) {
      if (end + minViewNs <= minStart + span) end = start + minViewNs;
      else start = end - minViewNs;
    }
    viewStartNs = clampNs(start, minStart, span);
    viewEndNs = clampNs(end, minStart, span);
    if (viewEndNs - viewStartNs < minViewNs) viewEndNs = Math.min(minStart + span, viewStartNs + minViewNs);
    refresh();
  }

  function clientXToNs(clientX) {
    const rect = overviewWrap?.getBoundingClientRect();
    if (!rect?.width) return minStart;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return minStart + pct * span;
  }

  /** @type {'new'|'move'|'resize-l'|'resize-r'|null} */
  let dragMode = null;
  let dragAnchorNs = 0;
  let dragStartViewStart = 0;
  let dragStartViewEnd = 0;

  function onPointerMove(clientX) {
    if (!dragMode) return;
    const ns = clientXToNs(clientX);
    if (dragMode === 'new') {
      const a = Math.min(dragAnchorNs, ns);
      const b = Math.max(dragAnchorNs, ns);
      setViewWindow(a, b);
      return;
    }
    if (dragMode === 'move') {
      const delta = ns - dragAnchorNs;
      const width = dragStartViewEnd - dragStartViewStart;
      let start = dragStartViewStart + delta;
      let end = dragStartViewEnd + delta;
      if (start < minStart) {
        start = minStart;
        end = minStart + width;
      }
      if (end > minStart + span) {
        end = minStart + span;
        start = end - width;
      }
      setViewWindow(start, end);
      return;
    }
    if (dragMode === 'resize-l') {
      setViewWindow(ns, dragStartViewEnd);
      return;
    }
    if (dragMode === 'resize-r') {
      setViewWindow(dragStartViewStart, ns);
    }
  }

  function endDrag() {
    dragMode = null;
    overviewWrap?.classList.remove('is-dragging');
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    onPointerMove(e.clientX);
  }

  function onMouseUp() {
    endDrag();
  }

  function startDrag(mode, clientX) {
    dragMode = mode;
    dragAnchorNs = clientXToNs(clientX);
    dragStartViewStart = viewStartNs;
    dragStartViewEnd = viewEndNs;
    overviewWrap?.classList.add('is-dragging');
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  overviewWrap?.addEventListener('mousedown', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.closest('.apex-log-gantt-brush-handle--left')) {
      e.preventDefault();
      startDrag('resize-l', e.clientX);
      return;
    }
    if (target.closest('.apex-log-gantt-brush-handle--right')) {
      e.preventDefault();
      startDrag('resize-r', e.clientX);
      return;
    }
    if (target.closest('.apex-log-gantt-brush-window')) {
      e.preventDefault();
      startDrag('move', e.clientX);
      return;
    }
    if (target.closest('.apex-log-gantt-overview') || target === overviewWrap) {
      e.preventDefault();
      const ns = clientXToNs(e.clientX);
      setViewWindow(ns, ns);
      startDrag('new', e.clientX);
    }
  });

  resetWindowBtn?.addEventListener('click', () => {
    viewStartNs = minStart;
    viewEndNs = maxEnd;
    refresh();
  });

  expandAllBtn?.addEventListener('click', () => {
    for (const id of collectExpandableIds(forest)) expanded.add(id);
    refresh();
  });

  collapseAllBtn?.addEventListener('click', () => {
    expanded.clear();
    refresh();
  });

  function exportMeta() {
    const viewStartMs = Number(((viewStartNs - minStart) / 1_000_000).toFixed(3));
    const viewEndMs = Number(((viewEndNs - minStart) / 1_000_000).toFixed(3));
    return {
      viewStartMs,
      viewEndMs,
      viewDurationMs: Number((viewEndMs - viewStartMs).toFixed(3)),
      logDurationMs: Number((span / 1_000_000).toFixed(3))
    };
  }

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  exportCsvBtn?.addEventListener('click', () => {
    const rows = buildTimelineExportRows(allNodes, minStart, viewStartNs, viewEndNs, t);
    const body = timelineToCsv(rows, exportMeta());
    downloadTimelineFile(body, 'text/csv;charset=utf-8', `apex-log-timeline-${stamp()}.csv`);
  });

  exportJsonBtn?.addEventListener('click', () => {
    const rows = buildTimelineExportRows(allNodes, minStart, viewStartNs, viewEndNs, t);
    const body = timelineToJson(rows, exportMeta());
    downloadTimelineFile(body, 'application/json;charset=utf-8', `apex-log-timeline-${stamp()}.json`);
  });

  refresh();

  timelineController = {
    revealLine(line) {
      const node = findTimelineNodeForLogLine(allNodes, line);
      if (!node) return false;
      for (const id of findAncestorIds(forest, node.id)) expanded.add(id);
      if (node.startNs < viewStartNs || node.endNs > viewEndNs) {
        viewStartNs = node.startNs;
        viewEndNs = Math.max(node.endNs, node.startNs + minViewNs);
        if (viewEndNs > minStart + span) {
          viewEndNs = minStart + span;
          viewStartNs = Math.max(minStart, viewEndNs - minViewNs);
        }
      }
      refresh();
      requestAnimationFrame(() => highlightPanelRow(mount, node.line || line));
      return true;
    }
  };

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => paintOverviewCanvas()) : null;
  ro?.observe(mount);
}
