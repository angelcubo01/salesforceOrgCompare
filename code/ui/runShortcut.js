import { getSelectedArtifactType } from './artifactTypeUi.js';

/**
 * Ctrl/⌘+Enter para ejecutar cuando el panel indicado está activo.
 * @param {string} artifactType
 * @param {() => void | Promise<void>} runFn
 * @param {{ allowInMonaco?: boolean }} [opts]
 */
export function bindRunShortcut(artifactType, runFn, opts = {}) {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
    if (getSelectedArtifactType() !== artifactType) return;
    if (!opts.allowInMonaco && isMonacoFocused()) return;
    const target = /** @type {HTMLElement | null} */ (e.target);
    if (target?.closest('.modal-backdrop, [role="dialog"]:not(.hidden)')) return;
    e.preventDefault();
    void runFn();
  });
}

function isMonacoFocused() {
  const active = document.activeElement;
  if (!active) return false;
  if (active.closest('.monaco-editor')) return true;
  if (active.classList?.contains('inputarea')) return true;
  return false;
}
