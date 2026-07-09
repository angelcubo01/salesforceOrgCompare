import { escapeHtml } from '../../../shared/htmlEscape.js';
import {
  APEX_LOG_PREVIEW,
  filterRowsByQuery,
  mountPreviewTable,
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
export function renderWorkflowView(mount, parsed, onJump, t) {
  if (!mount) return;
  const workflows = parsed?.workflows || [];

  mount.innerHTML = `
    ${panelSectionHeading('workflow', t('apexLogViewer.tab.workflow'), t)}
    <div class="apex-log-panel-toolbar apex-log-panel-toolbar--stack">
      <input type="search" class="apex-log-filter" id="apexLogWorkflowFilter"
        placeholder="${escapeHtml(t('apexLogViewer.filter.workflowPlaceholder'))}" />
      <div class="apex-log-summary-chips" id="apexLogWorkflowSummary"></div>
    </div>
    <div class="apex-log-table-wrap apex-log-panel-content" id="apexLogWorkflowWrap">
      <table class="apex-log-data-table">
        <thead><tr>
          <th>${escapeHtml(t('apexLogViewer.col.line'))}</th>
          <th>${escapeHtml(t('apexLogViewer.col.event'))}</th>
          <th>${escapeHtml(t('apexLogViewer.col.detail'))}</th>
        </tr></thead>
        <tbody id="apexLogWorkflowBody"></tbody>
      </table>
    </div>`;

  const wfBody = mount.querySelector('#apexLogWorkflowBody');
  const tableWrap = mount.querySelector('#apexLogWorkflowWrap');
  const filter = mount.querySelector('#apexLogWorkflowFilter');
  const summary = mount.querySelector('#apexLogWorkflowSummary');

  /** @type {ReturnType<typeof mountPreviewTable> | null} */
  let preview = null;

  function paint(list) {
    if (!wfBody) return;
    renderSummaryChips(summary, [
      { label: t('apexLogViewer.summary.workflowCount'), value: String(list.length) }
    ]);
    if (!list.length) {
      wfBody.innerHTML = `<tr><td colspan="3" class="apex-log-empty">${escapeHtml(t('apexLogViewer.empty.workflow'))}</td></tr>`;
      tableWrap?.querySelector('.apex-log-show-more-wrap')?.remove();
      return;
    }
    if (!preview) {
      preview = mountPreviewTable(wfBody, tableWrap, list, APEX_LOG_PREVIEW.tableRows, {
        rowHtmlFn: (w) => `<tr data-line="${w.line}" tabindex="0" role="button">
            <td>${w.line}</td>
            <td>${escapeHtml(w.event)}</td>
            <td>${escapeHtml(w.detail || '—')}</td>
          </tr>`,
        emptyHtml: `<tr><td colspan="3" class="apex-log-empty">${escapeHtml(t('apexLogViewer.empty.workflow'))}</td></tr>`,
        t,
        onJump
      });
    } else {
      preview.setRows(list);
    }
  }

  function applyFilter() {
    paint(
      filterRowsByQuery(workflows, filter?.value, (w) => `${w.event} ${w.detail}`)
    );
  }

  wireSearchFilter(filter, applyFilter);
  applyFilter();
  wirePanelHelpButtons(mount, t);
}
