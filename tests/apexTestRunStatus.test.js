import { describe, expect, it } from 'vitest';
import {
  apexTestRunHasFailures,
  getApexTestRunOutcomeSummary,
  isApexTestTerminalJobStatus
} from '../shared/apexTestRunStatus.js';

describe('apexTestRunHasFailures', () => {
  it('marks 10 of 11 passed as a failed run, not as a success', () => {
    expect(apexTestRunHasFailures({ Pass: 10, Fail: 1 }, { Status: 'Completed' })).toBe(true);
  });

  it('returns true when NumberOfErrors > 0', () => {
    expect(apexTestRunHasFailures(null, { Status: 'Completed', NumberOfErrors: 2 })).toBe(true);
  });

  it('returns false for all-pass completed job', () => {
    expect(apexTestRunHasFailures({ Pass: 5, Fail: 0 }, { Status: 'Completed', NumberOfErrors: 0 })).toBe(
      false
    );
  });

  it('uses one total for the summary, including compilation failures and skipped tests', () => {
    expect(getApexTestRunOutcomeSummary({ Pass: 10, Fail: 1, CompileFail: 2, Skip: 3 })).toMatchObject({
      known: true,
      passed: 10,
      failed: 1,
      compileFailed: 2,
      skipped: 3,
      total: 16
    });
  });

  it('recognizes terminal job states regardless of casing', () => {
    expect(isApexTestTerminalJobStatus('completed')).toBe(true);
    expect(isApexTestTerminalJobStatus('Processing')).toBe(false);
  });
});
