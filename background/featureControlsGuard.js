import {
  getActionNotice,
  isActionDisabled,
  resolveFeatureControlMessageText
} from '../shared/featureControls.js';
import {
  hydrateFeatureControlsCache,
  readFeatureControlsCache,
  FEATURE_CONTROLS_STORAGE_KEY
} from '../shared/featureControlsCache.js';

/** @type {import('../shared/featureControls.js').FeatureControlsConfig | null} */
let config = null;

export async function installFeatureControlsGuard() {
  config = await hydrateFeatureControlsCache();
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[FEATURE_CONTROLS_STORAGE_KEY]) return;
      const raw = changes[FEATURE_CONTROLS_STORAGE_KEY].newValue;
      void readFeatureControlsCache().then((c) => {
        config = c;
      });
    });
  }
}

/**
 * @param {string} actionId
 * @param {string} [lang]
 * @returns {{ ok: false, error: string, featureControlBlocked: true } | null}
 */
export function featureControlBlockedResponse(actionId, lang = 'es') {
  const cfg = config;
  if (!cfg || !isActionDisabled(cfg, actionId)) return null;
  const notice = getActionNotice(cfg, actionId, lang);
  const message =
    notice?.message ||
    resolveFeatureControlMessageText(
      { es: 'Acción temporalmente deshabilitada.', en: 'Action temporarily disabled.', severity: 'error' },
      lang
    );
  return { ok: false, error: message, featureControlBlocked: true };
}
