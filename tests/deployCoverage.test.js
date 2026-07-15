import { describe, expect, it } from 'vitest';
import {
  buildDeployCoverageRows,
  canShowDeployCoverage,
  collectDeployTestClassIds,
  deployHasCodeCoverage,
  formatDeployCoveragePercent,
  inferCoveredLinesFromSource
} from '../shared/deployCoverage.js';

describe('deployCoverage', () => {
  it('buildDeployCoverageRows calcula porcentaje desde numLocations', () => {
    const rows = buildDeployCoverageRows(
      [
        {
          id: '01pXX',
          name: 'MyClass',
          type: 'Class',
          numLocations: 100,
          numLocationsNotCovered: 25,
          uncoveredLines: [1, 2, 3]
        }
      ],
      0
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].percent).toBeCloseTo(0.75);
    expect(rows[0].covered).toBe(75);
    expect(rows[0].total).toBe(100);
    expect(rows[0].uncoveredLines).toEqual([1, 2, 3]);
  });

  it('buildDeployCoverageRows respeta umbral mínimo', () => {
    const rows = buildDeployCoverageRows(
      [{ id: '01p', name: 'Low', numLocations: 10, numLocationsNotCovered: 5 }],
      60
    );
    expect(rows).toHaveLength(0);
  });

  it('collectDeployTestClassIds extrae ids de tests del SOAP', () => {
    expect(
      collectDeployTestClassIds({
        successes: [{ id: '01pA', name: 'T1', methodName: 'm1' }],
        failures: [{ id: '01pB', name: 'T2', methodName: 'm2' }]
      })
    ).toEqual(['01pA', '01pB']);
  });

  it('canShowDeployCoverage cuando hay codeCoverage en SOAP', () => {
    expect(
      deployHasCodeCoverage({
        runTestResult: { codeCoverage: [{ id: '01p', numLocations: 10, numLocationsNotCovered: 1 }] }
      })
    ).toBe(true);
    expect(canShowDeployCoverage({ runTestResult: { codeCoverage: [{ id: '01p' }] } }, {})).toBe(true);
  });

  it('formatDeployCoveragePercent', () => {
    expect(formatDeployCoveragePercent(0.756)).toBe('75.6%');
  });

  it('inferCoveredLinesFromSource marca en verde las líneas no listadas como uncovered', () => {
    const body = [
      'public class Demo {',
      '  public void run() {',
      '    Integer x = 1;',
      '  }',
      '}'
    ].join('\n');
    const covered = inferCoveredLinesFromSource(body, [3]);
    expect(covered).toContain(1);
    expect(covered).toContain(2);
    expect(covered).toContain(4);
    expect(covered).toContain(5);
    expect(covered).not.toContain(3);
  });
});
