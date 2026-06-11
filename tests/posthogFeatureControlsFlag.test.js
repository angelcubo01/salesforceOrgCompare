import { describe, it, expect, beforeEach } from 'vitest';
import {
  FEATURE_CONTROLS_FLAG,
  bootstrapFeatureControls,
  loadFeatureControlsFromPosthog,
  resetFeatureControlsFlagCacheForTests,
  getCachedFeatureControlsConfig
} from '../shared/posthogFeatureControlsFlag.js';
import { resetFeatureFlagLoaderForTests } from '../shared/posthogFeatureFlagLoader.js';
import { resetFeatureControlsCacheForTests } from '../shared/featureControlsCache.js';
import { isToolVisible } from '../shared/featureControls.js';

describe('FEATURE_CONTROLS_FLAG', () => {
  it('usa la clave acordada con PostHog', () => {
    expect(FEATURE_CONTROLS_FLAG).toBe('sfoc_feature_controls');
  });
});

describe('loadFeatureControlsFromPosthog', () => {
  beforeEach(() => {
    resetFeatureControlsFlagCacheForTests();
    resetFeatureFlagLoaderForTests();
    resetFeatureControlsCacheForTests();
  });

  it('devuelve defaults sin cliente PostHog', async () => {
    const cfg = await loadFeatureControlsFromPosthog(null);
    expect(cfg.tools).toEqual({});
    expect(isToolVisible(cfg, 'ApexTests')).toBe(true);
  });

  it('parsea payload cuando el flag es true', async () => {
    const ph = {
      isFeatureEnabled: () => true,
      getFeatureFlagPayload: () => ({
        version: 1,
        tools: { ApexTests: { hidden: true } }
      }),
      onFeatureFlags: (cb) => cb(),
      reloadFeatureFlags: () => {}
    };
    const cfg = await loadFeatureControlsFromPosthog(ph);
    expect(cfg.tools.ApexTests).toEqual({ hidden: true });
    expect(getCachedFeatureControlsConfig().tools.ApexTests).toEqual({ hidden: true });
  });

  it('usa caché de storage si los flags no llegan a tiempo', async () => {
    const { setFeatureControlsMemoryCache } = await import('../shared/featureControlsCache.js');
    setFeatureControlsMemoryCache({
      version: 1,
      tools: { QuickEdit: { hidden: true } },
      modes: {},
      metadataTypes: {},
      actions: {}
    });
    const ph = {
      isFeatureEnabled: () => true,
      getFeatureFlagPayload: () => null,
      onFeatureFlags: () => {},
      reloadFeatureFlags: () => {}
    };
    const cfg = await loadFeatureControlsFromPosthog(ph, { force: true, timeoutMs: 1 });
    expect(cfg.tools.QuickEdit).toEqual({ hidden: true });
  });

  it('devuelve defaults si el flag es false', async () => {
    const ph = {
      isFeatureEnabled: () => false,
      getFeatureFlagPayload: () => ({
        tools: { ApexTests: { hidden: true } }
      }),
      onFeatureFlags: (cb) => cb(),
      reloadFeatureFlags: () => {}
    };
    const cfg = await loadFeatureControlsFromPosthog(ph);
    expect(cfg.tools).toEqual({});
  });
});
