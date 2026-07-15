import { describe, expect, it } from 'vitest';
import { apexRunMatchesStoredJobId, sfApexIdKey } from '../shared/apexTestJobIdMatch.js';

describe('sfApexIdKey', () => {
  it('normalizes 15-char ids case-insensitively', () => {
    expect(sfApexIdKey('707XXXXXXXXXXXX')).toBe(sfApexIdKey('707xxxxxxxxxxxx'));
  });
});

describe('apexRunMatchesStoredJobId', () => {
  it('matches requested jobId against canonical async job id', () => {
    const run = {
      jobId: '707SHORTID15CHA',
      canonicalJobId: '707SHORTID15CHAAA',
      job: { Id: '707SHORTID15CHAAA' }
    };
    expect(apexRunMatchesStoredJobId(run, '707SHORTID15CHAAA')).toBe(true);
    expect(apexRunMatchesStoredJobId(run, '707SHORTID15CHA')).toBe(true);
  });
});
