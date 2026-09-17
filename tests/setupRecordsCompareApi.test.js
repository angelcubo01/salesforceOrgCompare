import { describe, it, expect, vi } from 'vitest';

vi.mock('../shared/salesforceApi.js', () => ({
  restQueryAll: vi.fn(),
  restDescribeSobject: vi.fn(),
  toolingQueryAll: vi.fn()
}));

import { restDescribeSobject, restQueryAll, toolingQueryAll } from '../shared/salesforceApi.js';
import { fetchSetupRecordsForType, listCustomMetadataTypes } from '../shared/setupRecordsCompareApi.js';

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

  it('obtiene los campos de Custom Metadata desde Tooling sin llamar a REST describe', async () => {
    toolingQueryAll.mockResolvedValue([
      { QualifiedApiName: 'DeveloperName', DataType: 'text', IsCalculated: false },
      { QualifiedApiName: 'MasterLabel', DataType: 'text', IsCalculated: false },
      { QualifiedApiName: 'Enabled__c', DataType: 'checkbox', IsCalculated: false },
      { QualifiedApiName: 'CreatedDate', DataType: 'datetime', IsCalculated: false }
    ]);
    restQueryAll.mockResolvedValue([
      { DeveloperName: 'Default', MasterLabel: 'Default', Enabled__c: true }
    ]);

    const result = await fetchSetupRecordsForType(
      'https://x.salesforce.com',
      'sid',
      '60',
      'Zuora_Default_Configuration__mdt'
    );

    expect(restDescribeSobject).not.toHaveBeenCalled();
    expect(toolingQueryAll).toHaveBeenCalledWith(
      'https://x.salesforce.com',
      'sid',
      '60',
      expect.stringMatching(/FROM EntityParticle[\s\S]*Zuora_Default_Configuration__mdt/i)
    );
    expect(restQueryAll).toHaveBeenCalledWith(
      'https://x.salesforce.com',
      'sid',
      '60',
      'SELECT DeveloperName, MasterLabel, Enabled__c FROM Zuora_Default_Configuration__mdt'
    );
    expect(result).toMatchObject({
      fieldNames: ['DeveloperName', 'MasterLabel', 'Enabled__c'],
      alignment: 'developerName',
      totalSize: 1
    });
  });
});
