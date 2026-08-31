import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('aviso de cambios en Workbench', () => {
  it('explica el impacto y ofrece el detalle mediante tooltip accesible', () => {
    const source = readFileSync(join(root, 'code', 'workbench', 'workbenchShell.js'), 'utf8');
    expect(source).toContain("'workbench.risk.writeHint'");
    expect(source).toContain("risk.setAttribute('aria-label'");
    expect(source).toContain('risk.dataset.tooltip');
    expect(source).not.toContain('workbench-risk-badge-label');
    expect(source).not.toContain('risk.title = riskHint');
  });
});
