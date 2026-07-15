import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVscodeTabLabelTitle } from '../code/ui/vscodeTabs.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('vscodeTabs', () => {
  it('resolveVscodeTabLabelTitle muestra el título completo solo si está truncado', () => {
    expect(resolveVscodeTabLabelTitle('MyClass · Org Dev', true)).toBe('MyClass · Org Dev');
    expect(resolveVscodeTabLabelTitle('MyClass · Org Dev', false)).toBe('');
    expect(resolveVscodeTabLabelTitle('', true)).toBe('');
  });

  it('resolveVscodeTabLabelTitle prioriza título completo sobre pista de renombrado', () => {
    expect(resolveVscodeTabLabelTitle('Script 1', true, 'Doble clic para renombrar')).toBe('Script 1');
  });

  it('resolveVscodeTabLabelTitle usa pista de renombrado si no hay truncado', () => {
    expect(resolveVscodeTabLabelTitle('Script 1', false, 'Doble clic para renombrar')).toBe(
      'Doble clic para renombrar'
    );
  });

  it('aplica tooltip truncado en el render de pestañas', () => {
    const src = readFileSync(join(root, 'code/ui/vscodeTabs.js'), 'utf8');
    expect(src).toContain('dataset.fullLabel = buildTabLabelTooltip(tab)');
    expect(src).toContain('syncVscodeTabLabelTooltips');
    expect(src).toContain('scrollWidth > labelEl.clientWidth');
  });
});
