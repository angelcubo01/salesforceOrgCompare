import { describe, expect, it } from 'vitest';
import { buildRecordViewUrl, extractSalesforceId } from '../shared/idActionsApi.js';

describe('idActionsApi', () => {
  it('extracts Salesforce ids', () => {
    expect(extractSalesforceId('record 001xx000003DGbQAAW here')).toBe('001xx000003DGbQAAW');
  });

  it('builds record view urls', () => {
    expect(buildRecordViewUrl('https://x.my.salesforce.com', '001ABC')).toBe(
      'https://x.my.salesforce.com/001ABC'
    );
  });
});
