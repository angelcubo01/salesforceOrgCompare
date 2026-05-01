// Monaco ESM loader (no eval/AMD) and helpers.
import { state } from '../core/state.js';

export async function loadMonaco() {
  // Load Monaco via AMD loader to avoid CSS-as-module issues in ESM build
  return await new Promise((resolve, reject) => {
    try {
      // Suppress Monaco language loading errors
      const originalConsoleError = console.error;
      console.error = function(...args) {
        if (args[0] && typeof args[0] === 'string' && args[0].includes('Failed trying to load default language strings')) {
          return; // Suppress this specific error
        }
        originalConsoleError.apply(console, args);
      };
      
      // Ensure AMD loader is available
      if (typeof require === 'undefined') {
        reject(new Error('Monaco AMD loader not found'));
        return;
      }
      // Load core and Apex basic language contribution for syntax highlighting
      require(['vs/editor/editor.main', 'vs/basic-languages/apex/apex'], (_ignored, apexModule) => {
        const monaco = window.monaco;
        try {
          if (apexModule && monaco?.languages) {
            // Register Apex language (basic monarch tokenizer)
            monaco.languages.register({ id: 'apex' });
            if (apexModule.language) monaco.languages.setMonarchTokensProvider('apex', apexModule.language);
            if (apexModule.conf) monaco.languages.setLanguageConfiguration('apex', apexModule.conf);
          }
          if (monaco?.editor?.defineTheme) {
            monaco.editor.defineTheme('sfoc-editor-dark', {
              base: 'vs-dark',
              inherit: true,
              rules: [],
              colors: {
                'editor.background': '#0f172a',
                'editor.foreground': '#e2e8f0',
                'diffEditor.insertedTextBackground': '#2dd4bf40',
                'diffEditor.removedTextBackground': '#fb718540',
                'diffEditor.insertedLineBackground': '#2dd4bf22',
                'diffEditor.removedLineBackground': '#fb718522',
                'diffEditor.insertedTextBorder': '#00000000',
                'diffEditor.removedTextBorder': '#00000000',
                'diffEditor.diagonalFill': '#2d374830',
                'editorOverviewRuler.addedForeground': '#2dd4bfcc',
                'editorOverviewRuler.deletedForeground': '#fb7185cc',
                'editorOverviewRuler.modifiedForeground': '#7dd3fccc',
                'editorGutter.addedBackground': '#2dd4bf50',
                'editorGutter.deletedBackground': '#fb718550',
                'editorGutter.modifiedBackground': '#7dd3fc50'
              }
            });
            if (monaco.editor.setTheme) {
              monaco.editor.setTheme('sfoc-editor-dark');
            }
          }
        } catch (e) {
          // Non-fatal: continue even if Apex registration fails
          // Silently fail - language registration error is not critical
        }
        resolve(monaco);
      }, reject);
    } catch (e) {
      reject(e);
    }
  });
}

export function createSingleEditor(monaco, container) {
  const wrap = state.wordWrapEnabled ? 'on' : 'off';
  return monaco.editor.create(container, {
    value: '',
    readOnly: true,
    language: 'plaintext',
    automaticLayout: true,
    minimap: { enabled: false },
    wordWrap: wrap,
    theme: 'sfoc-editor-dark',
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
    scrollbar: {
      useShadows: false,
      vertical: 'auto',
      horizontal: 'auto'
    }
  });
}

export function createDiffEditor(monaco, container) {
  const wrap = state.wordWrapEnabled ? 'on' : 'off';
  const diff = monaco.editor.createDiffEditor(container, {
    readOnly: true,
    automaticLayout: true,
    renderIndicators: true,
    originalEditable: false,
    diffAlgorithm: 'advanced',
    renderSideBySide: true,
    enableSplitViewResizing: false,
    useInlineViewWhenSpaceIsLimited: false,
    renderOverviewRuler: true,
    renderMarginRevertIcon: false,
    ignoreTrimWhitespace: false,
    minimap: { enabled: false },
    wordWrap: wrap,
    theme: 'sfoc-editor-dark',
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
    renderLineHighlight: 'all',
    scrollbar: {
      useShadows: false,
      vertical: 'auto',
      horizontal: 'auto'
    },
    readOnlyMessage: null
  });
  try {
    const common = {
      wordWrap: wrap,
      theme: 'sfoc-editor-dark',
      fontSize: 13,
      lineHeight: 20,
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
      glyphMargin: true,
      folding: false,
      lineDecorationsWidth: 14,
      lineNumbersMinChars: 4,
      padding: { top: 8 },
      renderLineHighlight: 'all',
      overviewRulerLanes: 0,
      overviewRulerBorder: false
    };
    diff.getOriginalEditor().updateOptions(common);
    diff.getModifiedEditor().updateOptions(common);
  } catch (e) {
    // ignore if APIs differ on this monaco version
  }
  return diff;
}

export function applyWordWrapToCurrentEditors() {
  const wrap = state.wordWrapEnabled ? 'on' : 'off';
  try {
    if (state.editor) state.editor.updateOptions({ wordWrap: wrap });
  } catch {}
  try {
    if (state.diffEditor) {
      state.diffEditor.updateOptions({ wordWrap: wrap });
      state.diffEditor.getOriginalEditor().updateOptions({ wordWrap: wrap });
      state.diffEditor.getModifiedEditor().updateOptions({ wordWrap: wrap });
    }
  } catch {}
}

export function languageForFileName(fileName) {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.js')) return 'javascript';
  if (lower.endsWith('.ts')) return 'typescript';
  if (lower.endsWith('.html') || lower.endsWith('.page') || lower.endsWith('.component')) return 'html';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.svg') || lower.endsWith('.xml') || lower.endsWith('.cmp') || lower.endsWith('.app')) return 'xml';
  if (lower.endsWith('.cls') || lower.endsWith('.trigger')) return 'apex';
  return 'plaintext';
}


