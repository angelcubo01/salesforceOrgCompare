import { describe, it, expect, beforeEach } from 'vitest';
import {
  POPUP_CONTROLS_FLAG,
  loadPopupControlsFromPosthog,
  resetPopupControlsFlagCacheForTests,
  getCachedPopupControlsConfig
} from '../shared/posthogPopupControlsFlag.js';
import { resetFeatureFlagLoaderForTests } from '../shared/posthogFeatureFlagLoader.js';

describe('POPUP_CONTROLS_FLAG', () => {
  it('usa la clave acordada con PostHog', () => {
    expect(POPUP_CONTROLS_FLAG).toBe('sfoc_popup_controls');
  });
});

describe('loadPopupControlsFromPosthog', () => {
  beforeEach(() => {
    resetPopupControlsFlagCacheForTests();
    resetFeatureFlagLoaderForTests();
  });

  it('devuelve defaults sin cliente PostHog', async () => {
    const cfg = await loadPopupControlsFromPosthog(null);
    expect(cfg.flagActive).toBe(false);
    expect(cfg.notice).toBeNull();
  });

  it('parsea payload cuando el flag es true', async () => {
    const ph = {
      isFeatureEnabled: () => true,
      getFeatureFlagPayload: () => ({
        version: 1,
        notice: { enabled: true, es: 'Aviso', en: 'Notice', severity: 'error' },
        openApp: { disabled: true }
      }),
      onFeatureFlags: (cb) => cb(),
      reloadFeatureFlags: () => {}
    };
    const cfg = await loadPopupControlsFromPosthog(ph);
    expect(cfg.flagActive).toBe(true);
    expect(cfg.notice?.severity).toBe('error');
    expect(cfg.openApp.disabled).toBe(true);
    expect(getCachedPopupControlsConfig().openApp.disabled).toBe(true);
  });

  it('devuelve defaults si el flag es false', async () => {
    const ph = {
      isFeatureEnabled: () => false,
      getFeatureFlagPayload: () => ({
        notice: { enabled: true, es: 'Aviso', en: 'Notice' }
      }),
      onFeatureFlags: (cb) => cb(),
      reloadFeatureFlags: () => {}
    };
    const cfg = await loadPopupControlsFromPosthog(ph);
    expect(cfg.flagActive).toBe(false);
    expect(cfg.notice).toBeNull();
  });
});
