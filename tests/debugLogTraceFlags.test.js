import { describe, expect, it } from 'vitest';
import {
  USER_DEBUG_TRACE_MAX_WINDOW_MS,
  computeTraceExtension,
  isUserDebugTraceActive,
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

describe('computeTraceExtension', () => {
  it('adds 15 minutes to expiration', () => {
    const startIso = '2026-07-02T10:00:00.000Z';
    const expirationIso = '2026-07-02T11:00:00.000Z';
    const result = computeTraceExtension({
      startIso,
      expirationIso,
      addMs: 15 * 60 * 1000
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
      addMs: 15 * 60 * 1000
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
        addMs: 15 * 60 * 1000
      })
    ).toThrow(/24 hour/);
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
