import { describe, expect, it } from 'vitest';
import { apexTestRunHasFailures } from '../shared/apexTestRunStatus.js';

describe('apexTestRunHasFailures', () => {
  it('returns true when Fail count > 0', () => {
    expect(apexTestRunHasFailures({ Pass: 3, Fail: 1 }, { Status: 'Completed' })).toBe(true);
  });

  it('returns true when NumberOfErrors > 0', () => {
    expect(apexTestRunHasFailures(null, { Status: 'Completed', NumberOfErrors: 2 })).toBe(true);
  });

  it('returns false for all-pass completed job', () => {
    expect(apexTestRunHasFailures({ Pass: 5, Fail: 0 }, { Status: 'Completed', NumberOfErrors: 0 })).toBe(
      false
    );
  });
});
