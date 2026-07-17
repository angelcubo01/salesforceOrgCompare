import { escapeHtml } from '../../../shared/htmlEscape.js';
import { classifyLogEvent } from '../../../shared/apexLogParser.js';
import {
  buildStrippedText,
  readApexLogTextFilterPrefs,
  writeApexLogTextFilterPrefs
} from '../../../shared/apexLogTextFilterPrefs.js';

const FILTER_KEYS = [
  'soql',
  'dml',
  'debug',
  'callout',
  'limit',
  'error',
  'stack',
  'method',
  'unit',
  'validation',
  'noise',
  'other'
];

const RELEVANT_KEYS = FILTER_KEYS.filter((k) => k !== 'noise' && k !== 'other');

/** @type {{ getEditorToFileLine: (editorLine: number) => number, getFileToEditorLine: (fileLine: number) => number, isStripMode: () => boolean } | null} */
let textFilterApi = null;

export function getTextFilterApi() {
  return textFilterApi;
}

/**
 * @param {import('monaco-editor')} monaco
 * @param {import('monaco-editor').editor.IStandaloneCodeEditor} editor
 * @param {object[]} lineEvents
 * @param {(key: string, vars?: Record<string, string | number>) => string} t
 */
export function mountTextFilterBar(monaco, editor, lineEvents, t) {
  const toolbar = document.getElementById('apexLogTextToolbar');
  const countEl = document.getElementById('apexLogTextFilterCount');
  if (!toolbar || !editor) return;

  const decoStoreKey = '__apexTextFilterHiddenDecoIds';
  /** @type {string[]} */
  const previousHidden = Array.isArray(editor[decoStoreKey]) ? editor[decoStoreKey] : [];
  if (previousHidden.length) {
    try {
      editor.deltaDecorations(previousHidden, []);
    } catch {
      /* ignore stale decoration ids */
    }
  }

  const enabled = new Set(RELEVANT_KEYS);
  let stripHiddenLines = false;
  /** @type {number[]} */
  let lineMap = [];
  let hiddenDecoIds = [];
  const categoryByLine = new Map((lineEvents || []).map((e) => [e.line, e.category]));

  const model = editor.getModel();
  const sourceText = model?.getValue() ?? '';
  const sourceLines = sourceText.split(/\r?\n/);

  toolbar.innerHTML = `
    <div class="apex-log-text-config">
      <label class="apex-log-text-config-toggle" title="${escapeHtml(t('apexLogViewer.textFilter.stripModeHint'))}">
        <input type="checkbox" id="apexLogTextStripMode" />
        <span class="apex-log-text-config-switch" aria-hidden="true"></span>
        <span class="apex-log-text-config-label">${escapeHtml(t('apexLogViewer.textFilter.stripMode'))}</span>
      </label>
    </div>
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

  const stripToggle = toolbar.querySelector('#apexLogTextStripMode');

  function updateTextFilterApi() {
    textFilterApi = {
      isStripMode: () => stripHiddenLines,
      getEditorToFileLine(editorLine) {
        if (!stripHiddenLines) return editorLine;
        const idx = editorLine - 1;
        return idx >= 0 && idx < lineMap.length ? lineMap[idx] : 0;
      },
      getFileToEditorLine(fileLine) {
        if (!stripHiddenLines) return fileLine;
        const idx = lineMap.indexOf(fileLine);
        return idx >= 0 ? idx + 1 : 0;
      }
    };
  }

  function applyFilters() {
    const currentModel = editor.getModel();
    if (!currentModel) return;
    const total = sourceLines.length;

    if (stripHiddenLines) {
      hiddenDecoIds = editor.deltaDecorations(hiddenDecoIds, []);
      editor[decoStoreKey] = hiddenDecoIds;

      const { text, lineMap: nextLineMap } = buildStrippedText(sourceLines, enabled, categoryByLine);
      lineMap = nextLineMap;
      if (currentModel.getValue() !== text) {
        editor.setValue(text);
      }

      const visible = lineMap.length;
      if (countEl) {
        countEl.textContent = t('apexLogViewer.textFilter.countStripped', {
          visible,
          total,
          stripped: total - visible
        });
      }
    } else {
      lineMap = [];
      if (currentModel.getValue() !== sourceText) {
        editor.setValue(sourceText);
      }

      const hidden = [];
      for (let line = 1; line <= total; line++) {
        const category = categoryByLine.get(line) || 'other';
        if (!enabled.has(category)) {
          hidden.push({
            range: new monaco.Range(line, 1, line, 1),
            options: {
              isWholeLine: true,
              inlineClassName: 'apex-log-line-hidden',
              className: 'apex-log-line-hidden'
            }
          });
        }
      }

      hiddenDecoIds = editor.deltaDecorations(hiddenDecoIds, hidden);
      editor[decoStoreKey] = hiddenDecoIds;
      const visible = total - hidden.length;
      if (countEl) {
        countEl.textContent = t('apexLogViewer.textFilter.count', { visible, total });
      }
    }

    updateTextFilterApi();
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
    for (const k of RELEVANT_KEYS) enabled.add(k);
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

  stripToggle?.addEventListener('change', () => {
    if (!(stripToggle instanceof HTMLInputElement)) return;
    stripHiddenLines = stripToggle.checked;
    void writeApexLogTextFilterPrefs({ stripHiddenLines });
    applyFilters();
  });

  void readApexLogTextFilterPrefs().then((prefs) => {
    stripHiddenLines = prefs.stripHiddenLines;
    if (stripToggle instanceof HTMLInputElement) stripToggle.checked = stripHiddenLines;
    applyFilters();
  });
}

/** @param {string} lineText */
export function getLineEventCategory(lineText) {
  const m = lineText.match(/\|([A-Z_]+)\|/);
  return classifyLogEvent(m?.[1] || '');
}
