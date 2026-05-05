// Monaco ESM loader (no eval/AMD) and helpers.
import { state } from '../core/state.js';
import { getMonacoThemeId } from '../../shared/extensionSettings.js';

/** Tema activo para nuevos editores y actualizaciones globales. */
export function resolveMonacoThemeId() {
  return getMonacoThemeId();
}

/**
 * Aplica el tema guardado en ajustes a Monaco (diff, editor único y opciones hijas).
 * @param {import('monaco-editor')} monaco
 */
export function applyMonacoThemeGlobally(monaco) {
  if (!monaco?.editor?.setTheme) return;
  const id = resolveMonacoThemeId();
  try {
    monaco.editor.setTheme(id);
  } catch {
    /* ignore */
  }
  try {
    if (state.editor) state.editor.updateOptions({ theme: id });
  } catch {
    /* ignore */
  }
  try {
    if (state.diffEditor) {
      state.diffEditor.updateOptions({ theme: id });
      state.diffEditor.getOriginalEditor().updateOptions({ theme: id });
      state.diffEditor.getModifiedEditor().updateOptions({ theme: id });
    }
  } catch {
    /* ignore */
  }
}

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
      // Load core, Apex (diff viewer) y SQL (explorador SOQL: integración nativa con suggest)
      require(
        ['vs/editor/editor.main', 'vs/basic-languages/apex/apex', 'vs/basic-languages/sql/sql'],
        (_ignored, apexModule, sqlModule) => {
          const monaco = window.monaco;
          try {
            if (apexModule && monaco?.languages) {
              // Register Apex language (basic monarch tokenizer)
              monaco.languages.register({ id: 'apex' });
              if (apexModule.language) monaco.languages.setMonarchTokensProvider('apex', apexModule.language);
              if (apexModule.conf) monaco.languages.setLanguageConfiguration('apex', apexModule.conf);
            }
          } catch {
            /* apex opcional */
          }
          try {
            if (sqlModule && monaco?.languages) {
              try {
                monaco.languages.register({ id: 'sql' });
              } catch {
                /* sql ya registrado */
              }
              if (sqlModule.language) monaco.languages.setMonarchTokensProvider('sql', sqlModule.language);
              if (sqlModule.conf) monaco.languages.setLanguageConfiguration('sql', sqlModule.conf);
            }
          } catch {
            /* sql opcional */
          }
          try {
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
            monaco.editor.defineTheme('sfoc-editor-light', {
              base: 'vs',
              inherit: true,
              rules: [],
              colors: {
                'editor.background': '#f8fafc',
                'editor.foreground': '#0f172a',
                'diffEditor.insertedTextBackground': '#34d39940',
                'diffEditor.removedTextBackground': '#f43f5e38',
                'diffEditor.insertedLineBackground': '#34d39922',
                'diffEditor.removedLineBackground': '#f43f5e22',
                'diffEditor.insertedTextBorder': '#00000000',
                'diffEditor.removedTextBorder': '#00000000',
                'diffEditor.diagonalFill': '#cbd5e148',
                'editorOverviewRuler.addedForeground': '#059669cc',
                'editorOverviewRuler.deletedForeground': '#e11d48cc',
                'editorOverviewRuler.modifiedForeground': '#2563ebcc',
                'editorGutter.addedBackground': '#34d39944',
                'editorGutter.deletedBackground': '#f43f5e44',
                'editorGutter.modifiedBackground': '#3b82f644'
              }
            });
            if (monaco.editor.setTheme) {
              monaco.editor.setTheme(resolveMonacoThemeId());
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
  const th = resolveMonacoThemeId();
  return monaco.editor.create(container, {
    value: '',
    readOnly: true,
    language: 'plaintext',
    automaticLayout: true,
    minimap: { enabled: false },
    wordWrap: wrap,
    theme: th,
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
  const th = resolveMonacoThemeId();
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
    theme: th,
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
      theme: th,
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


