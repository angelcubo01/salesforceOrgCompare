import { describe, expect, it, vi } from 'vitest';
import {
  aggregateCoverageRows,
  collectTouchedApexIds,
  fetchApexTestCoverageLines,
  fetchApexTestRunCoverageSummary,
  indexApexTestRunMethods
} from '../shared/apexTestCoverage.js';

describe('apexTestCoverage', () => {
  it('limita las clases tocadas a los metodos ejecutados en el job', () => {
    const run = indexApexTestRunMethods([
      { ApexClassId: '01p000000000001AAA', MethodName: 'testActual' }
    ]);
    const ids = collectTouchedApexIds(
      [
        {
          ApexTestClassId: '01p000000000001',
          TestMethodName: 'testActual',
          ApexClassOrTriggerId: '01p000000000101AAA'
        },
        {
          ApexTestClassId: '01p000000000001AAA',
          TestMethodName: 'testAntiguo',
          ApexClassOrTriggerId: '01p000000000999AAA'
        }
      ],
      run.methodKeys
    );
    expect(ids).toEqual(['01p000000000101AAA']);
  });

  it('calcula el porcentaje con los contadores oficiales del agregado', () => {
    expect(
      aggregateCoverageRows(
        [
          {
            ApexClassOrTriggerId: '01pA',
            ApexClassOrTrigger: { Name: 'Servicio' },
            NumLinesCovered: 75,
            NumLinesUncovered: 25
          },
          {
            ApexClassOrTriggerId: '01pB',
            ApexClassOrTrigger: { Name: 'Bajo' },
            NumLinesCovered: 4,
            NumLinesUncovered: 6
          }
        ],
        50
      )
    ).toEqual([
      {
        id: '01pA',
        name: 'Servicio',
        percent: 0.75,
        covered: 75,
        total: 100
      }
    ]);
  });

  it('monta un resumen ligero y no descarga Coverage por cada metodo', async () => {
    const queries = [];
    const queryAll = vi.fn(async (_url, _sid, _version, soql) => {
      queries.push(soql);
      if (soql.includes('FROM ApexTestResult')) {
        return [{ ApexClassId: '01p000000000001AAA', MethodName: 'testActual' }];
      }
      if (soql.includes('FROM ApexCodeCoverage WHERE')) {
        return [
          {
            ApexTestClassId: '01p000000000001AAA',
            TestMethodName: 'testActual',
            ApexClassOrTriggerId: '01p000000000101AAA'
          },
          {
            ApexTestClassId: '01p000000000001AAA',
            TestMethodName: 'testAntiguo',
            ApexClassOrTriggerId: '01p000000000999AAA'
          }
        ];
      }
      if (soql.includes('FROM ApexCodeCoverageAggregate')) {
        expect(soql).toContain("'01p000000000101AAA'");
        expect(soql).not.toContain('01p000000000999AAA');
        return [
          {
            ApexClassOrTriggerId: '01p000000000101AAA',
            ApexClassOrTrigger: { Id: '01p000000000101AAA', Name: 'Servicio' },
            NumLinesCovered: 8,
            NumLinesUncovered: 2
          }
        ];
      }
      return [];
    });

    const result = await fetchApexTestRunCoverageSummary({
      instanceUrl: 'https://example.my.salesforce.com',
      sid: 'sid',
      apiVersion: '63.0',
      jobId: '707000000000001AAA',
      minCoveragePercent: 0,
      queryAll
    });

    expect(result.scope).toBe('run');
    expect(result.classes).toEqual([
      {
        id: '01p000000000101AAA',
        name: 'Servicio',
        percent: 0.8,
        covered: 8,
        total: 10
      }
    ]);
    const detailedQuery = queries.find((q) => q.includes('FROM ApexCodeCoverage WHERE'));
    expect(detailedQuery).not.toContain(', Coverage');
  });

  it('obtiene las lineas con una sola consulta al agregado', async () => {
    const queryAll = vi.fn(async () => [
      { Coverage: { coveredLines: [1, 2], uncoveredLines: [3] } }
    ]);
    const result = await fetchApexTestCoverageLines({
      instanceUrl: 'https://example.my.salesforce.com',
      sid: 'sid',
      apiVersion: '63.0',
      jobId: '707000000000001AAA',
      classOrTriggerId: '01p000000000101AAA',
      queryAll
    });
    expect(result).toEqual({ coveredLines: [1, 2], uncoveredLines: [3] });
    expect(queryAll).toHaveBeenCalledTimes(1);
    expect(queryAll.mock.calls[0][3]).toContain('FROM ApexCodeCoverageAggregate');
  });
});
