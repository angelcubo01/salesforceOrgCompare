import { describe, expect, it } from 'vitest';
import {
  buildCompanyInfoUrl,
  buildTrustPageUrl,
  countActiveIncidents,
  deriveTrustHealth,
  hasTrustAlert,
  inferInstanceKeyFromHostname,
  isMaintenanceInProgress,
  parseNextMaintenance,
  selectActiveIncidents,
  selectIncidentHistory,
  selectMaintenanceHistory,
  selectUpcomingMaintenances
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
    expect(countActiveIncidents({ Incidents: [{ status: 'ACTIVE', affectsAll: true }, { status: 'RESOLVED', affectsAll: true }] }, 'NA1')).toBe(1);
  });

  it('does not count eight resolved incidents as active', () => {
    const incidents = Array.from({ length: 8 }, (_, index) => ({ id: `i${index}`, status: 'Resolved', affectsAll: true }));
    expect(selectActiveIncidents(incidents, 'NA1')).toHaveLength(0);
    expect(selectIncidentHistory(incidents, 'NA1')).toHaveLength(8);
    expect(hasTrustAlert('NA1', { status: 'OK', Incidents: incidents })).toBe(false);
  });

  it('separates active and resolved incidents and deduplicates by id', () => {
    const incidents = [
      { id: 'active', status: 'ACTIVE', instanceKeys: ['NA1'] },
      { id: 'active', status: 'ACTIVE', instanceKeys: ['NA1'] },
      { id: 'done', status: 'CLOSED', instanceKeys: ['NA1'] }
    ];
    expect(selectActiveIncidents(incidents, 'NA1').map((item) => item.id)).toEqual(['active']);
    expect(selectIncidentHistory(incidents, 'NA1').map((item) => item.id)).toEqual(['done']);
  });

  it('uses an open IncidentImpact only when status is missing', () => {
    expect(selectActiveIncidents([{ id: 'fallback', affectsAll: true, IncidentImpacts: [{ startTime: '2026-01-01T00:00:00Z' }] }], 'NA1')).toHaveLength(1);
    expect(selectActiveIncidents([{ id: 'finished', affectsAll: true, IncidentImpacts: [{ startTime: '2026-01-01T00:00:00Z', endTime: '2026-01-01T01:00:00Z' }] }], 'NA1')).toHaveLength(0);
  });

  it('orders upcoming maintenance and excludes completed, cancelled and postponed records', () => {
    const now = Date.parse('2026-02-01T00:00:00Z');
    const records = [
      { id: 'later', plannedStartTime: '2026-02-03T00:00:00Z', status: 'SCHEDULED' },
      { id: 'first', plannedStartTime: '2026-02-02T00:00:00Z', status: 'SCHEDULED' },
      { id: 'cancelled', plannedStartTime: '2026-02-01T02:00:00Z', status: 'CANCELLED' },
      { id: 'completed', plannedStartTime: '2026-02-01T03:00:00Z', status: 'COMPLETED' },
      { id: 'postponed', plannedStartTime: '2026-02-01T04:00:00Z', status: 'POSTPONED' }
    ];
    expect(selectUpcomingMaintenances(records, now).map((item) => item.id)).toEqual(['first', 'later']);
    expect(selectMaintenanceHistory(records, now).map((item) => item.id)).toEqual(expect.arrayContaining(['cancelled', 'completed', 'postponed']));
  });

  it('recognises maintenance currently in progress', () => {
    const now = Date.parse('2026-02-01T12:00:00Z');
    expect(isMaintenanceInProgress({ plannedStartTime: '2026-02-01T11:00:00Z', plannedEndTime: '2026-02-01T13:00:00Z', status: 'IN_PROGRESS' }, now)).toBe(true);
  });

  it('maps every official Trust status', () => {
    expect(deriveTrustHealth('OK')).toMatchObject({ level: 'operational', labelKey: 'operational' });
    expect(deriveTrustHealth('MAJOR_INCIDENT_CORE').level).toBe('major');
    expect(deriveTrustHealth('MINOR_INCIDENT_CORE').level).toBe('minor');
    expect(deriveTrustHealth('MAINTENANCE_CORE').level).toBe('maintenance');
    expect(deriveTrustHealth('MAJOR_INCIDENT_NONCORE').level).toBe('major');
    expect(deriveTrustHealth('MINOR_INCIDENT_NONCORE').level).toBe('minor');
    expect(deriveTrustHealth('MAINTENANCE_NONCORE').level).toBe('maintenance');
  });
});
