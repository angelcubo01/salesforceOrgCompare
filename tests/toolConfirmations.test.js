import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migratedTools = [
  'anonymousApexPanel.js',
  'apexTestsHubRuns.js',
  'apexTestsPanel.js',
  'dataWorkbenchPanel.js',
  'debugLogBrowserPanel.js',
  'debugLogViewTracesModal.js',
  'deployStatusPanel.js',
  'eventMonitorPanel.js',
  'lightningQuickEditPanel.js',
  'queryExplorerPanel.js',
  'quickEditPanel.js',
  'restExplorerPanel.js'
];

describe('tool confirmations', () => {
  it('no usa confirmaciones nativas en herramientas fuera del Comparator', async () => {
    for (const file of migratedTools) {
      const source = await readFile(new URL(`../code/ui/${file}`, import.meta.url), 'utf8');
      expect(source, file).not.toContain('window.confirm(');
    }
  });

  it('mantiene la excepción interna del Comparator fuera de la migración', async () => {
    const source = await readFile(new URL('../code/setup/setupListeners.js', import.meta.url), 'utf8');
    expect(source).toContain('window.confirm(');
  });
});
