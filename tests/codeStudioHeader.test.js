import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('Code Studio en cabecera Workbench', () => {
  it('declara las acciones de edición y despliegue para Apex y Lightning', () => {
    const source = readFileSync(join(root, 'code', 'workbench', 'workspaceRegistry.js'), 'utf8');
    for (const actionId of [
      'quick-edit-save', 'quick-edit-revert', 'quick-edit-retrieve', 'quick-edit-validate', 'quick-edit-deploy', 'quick-edit-clear',
      'lightning-quick-edit-save', 'lightning-quick-edit-revert', 'lightning-quick-edit-retrieve', 'lightning-quick-edit-validate', 'lightning-quick-edit-deploy', 'lightning-quick-edit-clear'
    ]) {
      expect(source).toContain(actionId);
    }
  });

  it('sincroniza el buscador de la cabecera con el índice existente', () => {
    const shell = readFileSync(join(root, 'code', 'workbench', 'workbenchShell.js'), 'utf8');
    const search = readFileSync(join(root, 'code', 'ui', 'codeEditorSearch.js'), 'utf8');
    expect(shell).toContain("id = 'workbenchCodeStudioSearchInput'");
    expect(search).toContain('getAnchorEl');
  });

  it('no duplica la organización objetivo en la cabecera', () => {
    const shell = readFileSync(join(root, 'code', 'workbench', 'workbenchShell.js'), 'utf8');
    expect(shell).not.toContain('createCodeStudioTarget');
    expect(shell).not.toContain('workbench-code-studio-target');
  });
});
