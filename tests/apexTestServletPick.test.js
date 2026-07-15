import { describe, expect, it } from 'vitest';
import {
  pickPrimaryApexTestServletRow,
  servletExtstatusSuggestsFailure
} from '../shared/apexTestServletPick.js';

describe('servletExtstatusSuggestsFailure', () => {
  it('detects fail wording', () => {
    expect(servletExtstatusSuggestsFailure('Completed with Failures')).toBe(true);
  });

  it('detects partial progress fraction', () => {
    expect(servletExtstatusSuggestsFailure('Completed (3 / 5)')).toBe(true);
    expect(servletExtstatusSuggestsFailure('Completed (5 / 5)')).toBe(false);
  });
});

describe('pickPrimaryApexTestServletRow', () => {
  it('prefers processing over queued', () => {
    const rows = [
      { status: 'Queued', extstatus: 'OK', parentid: 'a' },
      { status: 'Processing', extstatus: 'OK', parentid: 'a' }
    ];
    expect(pickPrimaryApexTestServletRow(rows)?.status).toBe('Processing');
  });

  it('among terminal rows prefers failure extstatus', () => {
    const rows = [
      { status: 'Completed', extstatus: 'Completed (5 / 5)', parentid: 'a', classname: 'Good' },
      { status: 'Completed', extstatus: 'Completed (2 / 5)', parentid: 'a', classname: 'Bad' }
    ];
    const picked = pickPrimaryApexTestServletRow(rows);
    expect(picked?.classname).toBe('Bad');
  });
});
