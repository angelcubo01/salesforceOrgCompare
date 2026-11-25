import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createMetadataZipBase64 } from '../shared/metadataRetrieve.js';
import {
  applyPermissionAccessBatch,
  applyPermissionSetOperations,
  applyProfileOperations,
  filterPermissionAccessObjects,
  patchProfilePermissionXml
} from '../shared/permissionAccessApi.js';

function previewOperation(overrides = {}) {
  return {
    operationId: 'op-1',
    target: { type: 'PermissionSet', id: '0PS1', name: 'Custom', parentId: '0PS1' },
    resource: { type: 'object', objectApiName: 'Account' },
    desired: { read: 'grant' }, current: { read: false }, final: {
      read: true, create: false, edit: false, delete: false, viewAllRecords: false,
      modifyAllRecords: false, viewAllFields: false
    }, changes: { read: { current: false, final: true } }, status: 'pending', recordId: null,
    ...overrides
  };
}

describe('permission access API', () => {
  it('revalida single-org y aplica los bloqueos de escritura en background', async () => {
    const source = await readFile(new URL('../background/messageHandlers.js', import.meta.url), 'utf8');
    const handler = source.slice(source.indexOf("case 'permissionAccess:preview'"), source.indexOf("case 'permissionsDiff:search'"));
    expect(handler).toContain('COMPARISON_MODE_NOT_SUPPORTED');
    expect(handler).toContain("featureControlBlockedResponse('deploy')");
    expect(handler).toContain("assertOrgWriteAllowed(org, sid, { action: 'deploy' })");
  });

  it('filtra objetos queryables del describe global', () => {
    expect(filterPermissionAccessObjects([
      { name: 'Account', label: 'Cuenta', queryable: true },
      { name: 'Hidden__c', label: 'Oculto', queryable: false }
    ], 'cuenta')).toEqual([{ name: 'Account', label: 'Cuenta', custom: false }]);
  });

  it('crea, actualiza y continúa un Composite después de un error individual', async () => {
    const operations = [previewOperation(), previewOperation({
      operationId: 'op-2', recordId: '110x', resource: { type: 'field', objectApiName: 'Account', fieldApiName: 'Name' },
      final: { read: true, edit: true }
    })];
    const rest = vi.fn().mockResolvedValue({ ok: true, json: { compositeResponse: [
      { httpStatusCode: 201, body: { id: '110new' } },
      { httpStatusCode: 400, body: [{ errorCode: 'INVALID_FIELD', message: 'Denied' }] }
    ] } });
    const results = await applyPermissionSetOperations('https://example.test', 'sid', '63.0', operations, { restRequestWithSid: rest });
    expect(results.map((item) => item.status)).toEqual(['success', 'failed']);
    const payload = JSON.parse(rest.mock.calls[0][4].body);
    expect(payload.allOrNone).toBe(false);
    expect(payload.compositeRequest).toHaveLength(2);
  });

  it('no envía operaciones sin cambios', async () => {
    const rest = vi.fn();
    const results = await applyPermissionSetOperations('url', 'sid', '63.0', [previewOperation({ status: 'unchanged' })], { restRequestWithSid: rest });
    expect(results[0].status).toBe('unchanged');
    expect(rest).not.toHaveBeenCalled();
  });

  it('modifica solo el nodo de perfil solicitado', () => {
    const xml = '<?xml version="1.0"?><Profile xmlns="http://soap.sforce.com/2006/04/metadata"><fieldPermissions><editable>false</editable><field>Case.Subject</field><readable>true</readable></fieldPermissions><userLicense>Salesforce</userLicense></Profile>';
    const patched = patchProfilePermissionXml(xml, [previewOperation({
      target: { type: 'Profile', id: '00e1', name: 'Agent' },
      resource: { type: 'field', objectApiName: 'Case', fieldApiName: 'Priority' },
      final: { read: true, edit: false }
    })]);
    expect(patched).toContain('<field>Case.Priority</field>');
    expect(patched).toContain('<field>Case.Subject</field>');
    expect(patched).toContain('<readable>true</readable>');
    expect(patched).toContain('<userLicense>Salesforce</userLicense>');
  });

  it('divide despliegues de perfil para aislar campos fallidos', async () => {
    const profileXml = '<?xml version="1.0"?><Profile xmlns="http://soap.sforce.com/2006/04/metadata"></Profile>';
    const zipBase64 = createMetadataZipBase64({ 'unpackaged/profiles/Agent.profile': profileXml, 'unpackaged/package.xml': '<Package />' });
    const operations = ['Name', 'Priority'].map((field, index) => previewOperation({
      operationId: `profile-${index}`, target: { type: 'Profile', id: '00e1', name: 'Agent', parentId: '0PSP' },
      resource: { type: 'field', objectApiName: 'Case', fieldApiName: field }, final: { read: true, edit: false }
    }));
    const deploy = vi.fn(async (_url, _sid, _version, zip) => {
      const call = deploy.mock.calls.length;
      if (call === 1) return { success: false, asyncId: '0AfGroup', errorMessage: 'group failed' };
      return { success: call === 2, asyncId: `0Af${call}`, errorMessage: call === 3 ? 'bad field' : '' };
    });
    const result = await applyProfileOperations('url', 'sid', '63.0', operations, {
      retrievePackageXmlZip: vi.fn().mockResolvedValue({ zipBase64 }), deployAndWait: deploy
    });
    expect(deploy).toHaveBeenCalledTimes(3);
    expect(result.results.map((item) => item.status).sort()).toEqual(['failed', 'success']);
  });

  it('combina resultados parciales sin rollback global', async () => {
    const ops = [previewOperation(), previewOperation({ operationId: 'op-2', status: 'unchanged' })];
    const result = await applyPermissionAccessBatch('url', 'sid', '63.0', [], {
      preview: vi.fn().mockResolvedValue({ results: ops }),
      restRequestWithSid: vi.fn().mockResolvedValue({ ok: true, json: { compositeResponse: [{ httpStatusCode: 204, body: null }] } })
    });
    expect(result.summary).toMatchObject({ applied: 1, unchanged: 1, failed: 0 });
  });
});
