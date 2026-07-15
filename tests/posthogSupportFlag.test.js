import { describe, it, expect, beforeEach } from 'vitest';
import {
  SUPPORT_FLAG,
  parseSupportFlagPayload,
  isPosthogSupportFlagEnabled,
  resetSupportFlagCacheForTests
} from '../shared/posthogSupportFlag.js';
import { resetFeatureFlagLoaderForTests } from '../shared/posthogFeatureFlagLoader.js';

describe('SUPPORT_FLAG', () => {
  it('usa la clave acordada con PostHog', () => {
    expect(SUPPORT_FLAG).toBe('sfoc_support');
  });
});

describe('parseSupportFlagPayload', () => {
  it('desactivado por defecto si el payload es inválido', () => {
    expect(parseSupportFlagPayload(null)).toEqual({ enabled: false });
    expect(parseSupportFlagPayload(undefined)).toEqual({ enabled: false });
  });

  it('respeta enabled true', () => {
    expect(parseSupportFlagPayload({ enabled: true })).toEqual({ enabled: true });
  });

  it('respeta enabled false', () => {
    expect(parseSupportFlagPayload({ enabled: false })).toEqual({ enabled: false });
  });

  it('parsea payload JSON string', () => {
    expect(parseSupportFlagPayload('{"enabled":true}')).toEqual({ enabled: true });
  });
});

describe('isPosthogSupportFlagEnabled', () => {
  beforeEach(() => {
    resetSupportFlagCacheForTests();
    resetFeatureFlagLoaderForTests();
  });

  it('devuelve false sin cliente PostHog', async () => {
    expect(await isPosthogSupportFlagEnabled(null)).toBe(false);
  });

  it('devuelve false si el flag no es true', async () => {
    const ph = {
      isFeatureEnabled: () => false,
      getFeatureFlagPayload: () => ({ enabled: true }),
      onFeatureFlags: (cb) => cb(),
      reloadFeatureFlags: () => {}
    };
    expect(await isPosthogSupportFlagEnabled(ph)).toBe(false);
  });

  it('devuelve false si payload.enabled es false', async () => {
    const ph = {
      isFeatureEnabled: () => true,
      getFeatureFlagPayload: () => ({ enabled: false }),
      onFeatureFlags: (cb) => cb(),
      reloadFeatureFlags: () => {}
    };
    expect(await isPosthogSupportFlagEnabled(ph)).toBe(false);
  });

  it('devuelve true si flag true y payload enabled', async () => {
    const ph = {
      isFeatureEnabled: () => true,
      getFeatureFlagPayload: () => ({ enabled: true }),
      onFeatureFlags: (cb) => cb(),
      reloadFeatureFlags: () => {}
    };
    expect(await isPosthogSupportFlagEnabled(ph)).toBe(true);
  });
});
