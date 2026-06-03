import { describe, it, expect } from 'vitest';
import { pickUsageLogEntry, usageDescriptorFromItem } from '../shared/usageLogEntry.js';

describe('pickUsageLogEntry', () => {
  it('solo incluye campos permitidos', () => {
    const picked = pickUsageLogEntry({
      kind: 'codeComparison',
      artifactType: 'ApexClass',
      leftOrgId: 'org1',
      rightOrgId: 'org2',
      leftInstanceUrl: 'https://evil.example',
      leftOrgName: 'Prod',
      sessionId: 'secret',
      extra: 'drop'
    });
    expect(picked).toEqual({
      kind: 'codeComparison',
      artifactType: 'ApexClass',
      leftOrgId: 'org1',
      rightOrgId: 'org2'
    });
  });

  it('conserva métricas numéricas y flags de resultado', () => {
    const picked = pickUsageLogEntry({
      kind: 'codeComparison',
      ok: true,
      success: false,
      leftFilesCount: 3,
      diffLines: 42,
      typesCount: 5,
      errorMessage: 'x'.repeat(600)
    });
    expect(picked.ok).toBe(true);
    expect(picked.success).toBe(false);
    expect(picked.leftFilesCount).toBe(3);
    expect(picked.diffLines).toBe(42);
    expect(picked.typesCount).toBe(5);
    expect(String(picked.errorMessage).length).toBe(500);
  });

  it('sanitiza descriptor y rechaza comparisonUrl no extension', () => {
    const picked = pickUsageLogEntry({
      kind: 'codeComparison',
      descriptor: { name: 'Foo', evil: { nested: true } },
      comparisonUrl: 'https://attacker.example/x'
    });
    expect(picked.descriptor).toEqual({ name: 'Foo' });
    expect(picked.comparisonUrl).toBeUndefined();
  });

  it('acepta comparisonUrl chrome-extension', () => {
    const url = 'chrome-extension://abc123/code/code.html?left=a';
    const picked = pickUsageLogEntry({ comparisonUrl: url });
    expect(picked.comparisonUrl).toBe(url);
  });
});

describe('usageDescriptorFromItem', () => {
  it('incluye key, fileName y name derivado', () => {
    const d = usageDescriptorFromItem({
      type: 'LWC',
      key: 'myLwc/lwcHtml',
      fileName: 'myLwc.html',
      descriptor: { name: 'myLwc' }
    });
    expect(d.key).toBe('myLwc/lwcHtml');
    expect(d.fileName).toBe('myLwc.html');
    expect(d.name).toBe('myLwc');
  });
});
