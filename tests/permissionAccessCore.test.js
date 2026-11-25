import { describe, expect, it } from 'vitest';
import {
  applyPermissionDependencies,
  buildPermissionPreview,
  normalizePermissionOperations,
  resolveDesiredPermissions
} from '../shared/permissionAccessCore.js';

describe('permission access core', () => {
  it('aplica dependencias al conceder y retirar permisos de objeto', () => {
    expect(applyPermissionDependencies({ type: 'object' }, { modifyAllRecords: true })).toMatchObject({
      read: true, create: true, edit: true, delete: true, viewAllRecords: true, modifyAllRecords: true
    });
    expect(resolveDesiredPermissions(
      { type: 'object' },
      { read: true, edit: true, delete: true },
      { read: 'revoke' }
    )).toMatchObject({ read: false, edit: false, delete: false });
  });

  it('Field Edit implica Field Read y retirar Read retira Edit', () => {
    expect(resolveDesiredPermissions({ type: 'field' }, {}, { edit: 'grant' }))
      .toEqual({ read: true, edit: true });
    expect(resolveDesiredPermissions({ type: 'field' }, { read: true, edit: true }, { read: 'revoke' }))
      .toEqual({ read: false, edit: false });
  });

  it('distingue no-op de cambios normalizados', () => {
    const [operation] = normalizePermissionOperations([{
      operationId: 'one', target: { type: 'PermissionSet', id: '0PS1' },
      resource: { type: 'field', objectApiName: 'Account', fieldApiName: 'Name' },
      desired: { read: 'keep', edit: 'keep' }
    }]);
    expect(buildPermissionPreview(operation, { read: true, edit: false }).status).toBe('unchanged');
    expect(buildPermissionPreview({ ...operation, desired: { read: 'grant', edit: 'grant' } }, {}).status).toBe('pending');
  });
});
