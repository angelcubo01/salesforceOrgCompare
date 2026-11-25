import { state } from '../core/state.js';
import { applyArtifactTypeUi } from './artifactTypeUi.js';
import { saveScrollPosition } from './scrollRestore.js';
import { renderEditor } from '../editor/editorRender.js';
import { syncCompareUrlFromState } from '../lib/compareDeepLink.js';

const TOGGLE_ID = 'comparatorSingleViewToggle';

/**
 * Desactiva la «Vista única» sin renderizar. Los flujos que abren una comparación
 * real desde otra herramienta (p. ej. Comparar tipo de metadata → abrir diff) la
 * llaman antes de navegar al Comparator, porque con una sola org no habría diff.
 */
export function resetComparatorSingleView() {
  state.comparatorSingleView = false;
  const toggle = /** @type {HTMLInputElement | null} */ (document.getElementById(TOGGLE_ID));
  if (toggle) toggle.checked = false;
}

/**
 * «Vista única» del Comparator: abre el componente solo en la org izquierda, sin diff.
 * Desactivada por defecto. Al activarla la org derecha se aparca (ver `stashAndClearRightOrg`)
 * y `renderEditor` ya sabe pintar un único editor cuando solo hay una org.
 */
export function setupComparatorSingleViewToggle() {
  const toggle = /** @type {HTMLInputElement | null} */ (document.getElementById(TOGGLE_ID));
  if (!toggle) return;
  toggle.checked = !!state.comparatorSingleView;
  toggle.addEventListener('change', () => {
    // Antes de aparcar la org derecha, para que el scroll del diff se guarde con su clave dual.
    if (state.selectedItem) {
      saveScrollPosition(state.selectedItem, state.leftOrgId, state.rightOrgId);
    }
    state.comparatorSingleView = !!toggle.checked;
    applyArtifactTypeUi();
    syncCompareUrlFromState(state, { method: 'replace' });
    // `rightChanged` reutiliza el fichero de la org izquierda ya descargado.
    void renderEditor({ leftChanged: false, rightChanged: true });
  });
}
