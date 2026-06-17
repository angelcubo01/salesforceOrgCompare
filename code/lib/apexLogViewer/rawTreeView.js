import { buildApexLogTreeModel } from '../../../shared/apexLogParser.js';
import { createSingleEditor } from '../../editor/monaco.js';
import { registerSfocApexLogTreeLanguage, resolveTreeThemeId } from './registerTreelogLanguage.js';
import { ensurePanelSectionHeading } from './panelSectionHeading.js';

/** @type {import('monaco-editor').editor.IStandaloneCodeEditor | null} */
let treeEditor = null;
/** @type {{ start: number, end: number }[]} */
let treeFoldRanges = [];
/** @type {boolean} */
let foldingProviderRegistered = false;
/** @type {Map<number, number>} */
let treeLogLineToRow = new Map();

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

/**
 * @param {import('monaco-editor')} monaco
 * @param {HTMLElement} mount
 * @param {object} parsed
 * @param {boolean} lightTheme
 * @param {(key: string, params?: object) => string} t
 */
export function renderTreeView(monaco, mount, parsed, lightTheme, t) {
  if (!mount || !parsed?.tree) return null;
  ensurePanelSectionHeading(mount.parentElement, 'tree', t('apexLogViewer.tab.tree'));
  registerSfocApexLogTreeLanguage(monaco);
  ensureTreeFoldingProvider(monaco);

  const { lines, foldRanges, logLineToRow } = buildApexLogTreeModel(parsed.tree, t);
  treeFoldRanges = foldRanges;
  treeLogLineToRow = logLineToRow;
  const text = lines.join('\n') || '—';

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
