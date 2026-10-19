import { describe, it, expect } from 'vitest';
import { buildDiscoverBannerLineHtml } from '../shared/landingDiscoverBanner.js';

describe('landingDiscoverBanner', () => {
  const t = (key) => {
    if (key === 'code.landingDiscoverBanner') return 'Quick search:';
    if (key === 'code.landingDiscoverBannerWinLabel') return 'Windows';
    if (key === 'code.landingDiscoverBannerMacLabel') return 'Mac';
    if (key === 'code.landingEnvironmentShortcut') return 'Switch environment:';
    if (key === 'code.landingEnvironmentPrimary') return 'primary';
    if (key === 'code.landingEnvironmentSecondary') return 'comparison';
    if (key === 'code.landingPicklistShortcut') return 'then arrows + Enter';
    return key;
  };

  it('una sola línea con lead y atajos', () => {
    const html = buildDiscoverBannerLineHtml(t);
    expect(html).toContain('app-landing-discover-lead');
    expect(html).toContain('app-landing-discover-shortcuts');
    expect(html).toContain('<kbd>Ctrl+K</kbd>');
    expect(html).toContain('<kbd>⌘K</kbd>');
    expect(html).toContain('<kbd>Alt+1</kbd>');
    expect(html).toContain('<kbd>Alt+2</kbd>');
    expect(html).toContain('arrows + Enter');
  });
});
