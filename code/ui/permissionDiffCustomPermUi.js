import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import {
  buildCustomPermAssignmentBundle,
  compareCustomPermAssignmentBundles
} from '../../shared/permissionsDiffCore.js';

/** @type {{ name: string }|null} */
let committedCustomPerm = null;

/** @type {ReturnType<typeof compareCustomPermAssignmentBundles>|null} */
let lastCpAssignCompare = null;
/** @type {ReturnType<typeof buildCustomPermAssignmentBundle>|null} */
let lastCpAssignSingle = null;

export function getCommittedCustomPerm() {
  return committedCustomPerm;
}

export function customPermCommitActive(inputValue) {
  return !!committedCustomPerm && String(inputValue || '').trim() === committedCustomPerm.name;
}

export function invalidateCustomPermCommit() {
  committedCustomPerm = null;
  lastCpAssignCompare = null;
  lastCpAssignSingle = null;
}

export function clearCustomPermResults() {
  lastCpAssignCompare = null;
  lastCpAssignSingle = null;
}

export function hasCustomPermResults() {
  return !!(lastCpAssignCompare || lastCpAssignSingle);
}

export function pickCustomPerm(item, onLoad) {
  committedCustomPerm = { name: item.name };
  onLoad();
}

export async function searchCustomPermissions(orgId, queryText) {
  const res = await bg({
    type: 'permissionsDiff:searchCustomPermission',
    orgId,
    queryText
  });
  return res?.ok ? res.items || [] : [];
}

async function fetchAssignments(orgId, customPermissionName, containerFilter) {
  const res = await bg({
    type: 'permissionsDiff:fetchByCustomPermission',
    orgId,
    customPermissionInput: customPermissionName,
    containerFilter
  });
  if (!res?.ok) {
    const msg = res?.reason === 'NO_SID' ? t('toast.noSession') : res?.error || t('permDiff.fetchError');
    throw new Error(msg);
  }
  return res;
}

export async function loadCustomPermData(leftOrgId, rightOrgId, compareMode, containerFilter) {
  const name = committedCustomPerm?.name;
  if (!name) return;

  if (compareMode && rightOrgId) {
    const [leftRes, rightRes] = await Promise.all([
      fetchAssignments(leftOrgId, name, containerFilter),
      fetchAssignments(rightOrgId, name, containerFilter)
    ]);
    lastCpAssignCompare = compareCustomPermAssignmentBundles(
      buildCustomPermAssignmentBundle({ grants: leftRes.grants }),
      buildCustomPermAssignmentBundle({ grants: rightRes.grants })
    );
    lastCpAssignSingle = null;
    return;
  }

  const res = await fetchAssignments(leftOrgId, name, containerFilter);
  lastCpAssignSingle = buildCustomPermAssignmentBundle({ grants: res.grants });
  lastCpAssignCompare = null;
}

export function getCustomPermRowCount() {
  return state.permissionDiffCompareMode
    ? lastCpAssignCompare?.summary?.total ?? 0
    : lastCpAssignSingle?.grants?.length ?? 0;
}

export function renderCustomPermSummary(summaryEl, customPermissionName) {
  if (!summaryEl) return;
  if (state.permissionDiffCompareMode && lastCpAssignCompare) {
    const s = lastCpAssignCompare.summary;
    summaryEl.textContent = t('permDiff.summaryCpAssignCompare', {
      permission: customPermissionName,
      same: s?.same ?? 0,
      diff: s?.diff ?? 0,
      leftOnly: s?.leftOnly ?? 0,
      rightOnly: s?.rightOnly ?? 0,
      total: s?.total ?? 0
    });
    return;
  }
  if (!state.permissionDiffCompareMode && lastCpAssignSingle) {
    summaryEl.textContent = t('permDiff.summaryCpAssignSingle', {
      permission: customPermissionName,
      count: lastCpAssignSingle.grants?.length ?? 0
    });
    return;
  }
  summaryEl.textContent = '';
}

function formatContainerTypeLabel(type) {
  return type === 'Profile' ? t('permDiff.typeProfile') : t('permDiff.typePermissionSet');
}

function statusLabel(status) {
  const map = {
    same: t('permDiff.statusSame'),
    diff: t('permDiff.statusDiff'),
    leftOnly: t('permDiff.statusLeftOnly'),
    rightOnly: t('permDiff.statusRightOnly')
  };
  return map[status] || status;
}

function statusRowClass(status) {
  if (status === 'diff') return 'perm-diff-row-diff';
  if (status === 'leftOnly') return 'perm-diff-row-left-only';
  if (status === 'rightOnly') return 'perm-diff-row-right-only';
  return 'perm-diff-row-same';
}

function matchesFilter(key, filter) {
  if (!filter) return true;
  return key.toLowerCase().includes(filter.toLowerCase());
}

export function syncCustomPermTableHeader() {
  const thead = document.getElementById('permissionDiffThead');
  const table = document.getElementById('permissionDiffTable');
  if (!thead) return;
  const compare = !!state.permissionDiffCompareMode;
  table?.classList.add('is-resource');
  table?.classList.remove('is-cp-apex-only');

  if (compare) {
    thead.innerHTML = `
      <tr>
        <th scope="col">${t('permDiff.colContainer')}</th>
        <th scope="col">${t('permDiff.colContainerType')}</th>
        <th scope="col">${t('permDiff.colStatus')}</th>
        <th scope="col">${t('permDiff.colLeft')}</th>
        <th scope="col">${t('permDiff.colRight')}</th>
      </tr>`;
  } else {
    thead.innerHTML = `
      <tr>
        <th scope="col">${t('permDiff.colContainer')}</th>
        <th scope="col">${t('permDiff.colContainerType')}</th>
      </tr>`;
  }
  table?.classList.toggle('is-compare', compare);
}

export function renderCustomPermTable(tbody, empty, filter, showDiffOnly) {
  if (!tbody || !empty) return;
  tbody.innerHTML = '';
  const compare = !!state.permissionDiffCompareMode;

  if (compare && lastCpAssignCompare) {
    const rows = lastCpAssignCompare.rows.filter((r) => {
      if (showDiffOnly && r.status === 'same') return false;
      const name = r.left?.containerName || r.right?.containerName || r.key;
      return matchesFilter(name, filter);
    });
    if (!rows.length) {
      empty.hidden = false;
      empty.textContent = t('permDiff.empty');
      return;
    }
    empty.hidden = true;
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.className = statusRowClass(row.status);
      const name = row.left?.containerName || row.right?.containerName || row.key;
      const type = row.left?.containerType || row.right?.containerType || '';
      const leftMark = row.left ? t('permDiff.cpIncluded') : '—';
      const rightMark = row.right ? t('permDiff.cpIncluded') : '—';
      tr.innerHTML = `
        <td class="perm-diff-col-key">${escapeHtml(name)}</td>
        <td>${escapeHtml(formatContainerTypeLabel(type))}</td>
        <td>${statusLabel(row.status)}</td>
        <td>${escapeHtml(leftMark)}</td>
        <td>${escapeHtml(rightMark)}</td>
      `;
      tbody.appendChild(tr);
    }
    return;
  }

  const grants = (lastCpAssignSingle?.grants || []).filter(
    (r) => matchesFilter(r.key, filter) || matchesFilter(r.containerName, filter)
  );
  if (!grants.length) {
    empty.hidden = false;
    empty.textContent = t('permDiff.empty');
    return;
  }
  empty.hidden = true;
  for (const grant of grants) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="perm-diff-col-key">${escapeHtml(grant.containerName)}</td>
      <td>${escapeHtml(formatContainerTypeLabel(grant.containerType))}</td>
    `;
    tbody.appendChild(tr);
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
