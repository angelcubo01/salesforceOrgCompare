import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../shared/salesforceApi.js', () => ({
  restDescribeSobject: vi.fn(),
  restGetSobject: vi.fn(),
  restQuery: vi.fn(),
  restRequestWithSid: vi.fn(),
  fetchSessionUserId: vi.fn()
}));

vi.mock('../shared/recordCompareApi.js', () => ({
  resolveObjectFromRecordId: vi.fn()
}));

import {
  fetchSessionUserId,
  restDescribeSobject,
  restGetSobject,
  restQuery,
  restRequestWithSid
} from '../shared/salesforceApi.js';
import { resolveObjectFromRecordId } from '../shared/recordCompareApi.js';
import {
  fetchRecordViewerPayload,
  fetchRecordViewerPermissionSources,
  fetchViewAllPermissions,
  patchRecordViewerRecord,
  patchRecordViewerRecords,
  resolveRecordViewerTarget
} from '../shared/recordViewerApi.js';

describe('recordViewerApi', () => {
  beforeEach(() => vi.resetAllMocks());

  it('usa Describe como FLS efectivo y conserva campos editables aunque su valor no venga informado', async () => {
    resolveObjectFromRecordId.mockResolvedValue('Case');
    fetchSessionUserId.mockResolvedValue('005000000000001AAA');
    restDescribeSobject.mockResolvedValue({
      label: 'Caso', queryable: true, updateable: true,
      fields: [
        { name: 'Subject', label: 'Asunto', updateable: true },
        { name: 'Description', label: 'Descripción', updateable: true }
      ]
    });
    restGetSobject.mockResolvedValue({ Id: '500000000000001AAA', Subject: 'Prueba' });
    restQuery.mockResolvedValue([{ HasReadAccess: true, HasEditAccess: true, HasDeleteAccess: false, HasTransferAccess: false, MaxAccessLevel: 'Edit' }]);

    const result = await fetchRecordViewerPayload('https://example.my.salesforce.com', 'sid', '63.0', '500000000000001AAA');

    expect(restGetSobject).toHaveBeenCalledTimes(1);
    expect(restQuery.mock.calls[0][3]).toContain('SELECT RecordId, HasReadAccess, HasEditAccess');
    expect(result.recordAccess).toMatchObject({ HasReadAccess: true, HasEditAccess: true, MaxAccessLevel: 'Edit' });
    expect(result.describe.fields).toEqual([
      expect.objectContaining({ name: 'Subject', accessible: true, valuePresent: true, updateable: true }),
      expect.objectContaining({ name: 'Description', accessible: true, valuePresent: false, updateable: true })
    ]);
  });

  it('incluye el perfil al calcular Ver todos y Modificar todos', async () => {
    fetchSessionUserId.mockResolvedValue('005000000000001AAA');
    restQuery
      .mockResolvedValueOnce([{ PermissionSetId: '0PS000000000001AAA' }])
      .mockResolvedValueOnce([{ ProfileId: '00e000000000001AAA' }])
      .mockResolvedValueOnce([
        { Id: '0PS000000000001AAA', PermissionsViewAllData: false, PermissionsModifyAllData: false },
        { Id: '0PS000000000002AAA', PermissionsViewAllData: false, PermissionsModifyAllData: true }
      ])
      .mockResolvedValueOnce([]);

    const result = await fetchViewAllPermissions('https://example.my.salesforce.com', 'sid', '63.0', 'Case');

    expect(restQuery.mock.calls[2][3]).toContain("ProfileId = '00e000000000001AAA'");
    expect(result).toEqual({ viewAll: false, modifyAll: true });
  });

  it('identifica el perfil y Permission Set que conceden un permiso de objeto', async () => {
    fetchSessionUserId.mockResolvedValue('005000000000001AAA');
    restQuery
      .mockResolvedValueOnce([{ ProfileId: '00e000000000001AAA', Profile: { Name: 'CC Agente' } }])
      .mockResolvedValueOnce([{ Id: '0PS000000000001AAA' }])
      .mockResolvedValueOnce([{
        PermissionSetId: '0PS000000000002AAA',
        PermissionSet: { Label: 'CC Casos', IsOwnedByProfile: false }
      }])
      .mockResolvedValueOnce([
        { ParentId: '0PS000000000001AAA', PermissionsRead: true },
        { ParentId: '0PS000000000002AAA', PermissionsRead: true }
      ]);

    const sources = await fetchRecordViewerPermissionSources(
      'https://example.my.salesforce.com', 'sid', '63.0', 'Case', 'object', '', 'read'
    );

    expect(restQuery.mock.calls[3][3]).toContain("SobjectType = 'Case'");
    expect(sources).toEqual([
      { type: 'Profile', name: 'CC Agente' },
      { type: 'PermissionSet', name: 'CC Casos' }
    ]);
  });

  it('incluye los permisos del objeto cuando el campo no tiene FLS expl\u00edcito', async () => {
    fetchSessionUserId.mockResolvedValue('005000000000001AAA');
    restQuery
      .mockResolvedValueOnce([{ ProfileId: '00e000000000001AAA', Profile: { Name: 'CC Agente' } }])
      .mockResolvedValueOnce([{ Id: '0PS000000000001AAA' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ParentId: '0PS000000000001AAA', PermissionsEdit: true }]);

    const sources = await fetchRecordViewerPermissionSources(
      'https://example.my.salesforce.com', 'sid', '63.0', 'Case', 'field', 'Subject', 'edit'
    );

    expect(restQuery.mock.calls[3][3]).toContain("Field = 'Case.Subject'");
    expect(restQuery.mock.calls[4][3]).toContain('FROM ObjectPermissions');
    expect(sources).toEqual([{ type: 'Profile', name: 'CC Agente' }]);
  });

  it('envía todos los cambios en un PATCH condicional único', async () => {
    restRequestWithSid.mockResolvedValue({ ok: true, status: 204 });

    await patchRecordViewerRecord(
      'https://example.my.salesforce.com',
      'sid',
      '63.0',
      'Case',
      '500000000000001AAA',
      { Subject: 'Nuevo', Priority: 'High' },
      '2026-10-16T08:30:00.000Z'
    );

    expect(restRequestWithSid).toHaveBeenCalledTimes(1);
    expect(restRequestWithSid).toHaveBeenCalledWith(
      'https://example.my.salesforce.com',
      'sid',
      'PATCH',
      '/services/data/v63.0/sobjects/Case/500000000000001AAA',
      {
        headers: { 'If-Unmodified-Since': 'Fri, 16 Oct 2026 08:30:00 GMT' },
        body: JSON.stringify({ Subject: 'Nuevo', Priority: 'High' })
      }
    );
  });

  it('resuelve un registro relacionado usando el lookup real del registro raíz', async () => {
    resolveObjectFromRecordId.mockResolvedValue('Case');
    fetchSessionUserId.mockResolvedValue('005000000000001AAA');
    restDescribeSobject
      .mockResolvedValueOnce({ label: 'Caso', queryable: true, updateable: true, fields: [{ name: 'CaseExtension__c', type: 'reference', referenceTo: ['CaseExtension__c'], updateable: true }] })
      .mockResolvedValueOnce({ label: 'Extensión', queryable: true, updateable: true, fields: [{ name: 'Risk__c', type: 'picklist', updateable: true }] });
    restGetSobject
      .mockResolvedValueOnce({ Id: '500000000000001AAA', CaseExtension__c: 'a2J000000000001AAA' })
      .mockResolvedValueOnce({ Id: 'a2J000000000001AAA', Risk__c: 'Medium' });
    restQuery.mockResolvedValue([{ RecordId: 'x', HasReadAccess: true, HasEditAccess: true }]);

    const target = await resolveRecordViewerTarget(
      'https://example.my.salesforce.com', 'sid', '63.0', '500000000000001AAA', ['CaseExtension__c']
    );

    expect(restGetSobject).toHaveBeenLastCalledWith(
      'https://example.my.salesforce.com', 'sid', '63.0', 'CaseExtension__c', 'a2J000000000001AAA'
    );
    expect(target.objectApiName).toBe('CaseExtension__c');
    expect(target.record.Risk__c).toBe('Medium');
  });

  it('guarda varios registros relacionados con Composite allOrNone', async () => {
    restRequestWithSid.mockResolvedValue({
      ok: true,
      status: 200,
      json: { compositeResponse: [{ httpStatusCode: 204 }, { httpStatusCode: 204 }] }
    });
    const updates = [
      { objectApiName: 'Case', recordId: '500000000000001AAA', fields: { Status: 'Closed' } },
      { objectApiName: 'CaseExtension__c', recordId: 'a2J000000000001AAA', fields: { Risk__c: 'High' } }
    ];

    const result = await patchRecordViewerRecords('https://example.my.salesforce.com', 'sid', '63.0', updates);

    expect(result.ok).toBe(true);
    const request = JSON.parse(restRequestWithSid.mock.calls[0][4].body);
    expect(request.allOrNone).toBe(true);
    expect(request.compositeRequest).toHaveLength(2);
    expect(request.compositeRequest[1]).toMatchObject({ method: 'PATCH', body: { Risk__c: 'High' } });
  });
});
