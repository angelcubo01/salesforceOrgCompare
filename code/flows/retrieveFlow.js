import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from '../ui/toast.js';
import { readZipFirstUsableFile, normalizeRetrieveZipPath, readZipAllTextFiles } from '../lib/zipBinary.js';
import { beginFileViewerLoading, endFileViewerLoading, updateOrgSelectorsLockedState } from '../ui/viewerChrome.js';
import { getTotalDiffLines, buildAlignedDiff, applyDiffDecorations } from '../editor/diffUtils.js';
import { languageForFileName } from '../editor/monaco.js';
import { focusDiffAtIndex, disposeDiffEditorModels } from '../editor/editorRender.js';
import { prepareDiffForViewer } from '../lib/viewerLimits.js';
import { clearViewerChunkState, setViewerChunkFromPrepared } from '../ui/viewerChunkUi.js';
import { renderSavedItems } from '../ui/listUi.js';
import { updateDocumentTitle, updateFileMeta } from '../ui/documentMeta.js';
import { saveItemsToStorage } from '../core/persistence.js';
import { t } from '../../shared/i18n.js';

const RETRIEVE_BG_CONFIG = {
  PermissionSet: { messageType: 'metadata:retrievePermissionSet', paramName: 'permSetName' },
  Profile: { messageType: 'metadata:retrieveProfile', paramName: 'profileName' },
  FlexiPage: { messageType: 'metadata:retrieveFlexiPage', paramName: 'flexiPageName' }
};

export async function retrieveMetadataWithZipFromOrg(orgId, item, sideLabel) {
  if (item.type === 'PackageXml') {
    const entry = state.packageXmlLocalContent[item.key];
    if (!entry || entry.content == null) {
      showToast(t('toast.noPackageXml'), 'warn');
      return null;
    }
    const res = await bg({
      type: 'metadata:retrievePackageXml',
      orgId,
      packageXml: entry.content
    });
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

  const payload = { type: cfg.messageType, orgId };
  payload[cfg.paramName] = item.key;

  const res = await bg(payload);

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

  // Decodificar base64 → bytes
  const binaryString = atob(res.zipBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const extracted = await readZipFirstUsableFile(bytes);
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

  /** Un envío por pulsación: `usage:log` → service worker → `appendUsageLog` (POST al endpoint configurado). */
  async function logRetrieveOnce(extra = {}) {
    const entry = {
      kind: 'codeComparison',
      artifactType: item.type,
      descriptor: item.descriptor,
      leftOrgId,
      rightOrgId,
      comparisonUrl: window.location.href,
      viaRetrieveZip: true,
      ...extra
    };
    await bg({ type: 'usage:log', entry });
  }

  try {
    showToastWithSpinner(t('toast.fetchingBoth'));

    // Retrieve de ambos entornos en paralelo
    const [leftExtracted, rightExtracted] = await Promise.all([
      retrieveMetadataWithZipFromOrg(leftOrgId, item, 'org izquierda'),
      retrieveMetadataWithZipFromOrg(rightOrgId, item, 'org derecha')
    ]);

    dismissSpinnerToast();

    if (!leftExtracted || !rightExtracted) {
      // Los propios helpers ya han mostrado los toasts de error/warn
      await logRetrieveOnce({ ok: false, reason: 'retrieve_failed' });
      return;
    }

    // Necesitamos un diffEditor y monaco cargado
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
    // Package.xml: árbol de ficheros del ZIP (como bundles LWC) + diff por fichero seleccionado
    if (item.type === 'PackageXml' && leftExtracted.fromPackageXmlRetrieve && rightExtracted.fromPackageXmlRetrieve) {
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
      state.bundleCollapsed = state.bundleCollapsed || {};
      // Árbol «Retrieve» cerrado al inicio (undefined/true = colapsado, como LWC/Aura)
      delete state.bundleCollapsed[bundleKey];

      const firstPath = paths[0];
      const firstChild = state.savedItems.find(
        (s) => s.descriptor?.source === 'retrieveZipFile' && s.descriptor?.relativePath === firstPath
      );
      if (firstChild) {
        state.selectedItem = firstChild;
      }
      saveItemsToStorage();
      renderSavedItems(true);
      updateDocumentTitle();
      updateOrgSelectorsLockedState();

      const lc = leftByPath[firstPath] ?? '';
      const rc = rightByPath[firstPath] ?? '';
      const fn = firstPath.split('/').pop() || 'file';
      const prepared = await prepareDiffForViewer(lc, rc, { buildAlignedDiff });
      if (prepared.userMessage) {
        showToast(prepared.userMessage, prepared.skippedHeavyDiff ? 'warn' : 'info');
      }
      setViewerChunkFromPrepared(prepared, fn, fn);
      state.lastLeftContent = prepared.leftText;
      state.lastRightContent = prepared.rightText;
      disposeDiffEditorModels();
      const original = state.monaco.editor.createModel(prepared.leftText, languageForFileName(fn));
      const modified = state.monaco.editor.createModel(prepared.rightText, languageForFileName(fn));
      state.diffEditor.setModel({ original, modified });

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
          state.currentDiffIndex = 0;
          applyDiffDecorations(changes);
          if (typeof state.updateDiffNavButtons === 'function') state.updateDiffNavButtons();
          focusDiffAtIndex(0);
        }
      } catch {
        state.diffChanges = [];
        state.currentDiffIndex = -1;
        if (diffStatus) diffStatus.textContent = t('diff.noDifferences');
        applyDiffDecorations([]);
      }

      updateFileMeta(leftExtracted.meta || {}, rightExtracted.meta || {}, true);
      const ch = prepared.changes || [];
      await logRetrieveOnce({
        ok: true,
        retrieveMode: 'packageXml',
        zipFileCount: paths.length,
        selectedPath: firstPath,
        leftChars: lc.length,
        rightChars: rc.length,
        diffBlocks: ch.length,
        diffLines: getTotalDiffLines(ch)
      });
      showToast(t('toast.retrieveComplete', { count: paths.length }), 'info');
      return;
    }

    const leftRetrievedContent = leftExtracted.content || '';
    const rightRetrievedContent = rightExtracted.content || '';
    const targetFileName = rightExtracted.fileName;
    const rightFileName = targetFileName || (item.fileName || `${item.key}.permissionset`);

    // Construir diff alineado entre ambos retrieves (izquierda vs derecha), con límites anti-OOM
    const prepared = await prepareDiffForViewer(leftRetrievedContent, rightRetrievedContent, { buildAlignedDiff });
    if (prepared.userMessage) {
      showToast(prepared.userMessage, prepared.skippedHeavyDiff ? 'warn' : 'info');
    }
    setViewerChunkFromPrepared(prepared, rightFileName, rightFileName);
    state.lastLeftContent = prepared.leftText;
    state.lastRightContent = prepared.rightText;
    disposeDiffEditorModels();
    const original = state.monaco.editor.createModel(prepared.leftText, languageForFileName(rightFileName));
    const modified = state.monaco.editor.createModel(prepared.rightText, languageForFileName(rightFileName));
    state.diffEditor.setModel({ original, modified });

    // Recalcular diffs y estado
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

    // Actualizar la barra de metadatos con los datos de última modificación devueltos por el retrieve
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
    await logRetrieveOnce({ ok: false, error: String(e || '') });
    showToast(t('toast.retrieveError'), 'error');
  }
}
