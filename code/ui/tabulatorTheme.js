/**
 * Integración de tema para Tabulator.
 *
 * Los colores viven en variables CSS, de modo que las filas ya renderizadas y
 * las que recicla el DOM virtual cambian de tema sin recorrer el contenido de
 * la tabla. Solo se fuerza un redibujado al cambiar el tema para que Tabulator
 * recalcule medidas de cabeceras y columnas.
 */

function themeName(doc) {
  return doc?.documentElement?.dataset?.uiTheme === 'light' ? 'light' : 'dark';
}

/** @param {{ getElement?: () => HTMLElement | null } | null | undefined} row */
export function styleTabulatorRow(row) {
  row?.getElement?.()?.classList.add('sfoc-tabulator-row');
}

function syncThemeMarker(table, redraw = false) {
  const root = table?.getElement?.();
  if (!root) return;
  root.dataset.sfocTheme = themeName(root.ownerDocument);
  if (redraw) table?.redraw?.(true);
}

/** Libera listeners propios antes de destruir una tabla. */
export function disposeTabulatorTheme(table) {
  const binding = table?.__sfocThemeBinding;
  if (!binding) return;
  binding.observer?.disconnect?.();
  binding.doc?.removeEventListener?.('sfoc:theme-ui-synced', binding.refresh);
  if (binding.animationFrame) {
    binding.doc?.defaultView?.cancelAnimationFrame?.(binding.animationFrame);
  }
  delete table.__sfocThemeBinding;
}

/** @param {any} table */
export function applyTabulatorTheme(table) {
  syncThemeMarker(table);
  if (table?.__sfocThemeBinding) return;
  const root = table?.getElement?.();
  const doc = root?.ownerDocument;
  if (!doc?.documentElement) return;

  const binding = {
    animationFrame: 0,
    doc,
    observer: null,
    refresh: null
  };
  binding.refresh = () => {
    if (binding.animationFrame) return;
    const schedule = doc.defaultView?.requestAnimationFrame || ((callback) => setTimeout(callback, 0));
    binding.animationFrame = schedule(() => {
      binding.animationFrame = 0;
      syncThemeMarker(table, true);
    });
  };
  binding.observer = typeof MutationObserver === 'undefined'
    ? null
    : new MutationObserver(binding.refresh);
  binding.observer?.observe(doc.documentElement, {
    attributes: true,
    attributeFilter: ['data-ui-theme']
  });
  // El evento hace la actualización inmediata desde el toggle; el observer
  // cubre cambios de ajustes, restauraciones y llamadas externas.
  doc.addEventListener?.('sfoc:theme-ui-synced', binding.refresh);
  table.__sfocThemeBinding = binding;
}
