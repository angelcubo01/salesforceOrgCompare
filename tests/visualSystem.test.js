import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const expectedHtml = [
  'code/apex-coverage-viewer.html',
  'code/apex-log-viewer.html',
  'code/apex-source-viewer.html',
  'code/code.html',
  'popup/popup.html',
  'popup/settings.html'
];
const standaloneHtml = expectedHtml.filter((file) => file !== 'code/code.html');

function collectHtml(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ['.git', 'dist', 'node_modules', 'test-results'].includes(entry.name)) continue;
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) collectHtml(absolute, out);
    else if (entry.name.endsWith('.html')) out.push(relative(root, absolute).replaceAll('\\', '/'));
  }
  return out;
}

describe('inventario y sistema visual global', () => {
  it('mantiene inventariados todos los documentos HTML fuente', () => {
    expect(collectHtml(root).sort()).toEqual(expectedHtml);
  });

  it('hace opt-in explícito en páginas independientes y comparte la hoja global', () => {
    for (const file of standaloneHtml) {
      const html = readFileSync(join(root, file), 'utf8');
      expect(html, file).toMatch(/<html[^>]+data-sfoc-document=/);
      expect(html, file).toContain('shared/sfoc-design-system.css');
    }
  });

  it('carga tokens en la aplicación sin convertir Classic en una superficie opt-in', () => {
    const html = readFileSync(join(root, 'code/code.html'), 'utf8');
    expect(html).toContain('../shared/sfoc-design-system.css');
    expect(html).not.toMatch(/<html[^>]+data-sfoc-document=/);

    const css = readFileSync(join(root, 'shared/sfoc-design-system.css'), 'utf8');
    expect(css).toContain("body[data-ui-mode='v2']");
    expect(css).not.toContain("body[data-ui-mode='classic']");
    expect(css).not.toMatch(/(^|\n)\s*:root\s*\{/);
  });

  it('define todos los tokens semánticos solicitados en claro y oscuro', () => {
    const css = readFileSync(join(root, 'shared/sfoc-design-system.css'), 'utf8');
    for (const token of [
      'canvas', 'surface', 'text', 'text-secondary', 'text-disabled', 'border', 'focus',
      'selection', 'hover', 'success', 'warning', 'danger', 'info', 'production', 'sandbox',
      'readonly', 'code-added', 'code-removed'
    ]) {
      expect(css, token).toContain(`--sfoc-color-${token}`);
    }
    for (const token of ['shadow-sm', 'shadow-md', 'radius-sm', 'radius-md', 'space-1', 'control-height']) {
      expect(css, token).toContain(`--sfoc-${token}`);
    }
  });

  it('no referencia scripts, estilos, fuentes o imágenes remotas desde HTML', () => {
    for (const file of expectedHtml) {
      const html = readFileSync(join(root, file), 'utf8');
      const resources = [...html.matchAll(/<(?:link|script|img)\b[^>]+(?:href|src)=["']([^"']+)["']/gi)]
        .map((match) => match[1])
        .filter((url) => /^https?:/i.test(url));
      expect(resources, file).toEqual([]);
    }
  });

  it('mantiene namespaced la interfaz inyectada en Salesforce', () => {
    const css = readFileSync(join(root, 'sfInject/content/styles.css'), 'utf8');
    expect(css).not.toMatch(/(^|\n)\s*(?:button|input|select|textarea|table|div)\b[^,{]*\{/);
    expect(css).toContain('.sfoc-inject-toast');
    expect(css).toContain('.sfoc-utf-filter');
    expect(readFileSync(join(root, 'manifest.json'), 'utf8')).toContain('sfInject/content/styles.css');
  });

  it('mantiene autocontenido y tokenizado el informe HTML descargable', () => {
    const source = readFileSync(join(root, 'code/editor/exportDiffHtml.js'), 'utf8');
    expect(source).toContain('<!DOCTYPE html>');
    expect(source).toContain('prefers-color-scheme: dark');
    expect(source).toContain('--add-bg:');
    expect(source).toContain('--rem-bg:');
    expect(source).not.toMatch(/linear-gradient\(/);
    expect(source).not.toMatch(/<(?:link|script|img)\b[^>]+(?:href|src)=["']https?:/i);
  });

  it('documenta puntos dinámicos y controladores de cada familia visual', () => {
    for (const file of [
      'code/ui/sfocModal.js',
      'code/ui/toast.js',
      'code/ui/quickOpen.js',
      'code/ui/driverOnboarding.js',
      'code/ui/debugLogBrowserPanel.js',
      'code/lib/apexLogViewer/tabHelpModal.js',
      'code/lib/logi/logiAdvisorModal.js',
      'popup/popupWelcome.js',
      'popup/popupHelp.js',
      'sfInject/content/ui.js'
    ]) {
      expect(existsSync(join(root, file)), file).toBe(true);
    }
  });
});
