import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  COMPARISON_MODE_TOGGLE_TOOLS,
  comparisonToggleIdForTool
} from '../code/ui/appComparisonToggle.js';
import { state } from '../code/core/state.js';
import { t, setLang } from '../shared/i18n.js';

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

describe('vista única del Comparator', () => {
  it('el Comparator expone el toggle de vista única', () => {
    expect(comparisonToggleIdForTool('Comparator')).toBe('comparatorSingleViewToggle');
    expect(COMPARISON_MODE_TOGGLE_TOOLS).toContain('Comparator');
  });

  it('las herramientas con modo comparación conservan su toggle', () => {
    expect(comparisonToggleIdForTool('AnonymousApex')).toBe('anonymousApexCompareToggle');
    expect(comparisonToggleIdForTool('OrgLimits')).toBe('orgLimitsCompareToggle');
  });

  it('herramientas sin toggle devuelven null', () => {
    expect(comparisonToggleIdForTool('ApexTests')).toBeNull();
    expect(comparisonToggleIdForTool('')).toBeNull();
  });

  it('está desactivada por defecto', () => {
    expect(state.comparatorSingleView).toBe(false);
  });

  it('el toggle existe en el HTML sin estar marcado', () => {
    const html = readFileSync(join(root, 'code', 'code.html'), 'utf8');
    const input = html.match(/<input[^>]*id="comparatorSingleViewToggle"[^>]*>/)?.[0] ?? '';
    expect(input).toContain('type="checkbox"');
    expect(input).not.toContain('checked');
  });

  it('tiene textos en español e inglés', () => {
    setLang('es');
    expect(t('code.singleView')).toBe('Vista única');
    expect(t('code.singleViewTip')).not.toBe('code.singleViewTip');
    expect(t('toast.singleViewRetrieveOnly')).not.toBe('toast.singleViewRetrieveOnly');
    setLang('en');
    expect(t('code.singleView')).toBe('Single view');
    expect(t('code.singleViewTip')).not.toBe('code.singleViewTip');
    expect(t('toast.singleViewRetrieveOnly')).not.toBe('toast.singleViewRetrieveOnly');
  });
});
