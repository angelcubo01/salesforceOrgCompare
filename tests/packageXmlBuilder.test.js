import { describe, expect, it } from 'vitest';
import {
  escapeXmlText,
  memberLinesForSet,
  buildPackageXmlFromSelection
} from '../shared/packageXmlBuilder.js';

describe('packageXmlBuilder', () => {
  it('escapes XML special characters', () => {
    expect(escapeXmlText('a & b < c')).toBe('a &amp; b &lt; c');
  });

  it('builds wildcard type block', () => {
    const map = new Map([['ApexClass', new Set(['*'])]]);
    const xml = buildPackageXmlFromSelection(map, '59.0');
    expect(xml).toContain('<members>*</members>');
    expect(xml).toContain('<name>ApexClass</name>');
    expect(xml).toContain('<version>59.0</version>');
  });

  it('builds multi-member sorted block', () => {
    const map = new Map([['ApexClass', new Set(['Zeta', 'Alpha'])]]);
    const xml = buildPackageXmlFromSelection(map, '60.0');
    expect(xml.indexOf('Alpha')).toBeLessThan(xml.indexOf('Zeta'));
  });

  it('memberLinesForSet returns empty for empty set', () => {
    expect(memberLinesForSet(new Set())).toEqual([]);
  });
});
