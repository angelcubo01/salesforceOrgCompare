import { describe, expect, it } from 'vitest';
import {
  flattenJsonForTree,
  isRestWriteMethod,
  normalizeRestExplorerPath,
  parseRestExplorerHeaders
} from '../shared/restExplorerApi.js';

describe('restExplorerApi', () => {
  it('detects write methods', () => {
    expect(isRestWriteMethod('POST')).toBe(true);
    expect(isRestWriteMethod('get')).toBe(false);
  });

  it('parses headers JSON', () => {
    expect(parseRestExplorerHeaders('')).toEqual({ ok: true, headers: {} });
    expect(parseRestExplorerHeaders('{"A":"b"}')).toEqual({ ok: true, headers: { A: 'b' } });
    expect(parseRestExplorerHeaders('[]').ok).toBe(false);
  });

  it('flattens JSON tree', () => {
    const rows = flattenJsonForTree({ a: 1, b: { c: 'x' } });
    expect(rows.some((r) => r.path === 'a' && r.value === '1')).toBe(true);
    expect(rows.some((r) => r.path === 'b.c' && r.value === 'x')).toBe(true);
  });

  it('normalizes REST paths', () => {
    expect(normalizeRestExplorerPath('/services/data/v59.0/')).toBe('/services/data/v59.0/');
    expect(normalizeRestExplorerPath('sobjects/Account')).toBe('/sobjects/Account');
  });
});
