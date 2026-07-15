import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SESSION_REPLAY_FLAG,
  parseSessionReplayPayload,
  shouldSampleSessionReplay,
  isSessionReplayPage,
  resetSessionReplayStateForTests
} from '../shared/posthogSessionReplay.js';

describe('SESSION_REPLAY_FLAG', () => {
  it('usa la clave acordada con PostHog', () => {
    expect(SESSION_REPLAY_FLAG).toBe('sfoc_session_replay');
  });
});

describe('parseSessionReplayPayload', () => {
  it('devuelve defaults si el payload es inválido', () => {
    expect(parseSessionReplayPayload(null)).toEqual({
      enabled: true,
      sample_rate: 0.1,
      min_duration_ms: 8000
    });
  });

  it('respeta enabled false y sample_rate', () => {
    expect(parseSessionReplayPayload({ enabled: false, sample_rate: 0.25 })).toEqual({
      enabled: false,
      sample_rate: 0.25,
      min_duration_ms: 8000
    });
  });

  it('acota sample_rate a 0..1', () => {
    expect(parseSessionReplayPayload({ sample_rate: 2 }).sample_rate).toBe(1);
    expect(parseSessionReplayPayload({ sample_rate: -1 }).sample_rate).toBe(0.1);
  });

  it('parsea payload JSON string (PostHog flag payloads.true)', () => {
    expect(
      parseSessionReplayPayload('{"enabled":true,"sample_rate":0.25,"min_duration_ms":5000}')
    ).toEqual({
      enabled: true,
      sample_rate: 0.25,
      min_duration_ms: 5000
    });
  });
});

describe('shouldSampleSessionReplay', () => {
  it('rechaza rate 0', () => {
    expect(shouldSampleSessionReplay(0, () => 0)).toBe(false);
  });

  it('acepta rate 1', () => {
    expect(shouldSampleSessionReplay(1, () => 0.99)).toBe(true);
  });

  it('usa random para muestreo parcial', () => {
    expect(shouldSampleSessionReplay(0.5, () => 0.4)).toBe(true);
    expect(shouldSampleSessionReplay(0.5, () => 0.6)).toBe(false);
  });
});

describe('isSessionReplayPage', () => {
  const origLocation = globalThis.location;

  beforeEach(() => {
    resetSessionReplayStateForTests();
  });

  afterEach(() => {
    if (origLocation) {
      Object.defineProperty(globalThis, 'location', {
        value: origLocation,
        configurable: true
      });
    }
  });

  it('permite code.html', () => {
    Object.defineProperty(globalThis, 'location', {
      value: { pathname: '/code/code.html' },
      configurable: true
    });
    expect(isSessionReplayPage()).toBe(true);
  });

  it('rechaza settings.html', () => {
    Object.defineProperty(globalThis, 'location', {
      value: { pathname: '/popup/settings.html' },
      configurable: true
    });
    expect(isSessionReplayPage()).toBe(false);
  });
});
