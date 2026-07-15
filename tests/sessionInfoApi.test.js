import { describe, expect, it } from 'vitest';
import {
  buildRestDataEndpoint,
  buildSessionDetailPayload,
  buildSessionDetailRows,
  buildUserInfoEndpoint
} from '../shared/sessionInfoApi.js';

describe('sessionInfoApi', () => {
  it('builds REST and userinfo endpoints', () => {
    expect(buildRestDataEndpoint('https://example.my.salesforce.com/', '59.0')).toBe(
      'https://example.my.salesforce.com/services/data/v59.0'
    );
    expect(buildUserInfoEndpoint('https://example.my.salesforce.com/')).toBe(
      'https://example.my.salesforce.com/services/oauth2/userinfo'
    );
  });

  it('normalizes session detail payload', () => {
    const detail = buildSessionDetailPayload(
      { userId: '005xx', username: 'user@example.com', name: 'Test User' },
      {
        id: '00Dxx',
        name: 'My Org',
        isSandbox: true,
        organizationType: 'Developer Edition',
        instanceName: 'EU5',
        namespacePrefix: 'CC',
        languageLocaleKey: 'es',
        timeZoneSidKey: 'Europe/Madrid',
        trialExpirationDate: null
      },
      { id: '00Dxx', instanceUrl: 'https://example.my.salesforce.com', apiVersion: '58.0', isSandbox: true },
      '59.0'
    );
    expect(detail.user?.userId).toBe('005xx');
    expect(detail.org.isSandbox).toBe(true);
    expect(detail.session.liveApiVersion).toBe('59.0');
    expect(detail.session.effectiveApiVersion).toBe('59.0');
    expect(detail.session.restDataEndpoint).toContain('/services/data/v59.0');
  });

  it('builds detail rows with fallbacks', () => {
    const detail = buildSessionDetailPayload(null, null, { id: '00D', instanceUrl: 'https://x.salesforce.com' }, null);
    const rows = buildSessionDetailRows(
      {
        userId: 'User Id',
        username: 'User',
        name: 'Name',
        orgId: 'Org Id',
        orgName: 'Org',
        orgType: 'Type',
        isSandbox: 'Sandbox',
        namespace: 'NS',
        timezone: 'TZ',
        locale: 'Loc',
        instanceName: 'Inst',
        instanceUrl: 'URL',
        savedApi: 'Saved',
        liveApi: 'Live',
        restEndpoint: 'REST',
        userInfoEndpoint: 'UI',
        yes: 'Yes',
        no: 'No'
      },
      detail
    );
    expect(rows.some((r) => r.label === 'Org Id' && r.value === '00D')).toBe(true);
    expect(rows.some((r) => r.label === 'Live' && r.value === '—')).toBe(true);
  });
});
