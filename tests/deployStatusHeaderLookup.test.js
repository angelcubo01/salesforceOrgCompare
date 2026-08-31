import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('Lookup de Deployments en cabecera', () => {
  it('deleg­a la consulta al input y botón existentes', () => {
    const source = readFileSync(join(root, 'code', 'workbench', 'workbenchShell.js'), 'utf8');
    expect(source).toContain("document.getElementById('deployStatusLookupInput')");
    expect(source).toContain("document.getElementById('deployStatusLookupBtn')");
    expect(source).toContain('function createDeployStatusLookup()');
  });
});
