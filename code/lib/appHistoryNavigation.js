/**
 * History API: restaura estado de la app desde la URL al usar Atrás/Adelante del navegador.
 */
import { state } from '../core/state.js';
import {
  deriveOpFromDeepLink,
  parseCompareDeepLink,
  resolveItemFromDeepLink,
  setApplyingHistoryNavigation
} from './compareDeepLink.js';
import { applyDeepLinkOrgs } from './compareDeepLinkUi.js';
import { navigateToModeAndTool } from '../ui/appModeNav.js';
import { updateDocumentTitle } from '../ui/documentMeta.js';
import { saveItemsToStorage } from '../core/persistence.js';
import { renderSavedItems, syncListActiveHighlight } from '../ui/listUi.js';
import { renderEditor } from '../editor/editorRender.js';
import { applyFeatureControlsUi } from '../ui/featureControlsUi.js';
import { ensureRightOrgDistinctFromLeft } from '../ui/orgs.js';

let popstateHandlerBound = false;

/**
 * Aplica modo, herramienta, orgs e ítem desde un deep-link parseado.
 * @param {ReturnType<typeof parseCompareDeepLink>} parsed
 */
export async function applyAppStateFromUrl(parsed) {
  setApplyingHistoryNavigation(true);
  try {
    const op = deriveOpFromDeepLink(parsed);
    await navigateToModeAndTool(parsed.navMode || 'home', op, { userInitiated: false });

    applyDeepLinkOrgs(parsed);
    if (parsed.leftOrgId && !parsed.rightOrgId) {
      ensureRightOrgDistinctFromLeft();
    }

    if (parsed.itemType && parsed.itemKey && parsed.itemType !== 'PackageXml') {
      const { added } = resolveItemFromDeepLink(parsed, state, state.savedItems, { select: true });
      if (added) {
        saveItemsToStorage();
      }
      renderSavedItems();
      syncListActiveHighlight();
      await renderEditor();
    }

    updateDocumentTitle();
    applyFeatureControlsUi();
  } finally {
    setApplyingHistoryNavigation(false);
  }
}

/** Registra el listener `popstate` una sola vez. */
export function setupAppHistoryNavigation() {
  if (typeof window === 'undefined' || popstateHandlerBound) return;
  popstateHandlerBound = true;

  window.addEventListener('popstate', () => {
    const parsed = parseCompareDeepLink(window.location.search);
    void applyAppStateFromUrl(parsed);
  });
}
