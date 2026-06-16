/**
 * Panel Record Compare: comparación campo a campo de dos registros entre orgs.
 */
import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { getSelectedArtifactType, applyArtifactTypeUi } from './artifactTypeUi.js';
import { updateOrgDropdownLayout, updateAuthIndicators, ensureRightOrgDistinctFromLeft } from './orgs.js';
import { buildOrgPicklistLabel } from '../../shared/orgPrefs.js';
import { isValidSalesforceRecordId } from '../../shared/fieldHistoryApi.js';
import { handleToolError, handleToolResponseFailure } from '../../shared/reportToolError.js';
import {
  buildRecordCompareRows,
  filterCompareRows,
  filterCompareRowsBySearch
} from '../../shared/recordCompareCore.js';

/**
 * @typedef {{
 *   leftRecordId: string,
 *   rightRecordId: string,
 *   fieldLabel: string,
 *   objectApiName: string,
 *   objectLabel: string
 * }} BreadcrumbLevel
 */

/** @type {BreadcrumbLevel[]} */
let breadcrumbStack = [];

/** @type {Map<string, { left: unknown, right: unknown, fieldMeta: unknown[], objectApiName: string, objectLabel: string }>} */
const compareCache = new Map();

/** @type {{ left: unknown, right: unknown, fieldMeta: unknown[], objectApiName: string, objectLabel: string } | null} */
let currentCompare = null;

function isDualOrgMode() {
  return !!state.recordCompareCompareMode;
}

function getEffectiveOrgIds() {
  const leftOrgId = state.leftOrgId;
  const rightOrgId = isDualOrgMode() ? state.rightOrgId : state.leftOrgId;
  return { leftOrgId, rightOrgId };
}

function cacheKey(leftId, rightId) {
  const { leftOrgId, rightOrgId } = getEffectiveOrgIds();
  return `${isDualOrgMode() ? 'dual' : 'single'}|${leftOrgId || ''}|${rightOrgId || ''}|${leftId}|${rightId}`;
}

function getOrgLabel(orgId) {
  const org = (state.orgsList || []).find((o) => o.id === orgId);
  if (!org) return String(orgId || '');
  try {
    return buildOrgPicklistLabel(org);
  } catch {
    return org.label || org.displayName || String(org.id || '');
  }
}

function getCompactOrgLabel(orgId) {
  const base = String(getOrgLabel(orgId) || '').trim();
  if (!base) return '';
  const noUser = base.split(' (')[0].trim();
  const noDomain = noUser.split(' - ')[0].trim();
  return noDomain || base;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getDiffOnly() {
  const el = document.getElementById('recordCompareDiffOnly');
  return el ? !!el.checked : true;
}

function getFilterElements() {
  return {
    leftId: document.getElementById('recordCompareLeftId'),
    rightId: document.getElementById('recordCompareRightId'),
    leftIdLabel: document.getElementById('recordCompareLeftIdLabel'),
    rightIdLabel: document.getElementById('recordCompareRightIdLabel'),
    compareToggle: document.getElementById('recordCompareCompareToggle'),
    compareBtn: document.getElementById('recordCompareBtn'),
    status: document.getElementById('recordCompareStatus'),
    breadcrumb: document.getElementById('recordCompareBreadcrumb'),
    tableMount: document.getElementById('recordCompareTableMount'),
    diffOnly: document.getElementById('recordCompareDiffOnly'),
    fieldSearch: document.getElementById('recordCompareFieldSearch'),
    fieldSearchWrap: document.getElementById('recordCompareFieldSearchWrap')
  };
}

function getFieldSearchNeedle() {
  const { fieldSearch } = getFilterElements();
  return fieldSearch ? fieldSearch.value : '';
}

function setFieldSearchVisible(visible) {
  const { fieldSearchWrap, fieldSearch } = getFilterElements();
  if (fieldSearchWrap) fieldSearchWrap.classList.toggle('hidden', !visible);
  if (!visible && fieldSearch) fieldSearch.value = '';
}

function syncFieldSearchI18n() {
  const { fieldSearch } = getFilterElements();
  if (!fieldSearch) return;
  const ph = t('recordCompare.searchDiffFieldsPh');
  fieldSearch.placeholder = ph;
  fieldSearch.setAttribute('aria-label', ph);
}

function buildRecordIdLabel(orgId, side) {
  const org = getCompactOrgLabel(orgId);
  if (isDualOrgMode()) {
    if (org) return t('recordCompare.orgIdLabel', { org });
    return t(side === 'right' ? 'recordCompare.selectRight' : 'recordCompare.selectLeft');
  }
  if (org) {
    return t('recordCompare.orgIdSideLabel', {
      org,
      side: t(side === 'right' ? 'recordCompare.sideB' : 'recordCompare.sideA')
    });
  }
  return t(side === 'right' ? 'recordCompare.secondIdLabel' : 'recordCompare.firstIdLabel');
}

function syncRecordCompareModeUi() {
  const { compareToggle, leftIdLabel, rightIdLabel, leftId, rightId } = getFilterElements();
  if (compareToggle) compareToggle.checked = isDualOrgMode();
  const idPh = t('recordCompare.idPh');
  if (leftIdLabel) leftIdLabel.textContent = buildRecordIdLabel(state.leftOrgId, 'left');
  if (rightIdLabel) {
    rightIdLabel.textContent = buildRecordIdLabel(
      isDualOrgMode() ? state.rightOrgId : state.leftOrgId,
      'right'
    );
  }
  if (leftId) leftId.placeholder = idPh;
  if (rightId) rightId.placeholder = idPh;
  syncFieldSearchI18n();
  if (!currentCompare) {
    setStatus(t(isDualOrgMode() ? 'recordCompare.hintDual' : 'recordCompare.hintSingle'));
  }
}

function setStatus(msg, isError = false) {
  const { status } = getFilterElements();
  if (!status) return;
  status.textContent = msg || '';
  status.classList.toggle('record-compare-status-error', !!isError);
}

function formatApiError(res) {
  const code = res?.errorCode ? String(res.errorCode).trim() : '';
  const msg = String(res?.error || t('recordCompare.loadError')).trim();
  if (!code) return msg;
  const short = msg.length > 280 ? `${msg.slice(0, 280)}…` : msg;
  return `${code}: ${short}`;
}

function clearResults() {
  currentCompare = null;
  breadcrumbStack = [];
  compareCache.clear();
  setFieldSearchVisible(false);
  const { tableMount, breadcrumb } = getFilterElements();
  if (tableMount) tableMount.innerHTML = '';
  if (breadcrumb) breadcrumb.innerHTML = '';
  setStatus(t(isDualOrgMode() ? 'recordCompare.hintDual' : 'recordCompare.hintSingle'));
}

function renderBreadcrumb() {
  const { breadcrumb } = getFilterElements();
  if (!breadcrumb) return;
  breadcrumb.innerHTML = '';

  if (!breadcrumbStack.length) {
    breadcrumb.classList.add('hidden');
    return;
  }

  breadcrumb.classList.remove('hidden');
  const nav = document.createElement('nav');
  nav.className = 'record-compare-breadcrumb-nav';
  nav.setAttribute('aria-label', t('recordCompare.breadcrumb'));

  breadcrumbStack.forEach((level, index) => {
    if (index > 0) {
      const sep = document.createElement('span');
      sep.className = 'record-compare-breadcrumb-sep';
      sep.textContent = '›';
      sep.setAttribute('aria-hidden', 'true');
      nav.appendChild(sep);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'record-compare-breadcrumb-item';
    const label =
      index === 0
        ? `${level.objectLabel || level.objectApiName} (${level.leftRecordId.substring(0, 6)}…)`
        : level.fieldLabel || level.objectLabel || level.objectApiName;
    btn.textContent = label;
    btn.title = `${level.objectApiName}: ${level.leftRecordId} / ${level.rightRecordId}`;
    if (index === breadcrumbStack.length - 1) {
      btn.classList.add('is-current');
      btn.setAttribute('aria-current', 'location');
    } else {
      btn.addEventListener('click', () => {
        void navigateToBreadcrumbLevel(index);
      });
    }
    nav.appendChild(btn);
  });

  breadcrumb.appendChild(nav);
}

async function navigateToBreadcrumbLevel(index) {
  if (index < 0 || index >= breadcrumbStack.length) return;
  breadcrumbStack = breadcrumbStack.slice(0, index + 1);
  const level = breadcrumbStack[index];
  const key = cacheKey(level.leftRecordId, level.rightRecordId);
  const cached = compareCache.get(key);
  if (cached) {
    currentCompare = cached;
    renderBreadcrumb();
    renderTable();
    return;
  }
  await loadCompare(level.leftRecordId, level.rightRecordId, false);
}

async function loadCompare(leftRecordId, rightRecordId, pushBreadcrumb) {
  const { leftId, rightId } = getFilterElements();
  const left = String(leftRecordId || leftId?.value || '').trim();
  const right = String(rightRecordId || rightId?.value || '').trim();
  const { leftOrgId, rightOrgId } = getEffectiveOrgIds();

  if (!leftOrgId) {
    setStatus(t('recordCompare.selectLeft'));
    return;
  }
  if (isDualOrgMode() && !rightOrgId) {
    setStatus(t('recordCompare.selectRight'));
    return;
  }
  if (!isValidSalesforceRecordId(left) || !isValidSalesforceRecordId(right)) {
    setStatus(t('recordCompare.invalidId'));
    return;
  }

  const key = cacheKey(left, right);
  const cached = compareCache.get(key);
  if (cached) {
    currentCompare = cached;
    if (pushBreadcrumb) {
      breadcrumbStack.push({
        leftRecordId: left,
        rightRecordId: right,
        fieldLabel: '',
        objectApiName: cached.objectApiName,
        objectLabel: cached.objectLabel
      });
    }
    renderBreadcrumb();
    renderTable();
    setStatus(
      t('recordCompare.loaded', {
        object: cached.objectApiName,
        diffCount: buildRecordCompareRows(
          /** @type {Record<string, unknown>} */ (cached.left),
          /** @type {Record<string, unknown>} */ (cached.right),
          /** @type {import('../../shared/recordCompareCore.js').RecordCompareFieldMeta[]} */ (cached.fieldMeta)
        ).filter((r) => r.isDiff).length
      })
    );
    return;
  }

  const toastId = showToastWithSpinner(t('recordCompare.loading'));
  setStatus(t('recordCompare.loading'));
  try {
    const res = await bg({
      type: 'recordCompare:fetchPair',
      leftOrgId,
      rightOrgId,
      leftRecordId: left,
      rightRecordId: right
    });
    dismissSpinnerToast(toastId);

    if (!res?.ok) {
      void handleToolResponseFailure(res, { artifact_type: 'RecordCompare', phase: 'fetch_pair' });
      if (res?.reason === 'NO_SID') {
        setStatus(t('recordCompare.noSid'));
        showToast(t('toast.noSession'));
      } else if (res?.reason === 'OBJECT_MISMATCH') {
        setStatus(
          t('recordCompare.objectMismatch', {
            left: res.leftObject || '—',
            right: res.rightObject || '—'
          })
        );
      } else if (res?.reason === 'INVALID_ID') {
        setStatus(t('recordCompare.invalidId'));
      } else if (res?.reason === 'NOT_FOUND') {
        setStatus(res.error || t('recordCompare.notFound'), true);
      } else if (res?.reason === 'QUERY_ERROR' || res?.errorCode) {
        setStatus(formatApiError(res), true);
      } else {
        setStatus(res?.error || t('recordCompare.loadError'), true);
      }
      return;
    }

    const payload = {
      left: res.left?.record ?? null,
      right: res.right?.record ?? null,
      fieldMeta: res.left?.fieldMeta || res.right?.fieldMeta || [],
      objectApiName: res.objectApiName || '',
      objectLabel: res.left?.objectLabel || res.right?.objectLabel || res.objectApiName || ''
    };

    compareCache.set(key, payload);
    currentCompare = payload;

    if (pushBreadcrumb) {
      breadcrumbStack.push({
        leftRecordId: left,
        rightRecordId: right,
        fieldLabel: '',
        objectApiName: payload.objectApiName,
        objectLabel: payload.objectLabel
      });
    }

    if (leftId && !leftRecordId) leftId.value = left;
    if (rightId && !rightRecordId) rightId.value = right;

    renderBreadcrumb();
    renderTable();

    const rows = buildRecordCompareRows(
      /** @type {Record<string, unknown>} */ (payload.left),
      /** @type {Record<string, unknown>} */ (payload.right),
      /** @type {import('../../shared/recordCompareCore.js').RecordCompareFieldMeta[]} */ (payload.fieldMeta)
    );
    setStatus(
      t('recordCompare.loaded', {
        object: payload.objectApiName,
        diffCount: rows.filter((r) => r.isDiff).length
      })
    );
  } catch (e) {
    void handleToolError(e, { artifact_type: 'RecordCompare', phase: 'compare' });
    dismissSpinnerToast(toastId);
    setStatus(String(e?.message || e), true);
  }
}

async function expandLookup(row) {
  if (!row.expandable) return;
  const left = row.leftLookupId;
  const right = row.rightLookupId;
  if (!left && !right) return;

  if (!left || !right) {
    showToast(t('recordCompare.lookupOneSideMissing'));
    return;
  }

  breadcrumbStack.push({
    leftRecordId: left,
    rightRecordId: right,
    fieldLabel: row.fieldLabel,
    objectApiName: row.referenceTo?.[0] || '',
    objectLabel: row.fieldLabel
  });

  await loadCompare(left, right, false);
}

function renderTable() {
  const { tableMount } = getFilterElements();
  if (!tableMount || !currentCompare) return;

  const dual = isDualOrgMode();
  const leftLabel = dual
    ? getCompactOrgLabel(state.leftOrgId)
    : t('recordCompare.colRecordA');
  const rightLabel = dual
    ? getCompactOrgLabel(state.rightOrgId)
    : t('recordCompare.colRecordB');
  const diffOnly = getDiffOnly();

  const allRows = buildRecordCompareRows(
    /** @type {Record<string, unknown>} */ (currentCompare.left),
    /** @type {Record<string, unknown>} */ (currentCompare.right),
    /** @type {import('../../shared/recordCompareCore.js').RecordCompareFieldMeta[]} */ (currentCompare.fieldMeta)
  );
  const filtered = filterCompareRows(allRows, diffOnly);
  const searchNeedle = getFieldSearchNeedle();
  const rowsToRender = filterCompareRowsBySearch(filtered, searchNeedle);

  tableMount.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'setup-records-compare-toolbar';

  const objectMeta = document.createElement('p');
  objectMeta.className = 'record-compare-object-meta';
  objectMeta.textContent = t('recordCompare.objectMeta', {
    object: currentCompare.objectApiName,
    label: currentCompare.objectLabel
  });
  if (diffOnly) {
    const diffCount = document.createElement('span');
    diffCount.className = 'record-compare-diff-count';
    diffCount.textContent = t('recordCompare.diffCount', {
      count: filtered.length,
      shown: rowsToRender.length
    });
    objectMeta.appendChild(document.createTextNode(' '));
    objectMeta.appendChild(diffCount);
  }
  toolbar.appendChild(objectMeta);
  tableMount.appendChild(toolbar);

  const scroll = document.createElement('div');
  scroll.className = 'setup-records-compare-table-scroll';
  const table = document.createElement('table');
  table.className = 'setup-records-compare-table record-compare-table';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>
    <th scope="col">${t('recordCompare.colField')}</th>
    <th scope="col">${
      dual
        ? t('recordCompare.colLeft', { org: escapeHtml(leftLabel) })
        : escapeHtml(leftLabel)
    }</th>
    <th scope="col">${
      dual
        ? t('recordCompare.colRight', { org: escapeHtml(rightLabel) })
        : escapeHtml(rightLabel)
    }</th>
    <th scope="col">${t('recordCompare.colStatus')}</th>
  </tr>`;
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  scroll.appendChild(table);
  tableMount.appendChild(scroll);

  function statusCell(row) {
    if (row.isDiff) return t('recordCompare.statusDiff');
    return t('recordCompare.statusMatch');
  }

  function renderBody() {
    tbody.innerHTML = '';
    const rows = filterCompareRowsBySearch(filtered, getFieldSearchNeedle());

    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.className = row.isDiff ? 'setup-records-compare-row-diff' : 'setup-records-compare-row-match';

      const tdField = document.createElement('td');
      tdField.className = 'record-compare-field-cell';
      if (row.isReference && row.expandable) {
        const expandBtn = document.createElement('button');
        expandBtn.type = 'button';
        expandBtn.className = 'record-compare-lookup-expand';
        expandBtn.setAttribute('aria-label', t('recordCompare.expandLookup', { field: row.fieldLabel }));
        expandBtn.textContent = '▶';
        expandBtn.addEventListener('click', () => void expandLookup(row));
        tdField.appendChild(expandBtn);
      }
      const fieldText = document.createElement('div');
      fieldText.className = 'record-compare-field-text';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'record-compare-field-label';
      labelSpan.textContent = row.fieldLabel;
      fieldText.appendChild(labelSpan);
      const apiSpan = document.createElement('span');
      apiSpan.className = 'record-compare-field-api';
      apiSpan.textContent = row.fieldApiName;
      fieldText.appendChild(apiSpan);
      tdField.appendChild(fieldText);

      const tdL = document.createElement('td');
      tdL.textContent = row.leftDisplay;
      const tdR = document.createElement('td');
      tdR.textContent = row.rightDisplay;
      const tdS = document.createElement('td');
      tdS.className = row.isDiff ? 'record-compare-status-diff' : 'record-compare-status-match';
      tdS.textContent = statusCell(row);

      tr.appendChild(tdField);
      tr.appendChild(tdL);
      tr.appendChild(tdR);
      tr.appendChild(tdS);
      tbody.appendChild(tr);
    }

    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.className = 'setup-records-compare-empty-cell';
      const needle = getFieldSearchNeedle().trim();
      if (needle) {
        td.textContent = t('recordCompare.noSearchResults', { query: needle });
      } else if (diffOnly) {
        td.textContent = t('recordCompare.noDiffs');
      } else {
        td.textContent = t('recordCompare.noRows');
      }
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }

  renderBody();
  setFieldSearchVisible(true);
}

export function invalidateRecordComparePanel() {
  clearResults();
}

export async function refreshRecordComparePanel() {
  if (getSelectedArtifactType() !== 'RecordCompare') return;
  syncRecordCompareModeUi();
  if (!state.leftOrgId) {
    clearResults();
    setStatus(t('recordCompare.selectLeft'));
    return;
  }
  if (isDualOrgMode()) {
    ensureRightOrgDistinctFromLeft();
    const right = document.getElementById('rightOrg');
    if (right && state.rightOrgId) right.value = state.rightOrgId;
    if (!state.rightOrgId) {
      clearResults();
      setStatus(t('recordCompare.selectRight'));
      return;
    }
  }
  if (!currentCompare) {
    setStatus(t(isDualOrgMode() ? 'recordCompare.hintDual' : 'recordCompare.hintSingle'));
  }
}

export function setupRecordComparePanel() {
  const { compareBtn, diffOnly, leftId, rightId, compareToggle } = getFilterElements();

  compareToggle?.addEventListener('change', () => {
    state.recordCompareCompareMode = !!compareToggle.checked;
    if (state.recordCompareCompareMode) {
      ensureRightOrgDistinctFromLeft();
      const right = document.getElementById('rightOrg');
      if (right && state.rightOrgId) right.value = state.rightOrgId;
    } else {
      state.rightOrgId = null;
      const right = document.getElementById('rightOrg');
      if (right) right.value = '';
    }
    clearResults();
    applyArtifactTypeUi();
    updateOrgDropdownLayout();
    updateAuthIndicators();
    syncRecordCompareModeUi();
    void refreshRecordComparePanel();
  });

  compareBtn?.addEventListener('click', () => {
    breadcrumbStack = [];
    compareCache.clear();
    void loadCompare('', '', true);
  });

  diffOnly?.addEventListener('change', () => {
    if (currentCompare) renderTable();
  });

  getFilterElements().fieldSearch?.addEventListener('input', () => {
    if (currentCompare) renderTable();
  });

  leftId?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') compareBtn?.click();
  });
  rightId?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') compareBtn?.click();
  });

  syncFieldSearchI18n();
}
