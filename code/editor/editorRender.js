import { loadMonaco, createSingleEditor, createDiffEditor, languageForFileName } from './monaco.js';
import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { beginFileViewerLoading, endFileViewerLoading, yieldToPaint, updateOrgSelectorsLockedState } from '../ui/viewerChrome.js';
import { getTotalDiffLines, buildAlignedDiff, applyDiffDecorations } from './diffUtils.js';
import {
  prepareDiffForViewer,
  sliceViewerChunk,
  sliceAlignedLinesChunk,
  sliceAlignedPrevChunkStart,
  getViewerChunkSize
} from '../lib/viewerLimits.js';
import { getNativeDiffMaxChars } from '../../shared/extensionSettings.js';
import { showToast } from '../ui/toast.js';
import { t } from '../../shared/i18n.js';
import { clearViewerChunkState, updateViewerChunkBar, setViewerChunkFromPrepared } from '../ui/viewerChunkUi.js';
import { getItemKey } from '../lib/itemLabels.js';
import { saveScrollPosition, restoreScrollPosition } from '../ui/scrollRestore.js';
import { updateDocumentTitle, updateFileMeta } from '../ui/documentMeta.js';
import { refreshAuthStatuses, updateOrgDropdownLayout } from '../ui/orgs.js';
import { isFullScreenToolMode } from '../ui/artifactTypeUi.js';
import { descriptorForFetchSource } from '../lib/sourceDescriptor.js';

/** LRU: diff alineado pesado (prepareDiffForViewer) si org+fichero y versiones no cambian. */
const diffPreparedLru = new Map();
const DIFF_PREP_CACHE_MAX = 24;

function touchDiffPreparedCache(key, value) {
  if (diffPreparedLru.has(key)) diffPreparedLru.delete(key);
  diffPreparedLru.set(key, value);
  while (diffPreparedLru.size > DIFF_PREP_CACHE_MAX) {
    const first = diffPreparedLru.keys().next().value;
    diffPreparedLru.delete(first);
  }
}

function diffPreparedCacheKey(itemKey, leftOrgId, rightOrgId, l, r) {
  const lSig = `${l.fileName || ''}\t${l.lastModifiedDate || ''}\t${(l.content || '').length}`;
  const rSig = `${r.fileName || ''}\t${r.lastModifiedDate || ''}\t${(r.content || '').length}`;
  return `${itemKey}|${leftOrgId}|${rightOrgId}|${lSig}|${rSig}`;
}

export function disposeDiffEditorModels() {
  if (!state.diffEditor) return;
  try {
    const m = state.diffEditor.getModel();
    if (m) {
      m.original?.dispose();
      m.modified?.dispose();
    }
  } catch {}
}

function disposeSingleEditorModel() {
  if (!state.editor) return;
  try {
    const m = state.editor.getModel();
    if (m) m.dispose();
  } catch {}
}

export async function renderEditor(opts = {}) {
  if (isFullScreenToolMode()) {
    return;
  }

  const container = document.getElementById('monacoContainer');
  const noOrgMessage = document.getElementById('noOrgMessage');
  const leftOrgId = state.leftOrgId;
  const rightOrgId = state.rightOrgId;
  const item = state.selectedItem;
  const diffStatus = document.getElementById('diffStatus');
  const retrieveAllBtn = document.getElementById('retrieveAllBtn');
  const leftChanged = opts.leftChanged === true;
  const rightChanged = opts.rightChanged === true;
  const itemKey = getItemKey(item);

  /** Spinner durante toda la carga (auth, fetch, Monaco, diff), solo si hay fichero y al menos una org. */
  const trackLoading = !!(item && (leftOrgId || rightOrgId));

  try {
    if (trackLoading) {
      beginFileViewerLoading();
      await yieldToPaint();
    }

    clearViewerChunkState();

    updateDocumentTitle();

  // Sin ningún entorno: mostrar mensaje. Si solo hay uno, mostrar ese (no borrar el fichero del otro).
  if (!leftOrgId && !rightOrgId) {
    noOrgMessage.style.display = 'flex';
    const noOrgContent = noOrgMessage.querySelector('.no-org-content');
    if (noOrgContent) {
      const h3 = noOrgContent.querySelector('h3');
      const p = noOrgContent.querySelector('p');
      if (h3) h3.textContent = t('code.selectOrg');
      if (p) p.textContent = t('code.selectOrgHint');
    }
    if (diffStatus) diffStatus.textContent = t('diff.noDifferences');
    if (retrieveAllBtn) { retrieveAllBtn.classList.add('hidden'); retrieveAllBtn.disabled = true; }
    updateFileMeta(null, null, false);
    return;
  }

  await refreshAuthStatuses();
  const leftAuthStatus = leftOrgId ? (state.authStatuses[leftOrgId] || 'expired') : null;
  const rightAuthStatus = rightOrgId ? (state.authStatuses[rightOrgId] || 'expired') : null;
  // Auth expirada del lado que vamos a usar
  const useOnlyRight = !leftOrgId && rightOrgId;
  const useOnlyLeft = leftOrgId && !rightOrgId;
  const expiredLeft = leftOrgId && leftAuthStatus === 'expired';
  const expiredRight = rightOrgId && rightAuthStatus === 'expired';
  if (useOnlyLeft && expiredLeft) {
    noOrgMessage.style.display = 'flex';
    const noOrgContent = noOrgMessage.querySelector('.no-org-content');
    if (noOrgContent) {
      const h3 = noOrgContent.querySelector('h3');
      const p = noOrgContent.querySelector('p');
      if (h3) h3.textContent = t('session.expired');
      if (p) p.textContent = t('session.expiredHint');
    }
    if (container) container.style.display = 'none';
    if (diffStatus) diffStatus.textContent = t('diff.noDifferences');
    if (retrieveAllBtn) { retrieveAllBtn.classList.add('hidden'); retrieveAllBtn.disabled = true; }
    updateFileMeta(null, null, false);
    return;
  }
  if (useOnlyRight && expiredRight) {
    noOrgMessage.style.display = 'flex';
    const noOrgContent = noOrgMessage.querySelector('.no-org-content');
    if (noOrgContent) {
      const h3 = noOrgContent.querySelector('h3');
      const p = noOrgContent.querySelector('p');
      if (h3) h3.textContent = t('session.expiredRight');
      if (p) p.textContent = t('session.expiredHint');
    }
    if (container) container.style.display = 'none';
    if (diffStatus) diffStatus.textContent = t('diff.noDifferences');
    if (retrieveAllBtn) { retrieveAllBtn.classList.add('hidden'); retrieveAllBtn.disabled = true; }
    updateFileMeta(null, null, false);
    return;
  }
  if (leftOrgId && rightOrgId && expiredLeft) {
    noOrgMessage.style.display = 'flex';
    const noOrgContent = noOrgMessage.querySelector('.no-org-content');
    if (noOrgContent) {
      const h3 = noOrgContent.querySelector('h3');
      const p = noOrgContent.querySelector('p');
      if (h3) h3.textContent = t('session.expiredLeft');
      if (p) p.textContent = t('session.expiredHint');
    }
    if (container) container.style.display = 'none';
    if (diffStatus) diffStatus.textContent = t('diff.noDifferences');
    if (retrieveAllBtn) { retrieveAllBtn.classList.add('hidden'); retrieveAllBtn.disabled = true; }
    updateFileMeta(null, null, true);
    return;
  }
  if (leftOrgId && rightOrgId && expiredRight) {
    noOrgMessage.style.display = 'flex';
    const noOrgContent = noOrgMessage.querySelector('.no-org-content');
    if (noOrgContent) {
      const h3 = noOrgContent.querySelector('h3');
      const p = noOrgContent.querySelector('p');
      if (h3) h3.textContent = t('session.expiredRight');
      if (p) p.textContent = t('session.expiredHint');
    }
    if (container) container.style.display = 'none';
    if (diffStatus) diffStatus.textContent = t('diff.noDifferences');
    if (retrieveAllBtn) { retrieveAllBtn.classList.add('hidden'); retrieveAllBtn.disabled = true; }
    updateFileMeta(null, null, true);
    return;
  }
  
  // Show editor container if auth is active
  if (container) container.style.display = 'block';
  
  // Hide no org message
  noOrgMessage.style.display = 'none';

  if (!item) {
    updateFileMeta(null, null, !!rightOrgId);
    if (retrieveAllBtn) {
      retrieveAllBtn.classList.add('hidden');
      retrieveAllBtn.disabled = true;
    }
    return;
  }

  // Update org dropdown layout
  updateOrgDropdownLayout();

    if (!state.monaco) state.monaco = await loadMonaco();

  const useCachedLeft = rightChanged && state.cachedLeft && state.cachedLeft.itemKey === itemKey && state.cachedLeft.orgId === leftOrgId;
  const useCachedRight = leftChanged && state.cachedRight && state.cachedRight.itemKey === itemKey && state.cachedRight.orgId === rightOrgId;

  const isLocalPackageXml = item?.type === 'PackageXml' && item.descriptor?.source === 'localFile';
  const isRetrieveZipFile =
    item?.type === 'PackageXml' && item.descriptor?.source === 'retrieveZipFile';

  let left = [];
  if (leftOrgId) {
    if (isRetrieveZipFile) {
      const cache = state.packageRetrieveZipCache[item.descriptor.parentKey];
      const path = item.descriptor.relativePath;
      if (cache && path) {
        const baseName = path.includes('/') ? path.split('/').pop() : path;
        left = [{ fileName: baseName, content: cache.leftByPath[path] ?? '' }];
      } else {
        left = [];
      }
    } else if (isLocalPackageXml) {
      const entry = state.packageXmlLocalContent[item.key];
      if (entry && entry.content != null) {
        const fn = entry.fileName || 'package.xml';
        left = [{ fileName: fn, content: entry.content }];
      } else {
        left = [{ fileName: 'package.xml', content: '' }];
      }
    } else if (useCachedLeft) {
      left = state.cachedLeft.files || [];
    } else {
      const leftFiles = await bg({
        type: 'fetchSource',
        orgId: leftOrgId,
        artifactType: item.type,
        descriptor: descriptorForFetchSource(item)
      });
      if (!leftFiles.ok) await refreshAuthStatuses();
      left = leftFiles.ok ? (leftFiles.files || []) : [];
      state.cachedLeft = { itemKey, orgId: leftOrgId, files: left };
    }
  }

  let right = [];
  if (rightOrgId) {
    if (isRetrieveZipFile) {
      const cache = state.packageRetrieveZipCache[item.descriptor.parentKey];
      const path = item.descriptor.relativePath;
      if (cache && path) {
        const baseName = path.includes('/') ? path.split('/').pop() : path;
        right = [{ fileName: baseName, content: cache.rightByPath[path] ?? '' }];
      } else {
        right = [];
      }
    } else if (isLocalPackageXml) {
      const entry = state.packageXmlLocalContent[item.key];
      if (entry && entry.content != null) {
        const fn = entry.fileName || 'package.xml';
        right = [{ fileName: fn, content: entry.content }];
      } else {
        right = [{ fileName: 'package.xml', content: '' }];
      }
    } else if (useCachedRight) {
      right = state.cachedRight.files || [];
    } else {
      const rightFiles = await bg({
        type: 'fetchSource',
        orgId: rightOrgId,
        artifactType: item.type,
        descriptor: descriptorForFetchSource(item)
      });
      if (!rightFiles.ok) await refreshAuthStatuses();
      right = rightFiles.ok ? (rightFiles.files || []) : [];
      state.cachedRight = { itemKey, orgId: rightOrgId, files: right };
    }
  }

  // PermissionSet / Profile / FlexiPage: el registro de uso va solo al pulsar "EJECUTAR RETRIEVE"
  // (un único log por pulsación en retrieveAndLoadFromZip). Aquí no enviamos nada a analítica.

  // Log de uso: registrar comparación (tipos que no dependen del botón retrieve)
  const logOnRender =
    item.type !== 'PermissionSet' &&
    item.type !== 'Profile' &&
    item.type !== 'FlexiPage' &&
    item.type !== 'PackageXml';
  if (logOnRender) {
    try {
      await bg({
        type: 'usage:log',
        entry: {
          kind: 'codeComparison',
          artifactType: item.type,
          descriptor: item.descriptor,
          leftOrgId,
          rightOrgId,
          comparisonUrl: window.location.href,
          leftFilesCount: Array.isArray(left) ? left.length : 0,
          rightFilesCount: Array.isArray(right) ? right.length : 0
        }
      });
    } catch {
      // ignoramos errores de logging
    }
  }

  // Un solo entorno: mostrar ese lado (no borrar el fichero del otro al cambiar dropdown)
  if (!rightOrgId) {
    if (state.diffListenerDisposable) { state.diffListenerDisposable.dispose(); state.diffListenerDisposable = null; }
    if (state.diffEditor) { state.diffEditor.dispose(); state.diffEditor = null; }
    if (!state.editor) state.editor = createSingleEditor(state.monaco, container);
    let file = left[0] || { fileName: 'empty.txt', content: '' };
    if (item.fileName) {
      const match = left.find(f => f.fileName === item.fileName);
      if (match) file = match;
    }
    const sliceL = sliceViewerChunk(file.content, 0);
    if (sliceL.hasNext) {
      showToast(t('toast.fileTooLarge', { total: sliceL.total.toLocaleString() }), 'warn');
    }
    disposeSingleEditorModel();
    const model = state.monaco.editor.createModel(sliceL.text, languageForFileName(file.fileName));
    state.editor.setModel(model);
    restoreScrollPosition(item, leftOrgId, rightOrgId);
    state.diffChanges = [];
    state.currentDiffIndex = -1;
    if (state.monaco && state.diffDecorationsOriginal && state.diffDecorationsModified && state.diffEditor) {
      try {
        const originalEditor = state.diffEditor.getOriginalEditor();
        const modifiedEditor = state.diffEditor.getModifiedEditor();
        state.diffDecorationsOriginal = originalEditor.deltaDecorations(state.diffDecorationsOriginal, []);
        state.diffDecorationsModified = modifiedEditor.deltaDecorations(state.diffDecorationsModified, []);
      } catch {}
    }
    if (diffStatus) diffStatus.textContent = t('diff.noDifferences');
    if (typeof state.updateDiffNavButtons === 'function') state.updateDiffNavButtons();
    if (retrieveAllBtn) { retrieveAllBtn.classList.add('hidden'); retrieveAllBtn.disabled = true; }
    updateFileMeta(file, null, false);
    if (sliceL.hasNext) {
      state.viewerChunk = {
        mode: 'single',
        fullText: file.content,
        fileName: file.fileName,
        offset: sliceL.start,
        hasPrev: sliceL.hasPrev,
        hasNext: sliceL.hasNext,
        displayStart: sliceL.start + 1,
        displayEnd: sliceL.end,
        totalChars: sliceL.total,
        itemKey: getItemKey(item)
      };
      updateViewerChunkBar();
    }
    return;
  }

  if (!leftOrgId) {
    if (state.diffListenerDisposable) { state.diffListenerDisposable.dispose(); state.diffListenerDisposable = null; }
    if (state.diffEditor) { state.diffEditor.dispose(); state.diffEditor = null; }
    if (!state.editor) state.editor = createSingleEditor(state.monaco, container);
    let file = right[0] || { fileName: 'empty.txt', content: '' };
    if (item.fileName) {
      const match = right.find(f => f.fileName === item.fileName);
      if (match) file = match;
    }
    const sliceR = sliceViewerChunk(file.content, 0);
    if (sliceR.hasNext) {
      showToast(t('toast.fileTooLarge', { total: sliceR.total.toLocaleString() }), 'warn');
    }
    disposeSingleEditorModel();
    const model = state.monaco.editor.createModel(sliceR.text, languageForFileName(file.fileName));
    state.editor.setModel(model);
    restoreScrollPosition(item, leftOrgId, rightOrgId);
    state.diffChanges = [];
    state.currentDiffIndex = -1;
    if (state.monaco && state.diffDecorationsOriginal && state.diffDecorationsModified && state.diffEditor) {
      try {
        const originalEditor = state.diffEditor.getOriginalEditor();
        const modifiedEditor = state.diffEditor.getModifiedEditor();
        state.diffDecorationsOriginal = originalEditor.deltaDecorations(state.diffDecorationsOriginal, []);
        state.diffDecorationsModified = modifiedEditor.deltaDecorations(state.diffDecorationsModified, []);
      } catch {}
    }
    if (diffStatus) diffStatus.textContent = t('diff.noDifferences');
    if (typeof state.updateDiffNavButtons === 'function') state.updateDiffNavButtons();
    if (retrieveAllBtn) { retrieveAllBtn.classList.add('hidden'); retrieveAllBtn.disabled = true; }
    updateFileMeta(null, file, false);
    if (sliceR.hasNext) {
      state.viewerChunk = {
        mode: 'single',
        fullText: file.content,
        fileName: file.fileName,
        offset: sliceR.start,
        hasPrev: sliceR.hasPrev,
        hasNext: sliceR.hasNext,
        displayStart: sliceR.start + 1,
        displayEnd: sliceR.end,
        totalChars: sliceR.total,
        itemKey: getItemKey(item)
      };
      updateViewerChunkBar();
    }
    return;
  }

  if (state.editor) { state.editor.dispose(); state.editor = null; }
  if (!state.diffEditor) state.diffEditor = createDiffEditor(state.monaco, container);

  let l = left[0] || { fileName: 'missing', content: '' };
  let r = right[0] || { fileName: 'missing', content: '' };
  if (item.fileName) {
    const lm = left.find(f => f.fileName === item.fileName);
    if (lm) l = lm;
    const rm = right.find(f => f.fileName === item.fileName);
    if (rm) r = rm;
    else r = { fileName: item.fileName, content: '' };
  }

  const leftRaw = l.content || '';
  const rightRaw = r.content || '';
  const maxIn = Math.max(leftRaw.length, rightRaw.length);
  const useNativeDiff = maxIn <= getNativeDiffMaxChars();

  if (useNativeDiff) {
    // --- Native Monaco diff: raw texts, Monaco computes diff internally ---
    clearViewerChunkState();
    state.lastLeftContent = leftRaw;
    state.lastRightContent = rightRaw;
    disposeDiffEditorModels();

    if (state.diffListenerDisposable) {
      state.diffListenerDisposable.dispose();
      state.diffListenerDisposable = null;
    }

    const onDiffReady = () => {
      try {
        const lineChanges = state.diffEditor ? (state.diffEditor.getLineChanges() || []) : [];
        state.diffChanges = lineChanges;
        if (!lineChanges.length) {
          state.currentDiffIndex = -1;
          if (diffStatus) diffStatus.textContent = t('diff.noDifferences');
        } else {
          state.currentDiffIndex = 0;
          const totalLines = getTotalDiffLines(lineChanges);
          if (diffStatus) {
            diffStatus.textContent = t('diff.status', { current: 1, total: lineChanges.length, lines: totalLines });
          }
        }
        if (typeof state.updateDiffNavButtons === 'function') state.updateDiffNavButtons();
      } catch {
        state.diffChanges = [];
        state.currentDiffIndex = -1;
        if (diffStatus) diffStatus.textContent = t('diff.noDifferences');
        if (typeof state.updateDiffNavButtons === 'function') state.updateDiffNavButtons();
      }
    };

    state.diffListenerDisposable = state.diffEditor.onDidUpdateDiff(onDiffReady);

    const original = state.monaco.editor.createModel(leftRaw, languageForFileName(l.fileName));
    const modified = state.monaco.editor.createModel(rightRaw, languageForFileName(r.fileName));
    state.diffEditor.setModel({ original, modified });
    restoreScrollPosition(item, leftOrgId, rightOrgId);

    setTimeout(() => {
      if (state.diffChanges.length === 0 && state.diffEditor) {
        onDiffReady();
      }
    }, 300);
  } else {
    // --- Chunked fallback for very large files ---
    const dpKey = diffPreparedCacheKey(itemKey, leftOrgId, rightOrgId, l, r);
    let prepared = diffPreparedLru.get(dpKey);
    if (!prepared) {
      prepared = prepareDiffForViewer(leftRaw, rightRaw, { buildAlignedDiff });
      touchDiffPreparedCache(dpKey, prepared);
    }
    if (prepared.userMessage) {
      showToast(prepared.userMessage, prepared.skippedHeavyDiff ? 'warn' : 'info');
    }

    setViewerChunkFromPrepared(prepared, l.fileName, r.fileName);

    state.lastLeftContent = prepared.leftText;
    state.lastRightContent = prepared.rightText;
    disposeDiffEditorModels();
    const original = state.monaco.editor.createModel(prepared.leftText, languageForFileName(l.fileName));
    const modified = state.monaco.editor.createModel(prepared.rightText, languageForFileName(r.fileName));
    state.diffEditor.setModel({ original, modified });
    restoreScrollPosition(item, leftOrgId, rightOrgId);

    if (state.diffListenerDisposable) {
      state.diffListenerDisposable.dispose();
      state.diffListenerDisposable = null;
    }

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
        if (typeof state.updateDiffNavButtons === 'function') state.updateDiffNavButtons();
        focusDiffAtIndex(state.currentDiffIndex);
      }
    } catch {
      state.diffChanges = [];
      state.currentDiffIndex = -1;
      if (diffStatus) diffStatus.textContent = t('diff.noDifferences');
      applyDiffDecorations([]);
      if (typeof state.updateDiffNavButtons === 'function') state.updateDiffNavButtons();
    }
  }
  updateFileMeta(l, r, true);
  if (retrieveAllBtn) {
    const hasRetrieveType =
      item.type === 'PermissionSet' ||
      item.type === 'Profile' ||
      item.type === 'FlexiPage' ||
      (item.type === 'PackageXml' && item.descriptor?.source === 'localFile');
    if (hasRetrieveType && leftOrgId && rightOrgId) {
      retrieveAllBtn.classList.remove('hidden');
      retrieveAllBtn.disabled = false;
    } else if (hasRetrieveType) {
      retrieveAllBtn.classList.remove('hidden');
      retrieveAllBtn.disabled = true;
    } else {
      retrieveAllBtn.classList.add('hidden');
      retrieveAllBtn.disabled = true;
    }
  }
  } finally {
    if (trackLoading) endFileViewerLoading();
    updateOrgSelectorsLockedState();
  }
}

/**
 * Navega entre fragmentos del visor (mismo tamaño máximo en Monaco; el texto completo sigue en memoria del proceso si ya estaba cargado).
 * @param {1|-1} direction Siguiente o anterior
 */
export function navigateViewerChunk(direction) {
  const vc = state.viewerChunk;
  if (!vc || (direction !== 1 && direction !== -1) || !state.monaco) return;

    const step = getViewerChunkSize();

  if (vc.mode === 'single') {
    if (!state.editor) return;
    const cur = sliceViewerChunk(vc.fullText, vc.offset);
    let nextSlice;
    if (direction === 1) {
      if (!cur.hasNext) return;
      nextSlice = sliceViewerChunk(vc.fullText, cur.end);
    } else {
      if (!cur.hasPrev) return;
      const prevOff = Math.max(0, cur.start - step);
      nextSlice = sliceViewerChunk(vc.fullText, prevOff);
    }
    try {
      const m = state.editor.getModel();
      if (m) m.dispose();
    } catch {}
    const model = state.monaco.editor.createModel(nextSlice.text, languageForFileName(vc.fileName));
    state.editor.setModel(model);
    state.viewerChunk = {
      ...vc,
      offset: nextSlice.start,
      hasPrev: nextSlice.hasPrev,
      hasNext: nextSlice.hasNext,
      displayStart: nextSlice.start + 1,
      displayEnd: nextSlice.end,
      totalChars: nextSlice.total
    };
    updateViewerChunkBar();
    return;
  }

  if (vc.mode === 'diffParallel') {
    if (!state.diffEditor) return;
    let nextOff;
    if (direction === 1) {
      nextOff = vc.offset + step;
      if (nextOff >= vc.fullLeft.length && nextOff >= vc.fullRight.length) return;
    } else {
      nextOff = Math.max(0, vc.offset - step);
      if (nextOff === vc.offset) return;
    }
    const nextL = sliceViewerChunk(vc.fullLeft, nextOff);
    const nextR = sliceViewerChunk(vc.fullRight, nextOff);
    disposeDiffEditorModels();
    const original = state.monaco.editor.createModel(nextL.text, languageForFileName(vc.lFileName));
    const modified = state.monaco.editor.createModel(nextR.text, languageForFileName(vc.rFileName));
    state.diffEditor.setModel({ original, modified });
    applyDiffDecorations([]);
    state.lastLeftContent = nextL.text;
    state.lastRightContent = nextR.text;
    state.viewerChunk = {
      ...vc,
      offset: nextOff,
      hasPrev: nextOff > 0,
      hasNext: nextOff + step < vc.fullLeft.length || nextOff + step < vc.fullRight.length,
      displayStart: nextOff + 1,
      displayEnd: Math.max(nextL.end, nextR.end)
    };
    updateViewerChunkBar();
    return;
  }

  if (vc.mode === 'diffAligned') {
    if (!state.diffEditor) return;
    let newStartLine;
    if (direction === 1) {
      if (!vc.hasNext) return;
      newStartLine = vc.endLineExclusive;
    } else {
      if (!vc.hasPrev) return;
      newStartLine = sliceAlignedPrevChunkStart(vc.leftFull, vc.rightFull, vc.startLine);
    }
    const chunk = sliceAlignedLinesChunk(vc.leftFull, vc.rightFull, newStartLine);
    disposeDiffEditorModels();
    const original = state.monaco.editor.createModel(chunk.leftText, languageForFileName(vc.lFileName));
    const modified = state.monaco.editor.createModel(chunk.rightText, languageForFileName(vc.rFileName));
    state.diffEditor.setModel({ original, modified });
    applyDiffDecorations([]);
    state.lastLeftContent = chunk.leftText;
    state.lastRightContent = chunk.rightText;
    state.viewerChunk = {
      ...vc,
      startLine: chunk.startLine,
      endLineExclusive: chunk.endLineExclusive,
      totalLines: chunk.totalLines,
      hasPrev: chunk.hasPrev,
      hasNext: chunk.hasNext,
      lineLabelStart: chunk.startLine + 1,
      lineLabelEnd: chunk.endLineExclusive
    };
    updateViewerChunkBar();
  }
}

export function focusDiffAtIndex(index) {
  if (!state.diffEditor || !state.diffChanges || !state.diffChanges.length) return;
  const changes = state.diffChanges;
  if (index < 0 || index >= changes.length) return;
  const change = changes[index];
  try {
    const originalEditor = state.diffEditor.getOriginalEditor();
    const modifiedEditor = state.diffEditor.getModifiedEditor();

    const oStart = change.originalStartLineNumber || change.modifiedStartLineNumber || 1;
    const oEnd = change.originalEndLineNumber || oStart;
    const mStart = change.modifiedStartLineNumber || change.originalStartLineNumber || 1;
    const mEnd = change.modifiedEndLineNumber || mStart;

    const centerO = Math.round((oStart + oEnd) / 2);
    const centerM = Math.round((mStart + mEnd) / 2);

    // Si es un bloque añadido sólo en la derecha, no tocamos el scroll de la izquierda
    if (change.kind === 'added') {
      modifiedEditor.revealLineInCenter(centerM);
      modifiedEditor.setPosition({ lineNumber: centerM, column: 1 });
      return;
    }

    // Si es un bloque eliminado sólo en la izquierda, no tocamos el scroll de la derecha
    if (change.kind === 'removed') {
      originalEditor.revealLineInCenter(centerO);
      originalEditor.setPosition({ lineNumber: centerO, column: 1 });
      return;
    }

    // En el resto de casos (reemplazos / mezclas), centramos ambos
    originalEditor.revealLineInCenter(centerO);
    modifiedEditor.revealLineInCenter(centerM);
    originalEditor.setPosition({ lineNumber: centerO, column: 1 });
    modifiedEditor.setPosition({ lineNumber: centerM, column: 1 });
  } catch {
    // ignore navigation errors
  }
}
