import { describe, expect, it } from 'vitest';
import {
  buildRecordViewerQuickActionUpdates,
  groupRecordViewerQuickActionUpdates,
  mergeRecordViewerQuickActions,
  normalizeRecordViewerQuickActions,
  recordViewerQuickActionsFor,
  recordViewerTargetPathKey
} from '../shared/recordViewerQuickActions.js';

describe('Record Viewer Quick Actions', () => {
  const actions = [
    {
      id: 'case-close',
      name: 'Cerrar caso',
      environmentIds: ['00D000000000001', '00D000000000002'],
      objectApiName: 'Case',
      operations: [
        { id: 'status', path: [], field: 'Status', value: 'Closed' },
        { id: 'risk', path: ['CaseExtension__c'], field: 'Risk__c', value: 'High' }
      ]
    },
    {
      id: 'global-flag',
      name: 'Marcar revisión',
      environmentIds: ['00D000000000001'],
      objectApiName: '*',
      operations: [{ path: [], field: 'Reviewed__c', value: true }]
    }
  ];

  it('normaliza acciones con actualizaciones del registro y de relaciones', () => {
    const normalized = normalizeRecordViewerQuickActions(actions);
    expect(normalized).toHaveLength(2);
    expect(normalized[0].environmentIds).toEqual(['00D000000000001', '00D000000000002']);
    expect(normalized[0].operations[1]).toMatchObject({ path: ['CaseExtension__c'], field: 'Risk__c', value: 'High' });
  });

  it('filtra por entorno seleccionado y objeto actual', () => {
    expect(recordViewerQuickActionsFor(actions, '00D000000000001', 'Case').map((action) => action.id)).toEqual(['case-close', 'global-flag']);
    expect(recordViewerQuickActionsFor(actions, '00D000000000001', 'Contact').map((action) => action.id)).toEqual(['global-flag']);
    expect(recordViewerQuickActionsFor(actions, '00D000000000002', 'Case').map((action) => action.id)).toEqual(['case-close']);
    expect(recordViewerQuickActionsFor(actions, '00D999999999999', 'Case')).toEqual([]);
  });

  it('migra reglas existentes limitadas a una única org', () => {
    const migrated = normalizeRecordViewerQuickActions([{
      id: 'old-action', name: 'Anterior', orgId: '00D000000000001', objectApiName: 'Case',
      operations: [{ field: 'Status', value: 'Closed' }]
    }]);
    expect(migrated[0].environmentIds).toEqual(['00D000000000001']);
  });

  it('combina backups sustituyendo las acciones con el mismo id', () => {
    const merged = mergeRecordViewerQuickActions(actions, [{
      id: 'case-close', name: 'Cerrar y clasificar', environmentIds: ['00D000000000002'], objectApiName: 'Case',
      operations: [{ field: 'Status', value: 'Closed' }]
    }]);
    expect(merged).toHaveLength(2);
    expect(merged.find((action) => action.id === 'case-close')).toMatchObject({
      name: 'Cerrar y clasificar', environmentIds: ['00D000000000002']
    });
  });

  it('agrupa varios campos por registro objetivo', () => {
    expect(groupRecordViewerQuickActionUpdates([
      { path: [], field: 'Status', value: 'Closed' },
      { path: ['CaseExtension__c'], field: 'Risk__c', value: 'High' },
      { path: ['CaseExtension__c'], field: 'Reviewed__c', value: true }
    ])).toEqual([
      { path: [], fields: { Status: 'Closed' } },
      { path: ['CaseExtension__c'], fields: { Risk__c: 'High', Reviewed__c: true } }
    ]);
    expect(recordViewerTargetPathKey(['CaseExtension__c', 'OwnerId'])).toBe('CaseExtension__c.OwnerId');
  });

  it('prepara la ejecución inmediata con los valores base de la org', () => {
    const updates = buildRecordViewerQuickActionUpdates([
      {
        operation: { path: [], field: 'Status', value: 'Closed' },
        context: { record: { Id: '500000000000001AAA', Status: 'Working', LastModifiedDate: '2026-10-19T10:00:00.000Z' } }
      },
      {
        operation: { path: ['CaseExtension__c'], field: 'Risk__c', value: 'High' },
        context: { record: { Id: 'a2J000000000001AAA', Risk__c: 'Medium', LastModifiedDate: '2026-10-19T10:01:00.000Z' } }
      }
    ]);

    expect(updates).toEqual([
      { path: [], recordId: '500000000000001AAA', fields: { Status: 'Closed' }, baseValues: { Status: 'Working' }, lastModifiedDate: '2026-10-19T10:00:00.000Z' },
      { path: ['CaseExtension__c'], recordId: 'a2J000000000001AAA', fields: { Risk__c: 'High' }, baseValues: { Risk__c: 'Medium' }, lastModifiedDate: '2026-10-19T10:01:00.000Z' }
    ]);
  });
});
