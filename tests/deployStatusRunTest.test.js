import { describe, expect, it } from 'vitest';
import {
  collectSlowTests,
  DEPLOY_SLOW_TEST_THRESHOLD_MS,
  hasCoverageFailureInRow,
  hasCoverageFailureInSoap
} from '../shared/deployStatusApi.js';

describe('deployStatus run test helpers', () => {
  it('collectSlowTests incluye éxitos y fallos por encima del umbral', () => {
    const slow = collectSlowTests({
      failures: [{ className: 'FailCls', methodName: 'slowFail', time: '12000' }],
      successes: [
        { className: 'FastCls', methodName: 'quick', time: '200' },
        { className: 'SlowCls', methodName: 'slowOk', time: '15000' }
      ]
    });
    expect(slow).toHaveLength(2);
    expect(slow[0]).toEqual({ className: 'SlowCls', methodName: 'slowOk', timeMs: 15000 });
    expect(slow[1]).toEqual({ className: 'FailCls', methodName: 'slowFail', timeMs: 12000 });
  });

  it('collectSlowTests ignora tests por debajo del umbral de Setup', () => {
    const slow = collectSlowTests({
      successes: [{ className: 'Cls', methodName: 'm', time: String(DEPLOY_SLOW_TEST_THRESHOLD_MS - 1) }]
    });
    expect(slow).toHaveLength(0);
  });

  it('hasCoverageFailureInRow detecta ErrorMessage de cobertura en DeployRequest', () => {
    expect(
      hasCoverageFailureInRow({
        status: 'Failed',
        errorMessage: 'Average test coverage across all Apex Classes and Triggers is 71%, at least 75% test coverage is required.'
      })
    ).toBe(true);
    expect(hasCoverageFailureInRow({ status: 'Failed', errorMessage: 'Un problema genérico' })).toBe(false);
    expect(hasCoverageFailureInRow({ status: 'Succeeded', errorMessage: 'coverage' })).toBe(false);
  });

  it('hasCoverageFailureInSoap detecta codeCoverageWarnings', () => {
    expect(
      hasCoverageFailureInSoap({
        runTestResult: {
          codeCoverageWarnings: [{ name: 'MyClass', message: 'Test coverage is 0%' }]
        }
      })
    ).toBe(true);
    expect(hasCoverageFailureInSoap({ errorMessage: 'Code coverage failure' })).toBe(true);
    expect(hasCoverageFailureInSoap({ errorMessage: 'Other error' })).toBe(false);
  });
});
