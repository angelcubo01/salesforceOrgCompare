/**
 * Texto del banner de descubrimiento en la pantalla de inicio (Quick Open).
 */

export const LANDING_DISCOVER_SHORTCUT_WIN = 'Ctrl+K';
export const LANDING_DISCOVER_SHORTCUT_MAC = '⌘K';
export const LANDING_ENVIRONMENT_PRIMARY_SHORTCUT = 'Alt+1';
export const LANDING_ENVIRONMENT_SECONDARY_SHORTCUT = 'Alt+2';

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
  const environmentLead = t('code.landingEnvironmentShortcut');
  const primary = t('code.landingEnvironmentPrimary');
  const secondary = t('code.landingEnvironmentSecondary');
  const picklist = t('code.landingPicklistShortcut');
  return (
    `<span class="app-landing-discover-lead">${lead}</span>` +
    `<span class="app-landing-discover-shortcuts">${shortcuts}</span>` +
    `<span class="app-landing-discover-shortcut-sep" aria-hidden="true">·</span>` +
    `<span class="app-landing-discover-lead">${environmentLead}</span>` +
    `<span class="app-landing-discover-shortcut-group"><kbd>${LANDING_ENVIRONMENT_PRIMARY_SHORTCUT}</kbd><span class="app-landing-discover-shortcut-label">${primary}</span></span>` +
    `<span class="app-landing-discover-shortcut-group"><kbd>${LANDING_ENVIRONMENT_SECONDARY_SHORTCUT}</kbd><span class="app-landing-discover-shortcut-label">${secondary}</span></span>` +
    `<span class="app-landing-discover-shortcut-label">${picklist}</span>`
  );
}
