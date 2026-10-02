import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../shared/salesforceApi.js', () => ({
  restQuery: vi.fn(),
  restQueryAll: vi.fn(),
  restDescribeGlobal: vi.fn(),
  restDescribeSobject: vi.fn()
}));

import { restQuery, restQueryAll } from '../shared/salesforceApi.js';
import {
  fetchPermissionContainerData,
  fetchPermissionUserData,
  resolveParentContainers,
  resolvePermissionContainer,
  searchPermissionUsers
} from '../shared/permissionsDiffApi.js';

describe('permissionsDiffApi', () => {
  beforeEach(() => vi.resetAllMocks());

  it('resuelve un perfil por su nombre para consultar sus permisos', async () => {
    restQuery.mockResolvedValueOnce([{ Id: '00e000000000001', Name: 'CC_Usuario' }]);

    const result = await resolvePermissionContainer(
      'https://example.my.salesforce.com',
      'sid',
      '63.0',
      'Profile',
      'CC_Usuario'
    );

    expect(result).toEqual({
      parentId: '00e000000000001',
      profileId: '00e000000000001',
      containerType: 'Profile',
      name: 'CC_Usuario'
    });
  });

  it('filtra los permisos de perfiles por Parent.Profile.Name', async () => {
    restQuery.mockResolvedValueOnce([{ Id: '00e000000000001', Name: 'CC_Usuario' }]);
    restQueryAll.mockResolvedValue([]);

    await fetchPermissionContainerData(
      'https://example.my.salesforce.com',
      'sid',
      '63.0',
      'Profile',
      'CC_Usuario'
    );

    expect(restQueryAll).toHaveBeenNthCalledWith(
      1,
      'https://example.my.salesforce.com',
      'sid',
      '63.0',
      expect.stringContaining("FROM ObjectPermissions WHERE Parent.Profile.Name = 'CC_Usuario'")
    );
    expect(restQueryAll).toHaveBeenNthCalledWith(
      2,
      'https://example.my.salesforce.com',
      'sid',
      '63.0',
      expect.stringContaining("FROM FieldPermissions WHERE Parent.Profile.Name = 'CC_Usuario'")
    );
    expect(restQueryAll).toHaveBeenNthCalledWith(
      3,
      'https://example.my.salesforce.com',
      'sid',
      '63.0',
      expect.stringContaining("FROM SetupEntityAccess WHERE Parent.Profile.Name = 'CC_Usuario'")
    );
  });

  it('no degrada un tipo de contenedor desconocido a PermissionSet', async () => {
    await expect(fetchPermissionContainerData(
      'https://example.my.salesforce.com',
      'sid',
      '63.0',
      /** @type {any} */ ('ProfileOrPermissionSet'),
      'CC_Usuario'
    )).rejects.toThrow('must be selected from the list');
    expect(restQuery).not.toHaveBeenCalled();
    expect(restQueryAll).not.toHaveBeenCalled();
  });

  it('identifica perfiles por ProfileId al consultar permisos de objeto o campo', async () => {
    restQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        Id: '0PS000000000001',
        Name: '00e000000000001',
        IsOwnedByProfile: false,
        ProfileId: '00e000000000001',
        Profile: { Name: 'CC_Usuario' }
      }]);

    const containers = await resolveParentContainers(
      'https://example.my.salesforce.com',
      'sid',
      '63.0',
      ['0PS000000000001']
    );

    expect(restQuery).toHaveBeenNthCalledWith(
      2,
      'https://example.my.salesforce.com',
      'sid',
      '63.0',
      expect.stringContaining('ProfileId, Profile.Name')
    );
    expect(containers.get('0PS000000000001')).toMatchObject({
      containerType: 'Profile',
      name: 'CC_Usuario'
    });
  });

  it('busca usuarios activos por nombre o username', async () => {
    restQuery.mockResolvedValueOnce([{
      Id: '005000000000001',
      Name: 'Agente Contact Center',
      Username: 'agente@example.com',
      Profile: { Name: 'CC Agente' }
    }]);

    const users = await searchPermissionUsers('https://example.my.salesforce.com', 'sid', '63.0', 'agente');

    expect(users).toEqual([{
      id: '005000000000001',
      name: 'Agente Contact Center',
      username: 'agente@example.com',
      profileName: 'CC Agente'
    }]);
    expect(restQuery).toHaveBeenCalledWith(
      'https://example.my.salesforce.com',
      'sid',
      '63.0',
      expect.stringContaining('FROM User')
    );
  });

  it('suma perfil y permission sets directos en los permisos efectivos de un usuario', async () => {
    restQuery
      .mockResolvedValueOnce([{
        Id: '005000000000001',
        Name: 'Agente Contact Center',
        Username: 'agente@example.com',
        ProfileId: '00e000000000001',
        Profile: { Name: 'CC Agente' }
      }])
      .mockResolvedValueOnce([{ Id: '0PS000000000001' }]);
    restQueryAll
      .mockResolvedValueOnce([{
        PermissionSetId: '0PS000000000002',
        PermissionSet: { Name: 'CC_Casos', Label: 'CC Casos', IsOwnedByProfile: false }
      }])
      .mockResolvedValueOnce([{ ParentId: '0PS000000000002', SobjectType: 'Case', PermissionsRead: true }])
      .mockResolvedValueOnce([{ ParentId: '0PS000000000002', SobjectType: 'Case', Field: 'Case.Subject', PermissionsRead: true }])
      .mockResolvedValueOnce([]);

    const result = await fetchPermissionUserData(
      'https://example.my.salesforce.com',
      'sid',
      '63.0',
      '005000000000001'
    );

    expect(result.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'Profile', name: 'CC Agente' }),
      expect.objectContaining({ type: 'PermissionSet', name: 'CC Casos' })
    ]));
    expect(result.objectPermissions).toEqual([expect.objectContaining({ SobjectType: 'Case', PermissionsRead: true })]);
    expect(result.fieldPermissions).toEqual([expect.objectContaining({ Field: 'Case.Subject', PermissionsRead: true })]);
    expect(result.objectPermissions[0].sources).toEqual([
      expect.objectContaining({ type: 'PermissionSet', name: 'CC Casos', PermissionsRead: true })
    ]);
  });
});
