import { escapeHtml } from '../../../shared/htmlEscape.js';
import { classifyLogEvent } from '../../../shared/apexLogParser.js';

const FILTER_KEYS = ['soql', 'dml', 'debug', 'callout', 'limit', 'error', 'method', 'unit', 'noise'];

/**
 * @param {import('monaco-editor')} monaco
 * @param {import('monaco-editor').editor.IStandaloneCodeEditor} editor
 * @param {object[]} lineEvents
 * @param {(key: string) => string} t
 */
export function mountTextFilterBar(monaco, editor, lineEvents, t) {
  const toolbar = document.getElementById('apexLogTextToolbar');
  const countEl = document.getElementById('apexLogTextFilterCount');
  if (!toolbar || !editor) return;

  const enabled = new Set(FILTER_KEYS.filter((k) => k !== 'noise'));

  toolbar.innerHTML = `
    <div class="apex-log-text-filters">
      ${FILTER_KEYS.map(
        (key) => `<label class="apex-log-text-filter-label">
        <input type="checkbox" data-filter="${key}" ${enabled.has(key) ? 'checked' : ''} />
        ${escapeHtml(t(`apexLogViewer.textFilter.${key}`))}
      </label>`
      ).join('')}
      <button type="button" class="apex-log-gantt-action" id="apexLogTextRelevant">${escapeHtml(t('apexLogViewer.textFilter.relevantOnly'))}</button>
      <button type="button" class="apex-log-gantt-action" id="apexLogTextShowAll">${escapeHtml(t('apexLogViewer.textFilter.showAll'))}</button>
    </div>`;

  let hiddenDecoIds = [];

  function applyFilters() {
    const model = editor.getModel();
    if (!model) return;
    const total = model.getLineCount();
    const hidden = [];

    for (const ev of lineEvents || []) {
      if (!enabled.has(ev.category)) {
        hidden.push({
          range: new monaco.Range(ev.line, 1, ev.line, 1),
          options: {
            isWholeLine: true,
            inlineClassName: 'apex-log-line-hidden',
            className: 'apex-log-line-hidden'
          }
        });
      }
    }

    hiddenDecoIds = editor.deltaDecorations(hiddenDecoIds, hidden);
    const visible = total - hidden.length;
    if (countEl) {
      countEl.textContent = t('apexLogViewer.textFilter.count', { visible, total });
    }
  }

  toolbar.querySelectorAll('input[data-filter]').forEach((input) => {
    input.addEventListener('change', () => {
      const key = input.dataset.filter;
      if (!key) return;
      if (input.checked) enabled.add(key);
      else enabled.delete(key);
      applyFilters();
    });
  });

  toolbar.querySelector('#apexLogTextRelevant')?.addEventListener('click', () => {
    enabled.clear();
    for (const k of FILTER_KEYS) {
      if (k !== 'noise') enabled.add(k);
    }
    toolbar.querySelectorAll('input[data-filter]').forEach((input) => {
      const key = input.dataset.filter;
      if (input instanceof HTMLInputElement) input.checked = enabled.has(key);
    });
    applyFilters();
  });

  toolbar.querySelector('#apexLogTextShowAll')?.addEventListener('click', () => {
    for (const k of FILTER_KEYS) enabled.add(k);
    toolbar.querySelectorAll('input[data-filter]').forEach((input) => {
      if (input instanceof HTMLInputElement) input.checked = true;
    });
    applyFilters();
  });

  applyFilters();
}

/** @param {string} lineText */
export function getLineEventCategory(lineText) {
  const m = lineText.match(/\|([A-Z_]+)\|/);
  return classifyLogEvent(m?.[1] || '');
}
