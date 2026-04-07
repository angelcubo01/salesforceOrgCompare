import { state } from '../core/state.js';
import { getFileKey } from '../lib/itemLabels.js';

export function saveScrollPosition(item, leftOrgId, rightOrgId) {
  if (!item) return;
  
  const fileKey = getFileKey(item, leftOrgId, rightOrgId);
  
  if (rightOrgId && state.diffEditor) {
    // Save scroll positions for both editors in diff mode
    try {
      const originalScrollTop = state.diffEditor.getOriginalEditor().getScrollTop();
      const modifiedScrollTop = state.diffEditor.getModifiedEditor().getScrollTop();
      state.scrollPositions[fileKey] = {
        original: originalScrollTop,
        modified: modifiedScrollTop
      };
    } catch (e) {
      // Ignore errors
    }
  } else if (!rightOrgId && state.editor) {
    // Save scroll position for single editor
    try {
      const scrollTop = state.editor.getScrollTop();
      state.scrollPositions[fileKey] = {
        single: scrollTop
      };
    } catch (e) {
      // Ignore errors
    }
  }
}

export function restoreScrollPosition(item, leftOrgId, rightOrgId) {
  if (!item) return;
  
  const fileKey = getFileKey(item, leftOrgId, rightOrgId);
  const savedPosition = state.scrollPositions[fileKey];
  
  if (!savedPosition) return;
  
  // Use setTimeout to ensure the editor has finished rendering
  setTimeout(() => {
    if (rightOrgId && state.diffEditor && savedPosition.original !== undefined && savedPosition.modified !== undefined) {
      // Restore scroll positions for both editors in diff mode
      try {
        state.diffEditor.getOriginalEditor().setScrollTop(savedPosition.original);
        state.diffEditor.getModifiedEditor().setScrollTop(savedPosition.modified);
      } catch (e) {
        // Ignore errors
      }
    } else if (!rightOrgId && state.editor && savedPosition.single !== undefined) {
      // Restore scroll position for single editor
      try {
        state.editor.setScrollTop(savedPosition.single);
      } catch (e) {
        // Ignore errors
      }
    }
  }, 50);
}
