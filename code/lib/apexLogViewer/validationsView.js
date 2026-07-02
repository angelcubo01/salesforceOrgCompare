import { escapeHtml } from '../../../shared/htmlEscape.js';
import {
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
export function renderValidationsView(mount, parsed, onJump, t) {
  if (!mount) return;
  const validations = parsed?.validations || [];

  mount.innerHTML = `
    ${panelSectionHeading('validations', t('apexLogViewer.tab.validations'), t)}
    <div class="apex-log-panel-toolbar apex-log-panel-toolbar--stack">
      <input type="search" class="apex-log-filter" id="apexLogValidationsFilter"
        placeholder="${escapeHtml(t('apexLogViewer.filter.validationsPlaceholder'))}" />
      <div class="apex-log-summary-chips" id="apexLogValidationsSummary"></div>
    </div>
    <div class="apex-log-table-wrap apex-log-panel-content">
      <table class="apex-log-data-table">
        <thead><tr>
          <th>${escapeHtml(t('apexLogViewer.col.line'))}</th>
          <th>${escapeHtml(t('apexLogViewer.col.type'))}</th>
          <th>${escapeHtml(t('apexLogViewer.col.name'))}</th>
          <th>${escapeHtml(t('apexLogViewer.col.result'))}</th>
        </tr></thead>
        <tbody id="apexLogValidationsBody"></tbody>
      </table>
    </div>`;

  const valBody = mount.querySelector('#apexLogValidationsBody');
  const filter = mount.querySelector('#apexLogValidationsFilter');
  const summary = mount.querySelector('#apexLogValidationsSummary');

  function paint(list) {
    if (!valBody) return;
    const fails = list.filter((v) => v.result === 'fail' || v.kind === 'fail').length;
    renderSummaryChips(summary, [
      { label: t('apexLogViewer.summary.validationCount'), value: String(list.length) },
      { label: t('apexLogViewer.summary.validationFails'), value: String(fails) }
    ]);
    valBody.innerHTML = list.length
      ? list
          .map(
            (v) => `<tr data-line="${v.line}" tabindex="0" role="button">
            <td>${v.line}</td>
            <td>${escapeHtml(v.kind)}</td>
            <td>${escapeHtml(v.name || v.ruleId || '—')}</td>
            <td class="${v.result === 'fail' || v.kind === 'fail' ? 'apex-log-text--error' : ''}">${escapeHtml(v.result || (v.kind === 'pass' ? 'pass' : '—'))}</td>
          </tr>`
          )
          .join('')
      : `<tr><td colspan="4" class="apex-log-empty">${escapeHtml(t('apexLogViewer.empty.validations'))}</td></tr>`;
    bindLogTableRowNavigation(valBody.querySelectorAll('tr[data-line]'), onJump);
  }

  function applyFilter() {
    paint(
      filterRowsByQuery(
        validations,
        filter?.value,
        (v) => `${v.name} ${v.ruleId} ${v.kind} ${v.result}`
      )
    );
  }

  wireSearchFilter(filter, applyFilter);
  applyFilter();
  wirePanelHelpButtons(mount, t);
}
