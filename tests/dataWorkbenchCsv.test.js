import { describe, expect, it } from 'vitest';
import { detectImportFormat, mapColumns, parseCsv, parseImportData } from '../shared/dataWorkbenchCsv.js';

describe('dataWorkbenchCsv', () => {
  it('parses simple CSV', () => {
    const csv = parseCsv('Name,Amount\nA,1\nB,2');
    expect(csv.headers).toEqual(['Name', 'Amount']);
    expect(csv.rows).toHaveLength(2);
  });

  it('maps columns to Salesforce fields', () => {
    const rows = mapColumns(['Name'], [['X']], { Name: 'Name' });
    expect(rows[0].Name).toBe('X');
  });

  it('detectImportFormat reconoce JSON y TSV', () => {
    expect(detectImportFormat('[{"Id":"001"}]')).toBe('json');
    expect(detectImportFormat('A\tB\n1\t2')).toBe('excel');
    expect(detectImportFormat('A,B\n1,2')).toBe('csv');
  });

  it('parseImportData parsea JSON', () => {
    const data = parseImportData('[{"Name":"Acme","Id":"001"}]');
    expect(data.format).toBe('json');
    expect(data.headers).toContain('Name');
    expect(data.rows[0][data.headers.indexOf('Name')]).toBe('Acme');
  });
});
