import { describe, it, expect, beforeEach } from 'vitest';
import {
  FEATURE_FLAG_RELOAD_TTL_MS,
  reloadFeatureFlagsIfNeeded,
  resetFeatureFlagLoaderForTests,
  waitForFeatureFlags
} from '../shared/posthogFeatureFlagLoader.js';

describe('posthogFeatureFlagLoader', () => {
  beforeEach(() => {
    resetFeatureFlagLoaderForTests();
  });

  it('reload solo una vez dentro del TTL', () => {
    let reloads = 0;
    const ph = { reloadFeatureFlags: () => { reloads += 1; }, onFeatureFlags: (cb) => cb() };

    expect(reloadFeatureFlagsIfNeeded(ph)).toBe(true);
    expect(reloadFeatureFlagsIfNeeded(ph)).toBe(false);
    expect(reloads).toBe(1);
  });

  it('force ignora TTL', () => {
    let reloads = 0;
    const ph = { reloadFeatureFlags: () => { reloads += 1; } };

    reloadFeatureFlagsIfNeeded(ph);
    reloadFeatureFlagsIfNeeded(ph, { force: true });
    expect(reloads).toBe(2);
  });

  it('waitForFeatureFlags no dispara reload si flags ya listos', async () => {
    let reloads = 0;
    const ph = {
      reloadFeatureFlags: () => { reloads += 1; },
      onFeatureFlags: (cb) => cb()
    };
    reloadFeatureFlagsIfNeeded(ph);
    await waitForFeatureFlags(ph, 100);
    await waitForFeatureFlags(ph, 100);
    expect(reloads).toBe(1);
  });

  it('TTL configurado a 30 minutos', () => {
    expect(FEATURE_FLAG_RELOAD_TTL_MS).toBe(30 * 60 * 1000);
  });
});
