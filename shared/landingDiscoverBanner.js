/**
 * Texto del banner de descubrimiento en la pantalla de inicio (Quick Open, etc.).
 * Por defecto: i18n. Opcional: `homeDiscoverBanner` / `_es` / `_en` en version.json remoto.
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

/**
 * Mensaje remoto si existe (misma prioridad que homeBanner).
 * @param {Record<string, unknown> | null | undefined} remote
 * @param {'es' | 'en'} lang
 */
export function landingDiscoverBannerFromRemote(remote, lang) {
  if (!remote) return '';
  const es = String(remote.homeDiscoverBanner_es || '').trim();
  const en = String(remote.homeDiscoverBanner_en || '').trim();
  const gen = String(remote.homeDiscoverBanner || '').trim();
  return lang === 'es' ? es || gen || en : en || gen || es;
}

/**
 * @param {Record<string, unknown> | null | undefined} remote
 * @param {'es' | 'en'} lang
 * @param {(key: string, params?: Record<string, string>) => string} t
 * @returns {{ html: string, isRemote: boolean }}
 */
export function resolveLandingDiscoverBannerContent(remote, lang, t) {
  const fromRemote = landingDiscoverBannerFromRemote(remote, lang);
  if (fromRemote) {
    return {
      html: landingDiscoverBannerHtml(fromRemote),
      isRemote: true
    };
  }
  return {
    html: buildDiscoverBannerLineHtml(t),
    isRemote: false
  };
}

/** Escapa HTML y resalta atajos conocidos con &lt;kbd&gt; (texto remoto). */
export function landingDiscoverBannerHtml(plainText) {
  const raw = String(plainText || '');
  const esc = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const wrap = (s) => `<kbd>${s}</kbd>`;
  return esc
    .replaceAll(LANDING_DISCOVER_SHORTCUT_WIN, wrap(LANDING_DISCOVER_SHORTCUT_WIN))
    .replaceAll(LANDING_DISCOVER_SHORTCUT_MAC, wrap(LANDING_DISCOVER_SHORTCUT_MAC));
}
