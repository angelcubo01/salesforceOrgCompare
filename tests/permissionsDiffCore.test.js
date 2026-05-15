import { describe, it, expect } from 'vitest';
import {
  normalizeObjectPermission,
  normalizeFieldPermission,
  diffObjectPermissions,
  diffFieldPermissions,
  comparePermissionBundles,
  buildPermissionDiffBundle,
  diffBoolFields,
  parseResourceInput,
  containerAccessKey,
  compareAccessByResourceBundles,
  buildAccessByResourceBundle,
  normalizeObjectAccessGrant,
  normalizeSetupEntityAccess,
  formatSetupEntityLabel
} from '../shared/permissionsDiffCore.js';

describe('permissionsDiffCore', () => {
  it('normalizes object permission keys', () => {
    const n = normalizeObjectPermission({
      SobjectType: 'Account',
      PermissionsRead: true,
      PermissionsCreate: false
    });
    expect(n.key).toBe('Account');
    expect(n.PermissionsRead).toBe(true);
    expect(n.PermissionsCreate).toBe(false);
  });

  it('normalizes field permission composite key', () => {
    const n = normalizeFieldPermission({
      SobjectType: 'Account',
      Field: 'Account.Name',
      PermissionsRead: true,
      PermissionsEdit: false
    });
    expect(n.key).toBe('Account.Name');
  });

  it('detects object permission diff', () => {
    const left = [normalizeObjectPermission({ SobjectType: 'Case', PermissionsRead: true })];
    const right = [normalizeObjectPermission({ SobjectType: 'Case', PermissionsRead: false })];
    const d = diffObjectPermissions(left, right);
    expect(d.summary.diff).toBe(1);
    expect(d.rows[0].status).toBe('diff');
  });

  it('detects leftOnly and rightOnly', () => {
    const left = [normalizeObjectPermission({ SobjectType: 'A', PermissionsRead: true })];
    const right = [normalizeObjectPermission({ SobjectType: 'B', PermissionsRead: true })];
    const d = diffObjectPermissions(left, right);
    expect(d.summary.leftOnly).toBe(1);
    expect(d.summary.rightOnly).toBe(1);
  });

  it('comparePermissionBundles aggregates sections', () => {
    const l = buildPermissionDiffBundle({
      objectPermissions: [{ SobjectType: 'X', PermissionsRead: true }],
      fieldPermissions: [],
      setupEntityAccess: []
    });
    const r = buildPermissionDiffBundle({
      objectPermissions: [{ SobjectType: 'X', PermissionsRead: false }],
      fieldPermissions: [],
      setupEntityAccess: []
    });
    const cmp = comparePermissionBundles(l, r);
    expect(cmp.objectPermissions.summary.diff).toBe(1);
  });

  it('parseResourceInput splits field api name', () => {
    const p = parseResourceInput('Account.Name', 'field');
    expect(p.objectApiName).toBe('Account');
    expect(p.fieldQualified).toBe('Account.Name');
  });

  it('compareAccessByResourceBundles diffs containers', () => {
    const left = buildAccessByResourceBundle({
      grants: [
        normalizeObjectAccessGrant(
          { SobjectType: 'Case', PermissionsRead: true },
          { containerType: 'Profile', name: 'Admin' }
        )
      ]
    });
    const right = buildAccessByResourceBundle({
      grants: [
        normalizeObjectAccessGrant(
          { SobjectType: 'Case', PermissionsRead: false },
          { containerType: 'Profile', name: 'Admin' }
        )
      ]
    });
    const cmp = compareAccessByResourceBundles(left, right, 'object');
    expect(cmp.summary.diff).toBe(1);
    expect(containerAccessKey({ containerType: 'Profile', name: 'Admin' })).toBe('Profile:Admin');
  });

  it('formats setup entity with resolved API name', () => {
    const n = normalizeSetupEntityAccess({
      SetupEntityType: 'ApexClass',
      SetupEntityId: '01p000000000001',
      SetupEntityName: 'MyController'
    });
    expect(n.SetupEntityName).toBe('MyController');
    expect(
      formatSetupEntityLabel(n, (type) => (type === 'ApexClass' ? 'Clase Apex' : type))
    ).toBe('Clase Apex: MyController');
  });

  it('formats custom setting via DurableId resolution as API name only', () => {
    const n = normalizeSetupEntityAccess({
      SetupEntityType: 'CustomEntityDefinition',
      SetupEntityId: '01I1t000002JdujEAC',
      SetupEntityName: 'CC_Settings__c'
    });
    expect(
      formatSetupEntityLabel(n, (type) =>
        type === 'CustomEntityDefinition' ? 'Objeto / metadato' : type
      )
    ).toBe('Objeto / metadato: CC_Settings__c');
  });

  it('diffBoolFields lists changed flags', () => {
    const ch = diffBoolFields(
      { PermissionsRead: true, PermissionsEdit: false },
      { PermissionsRead: false, PermissionsEdit: true },
      ['PermissionsRead', 'PermissionsEdit']
    );
    expect(ch).toHaveLength(2);
  });
});
