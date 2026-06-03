import { describe, it, expect, vi } from 'vitest';

vi.mock('../shared/salesforceApi.js', () => ({
  restQueryAll: vi.fn(),
  restDescribeSobject: vi.fn()
}));

import { restQueryAll } from '../shared/salesforceApi.js';
import { listCustomMetadataTypes } from '../shared/setupRecordsCompareApi.js';

describe('setupRecordsCompareApi', () => {
  it('listCustomMetadataTypes uses LIKE without ESCAPE and filters __mdt suffix', async () => {
    restQueryAll.mockResolvedValue([
      { QualifiedApiName: 'CC_Config__mdt', Label: 'Config' },
      { QualifiedApiName: 'Wrong_mdt', Label: 'Bad' },
      { QualifiedApiName: 'Other__c', Label: 'Obj' }
    ]);

    const types = await listCustomMetadataTypes('https://x.salesforce.com', 'sid', '60');

    expect(restQueryAll).toHaveBeenCalledWith(
      'https://x.salesforce.com',
      'sid',
      '60',
      expect.stringMatching(/LIKE '%mdt'/i)
    );
    expect(restQueryAll.mock.calls[0][3]).not.toMatch(/ESCAPE/i);
    expect(types).toEqual([{ apiName: 'CC_Config__mdt', label: 'Config' }]);
  });
});
