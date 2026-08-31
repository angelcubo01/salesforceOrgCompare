import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('subherramientas de Workbench', () => {
  it('no las denomina vistas en la navegación', () => {
    const shell = readFileSync(join(root, 'code', 'workbench', 'workbenchShell.js'), 'utf8');
    const i18n = readFileSync(join(root, 'shared', 'i18n.js'), 'utf8');
    expect(shell).toContain("'workbench.subbar.tools'");
    expect(shell).not.toContain('workbench.subbar.views');
    expect(i18n).toContain("'workbench.subbar.tools': '{count} herramientas'");
  });
});
