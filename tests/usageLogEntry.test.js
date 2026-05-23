import { describe, it, expect } from 'vitest';
import { pickUsageLogEntry } from '../shared/usageLogEntry.js';

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
