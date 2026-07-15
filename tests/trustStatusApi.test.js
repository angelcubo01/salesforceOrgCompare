import { describe, expect, it } from 'vitest';
import {
  buildCompanyInfoUrl,
  buildTrustPageUrl,
  countActiveIncidents,
  hasTrustAlert,
  inferInstanceKeyFromHostname,
  parseNextMaintenance
} from '../shared/trustStatusApi.js';

describe('trustStatusApi', () => {
  it('infers instance key from classic hostname', () => {
    expect(inferInstanceKeyFromHostname('na123.salesforce.com')).toBe('NA123');
  });

  it('returns empty for my domain hostnames', () => {
    expect(inferInstanceKeyFromHostname('mycompany.my.salesforce.com')).toBe('');
  });

  it('builds trust and company urls', () => {
    expect(buildTrustPageUrl('eu5')).toBe('https://status.salesforce.com/instances/EU5');
    expect(buildCompanyInfoUrl('https://example.my.salesforce.com')).toBe(
      'https://example.my.salesforce.com/lightning/setup/CompanyProfileInfo/home'
    );
  });

  it('parses next future maintenance', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const past = new Date(Date.now() - 86400000).toISOString();
    const next = parseNextMaintenance({
      Maintenances: [
        { plannedStartTime: past, name: 'Past' },
        { plannedStartTime: future, name: 'Future' }
      ]
    });
    expect(next?.name).toBe('Future');
  });

  it('detects trust alerts', () => {
    expect(hasTrustAlert('NA1', { status: 'OK', Incidents: [] })).toBe(false);
    expect(hasTrustAlert('NA1', { status: 'DEGRADED', Incidents: [] })).toBe(true);
    expect(countActiveIncidents({ Incidents: [{}, {}] })).toBe(2);
  });
});
