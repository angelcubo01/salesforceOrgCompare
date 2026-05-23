import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseBrowserFromUserAgent,
  buildGa4UserProperties,
  audienceParamsForEvent,
  resetTelemetryAudienceCache
} from '../shared/telemetryAudienceContext.js';

describe('parseBrowserFromUserAgent', () => {
  it('detecta Chrome major', () => {
    const r = parseBrowserFromUserAgent(
      'Mozilla/5.0 Chrome/148.0.0.0 Safari/537.36'
    );
    expect(r.browser).toBe('chrome');
    expect(r.browser_major).toBe('148');
  });
});

describe('buildGa4UserProperties', () => {
  it('formato value para MP', () => {
    const p = buildGa4UserProperties({ timezone: 'Europe/Madrid', os_platform: 'win' });
    expect(p.timezone).toEqual({ value: 'Europe/Madrid' });
    expect(p.os_platform).toEqual({ value: 'win' });
  });
});

describe('audienceParamsForEvent', () => {
  beforeEach(() => resetTelemetryAudienceCache());

  it('expone campos clave en el evento', () => {
    const p = audienceParamsForEvent({
      os_platform: 'win',
      browser: 'chrome',
      browser_major: '148',
      timezone: 'Europe/Madrid'
    });
    expect(p.os_platform).toBe('win');
    expect(p.browser_major).toBe('148');
  });
});
