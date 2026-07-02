import { describe, it, expect } from 'vitest';
import {
  historySobjectApiName,
  historyParentFieldName,
  buildFieldHistorySoql,
  extractTrackedFieldsFromDescribe,
  mergeTrackedFieldLists,
  historyQueryableFromDescribeChildRels,
  isValidSalesforceRecordId,
  toSoqlDateTimeLiteral,
  expandTrackedFieldsForHistorySoql,
  parseSalesforceDateTime,
  fieldHistoryDisplayLabel,
  formatFieldHistoryValue
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
      fieldNames: ['Status', 'Owner']
    });
    expect(soql).toContain("CaseId = '500\\'x'");
    expect(soql).toContain("Field IN ('Status', 'Owner')");
  });

  it('admite varios tokens por campo en el filtro Field', () => {
    const soql = buildFieldHistorySoql({
      historyObject: 'CaseHistory',
      parentField: 'CaseId',
      recordId: '500xx0000000001',
      sinceIso: '2025-01-01T00:00:00.000Z',
      untilIso: '2025-06-03T12:00:00.000Z',
      fieldNames: ['Owner', 'OwnerId']
    });
    expect(soql).toContain("Field IN ('Owner', 'OwnerId')");
  });
});

describe('expandTrackedFieldsForHistorySoql', () => {
  const tracked = [
    { apiName: 'OwnerId', label: 'Owner', type: 'reference' },
    { apiName: 'AV_Cliente__c', label: 'Cliente AV', type: 'boolean' }
  ];

  it('incluye API name y etiqueta para filtros SOQL', () => {
    const names = expandTrackedFieldsForHistorySoql(['OwnerId'], tracked);
    expect(names.sort()).toEqual(['Owner', 'OwnerId']);
  });

  it('acepta selección por etiqueta', () => {
    const names = expandTrackedFieldsForHistorySoql(['Owner'], tracked);
    expect(names.sort()).toEqual(['Owner', 'OwnerId']);
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

describe('parseSalesforceDateTime', () => {
  it('parsea fechas REST con offset +0000', () => {
    const d = parseSalesforceDateTime('2026-06-16T07:56:29.000+0000');
    expect(d).toBeInstanceOf(Date);
    expect(d?.toISOString()).toBe('2026-06-16T07:56:29.000Z');
  });

  it('devuelve null para valores vacíos o inválidos', () => {
    expect(parseSalesforceDateTime('')).toBeNull();
    expect(parseSalesforceDateTime('not-a-date')).toBeNull();
  });
});

describe('fieldHistoryDisplayLabel', () => {
  const tracked = [
    { apiName: 'LastName', label: 'Apellidos' },
    { apiName: 'AV_Cliente__c', label: 'Es cliente' }
  ];

  it('muestra etiqueta y API cuando difieren', () => {
    expect(fieldHistoryDisplayLabel('AV_Cliente__c', tracked)).toBe('Es cliente (AV_Cliente__c)');
  });

  it('resuelve por API name o etiqueta', () => {
    expect(fieldHistoryDisplayLabel('LastName', tracked)).toBe('Apellidos (LastName)');
    expect(fieldHistoryDisplayLabel('Unknown__c', tracked)).toBe('Unknown__c');
  });
});

describe('formatFieldHistoryValue', () => {
  it('formatea booleanos y null como en AccountHistory', () => {
    expect(formatFieldHistoryValue(false)).toBe('false');
    expect(formatFieldHistoryValue(true)).toBe('true');
    expect(formatFieldHistoryValue(null)).toBe('');
    expect(formatFieldHistoryValue('GISELA RUZAFA AMADO')).toBe('GISELA RUZAFA AMADO');
  });
});
