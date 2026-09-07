import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('actualización de acciones de cabecera', () => {
  it('observa también el panel de la herramienta y reconstruye la cabecera tras navegar', () => {
    const source = readFileSync(join(root, 'code', 'workbench', 'workbenchShell.js'), 'utf8');
    expect(source).toContain("if (current.classList?.contains('sfoc-tool-panel')) break;");
    expect(source).toContain("scheduleWorkbenchRender('navigation-complete', requestId);");
    expect(source).toContain('previousHeader.replaceWith(header)');
    expect(source).toContain('syncWorkbenchHeaderState()');
  });
  it('vuelve a pintar la cabecera cuando termina de montar Inicio o una herramienta', () => {
    const shell = readFileSync(join(root, 'code', 'workbench', 'workbenchShell.js'), 'utf8');
    const artifactUi = readFileSync(join(root, 'code', 'ui', 'artifactTypeUi.js'), 'utf8');
    expect(shell).toContain("document.addEventListener('sfoc:artifact-ui-applied', syncFromLegacyNavigation);");
    expect(shell).toContain("scheduleWorkbenchRender('artifact-ui-applied')");
    expect(artifactUi.match(/new CustomEvent\('sfoc:artifact-ui-applied'\)/g)).toHaveLength(2);
  });
  it('does not recreate cloned controls or fade the tool subbar', () => {
    const shell = readFileSync(join(root, 'code', 'workbench', 'workbenchShell.js'), 'utf8');
    const css = readFileSync(join(root, 'code', 'workbench', 'workbench-refresh.css'), 'utf8');
    expect(shell).not.toContain('button.innerHTML = source.innerHTML');
    expect(shell).toContain('host.dataset.renderSignature === signature');
    expect(css).not.toContain('.workbench-tool-subbar.is-switching { opacity: 0.45; }');
  });
});
