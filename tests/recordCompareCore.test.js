import { describe, it, expect } from 'vitest';
import {
  buildRecordCompareFieldList,
  buildSoqlSelectList,
  buildRecordCompareRows,
  filterCompareRows,
  filterCompareRowsBySearch,
  pickReferenceDisplayPath,
  enrichReferenceDisplayPaths
} from '../shared/recordCompareCore.js';

const describeFields = [
  { name: 'Id', type: 'id', label: 'Record ID' },
  { name: 'Name', type: 'string', label: 'Name' },
  { name: 'AccountId', type: 'reference', label: 'Account ID', relationshipName: 'Account', referenceTo: ['Account'] },
  { name: 'OwnerId', type: 'reference', label: 'Owner ID', relationshipName: 'Owner', referenceTo: ['User'] },
  { name: 'Amount', type: 'currency', label: 'Amount' },
  { name: 'CreatedDate', type: 'datetime', label: 'Created Date' },
  { name: 'Custom__c', type: 'string', label: 'Custom', custom: true }
];

describe('recordCompareCore', () => {
  it('buildRecordCompareFieldList excludes Id and audit fields, includes references as display paths', () => {
    const list = buildRecordCompareFieldList(describeFields);
    const apiNames = list.map((f) => (f.isReference ? f.idField : f.apiName));
    expect(apiNames).not.toContain('Id');
    expect(apiNames).not.toContain('CreatedDate');
    expect(apiNames).toContain('Name');
    expect(apiNames).toContain('Amount');
    expect(apiNames).toContain('Custom__c');
    expect(apiNames).toContain('AccountId');
    expect(apiNames).not.toContain('OwnerId');
    const account = list.find((f) => f.idField === 'AccountId');
    expect(account?.displayPath).toBeUndefined();
  });

  it('pickReferenceDisplayPath uses CaseNumber for Case', () => {
    const caseDescribe = {
      nameFields: ['CaseNumber'],
      fields: [
        { name: 'CaseNumber', type: 'string', readable: true },
        { name: 'Subject', type: 'string', readable: true }
      ]
    };
    expect(pickReferenceDisplayPath('MasterRecord', caseDescribe)).toBe('MasterRecord.CaseNumber');
  });

  it('enrichReferenceDisplayPaths resolves Account.Name and MasterRecord.CaseNumber', () => {
    const list = buildRecordCompareFieldList([
      ...describeFields,
      {
        name: 'MasterRecordId',
        type: 'reference',
        label: 'Parent Case',
        relationshipName: 'MasterRecord',
        referenceTo: ['Case']
      }
    ]);
    const describes = new Map([
      [
        'Account',
        { nameFields: ['Name'], fields: [{ name: 'Name', type: 'string', readable: true }] }
      ],
      [
        'Case',
        {
          nameFields: ['CaseNumber'],
          fields: [{ name: 'CaseNumber', type: 'string', readable: true }]
        }
      ]
    ]);
    const enriched = enrichReferenceDisplayPaths(list, describes);
    expect(enriched.find((f) => f.idField === 'AccountId')?.displayPath).toBe('Account.Name');
    expect(enriched.find((f) => f.idField === 'MasterRecordId')?.displayPath).toBe(
      'MasterRecord.CaseNumber'
    );
  });

  it('buildSoqlSelectList includes relationship names and id fields for lookups', () => {
    const list = buildRecordCompareFieldList(describeFields);
    const describes = new Map([
      ['Account', { nameFields: ['Name'], fields: [{ name: 'Name', type: 'string', readable: true }] }]
    ]);
    const enriched = enrichReferenceDisplayPaths(list, describes);
    const soql = buildSoqlSelectList(enriched);
    expect(soql).toContain('Name');
    expect(soql).toContain('Account.Name');
    expect(soql).toContain('AccountId');
    expect(soql.split(', ')).not.toContain('Id');
  });

  it('buildRecordCompareRows reports no diff when lookup Ids differ but names match', () => {
    const list = buildRecordCompareFieldList(describeFields);
    const fieldMeta = enrichReferenceDisplayPaths(
      list,
      new Map([
        ['Account', { nameFields: ['Name'], fields: [{ name: 'Name', type: 'string', readable: true }] }]
      ])
    );
    const left = {
      Name: 'Opp A',
      Amount: 100,
      AccountId: '001LEFT000000001',
      Account: { Name: 'Acme' }
    };
    const right = {
      Name: 'Opp A',
      Amount: 100,
      AccountId: '001RIGHT00000001',
      Account: { Name: 'Acme' }
    };
    const rows = buildRecordCompareRows(left, right, fieldMeta);
    const accountRow = rows.find((r) => r.fieldApiName === 'Account');
    expect(accountRow?.isDiff).toBe(false);
    expect(accountRow?.leftLookupId).toBe('001LEFT000000001');
    expect(accountRow?.rightLookupId).toBe('001RIGHT00000001');
  });

  it('buildRecordCompareRows reports diff when lookup names differ', () => {
    const list = buildRecordCompareFieldList(describeFields);
    const fieldMeta = enrichReferenceDisplayPaths(
      list,
      new Map([
        ['Account', { nameFields: ['Name'], fields: [{ name: 'Name', type: 'string', readable: true }] }]
      ])
    );
    const left = {
      Name: 'Opp A',
      AccountId: '001LEFT',
      Account: { Name: 'Acme' }
    };
    const right = {
      Name: 'Opp A',
      AccountId: '001RIGHT',
      Account: { Name: 'Globex' }
    };
    const rows = buildRecordCompareRows(left, right, fieldMeta);
    const accountRow = rows.find((r) => r.fieldApiName === 'Account');
    expect(accountRow?.isDiff).toBe(true);
    expect(accountRow?.expandable).toBe(true);
  });

  it('buildRecordCompareRows never includes Id as a comparable row', () => {
    const fieldMeta = buildRecordCompareFieldList(describeFields);
    const rows = buildRecordCompareRows({ Id: '001xx', Name: 'X' }, { Id: '001yy', Name: 'X' }, fieldMeta);
    expect(rows.some((r) => r.fieldApiName === 'Id')).toBe(false);
  });

  it('filterCompareRows keeps only differing rows when diffOnly', () => {
    const fieldMeta = buildRecordCompareFieldList(describeFields);
    const rows = buildRecordCompareRows(
      { Name: 'A', Amount: 1, Account: { Name: 'X' }, AccountId: '001' },
      { Name: 'A', Amount: 2, Account: { Name: 'X' }, AccountId: '002' },
      fieldMeta
    );
    const filtered = filterCompareRows(rows, true);
    expect(filtered.every((r) => r.isDiff)).toBe(true);
    expect(filtered.some((r) => r.fieldApiName === 'Amount')).toBe(true);
    expect(filtered.some((r) => r.fieldApiName === 'Name')).toBe(false);
  });

  it('filterCompareRowsBySearch matches label or API name', () => {
    const rows = [
      {
        fieldApiName: 'AccountId',
        fieldLabel: 'Cuenta',
        leftDisplay: 'A',
        rightDisplay: 'B',
        isDiff: true,
        isReference: true,
        expandable: false,
        leftLookupId: null,
        rightLookupId: null,
        referenceTo: []
      },
      {
        fieldApiName: 'Status',
        fieldLabel: 'Estado',
        leftDisplay: 'Open',
        rightDisplay: 'Closed',
        isDiff: true,
        isReference: false,
        expandable: false,
        leftLookupId: null,
        rightLookupId: null,
        referenceTo: []
      }
    ];
    expect(filterCompareRowsBySearch(rows, 'cuenta')).toHaveLength(1);
    expect(filterCompareRowsBySearch(rows, 'AccountId')[0].fieldApiName).toBe('AccountId');
    expect(filterCompareRowsBySearch(rows, '')).toHaveLength(2);
    expect(filterCompareRowsBySearch(rows, 'zzz')).toHaveLength(0);
  });
});
