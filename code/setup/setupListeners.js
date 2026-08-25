import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { saveScrollPosition } from '../ui/scrollRestore.js';
import { renderEditor, focusDiffAtIndex, navigateViewerChunk } from '../editor/editorRender.js';
import { applyWordWrapToCurrentEditors, scheduleMonacoLayout } from '../editor/monaco.js';
import {
  updateOrgDropdownLayout,
  updateAuthIndicators,
  swapOrgs,
  syncTelemetryUserFromOrgState,
  pollAuthAfterReauth
} from '../ui/orgs.js';
import { removeAllItems } from '../ui/listUi.js';
import { downloadAllFiles, copyAllFileNames } from '../flows/fileActions.js';
import { getTotalDiffLines, advanceDiffIndex } from '../editor/diffUtils.js';
import { downloadDiffHtml } from '../editor/exportDiffHtml.js';
import { copyUnifiedDiffToClipboard } from '../editor/exportUnifiedDiff.js';
import { retrieveAndLoadFromZip } from '../flows/retrieveFlow.js';
import { resolveRetrieveTargetItem } from '../ui/viewerChrome.js';
import { getSelectedArtifactType } from '../ui/artifactTypeUi.js';
import { refreshGeneratePackageXmlTypes } from '../ui/generatePackageXmlPanel.js';
import {
  invalidateMetadataTypeComparePanel,
  refreshMetadataTypeComparePanel
} from '../ui/metadataTypeComparePanel.js';
import { resetFieldDependencyToInitial } from '../ui/fieldDependencyPanel.js';
import { resetDependencyExplorerPanel } from '../ui/dependencyExplorerPanel.js';
import { refreshApexTestsPanel } from '../ui/apexTestsPanel.js';
import { refreshAnonymousApexPanel } from '../ui/anonymousApexPanel.js';
import { refreshQueryExplorerPanel } from '../ui/queryExplorerPanel.js';
import { refreshObjectDescribePanel } from '../ui/objectDescribePanel.js';
import { refreshDataWorkbenchPanel } from '../ui/dataWorkbenchPanel.js';
import { refreshOrgLimitsPanel } from '../ui/orgLimitsPanel.js';
import { reloadEnvironmentStatusIfActive } from '../ui/environmentStatusPanel.js';
import { refreshDebugLogBrowserPanel } from '../ui/debugLogBrowserPanel.js';
import { refreshSetupAuditTrailPanel } from '../ui/setupAuditTrailPanel.js';
import { refreshFieldHistoryPanel } from '../ui/fieldHistoryPanel.js';
import { refreshPermissionDiffPanel } from '../ui/permissionDiffPanel.js';
import { refreshQuickEditPanel } from '../ui/quickEditPanel.js';
import { refreshLightningQuickEditPanel } from '../ui/lightningQuickEditPanel.js';
import { refreshApexCoverageComparePanel } from '../ui/apexCoverageComparePanel.js';
import { refreshCustomSettingsComparePanel } from '../ui/customSettingsComparePanel.js';
import { refreshCustomMetadataComparePanel } from '../ui/customMetadataComparePanel.js';
import { refreshRecordComparePanel } from '../ui/recordComparePanel.js';
import { onDeployStatusOrgChange } from '../ui/deployStatusPanel.js';
import { confirmSfocAction } from '../ui/sfocModal.js';
import { t } from '../../shared/i18n.js';
import { syncCompareUrlFromState } from '../lib/compareDeepLink.js';
import { hideSidebarSearchResults } from '../ui/searchSetup.js';
import { refreshActiveToolOnOrgChange } from './orgChangeRefresh.js';

export function wireSelectors() {
  const left = document.getElementById('leftOrg');
  const right = document.getElementById('rightOrg');
  const leftReauth = document.getElementById('leftReauthBtn');
  const rightReauth = document.getElementById('rightReauthBtn');
  if (!left || !right) return;
  left.addEventListener('change', () => {
    if (state.selectedItem) {
      saveScrollPosition(state.selectedItem, state.leftOrgId, state.rightOrgId);
    }
    const prevLeft = state.leftOrgId;
    state.leftOrgId = left.value || null;
    updateOrgDropdownLayout();
    updateAuthIndicators();
    syncTelemetryUserFromOrgState();
    hideSidebarSearchResults();
    syncCompareUrlFromState(state, { method: 'push' });
    renderEditor({ leftChanged: true, rightChanged: false, prevLeftOrgId: prevLeft });
    refreshActiveToolOnOrgChange('left');
  });
  right.addEventListener('change', () => {
    if (state.selectedItem) {
      saveScrollPosition(state.selectedItem, state.leftOrgId, state.rightOrgId);
    }
    const prevRight = state.rightOrgId;
    state.rightOrgId = right.value || null;
    updateOrgDropdownLayout();
    updateAuthIndicators();
    syncTelemetryUserFromOrgState();
    syncCompareUrlFromState(state, { method: 'push' });
    renderEditor({ leftChanged: false, rightChanged: true, prevRightOrgId: prevRight });
    refreshActiveToolOnOrgChange('right');
  });

  if (leftReauth) {
    leftReauth.addEventListener('click', async () => {
      if (!state.leftOrgId) return;
      const orgId = state.leftOrgId;
      await bg({ type: 'auth:reauth', orgId });
      void pollAuthAfterReauth(orgId);
    });
  }
  if (rightReauth) {
    rightReauth.addEventListener('click', async () => {
      if (!state.rightOrgId) return;
      const orgId = state.rightOrgId;
      await bg({ type: 'auth:reauth', orgId });
      void pollAuthAfterReauth(orgId);
    });
  }

  const swapBtn = document.getElementById('swapOrgsBtn');
  if (swapBtn) {
    swapBtn.addEventListener('click', () => {
      void (async () => {
        await swapOrgs();
        if (getSelectedArtifactType() === 'GeneratePackageXml') {
          refreshGeneratePackageXmlTypes();
        }
        if (getSelectedArtifactType() === 'MetadataTypeCompare') {
          invalidateMetadataTypeComparePanel();
          void refreshMetadataTypeComparePanel();
        }
        if (getSelectedArtifactType() === 'ApexTests') {
          void refreshApexTestsPanel();
        }
        if (getSelectedArtifactType() === 'FieldDependency') {
          resetFieldDependencyToInitial();
        }
        if (getSelectedArtifactType() === 'DependencyExplorer') {
          resetDependencyExplorerPanel();
        }
        if (getSelectedArtifactType() === 'AnonymousApex') {
          void refreshAnonymousApexPanel();
        }
        if (getSelectedArtifactType() === 'QueryExplorer') {
          void refreshQueryExplorerPanel();
        }
        if (getSelectedArtifactType() === 'OrgLimits') {
          void refreshOrgLimitsPanel();
        }
        if (getSelectedArtifactType() === 'EnvironmentStatus') {
          void reloadEnvironmentStatusIfActive();
        }
        if (getSelectedArtifactType() === 'PermissionDiff') {
          void refreshPermissionDiffPanel();
        }
        if (getSelectedArtifactType() === 'DebugLogBrowser') {
          void refreshDebugLogBrowserPanel();
        }
        if (getSelectedArtifactType() === 'SetupAuditTrail') {
          void refreshSetupAuditTrailPanel();
        }
        if (getSelectedArtifactType() === 'FieldHistory') {
          void refreshFieldHistoryPanel();
        }
        if (getSelectedArtifactType() === 'QuickEdit') {
          void refreshQuickEditPanel();
        }
        if (getSelectedArtifactType() === 'LightningQuickEdit') {
          void refreshLightningQuickEditPanel();
        }
        if (getSelectedArtifactType() === 'ApexCoverageCompare') {
          void refreshApexCoverageComparePanel();
        }
        if (getSelectedArtifactType() === 'CustomSettingsCompare') {
          void refreshCustomSettingsComparePanel();
        }
        if (getSelectedArtifactType() === 'CustomMetadataCompare') {
          void refreshCustomMetadataComparePanel();
        }
        if (getSelectedArtifactType() === 'RecordCompare') {
          void refreshRecordComparePanel();
        }
        if (getSelectedArtifactType() === 'DeployStatus') {
          onDeployStatusOrgChange();
        }
      })();
    });
  }
}

export function setupResizable() {
  const sidebar = document.querySelector('.sidebar');
  const resizeHandle = document.querySelector('.resize-handle');
  if (!sidebar || !resizeHandle) return;
  let isResizing = false;
  let layoutAfterResize = null;

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
      if (layoutAfterResize) cancelAnimationFrame(layoutAfterResize);
      layoutAfterResize = requestAnimationFrame(() => {
        layoutAfterResize = null;
        scheduleMonacoLayout();
      });
    }
  });
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
    clearBtn.addEventListener('click', async () => {
      if (!await confirmSfocAction({
        title: t('code.clearSavedFiles'),
        description: t('code.clearSavedFilesConfirm'),
        confirmLabel: t('code.clearSavedFiles'),
        variant: 'destructive'
      })) return;
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
  const copyUnifiedDiffBtn = document.getElementById('copyUnifiedDiffBtn');
  const exportDiffHtmlBtn = document.getElementById('exportDiffHtmlBtn');
  const diffStatus = document.getElementById('diffStatus');
  const retrieveAllBtn = document.getElementById('retrieveAllBtn');

  function updateButtons() {
    const hasDiffs = state.diffChanges && state.diffChanges.length > 0;
    if (prevBtn) prevBtn.disabled = !hasDiffs;
    if (nextBtn) nextBtn.disabled = !hasDiffs;
    if (copyUnifiedDiffBtn) {
      copyUnifiedDiffBtn.disabled = !state.diffEditor || !hasDiffs;
    }
    if (exportDiffHtmlBtn) {
      exportDiffHtmlBtn.disabled = !state.diffEditor || !hasDiffs;
    }
    if (diffStatus) {
      if (!hasDiffs) {
        diffStatus.textContent = t('diff.noDifferences');
      } else {
        const idx = state.currentDiffIndex >= 0 ? state.currentDiffIndex : 0;
        const totalLines = getTotalDiffLines(state.diffChanges);
        diffStatus.textContent = t('diff.status', {
          current: idx + 1,
          total: state.diffChanges.length,
          lines: totalLines
        });
      }
    }
  }

  function navigateDiff(direction) {
    if (!state.diffChanges?.length) return;
    state.currentDiffIndex = advanceDiffIndex(state.currentDiffIndex, direction, state.diffChanges.length);
    focusDiffAtIndex(state.currentDiffIndex);
    updateButtons();
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => navigateDiff(-1));
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => navigateDiff(1));
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

  if (copyUnifiedDiffBtn) {
    copyUnifiedDiffBtn.addEventListener('click', () => {
      void copyUnifiedDiffToClipboard(state);
    });
  }

  if (exportDiffHtmlBtn) {
    exportDiffHtmlBtn.addEventListener('click', () => {
      downloadDiffHtml(state);
    });
  }

  document.addEventListener('keydown', (e) => {
    const target = e.target;
    if (!target || typeof target.tagName !== 'string') return;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
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
      const item = resolveRetrieveTargetItem(state.selectedItem);
      if (!item) return;
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
