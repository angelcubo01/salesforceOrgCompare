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

const migratedFiles = [
  ['code/setup/setupListeners.js', '../code/setup/setupListeners.js'],
  ['popup/settings.js', '../popup/settings.js']
];

describe('tool confirmations', () => {
  it('no usa confirmaciones nativas en herramientas fuera del Comparator', async () => {
    for (const file of migratedTools) {
      const source = await readFile(new URL(`../code/ui/${file}`, import.meta.url), 'utf8');
      expect(source, file).not.toContain('window.confirm(');
    }
  });

  it('también elimina confirmaciones nativas en setup y ajustes', async () => {
    for (const [label, relativePath] of migratedFiles) {
      const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
      expect(source, label).not.toContain('window.confirm(');
    }
  });
});
