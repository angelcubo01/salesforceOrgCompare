import { describe, expect, it } from 'vitest';
import {
  USER_DEBUG_TRACE_MAX_WINDOW_MS,
  computeTraceExtension,
  buildTraceExtensionPlan,
  isUserDebugTraceActive,
  isUserDebugTraceRecentlyInactive,
  isUserDebugTraceVisibleByDefault,
  canExtendOrReactivateUserDebugTrace,
  parseSalesforceDateTimeMs,
  validateUserDebugTraceDates
} from '../shared/salesforceApi.js';

describe('isUserDebugTraceActive', () => {
  const now = new Date('2026-07-02T12:00:00.000Z').getTime();

  it('returns true when now is inside the window', () => {
    expect(
      isUserDebugTraceActive(
        {
          startIso: '2026-07-02T11:00:00.000Z',
          expirationIso: '2026-07-02T13:00:00.000Z'
        },
        now
      )
    ).toBe(true);
  });

  it('returns false when trace has expired', () => {
    expect(
      isUserDebugTraceActive(
        {
          startIso: '2026-07-02T09:00:00.000Z',
          expirationIso: '2026-07-02T11:00:00.000Z'
        },
        now
      )
    ).toBe(false);
  });

  it('returns false when trace has not started yet', () => {
    expect(
      isUserDebugTraceActive(
        {
          startIso: '2026-07-02T13:00:00.000Z',
          expirationIso: '2026-07-02T14:00:00.000Z'
        },
        now
      )
    ).toBe(false);
  });

  it('returns false at expiration boundary', () => {
    expect(
      isUserDebugTraceActive(
        {
          startIso: '2026-07-02T11:00:00.000Z',
          expirationIso: '2026-07-02T12:00:00.000Z'
        },
        now
      )
    ).toBe(false);
  });
});

describe('isUserDebugTraceRecentlyInactive', () => {
  const now = new Date('2026-07-02T12:00:00.000Z').getTime();

  it('returns true when trace expired within the last 30 minutes', () => {
    expect(
      isUserDebugTraceRecentlyInactive(
        {
          startIso: '2026-07-02T11:00:00.000Z',
          expirationIso: '2026-07-02T11:45:00.000Z'
        },
        now
      )
    ).toBe(true);
  });

  it('returns false when trace expired more than 30 minutes ago', () => {
    expect(
      isUserDebugTraceRecentlyInactive(
        {
          startIso: '2026-07-02T09:00:00.000Z',
          expirationIso: '2026-07-02T11:00:00.000Z'
        },
        now
      )
    ).toBe(false);
  });

  it('returns false for active traces', () => {
    expect(
      isUserDebugTraceRecentlyInactive(
        {
          startIso: '2026-07-02T11:00:00.000Z',
          expirationIso: '2026-07-02T13:00:00.000Z'
        },
        now
      )
    ).toBe(false);
  });
});

describe('isUserDebugTraceVisibleByDefault', () => {
  const now = new Date('2026-07-02T12:00:00.000Z').getTime();

  it('includes active and recently inactive traces', () => {
    expect(
      isUserDebugTraceVisibleByDefault(
        {
          startIso: '2026-07-02T11:00:00.000Z',
          expirationIso: '2026-07-02T13:00:00.000Z'
        },
        now
      )
    ).toBe(true);
    expect(
      isUserDebugTraceVisibleByDefault(
        {
          startIso: '2026-07-02T11:00:00.000Z',
          expirationIso: '2026-07-02T11:45:00.000Z'
        },
        now
      )
    ).toBe(true);
  });

  it('excludes traces expired outside the recent window', () => {
    expect(
      isUserDebugTraceVisibleByDefault(
        {
          startIso: '2026-07-02T09:00:00.000Z',
          expirationIso: '2026-07-02T11:00:00.000Z'
        },
        now
      )
    ).toBe(false);
  });
});

describe('computeTraceExtension', () => {
  const activeNowMs = new Date('2026-07-02T10:30:00.000Z').getTime();

  it('adds 15 minutes to expiration', () => {
    const startIso = '2026-07-02T10:00:00.000Z';
    const expirationIso = '2026-07-02T11:00:00.000Z';
    const result = computeTraceExtension({
      startIso,
      expirationIso,
      addMs: 15 * 60 * 1000,
      nowMs: activeNowMs
    });
    expect(result.expirationIso).toBe('2026-07-02T11:15:00.000Z');
    expect(result.cappedAtMax).toBe(false);
  });

  it('caps extension at 24 hours from start', () => {
    const startIso = '2026-07-02T10:00:00.000Z';
    const expirationIso = new Date(
      new Date(startIso).getTime() + USER_DEBUG_TRACE_MAX_WINDOW_MS - 5 * 60 * 1000
    ).toISOString();
    const result = computeTraceExtension({
      startIso,
      expirationIso,
      addMs: 15 * 60 * 1000,
      nowMs: activeNowMs
    });
    expect(new Date(result.expirationIso).getTime()).toBe(
      new Date(startIso).getTime() + USER_DEBUG_TRACE_MAX_WINDOW_MS
    );
    expect(result.cappedAtMax).toBe(true);
  });

  it('throws when already at max window', () => {
    const startIso = '2026-07-02T10:00:00.000Z';
    const expirationIso = new Date(
      new Date(startIso).getTime() + USER_DEBUG_TRACE_MAX_WINDOW_MS
    ).toISOString();
    expect(() =>
      computeTraceExtension({
        startIso,
        expirationIso,
        addMs: 15 * 60 * 1000,
        nowMs: new Date('2026-07-02T11:00:00.000Z').getTime()
      })
    ).toThrow(/24 hour/);
  });

  it('reactivates a recently expired trace from now', () => {
    const startIso = '2026-07-02T10:00:00.000Z';
    const expirationIso = '2026-07-02T11:45:00.000Z';
    const nowMs = new Date('2026-07-02T12:00:00.000Z').getTime();
    const result = computeTraceExtension({
      startIso,
      expirationIso,
      addMs: 15 * 60 * 1000,
      nowMs
    });
    expect(result.expirationIso).toBe('2026-07-02T12:15:00.000Z');
    expect(result.cappedAtMax).toBe(false);
  });
});

describe('canExtendOrReactivateUserDebugTrace', () => {
  const now = new Date('2026-07-02T12:00:00.000Z').getTime();

  it('allows reactivation for recently inactive traces', () => {
    expect(
      canExtendOrReactivateUserDebugTrace(
        {
          startIso: '2026-07-02T11:00:00.000Z',
          expirationIso: '2026-07-02T11:45:00.000Z'
        },
        now
      )
    ).toBe(true);
  });

  it('rejects traces expired outside the recent window', () => {
    expect(
      canExtendOrReactivateUserDebugTrace(
        {
          startIso: '2026-07-02T09:00:00.000Z',
          expirationIso: '2026-07-02T11:00:00.000Z'
        },
        now
      )
    ).toBe(false);
  });
});

describe('buildTraceExtensionPlan', () => {
  const now = new Date('2026-07-02T12:00:00.000Z').getTime();

  it('extends active traces from current expiration', () => {
    const plan = buildTraceExtensionPlan(
      {
        startIso: '2026-07-02T10:00:00.000Z',
        expirationIso: '2026-07-02T12:30:00.000Z'
      },
      15 * 60 * 1000,
      now
    );
    expect(plan.reactivated).toBe(false);
    expect(plan.expirationIso).toBe('2026-07-02T12:45:00.000Z');
    expect(plan.startIso).toBeNull();
  });

  it('reactivates recently inactive traces from now', () => {
    const plan = buildTraceExtensionPlan(
      {
        startIso: '2026-07-02T11:00:00.000Z',
        expirationIso: '2026-07-02T11:45:00.000Z'
      },
      15 * 60 * 1000,
      now
    );
    expect(plan.reactivated).toBe(true);
    expect(plan.startIso).toBe('2026-07-02T12:00:00.000Z');
    expect(plan.expirationIso).toBe('2026-07-02T12:15:00.000Z');
  });
});

describe('parseSalesforceDateTimeMs', () => {
  it('parses Salesforce UTC datetime without colon in offset', () => {
    expect(parseSalesforceDateTimeMs('2026-07-09T13:14:01.000+0000')).toBe(
      Date.parse('2026-07-09T13:14:01.000Z')
    );
  });
});

describe('validateUserDebugTraceDates', () => {
  it('returns null for valid window', () => {
    expect(
      validateUserDebugTraceDates({
        startIso: '2026-07-02T10:00:00.000Z',
        expirationIso: '2026-07-02T12:00:00.000Z'
      })
    ).toBeNull();
  });

  it('returns INVALID_RANGE when end is before start', () => {
    expect(
      validateUserDebugTraceDates({
        startIso: '2026-07-02T12:00:00.000Z',
        expirationIso: '2026-07-02T10:00:00.000Z'
      })
    ).toBe('INVALID_RANGE');
  });

  it('returns MAX_WINDOW when span exceeds 24h', () => {
    expect(
      validateUserDebugTraceDates({
        startIso: '2026-07-02T10:00:00.000Z',
        expirationIso: new Date(
          new Date('2026-07-02T10:00:00.000Z').getTime() + USER_DEBUG_TRACE_MAX_WINDOW_MS + 1000
        ).toISOString()
      })
    ).toBe('MAX_WINDOW');
  });
});
