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
    expect(source).toContain('function selectWholeClassAndLoadMethods(classValue)');
    expect(source).toContain('selectWholeClassAndLoadMethods(cb.value);');
    expect(source).toContain('function syncActiveMethodClassToSelection()');
    expect(source).toContain('function removeClassFromRunnerSelection(className)');
    expect(source).toContain('renderMethodClassPicker();');
  });

  it('sitúa Volver en la barra superior y explica el flujo de selección', () => {
    const html = readFileSync(join(root, 'code', 'code.html'), 'utf8');
    const controls = html.indexOf('id="apexTestsControls"');
    const back = html.indexOf('id="apexTestsBackToHubBtn"');
    expect(back).toBeGreaterThan(-1);
    expect(back).toBeLessThan(controls);
    expect(html).toContain('apex-tests-runner-back-link');
    expect(html).toContain('id="apexTestsClassFilter"');
    expect(html).toContain('id="apexTestsMethodFilter"');
    expect(html).toContain('id="apexTestsMethodClassSelect"');
    expect(html).toContain('id="apexTestsSelectAllMethodsToggle"');
    expect(html).not.toContain('apexTests.selectionWorkflowHint');
    expect(html).not.toContain('apexTests.manualMethodHint');
  });
});
