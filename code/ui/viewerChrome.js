import { state } from '../core/state.js';
import { t } from '../../shared/i18n.js';
import { updateOrgSwapButtonState } from './orgs.js';

export function beginFileViewerLoading() {
  state.fileViewerLoadingDepth = (state.fileViewerLoadingDepth || 0) + 1;
  const bar = document.getElementById('fileViewerLoadingBar');
  if (bar) bar.classList.remove('hidden');
}

export function endFileViewerLoading() {
  state.fileViewerLoadingDepth = Math.max(0, (state.fileViewerLoadingDepth || 0) - 1);
  if (state.fileViewerLoadingDepth === 0) {
    const bar = document.getElementById('fileViewerLoadingBar');
    if (bar) bar.classList.add('hidden');
  }
}

export function yieldToPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

export function isRetrieveZipTreeItem(item) {
  return !!(item && item.type === 'PackageXml' && item.descriptor?.source === 'retrieveZipFile');
}

export function updateOrgSelectorsLockedState() {
  try {
  const left = document.getElementById('leftOrg');
  const right = document.getElementById('rightOrg');
  const isGen = document.body.classList.contains('artifact-generate-package-xml');
  const isGenCompare = document.body.classList.contains('artifact-generate-package-xml-compare');
  const isApexTests = document.body.classList.contains('artifact-apex-tests');
  if (
    (isGen && !isGenCompare) ||
    isApexTests
  ) {
    const tipLeft = '';
    const tipRight = isApexTests
      ? t('orgs.apexTestsOnlyLeft')
      : t('orgs.genPkgOnlyLeft');
    if (left) {
      left.disabled = false;
      left.title = tipLeft;
    }
    if (right) {
      right.disabled = true;
      right.title = tipRight;
    }
    const editor = document.getElementById('editorContainer');
    if (editor) editor.classList.remove('org-selectors-locked');
    return;
  }
  if (isGenCompare) {
    if (left) {
      left.disabled = false;
      left.title = '';
    }
    if (right) {
      right.disabled = false;
      right.title = '';
    }
    const editor = document.getElementById('editorContainer');
    if (editor) editor.classList.remove('org-selectors-locked');
    return;
  }
  if (document.body.classList.contains('artifact-apex-coverage-compare')) {
    if (left) {
      left.disabled = false;
      left.title = '';
    }
    if (right) {
      right.disabled = false;
      right.title = '';
    }
    const editor = document.getElementById('editorContainer');
    if (editor) editor.classList.remove('org-selectors-locked');
    return;
  }
  if (document.body.classList.contains('artifact-field-dependency')) {
    if (left) {
      left.disabled = false;
      left.title = '';
    }
    if (right) {
      right.disabled = false;
      right.title = '';
    }
    const editor = document.getElementById('editorContainer');
    if (editor) editor.classList.remove('org-selectors-locked');
    return;
  }
  const locked = isRetrieveZipTreeItem(state.selectedItem);
  const tip = locked
    ? t('orgs.lockedHint')
    : '';
  if (left) {
    left.disabled = locked;
    left.title = tip;
  }
  if (right) {
    right.disabled = locked;
    right.title = tip;
  }
  const editor = document.getElementById('editorContainer');
  if (editor) editor.classList.toggle('org-selectors-locked', locked);
  } finally {
    updateOrgSwapButtonState();
  }
}

export function retrieveZipContentEqual(parentKey, relativePath) {
  const cache = state.packageRetrieveZipCache[parentKey];
  if (!cache || !relativePath) return null;
  const l = cache.leftByPath[relativePath];
  const r = cache.rightByPath[relativePath];
  return String(l ?? '') === String(r ?? '');
}
