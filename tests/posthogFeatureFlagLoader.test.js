import { describe, it, expect, beforeEach } from 'vitest';
import {
  FEATURE_FLAG_RELOAD_TTL_MS,
  refreshFeatureFlagsIfStale,
  reloadFeatureFlagsIfNeeded,
  resetFeatureFlagLoaderForTests,
  waitForFeatureFlags
} from '../shared/posthogFeatureFlagLoader.js';

describe('posthogFeatureFlagLoader', () => {
  beforeEach(() => {
    resetFeatureFlagLoaderForTests();
  });

  it('solo el refresco explícito del popup llama a reloadFeatureFlags', async () => {
    let reloads = 0;
    let onFlags;
    const ph = {
      reloadFeatureFlags: () => {
        reloads += 1;
        setTimeout(() => onFlags?.(), 0);
      },
      onFeatureFlags: (cb) => { onFlags = cb; },
      featureFlags: { setReloadingPaused: () => {} }
    };

    await expect(refreshFeatureFlagsIfStale(ph)).resolves.toBe(true);
    expect(reloads).toBe(1);
  });

  it('deduplica dos revalidaciones simultáneas del popup', async () => {
    let reloads = 0;
    let onFlags;
    const ph = {
      reloadFeatureFlags: () => {
        reloads += 1;
        setTimeout(() => onFlags?.(), 0);
      },
      onFeatureFlags: (cb) => { onFlags = cb; },
      featureFlags: { setReloadingPaused: () => {} }
    };

    await Promise.all([refreshFeatureFlagsIfStale(ph), refreshFeatureFlagsIfStale(ph)]);
    expect(reloads).toBe(1);
  });

  it('los helpers pasivos nunca disparan una recarga', async () => {
    let reloads = 0;
    const ph = {
      reloadFeatureFlags: () => { reloads += 1; },
      onFeatureFlags: (cb) => cb()
    };

    expect(reloadFeatureFlagsIfNeeded(ph)).toBe(false);
    await waitForFeatureFlags(ph, 100);
    expect(reloads).toBe(0);
  });

  it('TTL configurado a 6 horas', () => {
    expect(FEATURE_FLAG_RELOAD_TTL_MS).toBe(6 * 60 * 60 * 1000);
  });
});
