import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('appComparisonToggle', () => {
  it('centraliza todos los toggles de comparación de herramientas en la cabecera', () => {
    const source = readFileSync(join(root, 'code', 'ui', 'appComparisonToggle.js'), 'utf8');
    for (const id of [
      'generatePkgCompareToggle',
      'depExplorerCompareToggle',
      'anonymousApexCompareToggle',
      'queryExplorerCompareToggle',
      'recordCompareCompareToggle',
      'permissionDiffCompareToggle',
      'orgLimitsCompareToggle'
    ]) {
      expect(source).toContain(id);
    }
  });

  it('sitúa el control clásico inmediatamente antes de Ayuda', () => {
    const html = readFileSync(join(root, 'code', 'code.html'), 'utf8');
    expect(html.indexOf('id="appComparisonToggle"')).toBeLessThan(html.indexOf('id="appHelpBtn"'));
  });

  it('también lo presenta antes de Ayuda en el Workbench', () => {
    const source = readFileSync(join(root, 'code', 'workbench', 'workbenchShell.js'), 'utf8');
    expect(source.lastIndexOf('createToolComparisonToggle()')).toBeLessThan(source.indexOf("makeIconButton('workbenchHelpBtn'"));
  });
});
