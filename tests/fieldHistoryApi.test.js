import { describe, it, expect } from 'vitest';
import {
  historySobjectApiName,
  historyParentFieldName,
  buildFieldHistorySoql,
  extractTrackedFieldsFromDescribe,
  mergeTrackedFieldLists,
  historyQueryableFromDescribeChildRels,
  isValidSalesforceRecordId,
  toSoqlDateTimeLiteral
} from '../shared/fieldHistoryApi.js';

describe('historySobjectApiName', () => {
  it('mapea objetos estándar', () => {
    expect(historySobjectApiName('Account')).toBe('AccountHistory');
    expect(historySobjectApiName('Case')).toBe('CaseHistory');
  });

  it('mapea objetos custom', () => {
    expect(historySobjectApiName('MyObj__c')).toBe('MyObj__History');
  });
});

describe('historyParentFieldName', () => {
  it('usa ObjectId en estándar', () => {
    expect(historyParentFieldName('Account')).toBe('AccountId');
  });

  it('usa ParentId en custom', () => {
    expect(historyParentFieldName('MyObj__c')).toBe('ParentId');
  });
});

describe('buildFieldHistorySoql', () => {
  it('construye SOQL básico', () => {
    const soql = buildFieldHistorySoql({
      historyObject: 'AccountHistory',
      parentField: 'AccountId',
      recordId: '001xx000003DGbQ',
      sinceIso: '2025-01-01T00:00:00.000Z',
      untilIso: '2025-06-03T12:00:00.000Z',
      limit: 100
    });
    expect(soql).toContain('FROM AccountHistory');
    expect(soql).toContain("AccountId = '001xx000003DGbQ'");
    expect(soql).toContain('CreatedDate >=');
    expect(soql).toContain('LIMIT 100');
  });

  it('escapa comillas en record id y filtra campos', () => {
    const soql = buildFieldHistorySoql({
      historyObject: 'CaseHistory',
      parentField: 'CaseId',
      recordId: "500'x",
      sinceIso: '2025-01-01T00:00:00.000Z',
      untilIso: '2025-06-03T12:00:00.000Z',
      fieldNames: ["Status", "Owner"]
    });
    expect(soql).toContain("CaseId = '500\\'x'");
    expect(soql).toContain("Field IN ('Status', 'Owner')");
  });
});

describe('mergeTrackedFieldLists', () => {
  it('une describe y FieldDefinition sin duplicar', () => {
    const merged = mergeTrackedFieldLists(
      [{ apiName: 'Name', label: 'Name', type: 'string', trackHistory: true }],
      [{ apiName: 'OwnerId', label: 'Owner', type: 'reference', trackHistory: true }]
    );
    expect(merged).toHaveLength(2);
    expect(merged.map((r) => r.apiName).sort()).toEqual(['Name', 'OwnerId']);
  });
});

describe('historyQueryableFromDescribeChildRels', () => {
  it('detecta childSObject AccountHistory', () => {
    const ok = historyQueryableFromDescribeChildRels(
      { childRelationships: [{ childSObject: 'AccountHistory', relationshipName: 'Histories' }] },
      'AccountHistory'
    );
    expect(ok).toBe(true);
  });
});

describe('extractTrackedFieldsFromDescribe', () => {
  it('filtra solo trackHistory true', () => {
    const rows = extractTrackedFieldsFromDescribe({
      fields: [
        { name: 'Name', label: 'Name', type: 'string', trackHistory: false },
        { name: 'Status', label: 'Status', type: 'picklist', trackHistory: true },
        { name: 'OwnerId', label: 'Owner', type: 'reference', trackHistory: true }
      ]
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.apiName)).toEqual(['OwnerId', 'Status']);
  });
});

describe('isValidSalesforceRecordId', () => {
  it('acepta 15 y 18 caracteres', () => {
    expect(isValidSalesforceRecordId('001xx000003DGbQ')).toBe(true);
    expect(isValidSalesforceRecordId('001xx000003DGbQAAW')).toBe(true);
    expect(isValidSalesforceRecordId('short')).toBe(false);
    expect(isValidSalesforceRecordId('')).toBe(false);
  });
});

describe('toSoqlDateTimeLiteral', () => {
  it('formatea ISO sin milisegundos', () => {
    expect(toSoqlDateTimeLiteral('2025-01-15T10:30:00.000Z')).toBe('2025-01-15T10:30:00Z');
  });
});
