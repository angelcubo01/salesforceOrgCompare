/**
 * Texto del banner de descubrimiento en la pantalla de inicio (Quick Open).
 */

export const LANDING_DISCOVER_SHORTCUT_WIN = 'Ctrl+Shift+P';
export const LANDING_DISCOVER_SHORTCUT_MAC = '⌘⇧P';

/**
 * @param {(key: string, params?: Record<string, string>) => string} t
 */
export function defaultLandingDiscoverBannerText(t) {
  return t('code.landingDiscoverBanner');
}

/**
 * @param {(key: string, params?: Record<string, string>) => string} t
 */
export function buildStructuredDiscoverBannerShortcutsHtml(t) {
  const winLabel = t('code.landingDiscoverBannerWinLabel');
  const macLabel = t('code.landingDiscoverBannerMacLabel');
  return (
    `<span class="app-landing-discover-shortcut-group">` +
    `<kbd>${LANDING_DISCOVER_SHORTCUT_WIN}</kbd>` +
    `<span class="app-landing-discover-shortcut-label">${winLabel}</span>` +
    `</span>` +
    `<span class="app-landing-discover-shortcut-sep" aria-hidden="true">·</span>` +
    `<span class="app-landing-discover-shortcut-group">` +
    `<kbd>${LANDING_DISCOVER_SHORTCUT_MAC}</kbd>` +
    `<span class="app-landing-discover-shortcut-label">${macLabel}</span>` +
    `</span>`
  );
}

/** Una sola línea: texto + atajos (i18n). */
export function buildDiscoverBannerLineHtml(t) {
  const lead = defaultLandingDiscoverBannerText(t);
  const shortcuts = buildStructuredDiscoverBannerShortcutsHtml(t);
  return (
    `<span class="app-landing-discover-lead">${lead}</span>` +
    `<span class="app-landing-discover-shortcuts">${shortcuts}</span>`
  );
}
