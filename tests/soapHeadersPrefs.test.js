import { describe, expect, it } from 'vitest';
import { parseSoapHeadersJson, normalizeSoapHeadersMap } from '../shared/soapHeadersPrefs.js';

describe('soapHeadersPrefs', () => {
  it('parses soap headers json', () => {
    expect(parseSoapHeadersJson('{"AssignmentRuleHeader":{"useDefaultRule":false}}').ok).toBe(true);
    expect(parseSoapHeadersJson('bad').ok).toBe(false);
  });

  it('normalizes storage map', () => {
    const map = normalizeSoapHeadersMap({ org1: { A: '1' }, bad: null });
    expect(map.org1.A).toBe('1');
    expect(map.bad).toBeUndefined();
  });
});
