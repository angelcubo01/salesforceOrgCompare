/**
 * @param {import('monaco-editor')} monaco
 */
export function registerSfocApexLogTreeLanguage(monaco) {
  if (!monaco?.languages) return;
  try {
    monaco.languages.register({ id: 'sfoc-apex-log-tree' });
  } catch {
    /* ya registrado */
  }
  monaco.languages.setMonarchTokensProvider('sfoc-apex-log-tree', {
    tokenizer: {
      root: [
        [/[├└│─]/, 'tree-line'],
        [/\[[^\]]+\]/, 'type-tag'],
        [/\(\d+(\.\d+)? (ms|s)\)/, 'duration'],
        [/— \d+ (filas|rows)/, 'rows']
      ]
    }
  });
  try {
    monaco.editor.defineTheme('sfoc-apex-log-tree-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'tree-line', foreground: '64748b' },
        { token: 'type-tag', foreground: '38bdf8', fontStyle: 'bold' },
        { token: 'duration', foreground: 'a78bfa' },
        { token: 'rows', foreground: '34d399' }
      ],
      colors: {
        'editor.background': '#0f172a',
        'editor.foreground': '#e2e8f0'
      }
    });
    monaco.editor.defineTheme('sfoc-apex-log-tree-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'tree-line', foreground: '94a3b8' },
        { token: 'type-tag', foreground: '0284c7', fontStyle: 'bold' },
        { token: 'duration', foreground: '7c3aed' },
        { token: 'rows', foreground: '059669' }
      ],
      colors: {
        'editor.background': '#f8fafc',
        'editor.foreground': '#0f172a'
      }
    });
  } catch {
    /* ignore */
  }
}

/** @param {boolean} light */
export function resolveTreeThemeId(light) {
  return light ? 'sfoc-apex-log-tree-light' : 'sfoc-apex-log-tree-dark';
}
