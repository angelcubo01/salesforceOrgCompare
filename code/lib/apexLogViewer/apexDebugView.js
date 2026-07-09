import { escapeHtml } from '../../../shared/htmlEscape.js';
import {
  APEX_LOG_PREVIEW,
  createPreviewController,
  filterRowsByQuery,
  mountShowMoreFooter,
  renderSummaryChips,
  wireSearchFilter
} from './analysisTableUtils.js';
import { panelSectionHeading, wirePanelHelpButtons } from './panelSectionHeading.js';
import { parseDebugMessage, formatJsonPretty } from './jsonMessageParser.js';

/**
 * @param {HTMLElement} mount
 * @param {object} parsed
 * @param {(line: number) => void} onJump
 * @param {(key: string) => string} t
 */
export function renderDebugView(mount, parsed, onJump, t) {
  if (!mount) return;
  const rows = parsed?.userDebug || [];
  const methods = [...new Set(rows.map((r) => parseDebugMessage(r.message).methodTag).filter(Boolean))];
  const previewCtrl = createPreviewController(APEX_LOG_PREVIEW.debugItems);

  mount.innerHTML = `
    ${panelSectionHeading('debug', t('apexLogViewer.tab.debug'), t)}
    <div class="apex-log-panel-toolbar apex-log-panel-toolbar--stack">
      <input type="search" class="apex-log-filter" id="apexLogDebugFilter"
        placeholder="${escapeHtml(t('apexLogViewer.filter.debugPlaceholder'))}" />
      <select class="apex-log-filter-select" id="apexLogDebugMethodFilter">
        <option value="">${escapeHtml(t('apexLogViewer.filter.allMethods'))}</option>
        ${methods.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')}
      </select>
      <div class="apex-log-summary-chips" id="apexLogDebugSummary"></div>
    </div>
    <div class="apex-log-debug-list apex-log-panel-content" id="apexLogDebugList"></div>`;
  const listEl = mount.querySelector('#apexLogDebugList');
  const listSection = listEl?.parentElement;
  const filter = mount.querySelector('#apexLogDebugFilter');
  const methodFilter = mount.querySelector('#apexLogDebugMethodFilter');
  const summary = mount.querySelector('#apexLogDebugSummary');

  function paint(list) {
    if (!listEl) return;
    const withJson = list.filter((r) => parseDebugMessage(r.message).json).length;
    renderSummaryChips(summary, [
      { label: t('apexLogViewer.summary.debugCount'), value: String(list.length) },
      { label: t('apexLogViewer.summary.jsonMessages'), value: String(withJson) }
    ]);
    if (!list.length) {
      listEl.innerHTML = `<p class="apex-log-empty">${escapeHtml(t('apexLogViewer.empty.debug'))}</p>`;
      listSection?.querySelector('.apex-log-show-more-wrap')?.remove();
      return;
    }
    const visible = previewCtrl.slice(list);
    listEl.innerHTML = visible
      .map((r) => {
        const { json, prefix, methodTag } = parseDebugMessage(r.message);
        const jsonBlock = json
          ? `<details class="apex-log-debug-json">
              <summary>${escapeHtml(t('apexLogViewer.debug.expandJson'))}</summary>
              <pre class="apex-log-json-pre">${escapeHtml(formatJsonPretty(json))}</pre>
              <button type="button" class="apex-log-copy-btn" data-copy="${escapeHtml(json)}">${escapeHtml(t('apexLogViewer.debug.copyJson'))}</button>
            </details>`
          : '';
        return `<article class="apex-log-debug-item" data-line="${r.line}" tabindex="0" role="button">
          <header class="apex-log-debug-item-head">
            <span class="apex-log-debug-meta">L${r.line} · ${escapeHtml(r.timestamp)} · Apex:${r.apexLine !== '' ? r.apexLine : '—'}</span>
            ${methodTag ? `<span class="apex-log-panel-chip">${escapeHtml(methodTag)}</span>` : ''}
            <button type="button" class="apex-log-copy-btn apex-log-copy-btn--inline" data-copy="${escapeHtml(r.message)}">${escapeHtml(t('apexLogViewer.debug.copyMsg'))}</button>
          </header>
          <p class="apex-log-debug-msg">${escapeHtml(prefix || r.message)}</p>
          ${jsonBlock}
        </article>`;
      })
      .join('');

    listEl.querySelectorAll('.apex-log-debug-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('details')) return;
        onJump(Number(item.dataset.line));
      });
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onJump(Number(item.dataset.line));
        }
      });
    });

    listEl.querySelectorAll('.apex-log-copy-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = btn.getAttribute('data-copy') || '';
        navigator.clipboard?.writeText(text).catch(() => {});
      });
    });

    if (listSection) {
      mountShowMoreFooter(listSection, previewCtrl, list.length, APEX_LOG_PREVIEW.debugItems, t, () =>
        paint(list)
      );
    }
  }

  function applyFilter() {
    previewCtrl.reset();
    let filtered = filterRowsByQuery(
      rows,
      filter?.value,
      (r) => `${r.line} ${r.message} ${r.apexLine} ${r.timestamp}`
    );
    const method = methodFilter?.value;
    if (method) {
      filtered = filtered.filter((r) => parseDebugMessage(r.message).methodTag === method);
    }
    paint(filtered);
  }

  wireSearchFilter(filter, applyFilter);
  methodFilter?.addEventListener('change', applyFilter);
  applyFilter();
  wirePanelHelpButtons(mount, t);
}
