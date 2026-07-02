import { buildApexLogTreeModel } from '../../../shared/apexLogParser.js';
import { createSingleEditor } from '../../editor/monaco.js';
import { registerSfocApexLogTreeLanguage, resolveTreeThemeId } from './registerTreelogLanguage.js';
import { ensurePanelSectionHeading } from './panelSectionHeading.js';
import { escapeHtml } from '../../../shared/htmlEscape.js';

/** @type {import('monaco-editor').editor.IStandaloneCodeEditor | null} */
let treeEditor = null;
/** @type {{ start: number, end: number }[]} */
let treeFoldRanges = [];
/** @type {boolean} */
let foldingProviderRegistered = false;
/** @type {Map<number, number>} */
let treeLogLineToRow = new Map();
/** @type {string[]} */
let treeAllLines = [];

/**
 * @param {import('monaco-editor')} monaco
 */
function ensureTreeFoldingProvider(monaco) {
  if (foldingProviderRegistered || !monaco?.languages?.registerFoldingRangeProvider) return;
  foldingProviderRegistered = true;
  monaco.languages.registerFoldingRangeProvider('sfoc-apex-log-tree', {
    provideFoldingRanges() {
      return treeFoldRanges.map((r) => ({
        start: r.start,
        end: r.end,
        kind: monaco.languages.FoldingRangeKind?.Region
      }));
    }
  });
}

/**
 * @param {import('monaco-editor').editor.IStandaloneCodeEditor} editor
 * @param {number} lineNumber
 * @param {{ start: number, end: number }[]} foldRanges
 */
function unfoldTreeToLine(editor, lineNumber, foldRanges) {
  const ranges = foldRanges
    .filter((r) => r.start < lineNumber && r.end >= lineNumber)
    .sort((a, b) => a.start - b.start);
  for (const range of ranges) {
    editor.setPosition({ lineNumber: range.start, column: 1 });
    editor.getAction('editor.unfoldRecursively')?.run();
  }
}

/**
 * @param {number} line
 * @returns {boolean}
 */
export function revealTreeLogLine(line) {
  if (!treeEditor || !line) return false;
  const row = treeLogLineToRow.get(line);
  if (!row) return false;
  unfoldTreeToLine(treeEditor, row, treeFoldRanges);
  treeEditor.revealLineInCenter(row);
  treeEditor.setPosition({ lineNumber: row, column: 1 });
  treeEditor.focus();
  return true;
}

function applyTreeFilter(query, slowOnly, errorsOnly, parsed) {
  if (!treeEditor) return;
  const q = String(query || '').trim().toLowerCase();
  let lines = treeAllLines;
  if (q) lines = lines.filter((l) => l.toLowerCase().includes(q));
  if (slowOnly) {
    lines = lines.filter((l) => {
      const m = l.match(/\((\d+(?:\.\d+)?)\s*ms\)|\((\d+\.\d+)\s*s\)/);
      if (!m) return false;
      const ms = m[1] ? Number(m[1]) : Number(m[2]) * 1000;
      return ms >= 100;
    });
  }
  if (errorsOnly && parsed?.issues?.length) {
    const errorLines = new Set(parsed.issues.filter((i) => i.type === 'error').map((i) => i.line));
    lines = lines.filter((l) => {
      for (const ln of errorLines) {
        if (treeLogLineToRow.get(ln) && l.includes(String(ln))) return true;
      }
      return l.toLowerCase().includes('error') || l.includes('✗');
    });
  }
  treeEditor.setValue(lines.join('\n') || '—');
}

/**
 * @param {import('monaco-editor')} monaco
 * @param {HTMLElement} mount
 * @param {object} parsed
 * @param {boolean} lightTheme
 * @param {(key: string, params?: object) => string} t
 * @param {HTMLElement | null} [toolbarEl]
 */
export function renderTreeView(monaco, mount, parsed, lightTheme, t, toolbarEl) {
  if (!mount || !parsed?.tree) return null;
  ensurePanelSectionHeading(mount.parentElement, 'tree', t('apexLogViewer.tab.tree'), t);
  registerSfocApexLogTreeLanguage(monaco);
  ensureTreeFoldingProvider(monaco);

  const { lines, foldRanges, logLineToRow } = buildApexLogTreeModel(parsed.tree, t);
  treeFoldRanges = foldRanges;
  treeLogLineToRow = logLineToRow;
  treeAllLines = lines;
  const text = lines.join('\n') || '—';

  if (toolbarEl) {
    toolbarEl.innerHTML = `
      <input type="search" class="apex-log-filter" id="apexLogTreeFilter" placeholder="${escapeHtml(t('apexLogViewer.filter.treePlaceholder'))}" />
      <label class="apex-log-text-filter-label"><input type="checkbox" id="apexLogTreeSlow" /> ${escapeHtml(t('apexLogViewer.tree.slowOnly'))}</label>
      <label class="apex-log-text-filter-label"><input type="checkbox" id="apexLogTreeErrors" /> ${escapeHtml(t('apexLogViewer.tree.errorsOnly'))}</label>`;
  }

  if (!treeEditor) {
    treeEditor = createSingleEditor(monaco, mount);
    treeEditor.updateOptions({
      theme: resolveTreeThemeId(lightTheme),
      folding: true,
      showFoldingControls: 'always',
      foldingHighlight: true,
      glyphMargin: true
    });
    monaco.editor.setModelLanguage(treeEditor.getModel(), 'sfoc-apex-log-tree');
  } else {
    treeEditor.updateOptions({ theme: resolveTreeThemeId(lightTheme) });
  }

  treeEditor.setValue(text);

  const filterInput = toolbarEl?.querySelector('#apexLogTreeFilter');
  const slowCb = toolbarEl?.querySelector('#apexLogTreeSlow');
  const errorsCb = toolbarEl?.querySelector('#apexLogTreeErrors');
  const runFilter = () =>
    applyTreeFilter(filterInput?.value, slowCb?.checked, errorsCb?.checked, parsed);
  filterInput?.addEventListener('input', runFilter);
  slowCb?.addEventListener('change', runFilter);
  errorsCb?.addEventListener('change', runFilter);

  requestAnimationFrame(() => {
    try {
      treeEditor?.updateOptions({
        folding: true,
        showFoldingControls: 'always',
        foldingHighlight: true,
        glyphMargin: true
      });
      treeEditor?.layout();
    } catch {
      /* ignore */
    }
  });
  return treeEditor;
}

export function layoutTreeEditor() {
  try {
    treeEditor?.layout();
  } catch {
    /* ignore */
  }
}
