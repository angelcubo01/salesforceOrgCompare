import { describe, it, expect } from 'vitest';
import {
  landingDiscoverBannerFromRemote,
  resolveLandingDiscoverBannerContent,
  buildDiscoverBannerLineHtml,
  landingDiscoverBannerHtml,
  LANDING_DISCOVER_SHORTCUT_WIN
} from '../shared/landingDiscoverBanner.js';

describe('landingDiscoverBanner', () => {
  const t = (key) => {
    if (key === 'code.landingDiscoverBanner') return 'Quick search:';
    if (key === 'code.landingDiscoverBannerWinLabel') return 'Windows';
    if (key === 'code.landingDiscoverBannerMacLabel') return 'Mac';
    return key;
  };

  it('una sola línea con lead y atajos', () => {
    const html = buildDiscoverBannerLineHtml(t);
    expect(html).toContain('app-landing-discover-lead');
    expect(html).toContain('app-landing-discover-shortcuts');
    expect(html).toContain('<kbd>Ctrl+Shift+P</kbd>');
    expect(html).toContain('<kbd>⌘⇧P</kbd>');
  });

  it('resolve sin remoto devuelve html en línea', () => {
    const c = resolveLandingDiscoverBannerContent(null, 'en', t);
    expect(c.isRemote).toBe(false);
    expect(c.html).toContain('app-landing-discover-shortcuts');
  });

  it('prioriza homeDiscoverBanner_es', () => {
    const msg = landingDiscoverBannerFromRemote(
      { homeDiscoverBanner_es: 'Novedad: usa Ctrl+Shift+P' },
      'es'
    );
    expect(msg).toBe('Novedad: usa Ctrl+Shift+P');
  });

  it('envuelve atajos en kbd (remoto)', () => {
    const html = landingDiscoverBannerHtml(`Pulsa ${LANDING_DISCOVER_SHORTCUT_WIN} ahora`);
    expect(html).toContain('<kbd>Ctrl+Shift+P</kbd>');
  });
});
