import { describe, expect, it } from 'vitest';
import { parseSoapResults } from '../shared/dataImportSoap.js';

describe('dataImportSoap', () => {
  it('parseSoapResults extrae éxito e id', () => {
    const xml = `
      <createResponse>
        <result><id>001xx</id><success>true</success></result>
        <result><success>false</success><errors><message>bad</message></errors></result>
      </createResponse>`;
    const results = parseSoapResults(xml, 2);
    expect(results[0]).toEqual({ success: true, id: '001xx', errors: undefined });
    expect(results[1].success).toBe(false);
    expect(results[1].errors).toContain('bad');
  });
});
