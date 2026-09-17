import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../shared/salesforceApi.js', () => ({
  restQuery: vi.fn(),
  restQueryAll: vi.fn(),
  restDescribeGlobal: vi.fn(),
  restDescribeSobject: vi.fn()
}));

import { restQuery } from '../shared/salesforceApi.js';
import { resolvePermissionContainer } from '../shared/permissionsDiffApi.js';

describe('permissionsDiffApi', () => {
  beforeEach(() => vi.resetAllMocks());

  it('consulta permisos de un perfil mediante su Permission Set asociado', async () => {
    restQuery
      .mockResolvedValueOnce([{ Id: '00e000000000001', Name: 'CC_Usuario' }])
      .mockResolvedValueOnce([{ Id: '0PS000000000001' }]);

    const result = await resolvePermissionContainer(
      'https://example.my.salesforce.com',
      'sid',
      '63.0',
      'Profile',
      'CC_Usuario'
    );

    expect(restQuery).toHaveBeenNthCalledWith(
      2,
      'https://example.my.salesforce.com',
      'sid',
      '63.0',
      "SELECT Id FROM PermissionSet WHERE ProfileId = '00e000000000001' LIMIT 1"
    );
    expect(result).toEqual({
      parentId: '0PS000000000001',
      containerType: 'Profile',
      name: 'CC_Usuario'
    });
  });
});
