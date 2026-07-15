import { describe, expect, it } from 'vitest';
import {
  resolveApexLogBodyFetchLimit,
  sanitizeOrgForConfigExport,
  sanitizeOrgForConfigImport
} from '../background/helpers/messageHandlerHelpers.js';

describe('messageHandlerHelpers', () => {
  it('resolveApexLogBodyFetchLimit honors pageBodiesOnly', () => {
    expect(resolveApexLogBodyFetchLimit(10, { pageBodiesOnly: true })).toBe(10);
    expect(resolveApexLogBodyFetchLimit(10, { maxBodyFetches: 3 })).toBe(3);
    expect(resolveApexLogBodyFetchLimit(10, {})).toBe(0);
  });

  it('sanitizeOrgForConfigExport strips unknown fields', () => {
    const clean = sanitizeOrgForConfigExport({
      id: 'org1',
      label: 'Sandbox',
      instanceUrl: 'https://test.salesforce.com',
      cookieDomain: 'test.salesforce.com',
      apiVersion: '59.0',
      isSandbox: true,
      sid: 'must-not-export'
    });
    expect(clean?.id).toBe('org1');
    expect(clean?.sid).toBeUndefined();
    expect(clean?.isSandbox).toBe(true);
  });

  it('sanitizeOrgForConfigImport uses id key fallback', () => {
    const clean = sanitizeOrgForConfigImport(
      {
        label: 'Prod',
        instanceUrl: 'https://prod.salesforce.com',
        cookieDomain: 'prod.salesforce.com'
      },
      'prod-id'
    );
    expect(clean?.id).toBe('prod-id');
  });
});
