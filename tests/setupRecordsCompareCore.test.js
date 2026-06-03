import { describe, it, expect } from 'vitest';
import {
  buildCompareFieldList,
  detectRowAlignment,
  recordRowKey,
  recordRowLabel,
  normalizeFieldValue,
  diffFields,
  mergeRecordRows,
  filterMergedRows
} from '../shared/setupRecordsCompareCore.js';

const baseFields = [
  { name: 'Id', type: 'id' },
  { name: 'Name', type: 'string' },
  { name: 'SetupOwnerId', type: 'reference' },
  { name: 'DeveloperName', type: 'string' },
  { name: 'My_Field__c', type: 'string', custom: true },
  { name: 'CreatedDate', type: 'datetime' },
  { name: 'LastModifiedDate', type: 'datetime' }
];

describe('setupRecordsCompareCore', () => {
  it('detectRowAlignment uses developerName when field exists (not SetupOwnerId)', () => {
    expect(detectRowAlignment(baseFields)).toBe('developerName');
  });

  it('detectRowAlignment uses name for hierarchy custom settings (Name, no DeveloperName)', () => {
    const fields = baseFields.filter((f) => f.name !== 'DeveloperName');
    expect(detectRowAlignment(fields)).toBe('name');
  });

  it('detectRowAlignment name when only Name', () => {
    expect(detectRowAlignment([{ name: 'Name', type: 'string' }, { name: 'Foo__c', type: 'string' }])).toBe(
      'name'
    );
  });

  it('buildCompareFieldList excludes audit, Id and SetupOwnerId', () => {
    const list = buildCompareFieldList(baseFields);
    expect(list).not.toContain('Id');
    expect(list).not.toContain('SetupOwnerId');
    expect(list).not.toContain('CreatedDate');
    expect(list).toContain('Name');
    expect(list).toContain('My_Field__c');
  });

  it('recordRowKey for custom settings uses Name only', () => {
    const k = recordRowKey({ SetupOwnerId: '005xx', Name: 'Default' }, 'name');
    expect(k).toBe('Default');
  });

  it('mergeRecordRows matches same Name across orgs despite different SetupOwnerId', () => {
    const left = [{ Name: 'CC_3NClienteConfidencial', SetupOwnerId: '00DLEFT', CC_Activa__c: true }];
    const right = [{ Name: 'CC_3NClienteConfidencial', SetupOwnerId: '00DRIGHT', CC_Activa__c: true }];
    const merged = mergeRecordRows(left, right, 'name', ['CC_Activa__c']);
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('match');
    expect(merged[0].key).toBe('CC_3NClienteConfidencial');
  });

  it('recordRowKey for developerName', () => {
    expect(recordRowKey({ DeveloperName: 'Config_A' }, 'developerName')).toBe('Config_A');
  });

  it('normalizeFieldValue sorts multipicklist tokens', () => {
    expect(normalizeFieldValue('B;A')).toBe('A;B');
  });

  it('diffFields detects changes', () => {
    const d = diffFields({ Name: 'A', My_Field__c: 1 }, { Name: 'A', My_Field__c: 2 }, ['Name', 'My_Field__c']);
    expect(d).toEqual(['My_Field__c']);
  });

  it('mergeRecordRows handles leftOnly, rightOnly, diff, match', () => {
    const left = [
      { Name: 'OnlyLeft', My_Field__c: 'x' },
      { Name: 'Both', My_Field__c: '1' },
      { Name: 'Same', My_Field__c: 'y' }
    ];
    const right = [
      { Name: 'OnlyRight', My_Field__c: 'z' },
      { Name: 'Both', My_Field__c: '2' },
      { Name: 'Same', My_Field__c: 'y' }
    ];
    const merged = mergeRecordRows(left, right, 'name', ['Name', 'My_Field__c']);
    expect(merged.find((r) => r.key === 'OnlyLeft')?.status).toBe('leftOnly');
    expect(merged.find((r) => r.key === 'OnlyRight')?.status).toBe('rightOnly');
    expect(merged.find((r) => r.key === 'Both')?.status).toBe('diff');
    expect(merged.find((r) => r.key === 'Same')?.status).toBe('match');
  });

  it('filterMergedRows keeps only non-match when diffOnly', () => {
    const merged = [
      { key: 'a', status: 'match' },
      { key: 'b', status: 'diff' }
    ];
    expect(filterMergedRows(merged, true)).toHaveLength(1);
    expect(filterMergedRows(merged, false)).toHaveLength(2);
  });

  it('recordRowLabel for developerName', () => {
    expect(recordRowLabel({ DeveloperName: 'X' }, 'developerName')).toBe('X');
  });
});
