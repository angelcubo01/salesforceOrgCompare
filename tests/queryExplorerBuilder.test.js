import { describe, expect, it } from 'vitest';
import {
  buildSoqlFromBuilder,
  encodeQueryExplorerDeepLink,
  parseQueryExplorerDeepLink
} from '../shared/queryExplorerBuilder.js';

describe('queryExplorerBuilder', () => {
  it('builds SOQL with fields, where and limit', () => {
    expect(buildSoqlFromBuilder('Account', ['Id', 'Name'], 'Industry = \'Banking\'', 10)).toBe(
      "SELECT Id, Name FROM Account WHERE Industry = 'Banking' LIMIT 10"
    );
    expect(buildSoqlFromBuilder('Contact', [], '', '')).toBe('SELECT Id FROM Contact');
  });

  it('round-trips deep link query param', () => {
    const q = 'SELECT Id FROM Account LIMIT 5';
    const link = encodeQueryExplorerDeepLink(q, { api: 'rest', lang: 'soql' });
    const parsed = parseQueryExplorerDeepLink(link);
    expect(parsed?.query).toBe(q);
    expect(parsed?.api).toBe('rest');
    expect(parsed?.lang).toBe('soql');
  });
});
