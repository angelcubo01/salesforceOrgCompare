import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from '../ui/toast.js';
import { readZipFirstUsableFile, normalizeRetrieveZipPath, readZipAllTextFiles } from '../lib/zipBinary.js';
import { beginFileViewerLoading, endFileViewerLoading, updateOrgSelectorsLockedState } from '../ui/viewerChrome.js';
import { getTotalDiffLines, buildAlignedDiff, applyDiffDecorations } from '../editor/diffUtils.js';
import { languageForFileName } from '../editor/monaco.js';
import { focusDiffAtIndex, replaceDiffEditorModels } from '../editor/editorRender.js';
import { prepareDiffForViewer } from '../lib/viewerLimits.js';
import { clearViewerChunkState, setViewerChunkFromPrepared } from '../ui/viewerChunkUi.js';
import { clearBundleCollapsedForKey, renderSavedItems, syncListActiveHighlight } from '../ui/listUi.js';
import { updateDocumentTitle, updateFileMeta } from '../ui/documentMeta.js';
import { syncCompareUrlFromState } from '../lib/compareDeepLink.js';
import { renderEditor } from '../editor/editorRender.js';
import { saveItemsToStorage } from '../core/persistence.js';
import { captureUiException } from '../../shared/posthogClient.js';
import { usageDescriptorFromItem } from '../../shared/usageLogEntry.js';
import { t } from '../../shared/i18n.js';
import {
  beginCompareRetrieveSession,
  cancelCompareRetrieve,
  clearCompareRetrieveSession,
  isCompareRetrieveActive
} from './retrieveSessionUi.js';

const RETRIEVE_BG_CONFIG = {
  PermissionSet: { messageType: 'metadata:retrievePermissionSet', paramName: 'permSetName' },
  Profile: { messageType: 'metadata:retrieveProfile', paramName: 'profileName' },
  FlexiPage: { messageType: 'metadata:retrieveFlexiPage', paramName: 'flexiPageName' }
};

/**
 * @param {number} retrieveGeneration
 */
export async function retrieveMetadataWithZipFromOrg(orgId, item, sideLabel, retrieveGeneration) {
  if (!isCompareRetrieveActive(retrieveGeneration)) return null;

  if (item.type === 'PackageXml') {
    const entry = state.packageXmlLocalContent[item.key];
    if (!entry || entry.content == null) {
      showToast(t('toast.noPackageXml'), 'warn');
      return null;
    }
    const res = await bg({
      type: 'metadata:retrievePackageXml',
      orgId,
      packageXml: entry.content,
      retrieveGeneration
    });
    if (!isCompareRetrieveActive(retrieveGeneration)) return null;
    if (res?.cancelled) return null;
    if (!res || !res.ok || !res.zipBase64) {
      const rawError = (res && (res.error || res.reason)) || '';
      if (String(rawError).includes('agotó el tiempo de espera') || String(rawError).includes('timed out')) {
        showToast(t('toast.retrieveTimeout', { side: sideLabel }), 'error');
      } else {
        const msg = rawError || t('toast.retrieveFailed', { side: sideLabel });
        showToast(msg, 'error');
      }
      return null;
    }
    const binaryString = atob(res.zipBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const allFiles = await readZipAllTextFiles(bytes);
    if (!isCompareRetrieveActive(retrieveGeneration)) return null;
    if (!allFiles.length) {
      showToast(t('toast.zipNoFiles', { side: sideLabel }), 'warn');
      return null;
    }
    const meta = {
      lastModifiedByName: res.lastModifiedByName || '',
      lastModifiedByUsername: res.lastModifiedByUsername || '',
      lastModifiedDate: res.lastModifiedDate || ''
    };
    return { allFiles, meta, fromPackageXmlRetrieve: true };
  }

  const cfg = RETRIEVE_BG_CONFIG[item.type];
  if (!cfg) return null;

  const payload = { type: cfg.messageType, orgId, retrieveGeneration };
  payload[cfg.paramName] = item.key;

  const res = await bg(payload);

  if (!isCompareRetrieveActive(retrieveGeneration)) return null;
  if (res?.cancelled) return null;

  if (!res || !res.ok || !res.zipBase64) {
    const rawError = (res && (res.error || res.reason)) || '';
    if (String(rawError).includes('agotó el tiempo de espera') || String(rawError).includes('timed out')) {
      showToast(t('toast.retrieveTimeout', { side: sideLabel }), 'error');
    } else {
      const msg = rawError || t('toast.retrieveFailed', { side: sideLabel });
      showToast(msg, 'error');
    }
    return null;
  }

  const binaryString = atob(res.zipBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const extracted = await readZipFirstUsableFile(bytes);
  if (!isCompareRetrieveActive(retrieveGeneration)) return null;
  if (!extracted) {
    showToast(t('toast.zipNoUsable', { side: sideLabel }), 'warn');
    return null;
  }

  const meta = {
    lastModifiedByName: res.lastModifiedByName || '',
    lastModifiedByUsername: res.lastModifiedByUsername || '',
    lastModifiedDate: res.lastModifiedDate || ''
  };

  return { ...extracted, meta };
}

export async function retrieveAndLoadFromZip(item) {
  const leftOrgId = state.leftOrgId;
  const rightOrgId = state.rightOrgId;
  if (!leftOrgId || !rightOrgId) {
    showToast(t('toast.selectTwoOrgs'), 'warn');
    return;
  }

  const retrieveGeneration = await beginCompareRetrieveSession();

  /** Un envío por pulsación: `usage:log` → service worker → `appendUsageLog` (POST al endpoint configurado). */
  async function logRetrieveOnce(extra = {}) {
    const entry = {
      kind: 'codeComparison',
      artifactType: item.type,
      descriptor: usageDescriptorFromItem(item),
      leftOrgId,
      rightOrgId,
      comparisonUrl: window.location.href,
      viaRetrieveZip: true,
      ...extra
    };
    await bg({ type: 'usage:log', entry });
  }

  try {
    showToastWithSpinner(t('toast.fetchingBoth'), {
      onCancel: () => {
        void cancelCompareRetrieve();
      }
    });

    const [leftExtracted, rightExtracted] = await Promise.all([
      retrieveMetadataWithZipFromOrg(leftOrgId, item, 'org izquierda', retrieveGeneration),
      retrieveMetadataWithZipFromOrg(rightOrgId, item, 'org derecha', retrieveGeneration)
    ]);

    dismissSpinnerToast();

    if (!isCompareRetrieveActive(retrieveGeneration)) {
      await logRetrieveOnce({ ok: false, reason: 'cancelled' });
      return;
    }

    if (!leftExtracted || !rightExtracted) {
      await logRetrieveOnce({ ok: false, reason: 'retrieve_failed' });
      return;
    }

    if (!state.monaco || !state.diffEditor) {
      showToast(t('toast.openDiffFirst'), 'warn');
      await logRetrieveOnce({
        ok: false,
        reason: 'no_diff_editor',
        leftChars: 0,
        rightChars: 0
      });
      return;
    }

    beginFileViewerLoading();
    try {
    clearViewerChunkState();
    if (item.type === 'PackageXml' && leftExtracted.fromPackageXmlRetrieve && rightExtracted.fromPackageXmlRetrieve) {
      if (!isCompareRetrieveActive(retrieveGeneration)) return;

      const leftByPath = {};
      const rightByPath = {};
      for (const f of leftExtracted.allFiles || []) {
        const raw = String(f.path || '').replace(/\\/g, '/');
        if (raw.toLowerCase().endsWith('-meta.xml')) continue;
        const p = normalizeRetrieveZipPath(raw);
        if (!p) continue;
        leftByPath[p] = f.content ?? '';
      }
      for (const f of rightExtracted.allFiles || []) {
        const raw = String(f.path || '').replace(/\\/g, '/');
        if (raw.toLowerCase().endsWith('-meta.xml')) continue;
        const p = normalizeRetrieveZipPath(raw);
        if (!p) continue;
        rightByPath[p] = f.content ?? '';
      }
      const paths = [...new Set([...Object.keys(leftByPath), ...Object.keys(rightByPath)])].sort((a, b) =>
        a.localeCompare(b)
      );
      if (!paths.length) {
        showToast(t('toast.zipsNoComparable'), 'warn');
        await logRetrieveOnce({ ok: false, reason: 'no_files_in_zip' });
        return;
      }

      state.packageRetrieveZipCache[item.key] = { leftByPath, rightByPath, paths };
      state.savedItems = state.savedItems.filter(
        (s) => !(s.descriptor?.source === 'retrieveZipFile' && s.descriptor?.parentKey === item.key)
      );
      for (const p of paths) {
        state.savedItems.push({
          type: 'PackageXml',
          key: `${item.key}::${p}`,
          descriptor: { source: 'retrieveZipFile', parentKey: item.key, relativePath: p },
          fileName: p.includes('/') ? p.split('/').pop() : p
        });
      }
      const bundleKey = `PackageXmlRZ:${item.key}`;
      clearBundleCollapsedForKey(bundleKey);

      state.selectedItem = item;
      saveItemsToStorage();
      renderSavedItems(true);
      syncListActiveHighlight();
      updateDocumentTitle();
      updateOrgSelectorsLockedState();
      syncCompareUrlFromState(state);

      if (!isCompareRetrieveActive(retrieveGeneration)) return;
      await renderEditor();

      const pkgEntry = state.packageXmlLocalContent[item.key];
      const pkgChars = (pkgEntry?.content ?? '').length;
      await logRetrieveOnce({
        ok: true,
        retrieveMode: 'packageXml',
        zipFileCount: paths.length,
        leftChars: pkgChars,
        rightChars: pkgChars,
        diffBlocks: 0,
        diffLines: 0
      });
      showToast(t('toast.retrieveComplete', { count: paths.length }), 'info');
      return;
    }

    const leftRetrievedContent = leftExtracted.content || '';
    const rightRetrievedContent = rightExtracted.content || '';
    const targetFileName = rightExtracted.fileName;
    const rightFileName = targetFileName || (item.fileName || `${item.key}.permissionset`);

    const prepared = await prepareDiffForViewer(leftRetrievedContent, rightRetrievedContent, { buildAlignedDiff });
    if (!isCompareRetrieveActive(retrieveGeneration)) return;
    if (prepared.userMessage) {
      showToast(prepared.userMessage, prepared.skippedHeavyDiff ? 'warn' : 'info');
    }
    setViewerChunkFromPrepared(prepared, rightFileName, rightFileName);
    state.lastLeftContent = prepared.leftText;
    state.lastRightContent = prepared.rightText;
    const original = state.monaco.editor.createModel(prepared.leftText, languageForFileName(rightFileName));
    const modified = state.monaco.editor.createModel(prepared.rightText, languageForFileName(rightFileName));
    replaceDiffEditorModels(original, modified);

    const diffStatus = document.getElementById('diffStatus');
    try {
      const changes = prepared.changes || [];
      state.diffChanges = changes;
      if (!changes.length) {
        state.currentDiffIndex = -1;
        if (diffStatus) {
          if (prepared.skippedHeavyDiff) {
            diffStatus.textContent = t('diff.tooLargeForDiff');
          } else if (prepared.userMessage) {
            diffStatus.textContent = t('diff.truncatedNoNav');
          } else {
            diffStatus.textContent = t('diff.noDifferences');
          }
        }
        applyDiffDecorations([]);
      } else {
        if (state.currentDiffIndex < 0 || state.currentDiffIndex >= changes.length) {
          state.currentDiffIndex = 0;
        }
        applyDiffDecorations(changes);
        if (typeof state.updateDiffNavButtons === 'function') {
          state.updateDiffNavButtons();
        }
        focusDiffAtIndex(state.currentDiffIndex);
      }
    } catch {
      state.diffChanges = [];
      state.currentDiffIndex = -1;
      if (diffStatus) diffStatus.textContent = t('diff.noDifferences');
      applyDiffDecorations([]);
      if (typeof state.updateDiffNavButtons === 'function') {
        state.updateDiffNavButtons();
      }
    }

    updateFileMeta(leftExtracted.meta || {}, rightExtracted.meta || {}, true);

    const changes = Array.isArray(prepared.changes) ? prepared.changes : [];
    await logRetrieveOnce({
      ok: true,
      leftChars: leftRetrievedContent.length,
      rightChars: rightRetrievedContent.length,
      diffBlocks: changes.length,
      diffLines: getTotalDiffLines(changes)
    });

    showToast(t('toast.retrieveComparing'), 'info');
    } finally {
      endFileViewerLoading();
    }
  } catch (e) {
    dismissSpinnerToast();
    captureUiException(e, { artifact_type: 'Retrieve', phase: 'retrieve' });
    if (isCompareRetrieveActive(retrieveGeneration)) {
      await logRetrieveOnce({ ok: false, error: String(e || '') });
      showToast(t('toast.retrieveError'), 'error');
    }
  } finally {
    clearCompareRetrieveSession(retrieveGeneration);
  }
}

/** Cancela el retrieve de comparación en curso (p. ej. desde otro módulo). */
export function cancelActiveCompareRetrieve() {
  return cancelCompareRetrieve();
}
