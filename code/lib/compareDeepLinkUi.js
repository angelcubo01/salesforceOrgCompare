/**
 * Aplica deep-link al DOM / estado y selecciona ítem en la lista lateral.
 */
import { state } from '../core/state.js';
import { saveItemsToStorage } from '../core/persistence.js';
import { renderSavedItems, syncListActiveHighlight } from '../ui/listUi.js';
import { updateDocumentTitle } from '../ui/documentMeta.js';
import { applyArtifactTypeUi } from '../ui/artifactTypeUi.js';
import {
  operationSelectValueForItemType,
  resolveItemFromDeepLink
} from './compareDeepLink.js';

/**
 * @param {{ leftOrgId?: string | null, rightOrgId?: string | null }} parsed
 */
export function applyDeepLinkOrgs(parsed) {
  if (parsed.leftOrgId) {
    state.leftOrgId = parsed.leftOrgId;
    const left = document.getElementById('leftOrg');
    if (left) left.value = parsed.leftOrgId;
  }
  if (parsed.rightOrgId) {
    state.rightOrgId = parsed.rightOrgId;
    const right = document.getElementById('rightOrg');
    if (right) right.value = parsed.rightOrgId;
  }
}

/**
 * Restaura orgs e ítem del enlace sin cargar Monaco: rellena la búsqueda para que el usuario elija.
 * @param {ReturnType<import('./compareDeepLink.js').parseCompareDeepLink>} parsed
 */
export function applyDeepLinkItemHint(parsed) {
  if (!parsed.itemType || !parsed.itemKey) return;

  const op = parsed.op || operationSelectValueForItemType(parsed.itemType);
  const typeSelect = document.getElementById('typeSelect');
  if (op && typeSelect) {
    const hasOp = [...typeSelect.options].some((o) => o.value === op);
    if (hasOp) {
      typeSelect.value = op;
      state.selectedArtifactType = op;
    }
  }
  applyArtifactTypeUi();

  const { added } = resolveItemFromDeepLink(parsed, state, state.savedItems, { select: false });
  if (added) {
    saveItemsToStorage();
    renderSavedItems();
  }

  state.selectedItem = null;
  syncListActiveHighlight();

  const searchInput = document.getElementById('searchInput');
  const hintName =
    parsed.fileName ||
    (parsed.itemKey.includes('/') ? parsed.itemKey.split('/').pop() : parsed.itemKey) ||
    parsed.itemKey;
  if (searchInput && hintName) {
    searchInput.disabled = false;
    searchInput.value = hintName;
  }

  updateDocumentTitle();
}

/** @deprecated Usar applyDeepLinkItemHint (no abre comparación hasta elegir en búsqueda). */
export function selectListItemFromDeepLink(parsed) {
  applyDeepLinkItemHint(parsed);
}
