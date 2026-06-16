/**
 * Panel compartido para comparar registros de Custom Settings / Custom Metadata entre dos orgs.
 */
import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { buildOrgPicklistLabel } from '../../shared/orgPrefs.js';
import { handleToolError, handleToolResponseFailure } from '../../shared/reportToolError.js';
import {
  mergeRecordRows,
  filterMergedRows,
  normalizeFieldValue
} from '../../shared/setupRecordsCompareCore.js';

/**
 * @typedef {{
 *   artifactType: string,
 *   listTypesType: string,
 *   fetchRecordsType: string,
 *   typeSelectId: string,
 *   typeFilterId: string,
 *   refreshBtnId: string,
 *   changeTypeBtnId: string,
 *   statusId: string,
 *   tableMountId: string,
 *   diffOnlyId: string,
 *   i18nPrefix: string
 * }} SetupRecordsCompareConfig
 */

/** @type {Map<string, ReturnType<typeof mergeRecordRows>>} */
const mergedByConfig = new Map();

/** @type {Map<string, { fieldNames: string[], alignment: string, truncatedLeft: boolean, truncatedRight: boolean }>} */
const metaByConfig = new Map();

/** @type {Map<string, Array<{ apiName: string, label: string }>>} */
const typesCacheByConfig = new Map();

/**
 * @param {SetupRecordsCompareConfig} config
 */
function i18nKey(config, suffix) {
  return `${config.i18nPrefix}.${suffix}`;
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

function formatCellValue(record, field) {
  if (!record) return '—';
  const v = record[field];
  const n = normalizeFieldValue(v);
  return n === '' ? '—' : n;
}

/**
 * @param {SetupRecordsCompareConfig} config
 */
function getDiffOnly(config) {
  const el = document.getElementById(config.diffOnlyId);
  return el ? !!el.checked : true;
}

/**
 * @param {SetupRecordsCompareConfig} config
 * @param {Array<{ apiName: string, label: string }>} types
 */
function applyTypeFilterToSelect(config) {
  const sel = document.getElementById(config.typeSelectId);
  const filter = document.getElementById(config.typeFilterId)?.value?.trim().toLowerCase() || '';
  if (!sel) return;
  for (const opt of [...sel.options]) {
    if (!opt.value) continue;
    const hay = `${opt.textContent} ${opt.value}`.toLowerCase();
    opt.hidden = !!(filter && !hay.includes(filter));
  }
}

function populateTypeSelect(config, types) {
  const sel = document.getElementById(config.typeSelectId);
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '';
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = t(i18nKey(config, 'selectType'));
  sel.appendChild(ph);
  for (const item of types || []) {
    const opt = document.createElement('option');
    opt.value = item.apiName;
    opt.textContent = item.label ? `${item.label} (${item.apiName})` : item.apiName;
    sel.appendChild(opt);
  }
  if (prev && [...sel.options].some((o) => o.value === prev)) {
    sel.value = prev;
  }
  applyTypeFilterToSelect(config);
}

/**
 * @param {SetupRecordsCompareConfig} config
 */
async function loadTypesForLeftOrg(config) {
  const status = document.getElementById(config.statusId);
  if (!state.leftOrgId) {
    populateTypeSelect(config, []);
    if (status) status.textContent = t(i18nKey(config, 'selectLeft'));
    return;
  }

  try {
    const res = await bg({ type: config.listTypesType, orgId: state.leftOrgId });
    if (!res?.ok) {
      populateTypeSelect(config, []);
      const msg = res?.reason === 'NO_SID' ? t('toast.noSession') : res?.error || t(i18nKey(config, 'typesError'));
      void handleToolResponseFailure(res, { artifact_type: config.artifactType, phase: 'load_types' });
      if (status) status.textContent = msg;
      return;
    }
    const types = res.types || [];
    typesCacheByConfig.set(config.artifactType, types);
    populateTypeSelect(config, types);
    if (status) status.textContent = t(i18nKey(config, 'pickTypeAndLoad'));
  } catch (e) {
    void handleToolError(e, { artifact_type: config.artifactType, phase: 'load_types' });
    populateTypeSelect(config, []);
    if (status) status.textContent = String(e?.message || e);
  }
}

/**
 * @param {SetupRecordsCompareConfig} config
 * @param {boolean} hasResults
 */
function setResultsChromeVisible(config, hasResults) {
  document.getElementById(config.changeTypeBtnId)?.classList.toggle('hidden', !hasResults);
}

/**
 * @param {SetupRecordsCompareConfig} config
 */
function clearComparisonResults(config) {
  mergedByConfig.delete(config.artifactType);
  metaByConfig.delete(config.artifactType);
  const mount = document.getElementById(config.tableMountId);
  if (mount) mount.innerHTML = '';
  setResultsChromeVisible(config, false);
  const status = document.getElementById(config.statusId);
  if (status) status.textContent = t(i18nKey(config, 'pickTypeAndLoad'));
  const sel = document.getElementById(config.typeSelectId);
  sel?.focus();
  document
    .getElementById(config.tableMountId)
    ?.closest('.setup-records-compare-panel-inner')
    ?.querySelector('.setup-records-compare-sticky-head')
    ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/**
 * @param {SetupRecordsCompareConfig} config
 */
function renderTable(config, leftLabel, rightLabel) {
  const mount = document.getElementById(config.tableMountId);
  if (!mount) return;
  const merged = mergedByConfig.get(config.artifactType) || [];
  const meta = metaByConfig.get(config.artifactType);
  const fieldNames = meta?.fieldNames || [];
  const diffOnly = getDiffOnly(config);
  const filtered = filterMergedRows(merged, diffOnly);

  mount.innerHTML = '';

  const toolbar = document.createElement('div');
  toolbar.className = 'setup-records-compare-toolbar';

  const filterInput = document.createElement('input');
  filterInput.type = 'search';
  filterInput.className = 'setup-records-compare-filter';
  filterInput.placeholder = t(i18nKey(config, 'filterRows'));
  filterInput.setAttribute('aria-label', t(i18nKey(config, 'filterRows')));
  toolbar.appendChild(filterInput);
  const scrollHint = document.createElement('p');
  scrollHint.className = 'setup-records-compare-scroll-hint';
  scrollHint.textContent = t(i18nKey(config, 'scrollHint'));
  mount.appendChild(toolbar);
  mount.appendChild(scrollHint);

  if (meta?.truncatedLeft || meta?.truncatedRight) {
    const warn = document.createElement('p');
    warn.className = 'setup-records-compare-truncated';
    warn.textContent = t(i18nKey(config, 'truncatedWarning'));
    mount.appendChild(warn);
  }

  const scroll = document.createElement('div');
  scroll.className = 'setup-records-compare-table-scroll';
  const table = document.createElement('table');
  table.className = 'setup-records-compare-table';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>
    <th scope="col">${t(i18nKey(config, 'colKey'))}</th>
    <th scope="col">${t(i18nKey(config, 'colField'))}</th>
    <th scope="col">${t(i18nKey(config, 'colLeft'), { org: escapeHtml(leftLabel) })}</th>
    <th scope="col">${t(i18nKey(config, 'colRight'), { org: escapeHtml(rightLabel) })}</th>
    <th scope="col">${t(i18nKey(config, 'colStatus'))}</th>
  </tr>`;
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  scroll.appendChild(table);
  mount.appendChild(scroll);

  function statusLabel(status) {
    if (status === 'match') return t(i18nKey(config, 'statusMatch'));
    if (status === 'diff') return t(i18nKey(config, 'statusDiff'));
    if (status === 'leftOnly') return t(i18nKey(config, 'statusLeftOnly'));
    if (status === 'rightOnly') return t(i18nKey(config, 'statusRightOnly'));
    return status;
  }

  function renderBody(needle) {
    tbody.innerHTML = '';
    const n = String(needle || '')
      .trim()
      .toLowerCase();
    const rows = n
      ? filtered.filter((r) => r.label.toLowerCase().includes(n) || r.key.toLowerCase().includes(n))
      : filtered;

    for (const row of rows) {
      if (row.status === 'match' && !diffOnly) {
        const tr = document.createElement('tr');
        tr.className = 'setup-records-compare-row-match';
        tr.innerHTML = `<td>${escapeHtml(row.label)}</td><td>—</td><td>—</td><td>—</td><td>${escapeHtml(statusLabel('match'))}</td>`;
        tbody.appendChild(tr);
        continue;
      }

      const fieldsToShow =
        row.status === 'leftOnly' || row.status === 'rightOnly'
          ? fieldNames
          : row.diffFields.length
            ? row.diffFields
            : fieldNames;

      let first = true;
      for (const field of fieldsToShow) {
        const tr = document.createElement('tr');
        if (row.status === 'leftOnly') tr.classList.add('setup-records-compare-missing-right');
        if (row.status === 'rightOnly') tr.classList.add('setup-records-compare-missing-left');
        if (row.status === 'diff') tr.classList.add('setup-records-compare-row-diff');

        const tdKey = document.createElement('td');
        tdKey.textContent = first ? row.label : '';
        const tdField = document.createElement('td');
        tdField.textContent = field;
        const tdL = document.createElement('td');
        tdL.textContent = formatCellValue(row.left, field);
        const tdR = document.createElement('td');
        tdR.textContent = formatCellValue(row.right, field);
        const tdS = document.createElement('td');
        tdS.textContent = first ? statusLabel(row.status) : '';
        tr.appendChild(tdKey);
        tr.appendChild(tdField);
        tr.appendChild(tdL);
        tr.appendChild(tdR);
        tr.appendChild(tdS);
        tbody.appendChild(tr);
        first = false;
      }
    }

    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'setup-records-compare-empty-cell';
      td.textContent = diffOnly ? t(i18nKey(config, 'noDiffs')) : t(i18nKey(config, 'noRows'));
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }

  filterInput.addEventListener('input', () => renderBody(filterInput.value));
  renderBody('');
  setResultsChromeVisible(config, true);
}

/**
 * @param {SetupRecordsCompareConfig} config
 */
async function logComparison(config, typeApiName, rowCount, diffCount) {
  try {
    await bg({
      type: 'usage:log',
      entry: {
        kind: 'codeComparison',
        action: 'setupRecordsCompare',
        artifactType: config.artifactType,
        descriptor: {
          typeApiName: typeApiName || '',
          rows_total: rowCount ?? 0,
          rows_diff: diffCount ?? 0
        },
        leftOrgId: state.leftOrgId,
        rightOrgId: state.rightOrgId,
        comparisonUrl: typeof window !== 'undefined' ? window.location.href : '',
        leftFilesCount: 0,
        rightFilesCount: 0
      }
    });
  } catch {
    /* ignore */
  }
}

/**
 * @param {SetupRecordsCompareConfig} config
 */
async function runLoad(config) {
  const status = document.getElementById(config.statusId);
  const typeSel = document.getElementById(config.typeSelectId);
  const typeApiName = typeSel?.value?.trim() || '';

  if (!state.leftOrgId) {
    if (status) status.textContent = t(i18nKey(config, 'selectLeft'));
    return;
  }
  if (!state.rightOrgId) {
    if (status) status.textContent = t(i18nKey(config, 'selectRight'));
    return;
  }
  if (!typeApiName) {
    if (status) status.textContent = t(i18nKey(config, 'selectType'));
    showToast(t(i18nKey(config, 'selectType')), 'warn');
    return;
  }

  showToastWithSpinner(t(i18nKey(config, 'loading')));
  if (status) status.textContent = t(i18nKey(config, 'loading'));

  try {
    const [leftRes, rightRes] = await Promise.all([
      bg({ type: config.fetchRecordsType, orgId: state.leftOrgId, typeApiName }),
      bg({ type: config.fetchRecordsType, orgId: state.rightOrgId, typeApiName })
    ]);

    if (!leftRes?.ok) {
      const msg =
        leftRes?.reason === 'NO_SID' ? t('toast.noSession') : leftRes?.error || t(i18nKey(config, 'loadError'));
      void handleToolResponseFailure(leftRes, { artifact_type: config.artifactType, phase: 'fetch_records' });
      if (status) status.textContent = msg;
      showToast(msg, 'error');
      return;
    }
    if (!rightRes?.ok) {
      const msg =
        rightRes?.reason === 'NO_SID' ? t('toast.noSession') : rightRes?.error || t(i18nKey(config, 'loadError'));
      void handleToolResponseFailure(rightRes, { artifact_type: config.artifactType, phase: 'fetch_records' });
      if (status) status.textContent = msg;
      showToast(msg, 'error');
      return;
    }

    const fieldNames = leftRes.fieldNames?.length ? leftRes.fieldNames : rightRes.fieldNames || [];
    const alignment = leftRes.alignment || rightRes.alignment || 'name';
    const merged = mergeRecordRows(
      leftRes.records || [],
      rightRes.records || [],
      alignment,
      fieldNames
    );
    mergedByConfig.set(config.artifactType, merged);
    metaByConfig.set(config.artifactType, {
      fieldNames,
      alignment,
      truncatedLeft: !!leftRes.truncated,
      truncatedRight: !!rightRes.truncated
    });

    const diffCount = merged.filter((r) => r.status !== 'match').length;
    await logComparison(config, typeApiName, merged.length, diffCount);

    if (!merged.length) {
      const mount = document.getElementById(config.tableMountId);
      if (mount) mount.innerHTML = '';
      setResultsChromeVisible(config, false);
      if (status) status.textContent = t(i18nKey(config, 'noRecords'));
      return;
    }

    const leftL = getCompactOrgLabel(state.leftOrgId);
    const rightL = getCompactOrgLabel(state.rightOrgId);
    renderTable(config, leftL, rightL);
    if (status) {
      status.textContent = t(i18nKey(config, 'loadedSummary'), {
        total: String(merged.length),
        diff: String(diffCount)
      });
    }
  } catch (e) {
    void handleToolError(e, { artifact_type: config.artifactType, phase: 'fetch_records' });
    if (status) status.textContent = String(e?.message || e);
    showToast(String(e?.message || e), 'error');
  } finally {
    dismissSpinnerToast();
  }
}

/**
 * @param {SetupRecordsCompareConfig} config
 */
export function invalidateSetupRecordsComparePanel(config) {
  clearComparisonResults(config);
}

/**
 * @param {SetupRecordsCompareConfig} config
 */
export async function refreshSetupRecordsComparePanel(config) {
  if (getSelectedArtifactType() !== config.artifactType) return;
  const mount = document.getElementById(config.tableMountId);
  const status = document.getElementById(config.statusId);

  if (!state.leftOrgId) {
    clearComparisonResults(config);
    populateTypeSelect(config, []);
    if (status) status.textContent = t(i18nKey(config, 'selectLeft'));
    return;
  }
  if (!state.rightOrgId) {
    clearComparisonResults(config);
    if (status) status.textContent = t(i18nKey(config, 'selectRight'));
    return;
  }

  await loadTypesForLeftOrg(config);
}

/**
 * @param {SetupRecordsCompareConfig} config
 */
export function setupSetupRecordsComparePanel(config) {
  document.getElementById(config.refreshBtnId)?.addEventListener('click', () => void runLoad(config));
  document.getElementById(config.changeTypeBtnId)?.addEventListener('click', () => {
    clearComparisonResults(config);
  });
  document.getElementById(config.diffOnlyId)?.addEventListener('change', () => {
    const merged = mergedByConfig.get(config.artifactType);
    if (merged?.length) {
      renderTable(config, getCompactOrgLabel(state.leftOrgId), getCompactOrgLabel(state.rightOrgId));
    }
  });
  document.getElementById(config.typeFilterId)?.addEventListener('input', () => {
    applyTypeFilterToSelect(config);
  });
  document.getElementById(config.typeSelectId)?.addEventListener('change', () => {
    if (mergedByConfig.has(config.artifactType)) {
      clearComparisonResults(config);
    }
  });
}

export const CUSTOM_METADATA_COMPARE_CONFIG = {
  artifactType: 'CustomMetadataCompare',
  listTypesType: 'customMetadataCompare:listTypes',
  fetchRecordsType: 'customMetadataCompare:fetchRecords',
  typeSelectId: 'customMetadataCompareTypeSelect',
  typeFilterId: 'customMetadataCompareTypeFilter',
  refreshBtnId: 'customMetadataCompareRefreshBtn',
  changeTypeBtnId: 'customMetadataCompareChangeTypeBtn',
  statusId: 'customMetadataCompareStatus',
  tableMountId: 'customMetadataCompareTableMount',
  diffOnlyId: 'customMetadataCompareDiffOnly',
  i18nPrefix: 'customMetadataCompare'
};

export const CUSTOM_SETTINGS_COMPARE_CONFIG = {
  artifactType: 'CustomSettingsCompare',
  listTypesType: 'customSettingsCompare:listTypes',
  fetchRecordsType: 'customSettingsCompare:fetchRecords',
  typeSelectId: 'customSettingsCompareTypeSelect',
  typeFilterId: 'customSettingsCompareTypeFilter',
  refreshBtnId: 'customSettingsCompareRefreshBtn',
  changeTypeBtnId: 'customSettingsCompareChangeTypeBtn',
  statusId: 'customSettingsCompareStatus',
  tableMountId: 'customSettingsCompareTableMount',
  diffOnlyId: 'customSettingsCompareDiffOnly',
  i18nPrefix: 'customSettingsCompare'
};
