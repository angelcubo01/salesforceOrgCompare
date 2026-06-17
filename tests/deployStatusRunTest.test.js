import { describe, expect, it } from 'vitest';
import { collectSlowTests, DEPLOY_SLOW_TEST_THRESHOLD_MS } from '../shared/deployStatusApi.js';

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
});
