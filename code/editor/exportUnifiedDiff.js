import { buildUnifiedDiffPatch } from '../../shared/unifiedDiffCore.js';
import { getDisplayFileName } from '../lib/itemLabels.js';
import { t } from '../../shared/i18n.js';
import { showToast } from '../ui/toast.js';

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

  const patch = buildUnifiedDiffPatch(leftText, rightText, {
    oldPath: `${leftOrg}/${baseName}`,
    newPath: `${rightOrg}/${baseName}`,
    context: 3
  });

  if (!patch.trim()) {
    showToast(t('code.copyUnifiedDiffNoDiff'), 'warn');
    return;
  }

  const ok = await copyTextToClipboard(patch);
  if (ok) showToast(t('code.copyUnifiedDiffDone'), 'info');
  else showToast(t('code.copyUnifiedDiffFailed'), 'error');
}
