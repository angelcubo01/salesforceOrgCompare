import { describe, expect, it } from 'vitest';
import {
  buildChildRelationshipRows,
  buildFieldRows,
  buildRecordTypeRows,
  filterSobjects,
  filterTableRows,
  resolveObjectApiNameFromId,
  summarizeDescribe
} from '../shared/objectDescribeApi.js';

describe('objectDescribeApi', () => {
  const sobjects = [
    { name: 'Account', label: 'Account', keyPrefix: '001' },
    { name: 'Acme_Case__c', label: 'Acme Case', keyPrefix: 'a01' },
    { name: 'Contact', label: 'Contact', keyPrefix: '003' }
  ];

  it('filters by query and namespace prefix', () => {
    expect(filterSobjects(sobjects, 'acc', '').map((s) => s.name)).toEqual(['Account']);
    expect(filterSobjects(sobjects, '', 'Acme_').map((s) => s.name)).toEqual(['Acme_Case__c']);
  });

  it('resolves object from record id prefix', () => {
    expect(resolveObjectApiNameFromId(sobjects, '001xx0000000001')).toBe('Account');
    expect(resolveObjectApiNameFromId(sobjects, 'abc')).toBeNull();
  });

  it('builds field and relationship rows from describe', () => {
    const describe = {
      name: 'Account',
      label: 'Account',
      fields: [
        {
          name: 'Name',
          label: 'Name',
          type: 'string',
          custom: false,
          nillable: false,
          defaultedOnCreate: false,
          referenceTo: []
        }
      ],
      childRelationships: [{ relationshipName: 'Contacts', childSObject: 'Contact', field: 'AccountId' }],
      recordTypeInfos: [{ name: 'Master', recordTypeId: '012xx', active: true }]
    };
    expect(buildFieldRows(describe)).toHaveLength(1);
    expect(buildChildRelationshipRows(describe)[0].childSObject).toBe('Contact');
    expect(buildRecordTypeRows(describe)[0].name).toBe('Master');
    expect(summarizeDescribe(describe).fieldCount).toBe(1);
  });

  it('filters table rows across all column values', () => {
    const rows = [
      { apiName: 'Name', label: 'Account Name', type: 'string', custom: false },
      { apiName: 'Industry', label: 'Industry', type: 'picklist', custom: false }
    ];
    expect(filterTableRows(rows, 'industry')).toHaveLength(1);
    expect(filterTableRows(rows, 'account')).toHaveLength(1);
    expect(filterTableRows(rows, '')).toHaveLength(2);
  });
});
