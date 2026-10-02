import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../shared/salesforceApi.js', () => ({
  fetchOrgLimits: vi.fn(),
  fetchOrganizationStatus: vi.fn(),
  listRestApiVersions: vi.fn(),
  restQuery: vi.fn(),
  toolingQuery: vi.fn()
}));

import { fetchOrgLimits, fetchOrganizationStatus, listRestApiVersions, restQuery, toolingQuery } from '../shared/salesforceApi.js';
import { HEALTH_MONITOR_SECTIONS, fetchHealthMonitorContext, runHealthMonitorSection } from '../background/healthMonitor.js';

describe('healthMonitor', () => {
  beforeEach(() => vi.resetAllMocks());

  it('mantiene solo las áreas accionables del diagnóstico', () => {
    expect(HEALTH_MONITOR_SECTIONS).toHaveLength(15);
    expect(HEALTH_MONITOR_SECTIONS.map((section) => section.id)).not.toContain('entitlements');
  });

  it('abre el contexto sin ejecutar llamadas contra Salesforce', async () => {
    const result = await fetchHealthMonitorContext({ id: 'orgA', displayName: 'CC UAT', instanceUrl: 'https://cc.example.com', apiVersion: '63.0' });
    expect(result).toMatchObject({ ok: true, org: { id: 'orgA', name: 'CC UAT', instanceUrl: 'https://cc.example.com' } });
    expect(fetchOrganizationStatus).not.toHaveBeenCalled();
    expect(listRestApiVersions).not.toHaveBeenCalled();
  });

  it('resume los límites y mantiene sus porcentajes para el gráfico', async () => {
    fetchOrgLimits.mockResolvedValue({ DailyApiRequests: { Max: 100, Remaining: 5 }, DataStorageMB: { Max: 1000, Remaining: 700 } });
    const result = await runHealthMonitorSection({ instanceUrl: 'https://cc.example.com', apiVersion: '63.0' }, 'sid', 'limits');
    expect(result.ok).toBe(true);
    expect(result.section.metrics).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Críticos ≥ 90%', value: 1, tone: 'bad' })]));
    expect(result.section.chart.values).toEqual([95, 30]);
  });

  it('usa los objetos y campos relacionales válidos para riesgos, cobertura y paquetes', async () => {
    toolingQuery
      .mockResolvedValueOnce([{ Score: 64 }])
      .mockResolvedValueOnce([{ Setting: 'TLS', SettingRiskCategory: 'High' }])
      .mockResolvedValueOnce([{ ApexClassOrTrigger: { Name: 'CaseService' }, NumLinesCovered: 8, NumLinesUncovered: 2 }])
      .mockResolvedValueOnce([{ Status: 'Completed', MethodsFailed: 0 }])
      .mockResolvedValueOnce([{ SubscriberPackage: { Name: 'Pkg', NamespacePrefix: 'pkg' }, SubscriberPackageVersion: { Name: '1.0', IsBeta: false } }]);

    const org = { instanceUrl: 'https://cc.example.com', apiVersion: '63.0' };
    await runHealthMonitorSection(org, 'sid', 'securityHealth');
    await runHealthMonitorSection(org, 'sid', 'tests');
    const packages = await runHealthMonitorSection(org, 'sid', 'packages');

    expect(toolingQuery.mock.calls[1][3]).toContain('FROM SecurityHealthCheckRisks');
    expect(toolingQuery.mock.calls[2][3]).toContain('ApexClassOrTrigger.Name');
    expect(toolingQuery.mock.calls[2][3]).not.toContain('Name name');
    expect(toolingQuery.mock.calls[4][3]).toContain('SubscriberPackageVersion.IsBeta');
    expect(packages.section.rows[0]).toEqual(['Pkg', 'pkg', '1.0', 'No']);
  });

  it('consulta el inventario de flows en REST, donde FlowDefinitionView está disponible', async () => {
    restQuery.mockResolvedValueOnce([{ ProcessType: 'AutoLaunchedFlow', IsActive: true }]);
    toolingQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([{ Status: 'Active', total: 2 }]);

    await runHealthMonitorSection({ instanceUrl: 'https://cc.example.com', apiVersion: '63.0' }, 'sid', 'automation');
    expect(restQuery).toHaveBeenCalledWith('https://cc.example.com', 'sid', '63.0', expect.stringContaining('FROM FlowDefinitionView'));
  });
});
