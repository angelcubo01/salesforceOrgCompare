import { state } from '../core/state.js';
import { retrieveZipContentEqual } from './viewerChrome.js';
import { getDisplayFileName } from '../lib/itemLabels.js';
import { t } from '../../shared/i18n.js';

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

    leftSpan.textContent = formatLastModified(leftFile || {});

    if (hasRightOrg) {
      rightSpan.textContent = formatLastModified(rightFile || {});
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
    return;
  }
  if (state.selectedArtifactType === 'GeneratePackageXml') {
    document.title = t('docTitle.generatePkg');
    return;
  }
  if (state.selectedArtifactType === 'FieldDependency') {
    document.title = t('docTitle.fieldDep');
    return;
  }
  if (state.selectedArtifactType === 'ApexTests') {
    document.title = t('docTitle.apexTests');
    return;
  }
  if (state.selectedArtifactType === 'AnonymousApex') {
    document.title = t('docTitle.anonymousApex');
    return;
  }
  if (state.selectedArtifactType === 'OrgLimits') {
    document.title = t('docTitle.orgLimits');
    return;
  }
  if (state.selectedArtifactType === 'QueryExplorer') {
    document.title = t('docTitle.queryExplorer');
    return;
  }
  if (state.selectedArtifactType === 'SetupAuditTrail') {
    document.title = t('docTitle.setupAuditTrail');
    return;
  }
  if (state.selectedArtifactType === 'QuickEdit') {
    document.title = t('docTitle.quickEdit');
    return;
  }
  if (state.selectedArtifactType === 'ApexCoverageCompare') {
    document.title = t('docTitle.coverageCompare');
    return;
  }
  const sel = state.selectedItem;
  let fileName = getDisplayFileName(sel);
  if (sel?.type === 'PackageXml' && sel.descriptor?.source === 'retrieveZipFile' && sel.descriptor?.relativePath) {
    const eq = retrieveZipContentEqual(sel.descriptor.parentKey, sel.descriptor.relativePath);
    if (eq !== null) fileName = `${eq ? t('list.equalPrefix') : t('list.differentPrefix')}${fileName}`;
  }
  document.title = fileName;
}
