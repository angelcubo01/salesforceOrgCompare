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
  resolveParentContainers,
  resolvePermissionContainer
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
});
