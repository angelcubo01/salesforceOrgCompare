import { describe, it, expect, beforeEach } from 'vitest';
import {
  FEATURE_FLAG_RELOAD_TTL_MS,
  MANAGED_POSTHOG_FEATURE_FLAGS,
  cacheManagedFeatureFlagsSnapshot,
  getCachedManagedFeatureFlag,
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

  it('guarda todas las flags gestionadas tras una única recarga', async () => {
    const ph = {
      isFeatureEnabled: (key) => key === 'sfoc_support',
      getFeatureFlagPayload: (key) => (key === 'sfoc_support' ? { enabled: true } : null)
    };

    await cacheManagedFeatureFlagsSnapshot(ph);

    await expect(getCachedManagedFeatureFlag('sfoc_support')).resolves.toMatchObject({
      enabled: true,
      payload: { enabled: true }
    });
    await expect(getCachedManagedFeatureFlag('sfoc_session_replay')).resolves.toMatchObject({
      enabled: false,
      payload: null
    });
    expect(MANAGED_POSTHOG_FEATURE_FLAGS).toEqual([
      'sfoc_feature_controls',
      'sfoc_popup_controls',
      'sfoc_apex_log_ai_advisor',
      'sfoc_session_replay',
      'sfoc_support'
    ]);
  });
});
