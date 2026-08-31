import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('selector de pruebas Apex', () => {
  it('abre código con Ctrl/Cmd+clic sin confundirlo con la selección', () => {
    const source = readFileSync(join(root, 'code', 'ui', 'apexTestsPanel.js'), 'utf8');
    expect(source).toContain('function openApexSourceFromCtrlClick(event)');
    expect(source).toContain('event.ctrlKey || event.metaKey');
    expect(source).toContain('methodName ? { methodName } : {}');
    expect(source).toContain("'apex-tests-td-name apex-tests-source-target'");
  });

  it('sitúa Volver junto al selector y muestra las pistas de navegación', () => {
    const html = readFileSync(join(root, 'code', 'code.html'), 'utf8');
    const controls = html.indexOf('id="apexTestsControls"');
    const back = html.indexOf('id="apexTestsBackToHubBtn"');
    expect(back).toBeGreaterThan(controls);
    expect(html).toContain('apexTests.sourceOpenCtrlClickHint');
    expect(html).toContain('apex-tests-table-heading');
  });
});
