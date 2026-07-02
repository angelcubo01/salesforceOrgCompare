import { escapeHtml } from '../../../shared/htmlEscape.js';
import { formatMs, formatLogSize } from '../../../shared/apexLogParser.js';
import { panelSectionHeading, wirePanelHelpButtons } from './panelSectionHeading.js';
import { bindLogTableRowNavigation } from './analysisTableUtils.js';

/**
 * @param {string} instanceUrl
 * @param {string} id
 * @param {string} prefix
 */
function recordUrl(instanceUrl, id, prefix) {
  if (!instanceUrl || !id) return '';
  const base = String(instanceUrl).replace(/\/$/, '');
  const paths = {
    '001': `/lightning/r/Account/${id}/view`,
    '500': `/lightning/r/Case/${id}/view`,
    '005': `/lightning/r/User/${id}/view`,
    '003': `/lightning/r/Contact/${id}/view`
  };
  const path = paths[prefix] || `/${id}`;
  return `${base}${path}`;
}

/**
 * @param {HTMLElement} mount
 * @param {object} parsed
 * @param {(line: number) => void} onJump
 * @param {(key: string, params?: object) => string} t
 * @param {{ instanceUrl?: string }} [opts]
 */
export function renderSummaryView(mount, parsed, onJump, t, opts = {}) {
  if (!mount || !parsed) return;
  const instanceUrl = opts.instanceUrl || '';

  const topOps = [...(parsed.timeline || [])]
    .filter((ev) => ev.durationMs > 0)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 5);

  const codeFlow = (parsed.codeUnits || [])
    .filter((cu) => cu.durationMs > 0 || cu.label)
    .sort((a, b) => a.line - b.line);

  const records = parsed.records || {};
  const recordChips = [];
  const addRecords = (ids, label, prefix) => {
    for (const id of (ids || []).slice(0, 5)) {
      const url = recordUrl(instanceUrl, id, prefix);
      recordChips.push(
        url
          ? `<a class="apex-log-summary-record" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}: ${escapeHtml(id)}</a>`
          : `<span class="apex-log-summary-record">${escapeHtml(label)}: ${escapeHtml(id)}</span>`
      );
    }
  };
  addRecords(records.accounts, 'Account', '001');
  addRecords(records.cases, 'Case', '500');
  addRecords(records.users, 'User', '005');
  addRecords(records.contacts, 'Contact', '003');

  const limitPeak = parsed.limitPeak || {};
  const soqlPeak = limitPeak.SOQL;
  const calloutPeak = limitPeak.CALLOUT;

  mount.innerHTML = `
    ${panelSectionHeading('summary', t('apexLogViewer.tab.summary'), t)}
    <div class="apex-log-summary-grid">
      <div class="apex-log-summary-card">
        <span class="apex-log-summary-card-label">${escapeHtml(t('apexLogViewer.meta.duration'))}</span>
        <strong>${escapeHtml(formatMs(parsed.meta?.durationMs || 0))}</strong>
      </div>
      <div class="apex-log-summary-card">
        <span class="apex-log-summary-card-label">${escapeHtml(t('apexLogViewer.meta.size'))}</span>
        <strong>${escapeHtml(formatLogSize(parsed.meta?.sizeBytes || 0))}</strong>
      </div>
      <div class="apex-log-summary-card">
        <span class="apex-log-summary-card-label">${escapeHtml(t('apexLogViewer.summary.soqlCount'))}</span>
        <strong>${(parsed.soql || []).length}${soqlPeak ? ` / ${soqlPeak.max}` : ''}</strong>
      </div>
      <div class="apex-log-summary-card">
        <span class="apex-log-summary-card-label">${escapeHtml(t('apexLogViewer.summary.dmlCount'))}</span>
        <strong>${(parsed.dml || []).length}</strong>
      </div>
      <div class="apex-log-summary-card">
        <span class="apex-log-summary-card-label">${escapeHtml(t('apexLogViewer.summary.calloutCount'))}</span>
        <strong>${(parsed.callouts || []).length}${calloutPeak ? ` / ${calloutPeak.max}` : ''}</strong>
      </div>
      <div class="apex-log-summary-card">
        <span class="apex-log-summary-card-label">${escapeHtml(t('apexLogViewer.summary.errors'))}</span>
        <strong class="${(parsed.issues || []).some((i) => i.type === 'error') ? 'apex-log-text--error' : ''}">${(parsed.issues || []).filter((i) => i.type === 'error').length}</strong>
      </div>
    </div>
    ${
      parsed.user?.name
        ? `<p class="apex-log-summary-user">${escapeHtml(t('apexLogViewer.summary.user'))}: <strong>${escapeHtml(parsed.user.name)}</strong></p>`
        : ''
    }
    ${
      recordChips.length
        ? `<div class="apex-log-summary-section"><h3>${escapeHtml(t('apexLogViewer.summary.records'))}</h3><div class="apex-log-summary-records">${recordChips.join('')}</div></div>`
        : ''
    }
    <div class="apex-log-summary-section">
      <h3>${escapeHtml(t('apexLogViewer.summary.topSlow'))}</h3>
      <div class="apex-log-table-wrap">
        <table class="apex-log-data-table" id="apexLogSummaryTopTable">
          <thead><tr>
            <th>${escapeHtml(t('apexLogViewer.col.duration'))}</th>
            <th>${escapeHtml(t('apexLogViewer.col.type'))}</th>
            <th>${escapeHtml(t('apexLogViewer.col.detail'))}</th>
          </tr></thead>
          <tbody>${
            topOps.length
              ? topOps
                  .map(
                    (ev) => `<tr data-line="${ev.line}" tabindex="0" role="button">
                <td>${escapeHtml(formatMs(ev.durationMs))}</td>
                <td>${escapeHtml(t(`apexLogViewer.kind.${ev.type}`) || ev.type)}</td>
                <td class="apex-log-cell-query">${escapeHtml(ev.label)}</td>
              </tr>`
                  )
                  .join('')
              : `<tr><td colspan="3" class="apex-log-empty">${escapeHtml(t('apexLogViewer.empty.summaryTop'))}</td></tr>`
          }</tbody>
        </table>
      </div>
    </div>
    <div class="apex-log-summary-section">
      <h3>${escapeHtml(t('apexLogViewer.summary.executionFlow'))}</h3>
      <div class="apex-log-flow-list" id="apexLogSummaryFlow">${
        codeFlow.length
          ? codeFlow
              .map(
                (cu) => `<button type="button" class="apex-log-flow-item" data-line="${cu.line}">
            <span class="apex-log-flow-dur">${cu.durationMs > 0 ? escapeHtml(formatMs(cu.durationMs)) : '—'}</span>
            <span class="apex-log-flow-label">${escapeHtml(cu.label)}</span>
          </button>`
              )
              .join('')
          : `<p class="apex-log-empty">${escapeHtml(t('apexLogViewer.empty.summaryFlow'))}</p>`
      }</div>
    </div>`;
  bindLogTableRowNavigation(mount.querySelectorAll('#apexLogSummaryTopTable tr[data-line]'), onJump);
  mount.querySelectorAll('.apex-log-flow-item').forEach((btn) => {
    btn.addEventListener('click', () => onJump(Number(btn.dataset.line)));
  });
  wirePanelHelpButtons(mount, t);
}
