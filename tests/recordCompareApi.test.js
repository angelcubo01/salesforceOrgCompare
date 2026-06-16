import { describe, it, expect } from 'vitest';
import { buildFieldsSoql } from '../shared/recordCompareApi.js';

describe('recordCompareApi', () => {
  it('buildFieldsSoql uses FIELDS(ALL) without listing fields', () => {
    const soql = buildFieldsSoql('Case', '500bd00000P1ZzpAAF', 'ALL');
    expect(soql).toBe(
      "SELECT FIELDS(ALL) FROM Case WHERE Id = '500bd00000P1ZzpAAF' LIMIT 1"
    );
    expect(soql).not.toContain('MasterRecord.Name');
  });

  it('buildFieldsSoql escapes single quotes in record Id', () => {
    const soql = buildFieldsSoql('Case', "500'xx", 'ALL');
    expect(soql).toContain("Id = '500\\'xx'");
  });
});
