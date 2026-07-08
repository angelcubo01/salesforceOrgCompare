import { buildUnifiedDiffPatch } from '../../shared/unifiedDiffCore.js';
import { getDisplayFileName } from '../lib/itemLabels.js';
import { t } from '../../shared/i18n.js';
import { showToast } from '../ui/toast.js';
import { splitSummaryByFile } from '../../shared/packageDiffSummary.js';

function getOrgLabel(selectId) {
  try {
    const sel = document.getElementById(selectId);
    if (!sel || sel.selectedIndex < 0) return '';
    const opt = sel.options[sel.selectedIndex];
    return opt && opt.textContent ? opt.textContent.trim() : '';
  } catch {
    return '';
  }
}

function sanitizePathSegment(s) {
  return String(s || 'org')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }
}

/**
 * Copia al portapapeles un diff unificado estilo `git diff`.
 * @param {object} state Estado global (`code/core/state.js`).
 */
export async function copyUnifiedDiffToClipboard(state) {
  if (!state.diffEditor) {
    showToast(t('code.copyUnifiedDiffNoDiff'), 'warn');
    return;
  }

  let changes;
  try {
    changes = state.diffEditor.getLineChanges() || [];
  } catch {
    changes = [];
  }

  if (!changes.length) {
    showToast(t('code.copyUnifiedDiffNoDiff'), 'warn');
    return;
  }

  const originalEditor = state.diffEditor.getOriginalEditor();
  const modifiedEditor = state.diffEditor.getModifiedEditor();
  const original = originalEditor.getModel();
  const modified = modifiedEditor.getModel();
  if (!original || !modified) {
    showToast(t('code.copyUnifiedDiffNoDiff'), 'warn');
    return;
  }

  const leftText = original.getValue();
  const rightText = modified.getValue();
  const baseName = getDisplayFileName(state.selectedItem) || 'file';
  const leftOrg = sanitizePathSegment(getOrgLabel('leftOrg')) || 'left';
  const rightOrg = sanitizePathSegment(getOrgLabel('rightOrg')) || 'right';

  const isSummary =
    state.selectedItem?.type === 'PackageXml' &&
    state.selectedItem?.descriptor?.source === 'retrieveZipSummary';

  let patch;
  if (isSummary) {
    // El resumen ya es un extracto de diferencias: copiamos TODO el texto,
    // dividido por fichero (un bloque `diff --git` por cada uno), como el resumen.
    const files = splitSummaryByFile(leftText, rightText, t('packageDiffSummary.fileHeader'));
    if (files.length) {
      patch = files
        .map((f) => {
          const context = Math.max(
            f.leftText.split(/\r\n|\r|\n/).length,
            f.rightText.split(/\r\n|\r|\n/).length
          );
          return buildUnifiedDiffPatch(f.leftText, f.rightText, {
            oldPath: `${leftOrg}/${f.path}`,
            newPath: `${rightOrg}/${f.path}`,
            context
          });
        })
        .filter((p) => p.trim())
        .join('\n');
    } else {
      const context = Math.max(
        leftText.split(/\r\n|\r|\n/).length,
        rightText.split(/\r\n|\r|\n/).length
      );
      patch = buildUnifiedDiffPatch(leftText, rightText, {
        oldPath: `${leftOrg}/${baseName}`,
        newPath: `${rightOrg}/${baseName}`,
        context
      });
    }
  } else {
    patch = buildUnifiedDiffPatch(leftText, rightText, {
      oldPath: `${leftOrg}/${baseName}`,
      newPath: `${rightOrg}/${baseName}`,
      context: 3
    });
  }

  if (!patch.trim()) {
    showToast(t('code.copyUnifiedDiffNoDiff'), 'warn');
    return;
  }

  const ok = await copyTextToClipboard(patch);
  if (ok) showToast(t('code.copyUnifiedDiffDone'), 'info');
  else showToast(t('code.copyUnifiedDiffFailed'), 'error');
}
