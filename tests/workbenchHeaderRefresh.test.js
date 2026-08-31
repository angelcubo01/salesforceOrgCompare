import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('actualización de acciones de cabecera', () => {
  it('observa también el panel de la herramienta y reconstruye la cabecera tras navegar', () => {
    const source = readFileSync(join(root, 'code', 'workbench', 'workbenchShell.js'), 'utf8');
    expect(source).toContain("if (current.classList?.contains('sfoc-tool-panel')) break;");
    expect(source).toContain('headerRenderSignature = \'\';\n    renderWorkbenchShell();');
  });
  it('vuelve a pintar la cabecera cuando termina de montar Inicio o una herramienta', () => {
    const shell = readFileSync(join(root, 'code', 'workbench', 'workbenchShell.js'), 'utf8');
    const artifactUi = readFileSync(join(root, 'code', 'ui', 'artifactTypeUi.js'), 'utf8');
    expect(shell).toContain("document.addEventListener('sfoc:artifact-ui-applied', syncFromLegacyNavigation);");
    expect(shell).toContain("if (event?.type === 'sfoc:artifact-ui-applied')");
    expect(artifactUi.match(/new CustomEvent\('sfoc:artifact-ui-applied'\)/g)).toHaveLength(2);
  });
});
