import { state } from '../core/state.js';
import { getDisplayFileName } from '../lib/itemLabels.js';
import { t } from '../../shared/i18n.js';
import { syncCompareContextTitle } from './compareContextTitle.js';

export function formatLastModified(meta) {
  if (!meta) return '—';
  const name = meta.lastModifiedByName || '';
  const rawDate = meta.lastModifiedDate || '';

  let dateStr = '';
  if (rawDate) {
    try {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        const pad = (n) => String(n).padStart(2, '0');
        dateStr = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      } else {
        dateStr = String(rawDate);
      }
    } catch {
      dateStr = String(rawDate);
    }
  }

  const parts = [];
  if (name) parts.push(name);
  const who = parts.join(' ');

  if (who && dateStr) return `${who} • ${dateStr}`;
  if (who) return who;
  if (dateStr) return dateStr;
  return '—';
}

export function updateFileMeta(leftFile, rightFile, hasRightOrg) {
  try {
    const row = document.getElementById('fileMetaRow');
    const leftSpan = document.getElementById('leftFileMeta');
    const rightSpan = document.getElementById('rightFileMeta');
    if (!row || !leftSpan || !rightSpan) return;

    if (!leftFile && !rightFile) {
      leftSpan.textContent = '—';
      rightSpan.textContent = hasRightOrg ? '—' : '';
      if (hasRightOrg) row.classList.remove('single-side');
      else row.classList.add('single-side');
      return;
    }

    const leftText = formatLastModified(leftFile || {});
    leftSpan.textContent = leftText;
    leftSpan.title = leftText;

    if (hasRightOrg) {
      const rightText = formatLastModified(rightFile || {});
      rightSpan.textContent = rightText;
      rightSpan.title = rightText;
      row.classList.remove('single-side');
    } else {
      rightSpan.textContent = '';
      row.classList.add('single-side');
    }
  } catch {
    // ignore UI errors
  }
}

export function updateDocumentTitle() {
  if (!state.selectedArtifactType) {
    if (state.selectedItem) {
      const fileName = getDisplayFileName(state.selectedItem);
      document.title = fileName ? `${fileName} · ${t('docTitle.app')}` : t('docTitle.app');
    } else {
      document.title = t('docTitle.app');
    }
  } else if (state.selectedArtifactType === 'GeneratePackageXml') {
    document.title = t('docTitle.generatePkg');
  } else if (state.selectedArtifactType === 'FieldDependency') {
    document.title = t('docTitle.fieldDep');
  } else if (state.selectedArtifactType === 'ApexTests') {
    document.title = t('docTitle.apexTests');
  } else if (state.selectedArtifactType === 'AnonymousApex') {
    document.title = t('docTitle.anonymousApex');
  } else if (state.selectedArtifactType === 'OrgLimits') {
    document.title = t('docTitle.orgLimits');
  } else if (state.selectedArtifactType === 'PermissionDiff') {
    document.title = t('docTitle.permissionDiff');
  } else if (state.selectedArtifactType === 'QueryExplorer') {
    document.title = t('docTitle.queryExplorer');
  } else if (state.selectedArtifactType === 'SetupAuditTrail') {
    document.title = t('docTitle.setupAuditTrail');
  } else if (state.selectedArtifactType === 'QuickEdit') {
    document.title = t('docTitle.quickEdit');
  } else if (state.selectedArtifactType === 'ApexCoverageCompare') {
    document.title = t('docTitle.coverageCompare');
  } else {
    const sel = state.selectedItem;
    document.title = getDisplayFileName(sel);
  }
  syncCompareContextTitle();
}
