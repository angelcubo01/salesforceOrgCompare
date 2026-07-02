import { escapeHtml } from '../../../shared/htmlEscape.js';
import { formatMs } from '../../../shared/apexLogParser.js';
import { bindLogTableRowNavigation, mountSegmentControl } from './analysisTableUtils.js';
import { panelSectionHeading, wirePanelHelpButtons } from './panelSectionHeading.js';

/**
 * @param {string} section
 * @param {object[]} rows
 * @param {(key: string) => string} t
 */
function renderProfilingTable(section, rows, t) {
  if (!rows?.length) {
    return `<p class="apex-log-empty">${escapeHtml(t(`apexLogViewer.empty.profiling${section}`))}</p>`;
  }
  return `<div class="apex-log-table-wrap apex-log-panel-content">
    <table class="apex-log-data-table">
      <thead><tr>
        <th>${escapeHtml(t('apexLogViewer.col.location'))}</th>
        <th>${escapeHtml(t('apexLogViewer.col.apexLine'))}</th>
        <th>${escapeHtml(t('apexLogViewer.col.executions'))}</th>
        <th>${escapeHtml(t('apexLogViewer.col.duration'))}</th>
        <th>${escapeHtml(t('apexLogViewer.col.detail'))}</th>
      </tr></thead>
      <tbody>${rows
        .slice(0, 50)
        .map(
          (r) => `<tr data-line="${r.line || 0}" tabindex="0" role="button">
          <td>${escapeHtml(r.location)}</td>
          <td>${r.apexLine || '—'}</td>
          <td>${r.executions}</td>
          <td>${escapeHtml(formatMs(r.totalMs))}</td>
          <td class="apex-log-cell-query">${escapeHtml(r.detail)}</td>
        </tr>`
        )
        .join('')}</tbody>
    </table>
  </div>`;
}

/**
 * @param {HTMLElement} mount
 * @param {object} parsed
 * @param {(line: number) => void} onJump
 * @param {(key: string) => string} t
 */
export function renderProfilingView(mount, parsed, onJump, t) {
  if (!mount) return;
  const profiling = parsed?.profiling || { soql: [], dml: [], methods: [] };
  const hasAny =
    profiling.soql.length + profiling.dml.length + profiling.methods.length > 0;

  mount.innerHTML = `
    ${panelSectionHeading('profiling', t('apexLogViewer.tab.profiling'), t)}
    ${
      hasAny
        ? `<div class="apex-log-panel-toolbar">
        <div id="apexLogProfilingSegment"></div>
      </div>
      <div id="apexLogProfilingContent" class="apex-log-panel-content"></div>`
        : `<p class="apex-log-empty">${escapeHtml(t('apexLogViewer.empty.profiling'))}</p>`
    }`;
  if (!hasAny) return;

  const segmentEl = mount.querySelector('#apexLogProfilingSegment');
  const contentEl = mount.querySelector('#apexLogProfilingContent');
  let activeSection = 'Methods';

  const sections = [
    { id: 'Methods', label: t('apexLogViewer.profiling.methods'), rows: profiling.methods },
    { id: 'Soql', label: t('apexLogViewer.profiling.soql'), rows: profiling.soql },
    { id: 'Dml', label: t('apexLogViewer.profiling.dml'), rows: profiling.dml }
  ].filter((s) => s.rows.length > 0);

  if (!sections.length) return;
  activeSection = sections[0].id;

  function paintSection(sectionId) {
    if (!contentEl) return;
    const sec = sections.find((s) => s.id === sectionId) || sections[0];
    contentEl.innerHTML = renderProfilingTable(sec.id, sec.rows, t);
    contentEl.querySelectorAll('tr[data-line]').forEach((tr) => {
      const line = Number(tr.dataset.line);
      if (line > 0) bindLogTableRowNavigation([tr], onJump);
    });
  }

  mountSegmentControl(
    segmentEl,
    activeSection,
    sections.map((s) => ({ id: s.id, label: s.label })),
    (id) => {
      activeSection = id;
      paintSection(id);
    }
  );
  paintSection(activeSection);
  wirePanelHelpButtons(mount, t);
}
