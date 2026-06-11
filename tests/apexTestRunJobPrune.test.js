import { describe, expect, it } from 'vitest';
import {
  APEX_TEST_JOBS_TTL_MS,
  pruneExpiredStoredJobs
} from '../shared/apexTestRunJobPrune.js';

describe('pruneExpiredStoredJobs', () => {
  const now = 1_700_000_000_000;

  it('removes jobs older than 24h', () => {
    const list = [
      { orgId: 'o1', jobId: 'j1', startedAt: now - APEX_TEST_JOBS_TTL_MS - 1000 },
      { orgId: 'o1', jobId: 'j2', startedAt: now - 1000 }
    ];
    const pruned = pruneExpiredStoredJobs(list, now);
    expect(pruned).toHaveLength(1);
    expect(pruned[0].jobId).toBe('j2');
  });

  it('keeps jobs within retention window', () => {
    const list = [{ orgId: 'o1', jobId: 'j1', startedAt: now - 60_000 }];
    expect(pruneExpiredStoredJobs(list, now)).toHaveLength(1);
  });
});
