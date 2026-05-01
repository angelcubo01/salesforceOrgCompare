import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { saveScrollPosition } from '../ui/scrollRestore.js';
import { renderEditor, focusDiffAtIndex, navigateViewerChunk } from '../editor/editorRender.js';
import { applyWordWrapToCurrentEditors } from '../editor/monaco.js';
import { updateOrgDropdownLayout, updateAuthIndicators } from '../ui/orgs.js';
import { renderSavedItems, removeAllItems } from '../ui/listUi.js';
import { saveItemsToStorage } from '../core/persistence.js';
import { downloadAllFiles, copyAllFileNames } from '../flows/fileActions.js';
import { getTotalDiffLines } from '../editor/diffUtils.js';
import { downloadDiffHtml } from '../editor/exportDiffHtml.js';
import { retrieveAndLoadFromZip } from '../flows/retrieveFlow.js';
import { getSelectedArtifactType } from '../ui/artifactTypeUi.js';
import { refreshGeneratePackageXmlTypes } from '../ui/generatePackageXmlPanel.js';
import { resetFieldDependencyToInitial } from '../ui/fieldDependencyPanel.js';
import { refreshApexTestsPanel } from '../ui/apexTestsPanel.js';
import { refreshAnonymousApexPanel } from '../ui/anonymousApexPanel.js';
import { refreshOrgLimitsPanel } from '../ui/orgLimitsPanel.js';
import { refreshDebugLogBrowserPanel } from '../ui/debugLogBrowserPanel.js';
import { refreshSetupAuditTrailPanel } from '../ui/setupAuditTrailPanel.js';
import { t } from '../../shared/i18n.js';

export function wireSelectors() {
  const left = document.getElementById('leftOrg');
  const right = document.getElementById('rightOrg');
  const leftReauth = document.getElementById('leftReauthBtn');
  const rightReauth = document.getElementById('rightReauthBtn');
  left.addEventListener('change', () => {
    if (state.selectedItem) {
      saveScrollPosition(state.selectedItem, state.leftOrgId, state.rightOrgId);
    }
    const prevLeft = state.leftOrgId;
    state.leftOrgId = left.value || null;
    updateOrgDropdownLayout();
    updateAuthIndicators();
    const results = document.getElementById('searchResults');
    if (results) { results.style.display = 'none'; results.innerHTML = ''; }
    renderEditor({ leftChanged: true, rightChanged: false, prevLeftOrgId: prevLeft });
    if (getSelectedArtifactType() === 'GeneratePackageXml') {
      refreshGeneratePackageXmlTypes();
    }
    if (getSelectedArtifactType() === 'ApexTests') {
      void refreshApexTestsPanel();
    }
    if (getSelectedArtifactType() === 'FieldDependency') {
      resetFieldDependencyToInitial();
    }
    if (getSelectedArtifactType() === 'AnonymousApex') {
      void refreshAnonymousApexPanel();
    }
    if (getSelectedArtifactType() === 'OrgLimits') {
      void refreshOrgLimitsPanel();
    }
    if (getSelectedArtifactType() === 'DebugLogBrowser') {
      void refreshDebugLogBrowserPanel();
    }
    if (getSelectedArtifactType() === 'SetupAuditTrail') {
      void refreshSetupAuditTrailPanel();
    }
  });
  right.addEventListener('change', () => {
    if (state.selectedItem) {
      saveScrollPosition(state.selectedItem, state.leftOrgId, state.rightOrgId);
    }
    const prevRight = state.rightOrgId;
    state.rightOrgId = right.value || null;
    updateOrgDropdownLayout();
    updateAuthIndicators();
    renderEditor({ leftChanged: false, rightChanged: true, prevRightOrgId: prevRight });
    if (getSelectedArtifactType() === 'FieldDependency') {
      resetFieldDependencyToInitial();
    }
    if (getSelectedArtifactType() === 'AnonymousApex') {
      void refreshAnonymousApexPanel();
    }
    if (getSelectedArtifactType() === 'OrgLimits') {
      void refreshOrgLimitsPanel();
    }
    if (getSelectedArtifactType() === 'DebugLogBrowser') {
      void refreshDebugLogBrowserPanel();
    }
    if (getSelectedArtifactType() === 'SetupAuditTrail') {
      void refreshSetupAuditTrailPanel();
    }
  });

  leftReauth.addEventListener('click', async () => {
    if (!state.leftOrgId) return;
    await bg({ type: 'auth:reauth', orgId: state.leftOrgId });
  });
  rightReauth.addEventListener('click', async () => {
    if (!state.rightOrgId) return;
    await bg({ type: 'auth:reauth', orgId: state.rightOrgId });
  });
}

export function setupResizable() {
  const sidebar = document.querySelector('.sidebar');
  const resizeHandle = document.querySelector('.resize-handle');
  let isResizing = false;

  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    const newWidth = e.clientX;
    const minWidth = 200;
    const maxWidth = 500;
    
    if (newWidth >= minWidth && newWidth <= maxWidth) {
      sidebar.style.width = newWidth + 'px';
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

export function setupDragAndDrop() {
  const list = document.getElementById('leftList');
  let draggedElement = null;
  let draggedIndex = null;
  let placeholder = null;

  list.addEventListener('dragstart', (e) => {
    draggedElement = e.target;
    draggedIndex = parseInt(e.target.getAttribute('data-item-index'));
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    
    
    // Create placeholder element
    placeholder = document.createElement('div');
    placeholder.className = 'drag-placeholder';
    placeholder.style.display = 'none';
    list.appendChild(placeholder);
  });

  list.addEventListener('dragend', (e) => {
    e.target.classList.remove('dragging');
    
    // Remove placeholder
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.removeChild(placeholder);
    }
    placeholder = null;
  });

  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const afterElement = getDragAfterElement(list, e.clientY);
    
    if (placeholder) {
      placeholder.style.display = 'block';
      
      if (afterElement == null) {
        list.appendChild(placeholder);
      } else {
        list.insertBefore(placeholder, afterElement);
      }
    }
  });

  list.addEventListener('drop', (e) => {
    e.preventDefault();
    
    if (draggedElement && draggedIndex !== null && placeholder) {
      // Find the placeholder position among actual list items
      const listItems = Array.from(list.children).filter(child => child.tagName === 'LI');
      const placeholderIndex = Array.from(list.children).indexOf(placeholder);
      
      // Calculate new index based on placeholder position
      let newIndex = placeholderIndex;
      
      // Adjust index if moving down (placeholder is after the dragged item)
      if (placeholderIndex > draggedIndex) {
        newIndex = placeholderIndex - 1;
      }
      
      if (newIndex !== draggedIndex && newIndex >= 0 && newIndex < state.savedItems.length) {
        // Get the current display order of items
        const displayOrder = Array.from(list.children)
          .filter(child => child.tagName === 'LI')
          .map(li => {
            const displayIndex = parseInt(li.getAttribute('data-item-index'));
            return state.savedItems[displayIndex];
          });
        
        // Reorder the items in the display order
        const draggedItem = displayOrder[draggedIndex];
        displayOrder.splice(draggedIndex, 1);
        displayOrder.splice(newIndex, 0, draggedItem);
        
        // Update state with new order
        state.savedItems = displayOrder;
        
        // Save the new order
        saveItemsToStorage();
        
        // Re-render the list with new order (preserve manual order)
        renderSavedItems(true);
      }
    }
    
    // Remove placeholder
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.removeChild(placeholder);
    }
    placeholder = null;
  });

  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('li:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  function updateItemIndices() {
    document.querySelectorAll('.list li').forEach((li, index) => {
      li.setAttribute('data-item-index', index);
    });
  }
}

export function setupDownloadAll() {
  const downloadAllBtn = document.getElementById('downloadAllBtn');
  if (downloadAllBtn) {
    downloadAllBtn.addEventListener('click', async () => {
      await downloadAllFiles();
    });
  }
}

export function setupCopyAll() {
  const copyAllBtn = document.getElementById('copyAllBtn');
  if (copyAllBtn) {
    copyAllBtn.addEventListener('click', async () => {
      await copyAllFileNames();
    });
  }
}

export function setupClearHistoryButton() {
  const clearBtn = document.getElementById('clearHistoryButton');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      removeAllItems();
    });
  }
}

export function setupRemoveAll() {
  const removeAllBtn = document.getElementById('removeAllBtn');
  if (removeAllBtn) {
    removeAllBtn.addEventListener('click', () => {
      removeAllItems();
    });
  }
}

export function setupModifierKeyTracking() {
  const updateModifierState = (e) => {
    // Check if Cmd (Mac) or Ctrl (Windows/Linux) is pressed
    const isPressed = e.metaKey || e.ctrlKey;
    if (state.modifierKeyPressed !== isPressed) {
      state.modifierKeyPressed = isPressed;
      if (isPressed) {
        document.body.classList.add('modifier-pressed');
      } else {
        document.body.classList.remove('modifier-pressed');
      }
    }
  };

  // Listen for keydown events to detect when modifier is pressed
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Meta' || e.key === 'Control' || e.metaKey || e.ctrlKey) {
      updateModifierState(e);
    }
  });

  // Listen for keyup events to detect when modifier is released
  document.addEventListener('keyup', (e) => {
    // When Meta or Control key is released, check if any modifier is still pressed
    if (e.key === 'Meta' || e.key === 'Control') {
      // Use a small delay to ensure the keyup event has fully processed
      setTimeout(() => {
        const stillPressed = e.metaKey || e.ctrlKey;
        // If no modifier is pressed, update state
        if (!stillPressed && state.modifierKeyPressed) {
          state.modifierKeyPressed = false;
          document.body.classList.remove('modifier-pressed');
        }
      }, 10);
    }
  });

  // Also check on mousedown/mouseup to catch modifier state changes during mouse interactions
  document.addEventListener('mousedown', updateModifierState);
  document.addEventListener('mouseup', updateModifierState);
  
  // Handle blur event (when window loses focus) to reset state
  window.addEventListener('blur', () => {
    if (state.modifierKeyPressed) {
      state.modifierKeyPressed = false;
      document.body.classList.remove('modifier-pressed');
    }
  });
}

export function setupDiffNavigation() {
  const prevBtn = document.getElementById('prevDiffBtn');
  const nextBtn = document.getElementById('nextDiffBtn');
  const exportDiffHtmlBtn = document.getElementById('exportDiffHtmlBtn');
  const diffStatus = document.getElementById('diffStatus');
  const retrieveAllBtn = document.getElementById('retrieveAllBtn');

  function updateButtons() {
    const hasDiffs = state.diffChanges && state.diffChanges.length > 0 && state.currentDiffIndex >= 0;
    if (prevBtn) prevBtn.disabled = !hasDiffs || state.currentDiffIndex <= 0;
    if (nextBtn) nextBtn.disabled = !hasDiffs || state.currentDiffIndex >= state.diffChanges.length - 1;
    if (exportDiffHtmlBtn) {
      exportDiffHtmlBtn.disabled = !state.diffEditor || !hasDiffs;
    }
    if (diffStatus) {
      if (!hasDiffs) {
        diffStatus.textContent = t('diff.noDifferences');
      } else {
        const totalLines = getTotalDiffLines(state.diffChanges);
        diffStatus.textContent = t('diff.status', { current: state.currentDiffIndex + 1, total: state.diffChanges.length, lines: totalLines });
      }
    }
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (!state.diffChanges || !state.diffChanges.length) return;
      if (state.diffEditor && typeof state.diffEditor.goToDiff === 'function') {
        state.diffEditor.goToDiff('previous');
        state.currentDiffIndex = Math.max(0, state.currentDiffIndex - 1);
        updateButtons();
        return;
      }
      if (state.currentDiffIndex <= 0) return;
      state.currentDiffIndex -= 1;
      focusDiffAtIndex(state.currentDiffIndex);
      updateButtons();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (!state.diffChanges || !state.diffChanges.length) return;
      if (state.diffEditor && typeof state.diffEditor.goToDiff === 'function') {
        state.diffEditor.goToDiff('next');
        state.currentDiffIndex = Math.min(state.diffChanges.length - 1, state.currentDiffIndex + 1);
        updateButtons();
        return;
      }
      if (state.currentDiffIndex >= state.diffChanges.length - 1) return;
      state.currentDiffIndex += 1;
      focusDiffAtIndex(state.currentDiffIndex);
      updateButtons();
    });
  }

  state.updateDiffNavButtons = updateButtons;

  const wsBtn = document.getElementById('toggleWhitespaceBtn');
  if (wsBtn) {
    state.ignoreTrimWhitespace = false;
    wsBtn.addEventListener('click', () => {
      state.ignoreTrimWhitespace = !state.ignoreTrimWhitespace;
      wsBtn.classList.toggle('active', state.ignoreTrimWhitespace);
      wsBtn.title = state.ignoreTrimWhitespace ? t('code.whitespaceOn') : t('code.whitespaceOff');
      if (state.diffEditor) {
        state.diffEditor.updateOptions({ ignoreTrimWhitespace: state.ignoreTrimWhitespace });
      }
    });
  }

  const wwBtn = document.getElementById('toggleWordWrapBtn');
  if (wwBtn) {
    const syncWordWrapUi = () => {
      wwBtn.classList.toggle('active', !!state.wordWrapEnabled);
      wwBtn.title = state.wordWrapEnabled ? t('code.wordWrapOn') : t('code.wordWrapOff');
    };
    syncWordWrapUi();
    wwBtn.addEventListener('click', () => {
      state.wordWrapEnabled = !state.wordWrapEnabled;
      applyWordWrapToCurrentEditors();
      syncWordWrapUi();
    });
  }

  if (exportDiffHtmlBtn) {
    exportDiffHtmlBtn.addEventListener('click', () => {
      downloadDiffHtml(state);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (prevBtn) prevBtn.click();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (nextBtn) nextBtn.click();
    }
  });

  const viewerChunkPrev = document.getElementById('viewerChunkPrev');
  const viewerChunkNext = document.getElementById('viewerChunkNext');
  if (viewerChunkPrev) {
    viewerChunkPrev.addEventListener('click', () => navigateViewerChunk(-1));
  }
  if (viewerChunkNext) {
    viewerChunkNext.addEventListener('click', () => navigateViewerChunk(1));
  }

  // Wire retrieve button (solo para tipos con retrieve)
  if (retrieveAllBtn) {
    retrieveAllBtn.addEventListener('click', async () => {
      if (!state.selectedItem) return;
      const item = state.selectedItem;
      if (
        item.type !== 'PermissionSet' &&
        item.type !== 'Profile' &&
        item.type !== 'FlexiPage' &&
        item.type !== 'PackageXml'
      ) {
        return;
      }
      await retrieveAndLoadFromZip(item);
    });
  }
}

export function setupSidebarToggle() {
  const toggleBtn = document.getElementById('toggleSidebarBtn');
  if (!toggleBtn) return;
  toggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('sidebar-collapsed');
  });
}
