import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { handleToolError } from '../../shared/reportToolError.js';
import {
  buildChildRelationshipRows,
  buildFieldRows,
  buildRecordTypeRows,
  filterSobjects,
  filterTableRows,
  resolveObjectApiNameFromId,
  summarizeDescribe
} from '../../shared/objectDescribeApi.js';
import { logToolUsage } from './toolUsageLog.js';

/** @type {Array<Record<string, unknown>>} */
let globalSobjects = [];
let selectedObject = '';
let lastDescribe = null;
let loadInFlight = false;
let tableSearchQuery = '';

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getOrgId() {
  return document.getElementById('leftOrg')?.value || state.leftOrgId || '';
}

function setStatus(msg) {
  const el = document.getElementById('objectDescribeStatus');
  if (el) el.textContent = msg || '';
}

function populateObjectSelect(sobjects) {
  const sel = document.getElementById('objectDescribeObjectSelect');
  if (!sel) return;
  const search = document.getElementById('objectDescribeSearch')?.value || '';
  const ns = document.getElementById('objectDescribeNsFilter')?.value || '';
  const filtered = filterSobjects(sobjects, search, ns).slice(0, 500);
  const prev = sel.value;
  sel.innerHTML = `<option value="">${escapeHtml(t('objectDescribe.selectObject'))}</option>`;
  for (const s of filtered) {
    const opt = document.createElement('option');
    opt.value = String(s.name || '');
    opt.textContent = `${s.label || s.name} (${s.name})`;
    sel.appendChild(opt);
  }
  if (prev && filtered.some((s) => s.name === prev)) sel.value = prev;
}

async function loadGlobal() {
  const orgId = getOrgId();
  if (!orgId) {
    setStatus(t('objectDescribe.pickOrg'));
    return;
  }
  if (loadInFlight) return;
  loadInFlight = true;
  showToastWithSpinner(t('objectDescribe.loadingObjects'));
  setStatus(t('objectDescribe.loadingObjects'));
  try {
    const res = await bg({ type: 'objectDescribe:describeGlobal', orgId });
    if (!res?.ok) {
      if (res?.reason === 'NO_SID') throw new Error(t('objectDescribe.noSid'));
      throw new Error(res?.error || t('objectDescribe.loadFailed'));
    }
    globalSobjects = Array.isArray(res.sobjects) ? res.sobjects : [];
    populateObjectSelect(globalSobjects);
    setStatus(t('objectDescribe.objectsLoaded', { count: globalSobjects.length }));
    void logToolUsage('ObjectDescribe', 'describe_global', { ok: true, rowCount: globalSobjects.length });
  } catch (e) {
    void handleToolError(e, { artifact_type: 'ObjectDescribe', phase: 'describe_global' });
    setStatus(String(e?.message || e));
    showToast(String(e?.message || e), 'error');
  } finally {
    loadInFlight = false;
    dismissSpinnerToast();
  }
}

async function loadDescribe(objectApiName) {
  const orgId = getOrgId();
  const name = String(objectApiName || '').trim();
  if (!orgId || !name) return;
  selectedObject = name;
  showToastWithSpinner(t('objectDescribe.loadingDescribe'));
  setStatus(t('objectDescribe.loadingDescribe'));
  try {
    const res = await bg({ type: 'objectDescribe:describeSobject', orgId, objectApiName: name });
    if (!res?.ok) {
      if (res?.reason === 'NO_SID') throw new Error(t('objectDescribe.noSid'));
      throw new Error(res?.error || t('objectDescribe.describeFailed'));
    }
    lastDescribe = res.describe || null;
    renderDescribe();
    setStatus('');
  } catch (e) {
    lastDescribe = null;
    renderDescribe();
    void handleToolError(e, { artifact_type: 'ObjectDescribe', phase: 'describe_sobject' });
    setStatus(String(e?.message || e));
    showToast(String(e?.message || e), 'error');
  } finally {
    dismissSpinnerToast();
  }
}

function formatCellValue(value) {
  if (typeof value === 'boolean') return value ? t('envStatus.yes') : t('envStatus.no');
  if (value == null || value === '') return '';
  return String(value);
}

function renderTable(tbodyId, rows, columns) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="${columns.length}" class="object-describe-empty">${escapeHtml(t('objectDescribe.noRows'))}</td>`;
    tbody.appendChild(tr);
    return;
  }
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = columns
      .map((col) => `<td>${escapeHtml(formatCellValue(row[col]))}</td>`)
      .join('');
    tbody.appendChild(tr);
  }
}

function renderDescribe() {
  const summaryEl = document.getElementById('objectDescribeSummary');
  if (!lastDescribe) {
    if (summaryEl) summaryEl.innerHTML = '';
    renderTable('objectDescribeFieldsTbody', [], ['apiName', 'label', 'type', 'required', 'custom', 'referenceTo']);
    renderTable('objectDescribeChildRelsTbody', [], ['relationshipName', 'childSObject', 'field']);
    renderTable('objectDescribeRecordTypesTbody', [], ['name', 'recordTypeId', 'active']);
    return;
  }
  const summary = summarizeDescribe(lastDescribe);
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="object-describe-summary-grid">
        <div><span class="object-describe-k">${escapeHtml(t('objectDescribe.summaryName'))}</span> ${escapeHtml(summary.label)} (${escapeHtml(summary.name)})</div>
        <div><span class="object-describe-k">${escapeHtml(t('objectDescribe.summaryKeyPrefix'))}</span> ${escapeHtml(summary.keyPrefix || '—')}</div>
        <div><span class="object-describe-k">${escapeHtml(t('objectDescribe.summaryFlags'))}</span> ${escapeHtml([summary.custom ? 'custom' : 'standard', summary.queryable ? 'queryable' : '', summary.createable ? 'createable' : '', summary.updateable ? 'updateable' : ''].filter(Boolean).join(', '))}</div>
        <div><span class="object-describe-k">${escapeHtml(t('objectDescribe.summaryCounts'))}</span> ${escapeHtml(t('objectDescribe.summaryCountsValue', { fields: summary.fieldCount, children: summary.childRelationshipCount, rts: summary.recordTypeCount }))}</div>
      </div>
    `;
  }
  const fields = filterTableRows(
    buildFieldRows(lastDescribe).sort((a, b) => a.apiName.localeCompare(b.apiName)),
    tableSearchQuery
  );
  renderTable('objectDescribeFieldsTbody', fields, ['apiName', 'label', 'type', 'required', 'custom', 'referenceTo']);
  renderTable(
    'objectDescribeChildRelsTbody',
    filterTableRows(buildChildRelationshipRows(lastDescribe), tableSearchQuery),
    ['relationshipName', 'childSObject', 'field']
  );
  renderTable(
    'objectDescribeRecordTypesTbody',
    filterTableRows(buildRecordTypeRows(lastDescribe), tableSearchQuery),
    ['name', 'recordTypeId', 'active']
  );
}

function resolveIdAndDescribe() {
  const idInput = document.getElementById('objectDescribeIdInput');
  const id = idInput?.value?.trim() || '';
  if (!id) return;
  const name = resolveObjectApiNameFromId(globalSobjects, id);
  if (!name) {
    showToast(t('objectDescribe.idNotResolved'), 'error');
    return;
  }
  const sel = document.getElementById('objectDescribeObjectSelect');
  if (sel) sel.value = name;
  void loadDescribe(name);
}

export function setupObjectDescribePanel() {
  document.getElementById('objectDescribeDescribeBtn')?.addEventListener('click', () => {
    const name = document.getElementById('objectDescribeObjectSelect')?.value || '';
    void loadDescribe(name);
  });
  document.getElementById('objectDescribeResolveIdBtn')?.addEventListener('click', () => resolveIdAndDescribe());
  document.getElementById('objectDescribeSearch')?.addEventListener('input', () => populateObjectSelect(globalSobjects));
  document.getElementById('objectDescribeNsFilter')?.addEventListener('input', () => populateObjectSelect(globalSobjects));
  document.getElementById('objectDescribeTableSearch')?.addEventListener('input', (e) => {
    tableSearchQuery = /** @type {HTMLInputElement} */ (e.target).value || '';
    renderDescribe();
  });
  document.getElementById('objectDescribeObjectSelect')?.addEventListener('change', (e) => {
    const name = /** @type {HTMLSelectElement} */ (e.target).value;
    if (name) void loadDescribe(name);
  });
}

export async function refreshObjectDescribePanel() {
  if (getSelectedArtifactType() !== 'ObjectDescribe') return;
  globalSobjects = [];
  lastDescribe = null;
  selectedObject = '';
  tableSearchQuery = '';
  const tableSearchInput = document.getElementById('objectDescribeTableSearch');
  if (tableSearchInput) tableSearchInput.value = '';
  renderDescribe();
  await loadGlobal();
}
