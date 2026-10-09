import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import { consumeStagedImportData } from '../../shared/dataTransfer.js';
import {
  applyTabulatorTheme,
  disposeTabulatorTheme,
  styleTabulatorRow
} from './tabulatorTheme.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { handleToolError } from '../../shared/reportToolError.js';
import { guardToolAction } from './featureControlsUi.js';
import { filterSobjects, resolveObjectApiNameFromId } from '../../shared/objectDescribeApi.js';
import { parseFieldsFromForm, buildRecordPayload } from '../../shared/dataWorkbenchApi.js';
import {
  autoMapColumns,
  parseImportData,
  validateExcelImportRows,
  validateImportFileContent
} from '../../shared/dataWorkbenchCsv.js';
import { buildRecordEditorRows, buildUpdatePayloadFromRows } from '../../shared/recordEditorModel.js';
import { buildRecordViewUrl } from '../../shared/idActionsApi.js';
import { logToolUsage } from './toolUsageLog.js';
import { confirmSfocOrgAction, confirmSfocToolAction } from './sfocModal.js';

/** @type {'import'} */
let activeTab = 'import';
/** @type {Array<Record<string, unknown>>} */
let globalSobjects = [];
/** @type {Record<string, unknown> | null} */
let lastDescribe = null;
/** @type {Record<string, unknown> | null} */
let lastLayout = null;
/** @type {Record<string, unknown> | null} */
let lastRecord = null;
/** @type {Array<ReturnType<typeof buildRecordEditorRows>[number]>} */
let editorRows = [];
/** @type {'view' | 'create'} */
let editorMode = 'view';
/** @type {Set<string>} */
let editingFields = new Set();
/** @type {Record<string, string>} */
let fieldDrafts = {};
/** @type {{ headers: string[], rows: string[][] } | null} */
let parsedImport = null;
/** @type {Array<{ status: string, detail: string } | null>} */
let importRowStatuses = [];
let importRunComplete = false;
let importTable = null;
let importTableRenderVersion = 0;
let importTableSource = null;
let importTableColumnSignature = '';
let importDescribe = null;
let importWritableFieldNames = new Set();
let importPasteParseTimer = 0;
let tabulatorPromise = null;
let loadInFlight = false;
const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
const IMPORT_FILE_MIME_TYPES = {
  csv: new Set(['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain']),
  json: new Set(['application/json', 'text/json', 'application/ld+json']),
  excel: new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroenabled.12',
    'application/octet-stream'
  ])
};

function loadTabulator() {
  if (!tabulatorPromise) {
    tabulatorPromise = import('../../vendor/tabulator/tabulator_esm.min.js')
      .then(({ TabulatorFull }) => TabulatorFull);
  }
  return tabulatorPromise;
}

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
  const el = document.getElementById('dataWorkbenchStatus');
  if (el) el.textContent = msg || '';
}

function setActiveTab() {
  activeTab = 'import';
  document.getElementById('dataWorkbenchTabImport')?.classList.remove('hidden');
}

export function setDataWorkbenchView() {
  setActiveTab();
}

function hideAutocomplete(input, panel) {
  if (panel) {
    panel.hidden = true;
    panel.innerHTML = '';
  }
  input?.setAttribute('aria-expanded', 'false');
}

function renderObjectPickerResults(input, panel) {
  if (!input || !panel) return;
  const matches = filterSobjects(globalSobjects, input.value, '').slice(0, 40);
  if (!matches.length) {
    hideAutocomplete(input, panel);
    return;
  }
  panel.innerHTML = matches.map((sobject) => {
    const name = String(sobject.name || '');
    const label = String(sobject.label || name);
    return `<button type="button" class="item data-workbench-autocomplete-item" role="option" data-object-api-name="${escapeHtml(name)}">
      <span class="data-workbench-autocomplete-title">${escapeHtml(name)}</span>
      <span class="data-workbench-autocomplete-subtitle">${escapeHtml(`${label} (${name})`)}</span>
    </button>`;
  }).join('');
  panel.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function bindObjectPicker(inputId, panelId, onSelect) {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById(inputId));
  const panel = document.getElementById(panelId);
  if (!input || !panel) return;
  input.addEventListener('input', () => renderObjectPickerResults(input, panel));
  input.addEventListener('focus', () => renderObjectPickerResults(input, panel));
  input.addEventListener('blur', () => setTimeout(() => hideAutocomplete(input, panel), 120));
  panel.addEventListener('click', (event) => {
    const option = /** @type {HTMLElement} */ (event.target).closest('[data-object-api-name]');
    if (!option) return;
    input.value = option.dataset.objectApiName || '';
    hideAutocomplete(input, panel);
    onSelect?.();
  });
}

async function loadGlobal() {
  const orgId = getOrgId();
  if (!orgId) {
    setStatus(t('dataWorkbench.pickOrg'));
    return;
  }
  if (loadInFlight) return;
  loadInFlight = true;
  showToastWithSpinner(t('dataWorkbench.loadingObjects'));
  setStatus(t('dataWorkbench.loadingObjects'));
  try {
    const res = await bg({ type: 'objectDescribe:describeGlobal', orgId });
    if (!res?.ok) {
      if (res?.reason === 'NO_SID') throw new Error(t('dataWorkbench.noSid'));
      throw new Error(res?.error || t('dataWorkbench.loadFailed'));
    }
    globalSobjects = Array.isArray(res.sobjects) ? res.sobjects : [];
    setStatus(t('dataWorkbench.objectsLoaded', { count: globalSobjects.length }));
  } catch (e) {
    void handleToolError(e, { artifact_type: 'DataWorkbench', phase: 'describe_global' });
    setStatus(String(e?.message || e));
    showToast(String(e?.message || e), 'error');
  } finally {
    loadInFlight = false;
    dismissSpinnerToast();
  }
}

const RECORD_EDITOR_PENCIL_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

function syncFieldDraftsFromDom() {
  document.querySelectorAll('.record-editor-input').forEach((el) => {
    const input = /** @type {HTMLInputElement} */ (el);
    const name = input.dataset.field || '';
    if (name) fieldDrafts[name] = input.value;
  });
}

function clearFieldEditingState() {
  editingFields = new Set();
  fieldDrafts = {};
}

function isRowEditable(row) {
  if (editorMode === 'create') return row.createable && !row.calculated && row.name !== 'Id';
  return !!lastRecord && row.updateable && !row.calculated && row.name !== 'Id';
}

function hasPendingEdits() {
  return editingFields.size > 0;
}

function updateEditorActionButtons() {
  const pending = hasPendingEdits();
  document.getElementById('dataWorkbenchSaveBtn')?.classList.toggle('hidden', !pending);
  document.getElementById('dataWorkbenchCancelEditBtn')?.classList.toggle('hidden', !pending);
  document.getElementById('dataWorkbenchCreateBtn')?.classList.toggle('hidden', editorMode === 'create');
}

function renderRecordEditorTable() {
  const tbody = document.getElementById('dataWorkbenchRecordEditorTbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!editorRows.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="data-workbench-empty">${escapeHtml(t('recordEditor.noFields'))}</td></tr>`;
    return;
  }
  for (const row of editorRows) {
    const tr = document.createElement('tr');
    if (!row.onLayout) tr.classList.add('record-editor-off-layout');
    const editable = isRowEditable(row);
    const isEditing = editingFields.has(row.name);
    const val =
      isEditing && row.name in fieldDrafts
        ? fieldDrafts[row.name]
        : row.value == null
          ? ''
          : String(row.value);
    const pencilBtn = editable
      ? `<button type="button" class="record-editor-field-edit-btn${isEditing ? ' record-editor-field-edit-btn--active' : ''}" data-edit-field="${escapeHtml(row.name)}" title="${escapeHtml(t('recordEditor.editField'))}" aria-label="${escapeHtml(t('recordEditor.editField'))}: ${escapeHtml(row.label)}">${RECORD_EDITOR_PENCIL_SVG}</button>`
      : '';
    const valueCell = isEditing
      ? `<input type="text" class="sfoc-query-input record-editor-input" data-field="${escapeHtml(row.name)}" value="${escapeHtml(val)}" />`
      : `<span class="record-editor-value">${escapeHtml(val)}</span>`;
    tr.innerHTML = `
      <td>${escapeHtml(row.label)}</td>
      <td class="event-monitor-mono">${escapeHtml(row.name)}</td>
      <td>${escapeHtml(row.type)}</td>
      <td class="record-editor-value-cell"><div class="record-editor-value-row">${pencilBtn}${valueCell}</div></td>`;
    tbody.appendChild(tr);
  }
}

function toggleFieldEdit(fieldName) {
  const name = String(fieldName || '').trim();
  if (!name) return;
  const row = editorRows.find((r) => r.name === name);
  if (!row || !isRowEditable(row)) return;
  syncFieldDraftsFromDom();
  if (editingFields.has(name)) {
    editingFields.delete(name);
    delete fieldDrafts[name];
  } else {
    editingFields.add(name);
    fieldDrafts[name] = row.value == null ? '' : String(row.value);
  }
  updateEditorActionButtons();
  renderRecordEditorTable();
  if (editingFields.has(name)) {
    const input = document.querySelector(`.record-editor-input[data-field="${CSS.escape(name)}"]`);
    input?.focus();
  }
}

function collectEditorValues() {
  syncFieldDraftsFromDom();
  /** @type {Record<string, string>} */
  const values = {};
  for (const name of editingFields) {
    if (name in fieldDrafts) values[name] = fieldDrafts[name];
  }
  return values;
}

async function loadDescribe(objectApiName) {
  const orgId = getOrgId();
  const name = String(objectApiName || '').trim();
  if (!orgId || !name) return null;
  const res = await bg({ type: 'dataWorkbench:describeSobject', orgId, objectApiName: name });
  if (!res?.ok) {
    if (res?.reason === 'NO_SID') throw new Error(t('dataWorkbench.noSid'));
    throw new Error(res?.error || t('dataWorkbench.describeFailed'));
  }
  return res.describe || null;
}

async function loadRecord() {
  const orgId = getOrgId();
  let objectApiName = document.getElementById('dataWorkbenchObjectSelect')?.value || '';
  const recordId = document.getElementById('dataWorkbenchRecordIdInput')?.value?.trim() || '';
  if (!orgId) {
    showToast(t('dataWorkbench.pickOrg'), 'warn');
    return;
  }
  if (!objectApiName && recordId) {
    const resolved = resolveObjectApiNameFromId(globalSobjects, recordId);
    if (resolved) {
      objectApiName = resolved;
      const sel = document.getElementById('dataWorkbenchObjectSelect');
      if (sel) sel.value = resolved;
    }
  }
  if (!objectApiName || !recordId) {
    showToast(t('dataWorkbench.retrieveMissing'), 'warn');
    return;
  }
  showToastWithSpinner(t('dataWorkbench.retrieving'));
  try {
    lastDescribe = await loadDescribe(objectApiName);
    const res = await bg({
      type: 'dataWorkbench:retrieveRecord',
      orgId,
      objectApiName,
      recordId
    });
    if (!res?.ok) throw new Error(res?.error || t('dataWorkbench.retrieveFailed'));
    lastRecord = res.record || null;
    const rtId = lastRecord?.RecordTypeId ? String(lastRecord.RecordTypeId) : undefined;
    try {
      const layoutRes = await bg({
        type: 'dataWorkbench:describeLayout',
        orgId,
        objectApiName,
        recordTypeId: rtId
      });
      lastLayout = layoutRes?.ok ? layoutRes.layout : null;
    } catch {
      lastLayout = null;
    }
    editorMode = 'view';
    clearFieldEditingState();
    editorRows = buildRecordEditorRows(lastDescribe, lastLayout, lastRecord);
    updateEditorActionButtons();
    renderRecordEditorTable();
    setStatus('');
    void logToolUsage('DataWorkbench', 'load_record', { ok: true });
  } catch (e) {
    lastRecord = null;
    editorRows = [];
    renderRecordEditorTable();
    void handleToolError(e, { artifact_type: 'DataWorkbench', phase: 'retrieve' });
    showToast(String(e?.message || e), 'error');
  } finally {
    dismissSpinnerToast();
  }
}

async function startCreate() {
  const objectApiName = document.getElementById('dataWorkbenchObjectSelect')?.value || '';
  if (!objectApiName) {
    showToast(t('dataWorkbench.pickObject'), 'warn');
    return;
  }
  showToastWithSpinner(t('dataWorkbench.loadingDescribe'));
  try {
    lastDescribe = await loadDescribe(objectApiName);
    lastRecord = null;
    lastLayout = null;
    editorMode = 'create';
    clearFieldEditingState();
    editorRows = buildRecordEditorRows(lastDescribe, null, null).filter(
      (r) => r.createable && !r.calculated && r.name !== 'Id'
    );
    document.getElementById('dataWorkbenchRecordIdInput').value = '';
    updateEditorActionButtons();
    renderRecordEditorTable();
  } catch (e) {
    showToast(String(e?.message || e), 'error');
  } finally {
    dismissSpinnerToast();
  }
}

function cancelEdit() {
  const wasCreate = editorMode === 'create';
  editorMode = 'view';
  clearFieldEditingState();
  if (lastDescribe && lastRecord) {
    editorRows = buildRecordEditorRows(lastDescribe, lastLayout, lastRecord);
  } else if (wasCreate) {
    editorRows = [];
  }
  updateEditorActionButtons();
  renderRecordEditorTable();
}

async function saveRecord() {
  if (guardToolAction('dml_execute')) return;
  const orgId = getOrgId();
  const objectApiName = document.getElementById('dataWorkbenchObjectSelect')?.value || '';
  if (!orgId || !objectApiName || !lastDescribe) return;

  if (!hasPendingEdits()) {
    showToast(t('recordEditor.noFieldsSelected'), 'warn');
    return;
  }

  const values = collectEditorValues();
  const mode = editorMode === 'create' ? 'create' : 'update';
  const rowsForPayload = editorRows.filter((row) => editingFields.has(row.name));
  const rawPayload = buildUpdatePayloadFromRows(rowsForPayload, values, mode);
  const payload = buildRecordPayload(rawPayload, lastDescribe);
  if (!Object.keys(payload).length) {
    showToast(t('recordEditor.noFieldsSelected'), 'warn');
    return;
  }

  if (!await confirmSfocOrgAction({
    orgId,
    description: t('modal.confirmRecordSave', {
      operation: editorMode === 'create' ? t('dataWorkbench.insert') : t('dataWorkbench.update'),
      object: objectApiName
    }),
    confirmLabel: editorMode === 'create' ? t('modal.action.createRecord') : t('modal.action.updateRecord'),
    risk: 'write',
    variant: 'standard'
  })) return;

  if (editorMode !== 'create') {
    if (!lastRecord) {
      showToast(t('recordEditor.loadFirst'), 'warn');
      return;
    }
    const recordId = document.getElementById('dataWorkbenchRecordIdInput')?.value?.trim() || '';
    if (!recordId) {
      showToast(t('dataWorkbench.idRequired'), 'warn');
      return;
    }
    payload.Id = recordId;
    showToastWithSpinner(t('dataWorkbench.runningDml'));
    try {
      const res = await bg({
        type: 'dataWorkbench:dml',
        orgId,
        operation: 'update',
        objectApiName,
        records: [payload]
      });
      if (!res?.ok) throw new Error(res?.error || t('dataWorkbench.dmlFailed'));
      showToast(t('dataWorkbench.dmlSuccess'), 'success');
      editorMode = 'view';
      clearFieldEditingState();
      updateEditorActionButtons();
      await loadRecord();
      void logToolUsage('DataWorkbench', 'update', { ok: true });
    } catch (e) {
      void handleToolError(e, { artifact_type: 'DataWorkbench', phase: 'save' });
      showToast(String(e?.message || e), 'error');
    } finally {
      dismissSpinnerToast();
    }
    return;
  }

  if (editorMode === 'create') {
    showToastWithSpinner(t('dataWorkbench.runningDml'));
    try {
      const res = await bg({
        type: 'dataWorkbench:dml',
        orgId,
        operation: 'insert',
        objectApiName,
        records: [payload]
      });
      if (!res?.ok) throw new Error(res?.error || t('dataWorkbench.dmlFailed'));
      const newId = res.results?.[0]?.id || res.results?.[0]?.Id;
      if (newId) {
        document.getElementById('dataWorkbenchRecordIdInput').value = String(newId);
      }
      showToast(t('dataWorkbench.dmlSuccess'), 'success');
      editorMode = 'view';
      clearFieldEditingState();
      updateEditorActionButtons();
      if (newId) await loadRecord();
      void logToolUsage('DataWorkbench', 'insert', { ok: true });
    } catch (e) {
      void handleToolError(e, { artifact_type: 'DataWorkbench', phase: 'create' });
      showToast(String(e?.message || e), 'error');
    } finally {
      dismissSpinnerToast();
    }
  }
}

async function runRecordDml(operation) {
  if (guardToolAction('dml_execute')) return;
  const orgId = getOrgId();
  const objectApiName = document.getElementById('dataWorkbenchObjectSelect')?.value || '';
  const recordId = document.getElementById('dataWorkbenchRecordIdInput')?.value?.trim() || '';
  if (!orgId || !objectApiName || !recordId) {
    showToast(t('dataWorkbench.idRequired'), 'warn');
    return;
  }
  if (!await confirmSfocOrgAction({
    orgId,
    description: operation === 'purge'
      ? t('dataWorkbench.purgeConfirm')
      : t('modal.confirmRecordOperation', { operation, object: objectApiName, id: recordId }),
    confirmLabel: operation === 'purge'
      ? t('modal.action.purgeRecord')
      : operation === 'delete'
        ? t('modal.action.deleteRecord')
        : t('modal.action.undeleteRecord'),
    risk: operation === 'undelete' ? 'write' : 'destructive',
    variant: operation === 'undelete' ? 'standard' : 'destructive'
  })) return;
  showToastWithSpinner(t('dataWorkbench.runningDml'));
  try {
    const res = await bg({
      type: 'dataWorkbench:dml',
      orgId,
      operation,
      objectApiName,
      records: operation === 'undelete' || operation === 'purge' ? [recordId] : [{ Id: recordId }]
    });
    if (!res?.ok) throw new Error(res?.error || t('dataWorkbench.dmlFailed'));
    showToast(t('dataWorkbench.dmlSuccess'), 'success');
    if (operation === 'delete' || operation === 'purge') {
      lastRecord = null;
      editorRows = [];
      renderRecordEditorTable();
    } else {
      await loadRecord();
    }
    void logToolUsage('DataWorkbench', operation, { ok: true });
  } catch (e) {
    void handleToolError(e, { artifact_type: 'DataWorkbench', phase: operation });
    showToast(String(e?.message || e), 'error');
  } finally {
    dismissSpinnerToast();
  }
}

async function openRecordInSalesforce() {
  const recordId = document.getElementById('dataWorkbenchRecordIdInput')?.value?.trim() || '';
  if (!recordId) {
    showToast(t('dataWorkbench.idRequired'), 'warn');
    return;
  }
  const orgId = getOrgId();
  const res = await bg({ type: 'listSavedOrgs' });
  const org = (res?.orgs || []).find((o) => o.id === orgId);
  const url = buildRecordViewUrl(org?.instanceUrl || '', recordId);
  if (!url) {
    showToast(t('dataWorkbench.pickOrg'), 'warn');
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function renderCsvMapping(csv, describe) {
  const wrap = document.getElementById('dataWorkbenchCsvMapping');
  if (!wrap) return;
  if (!csv?.headers?.length) {
    wrap.innerHTML = '';
    return;
  }
  const operation = document.getElementById('dataWorkbenchImportOperation')?.value || 'insert';
  const fields = importMappableFields(describe, operation)
    .sort((a, b) => String(a.label || a.name).localeCompare(String(b.label || b.name)));
  importWritableFieldNames = new Set(fields.map((field) => String(field.name)));
  const auto = autoMapColumns(csv.headers, fields);
  wrap.innerHTML = csv.headers
    .map((h) => {
      const mapped = auto[h] || '';
      const unmapped = mapped ? '' : 'data-import-unmapped';
      return `<div class="data-workbench-csv-map-row ${unmapped}">
        <span class="data-workbench-csv-col">${escapeHtml(h)}</span>
        <div class="data-workbench-csv-map-control">
          <div class="data-workbench-autocomplete data-workbench-csv-map-autocomplete">
            <input type="search" class="sfoc-query-input data-workbench-csv-map-input" data-csv-col="${escapeHtml(h)}" value="${escapeHtml(mapped)}" placeholder="${escapeHtml(t('dataWorkbench.sfFieldPlaceholder'))}" autocomplete="off" aria-autocomplete="list" aria-expanded="false" />
            <div class="sfoc-autocomplete-panel data-workbench-autocomplete-results" role="listbox" hidden></div>
          </div>
          <button type="button" class="query-explorer-secondary-btn data-workbench-csv-map-skip" data-skip-csv-col="${escapeHtml(h)}" title="${escapeHtml(t('dataImport.skipColumn'))}">${escapeHtml(t('dataImport.skip'))}</button>
        </div>
      </div>`;
    })
    .join('');
  syncImportTableHeaders();
}

function isImportMappingValue(value) {
  const fieldName = String(value || '').trim();
  return fieldName === '_' || importWritableFieldNames.has(fieldName);
}

function updateImportMappingRow(input) {
  const row = input?.closest('.data-workbench-csv-map-row');
  row?.classList.toggle('data-import-unmapped', !isImportMappingValue(input?.value));
  syncImportTableHeaders();
}

function renderImportFieldResults(input, panel) {
  if (!input || !panel) return;
  const needle = input.value.trim().toLowerCase();
  const fields = importMappableFields(
    importDescribe,
    document.getElementById('dataWorkbenchImportOperation')?.value || 'insert'
  ).filter((field) => {
    const name = String(field.name || '').toLowerCase();
    const label = String(field.label || '').toLowerCase();
    return !needle || name.includes(needle) || label.includes(needle);
  }).slice(0, 40);
  if (!fields.length) {
    hideAutocomplete(input, panel);
    return;
  }
  panel.innerHTML = fields.map((field) => {
    const name = String(field.name || '');
    const label = String(field.label || name);
    return `<button type="button" class="item data-workbench-autocomplete-item" role="option" data-sf-field="${escapeHtml(name)}">
      <span class="data-workbench-autocomplete-title">${escapeHtml(name)}</span>
      <span class="data-workbench-autocomplete-subtitle">${escapeHtml(label)}</span>
    </button>`;
  }).join('');
  panel.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function importOperationRequiresId(operation) {
  return ['update', 'upsert', 'delete', 'undelete'].includes(String(operation || '').toLowerCase());
}

function importMappableFields(describe, operation) {
  const normalizedOperation = String(operation || 'insert').toLowerCase();
  const fields = Array.isArray(describe?.fields) ? describe.fields : [];
  if (normalizedOperation === 'delete' || normalizedOperation === 'undelete') {
    return fields.filter((field) => field?.name === 'Id');
  }
  return fields.filter((field) => {
    if (field?.name === 'Id') return importOperationRequiresId(normalizedOperation);
    if (field?.calculated) return false;
    return normalizedOperation === 'insert'
      ? !!field?.createable
      : !!field?.createable || !!field?.updateable;
  });
}

function collectCsvColumnMap() {
  /** @type {Record<string, string>} */
  const map = {};
  document.querySelectorAll('.data-workbench-csv-map-input').forEach((el) => {
    const input = /** @type {HTMLInputElement} */ (el);
    const col = input.dataset.csvCol || '';
    const sf = input.value.trim();
    if (col && sf && sf !== '_' && importWritableFieldNames.has(sf)) map[col] = sf;
  });
  return map;
}

function buildImportRecordsFromParsed(columnMap, includedRowIndexes = null) {
  /** @type {Record<string, string>[]} */
  const records = [];
  /** @type {number[]} */
  const rowIndexes = [];
  if (!parsedImport?.rows?.length) return { records, rowIndexes };
  for (let idx = 0; idx < parsedImport.rows.length; idx++) {
    if (includedRowIndexes && !includedRowIndexes.has(idx)) continue;
    const row = parsedImport.rows[idx];
    /** @type {Record<string, string>} */
    const rec = {};
    parsedImport.headers.forEach((header, i) => {
      const sfField = columnMap[header];
      if (!sfField || sfField === '_') return;
      rec[sfField] = row[i] != null ? String(row[i]) : '';
    });
    if (Object.keys(rec).length > 0) {
      records.push(rec);
      rowIndexes.push(idx);
    }
  }
  return { records, rowIndexes };
}

function importColumnWidth(title, minWidth = 120) {
  return Math.max(minWidth, Math.min(280, Math.ceil(String(title).length * 7.5) + 34));
}

function importColumnTitle(header) {
  const mappingInput = [...document.querySelectorAll('.data-workbench-csv-map-input')]
    .find((input) => input.dataset.csvCol === header);
  return mappingInput?.value.trim() || header;
}

function syncImportTableHeaders() {
  if (!importTable || importTable.destroyed || !parsedImport?.headers?.length) return;
  parsedImport.headers.forEach((header, columnIndex) => {
    const title = importColumnTitle(header);
    const columnElement = importTable.getColumn?.(`__sfocColumn${columnIndex}`)?.getElement?.();
    const titleElement = columnElement?.querySelector('.tabulator-col-title');
    if (titleElement) titleElement.textContent = title;
  });
}

function captureImportTableState(table) {
  if (!table || table.__sfocBuilt !== true || importTableSource !== parsedImport) return null;
  const holder = table.getElement?.()?.querySelector('.tabulator-tableholder');
  return {
    scrollTop: holder?.scrollTop || 0,
    scrollLeft: holder?.scrollLeft || 0,
    filters: (table.getHeaderFilters?.() || []).map(({ field, value }) => ({ field, value })),
    sorters: (table.getSorters?.() || []).map(({ field, dir }) => ({ field, dir })),
    selectedRows: (table.getSelectedData?.() || [])
      .map((row) => Number(row.__sfocRowIndex))
      .filter(Number.isInteger)
  };
}

function restoreImportTableState(table, savedState, availableFields) {
  if (!savedState) return;
  savedState.filters.forEach(({ field, value }) => {
    if (availableFields.has(field)) table.setHeaderFilterValue?.(field, value);
  });
  const validSorters = savedState.sorters.filter(({ field }) => availableFields.has(field));
  if (validSorters.length) table.setSort?.(validSorters);
  if (savedState.selectedRows.length) table.selectRow?.(savedState.selectedRows);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (table !== importTable || table.destroyed) return;
    const holder = table.getElement?.()?.querySelector('.tabulator-tableholder');
    if (!holder) return;
    holder.scrollTop = Math.min(savedState.scrollTop, Math.max(0, holder.scrollHeight - holder.clientHeight));
    holder.scrollLeft = Math.min(savedState.scrollLeft, Math.max(0, holder.scrollWidth - holder.clientWidth));
  }));
}

function updateImportFilterSummary(table = importTable) {
  const summary = document.getElementById('dataWorkbenchImportFilterSummary');
  if (!summary) return;
  const filters = (table?.getHeaderFilters?.() || [])
    .filter(({ value }) => String(value ?? '').trim());
  if (!filters.length) {
    summary.textContent = '';
    return;
  }
  const fields = filters.map(({ field, value }) => {
    const match = /^__sfocColumn(\d+)$/.exec(String(field || ''));
    const header = match ? parsedImport?.headers?.[Number(match[1])] : field;
    return `${header}: ${String(value).trim()}`;
  });
  const activeRows = table?.getData?.('active');
  const totalRows = table?.getData?.('all');
  summary.textContent = t('dataImport.filteringMetrics', {
    filtered: String(Array.isArray(activeRows) ? activeRows.length : 0),
    total: String(Array.isArray(totalRows) ? totalRows.length : 0),
    fields: fields.join(', ')
  });
}

function updateImportColumnRows(field, rowIndexes, value) {
  const match = /^__sfocColumn(\d+)$/.exec(String(field || ''));
  if (!match || !parsedImport?.rows?.length) return;
  const columnIndex = Number(match[1]);
  const uniqueRowIndexes = [...new Set(rowIndexes)]
    .filter((rowIndex) => Number.isInteger(rowIndex) && parsedImport.rows[rowIndex]);
  if (!uniqueRowIndexes.length) return;

  const nextValue = String(value ?? '');
  uniqueRowIndexes.forEach((rowIndex) => {
    parsedImport.rows[rowIndex][columnIndex] = nextValue;
  });
  importRunComplete = false;
  importRowStatuses = [];

  const updates = uniqueRowIndexes.map((rowIndex) => ({
    __sfocRowIndex: rowIndex,
    [field]: nextValue
  }));
  void Promise.resolve(importTable?.updateData?.(updates))
    .then(() => importTable?.refreshFilter?.())
    .catch(() => {});
}

function getImportFillRowIndexes(sourceRowIndex, targetRowIndex) {
  const visibleRowIndexes = (importTable?.getRows?.('active') || [])
    .map((row) => Number(row.getData?.().__sfocRowIndex))
    .filter(Number.isInteger);
  const sourcePosition = visibleRowIndexes.indexOf(sourceRowIndex);
  const targetPosition = visibleRowIndexes.indexOf(targetRowIndex);
  if (sourcePosition < 0 || targetPosition < 0) return [sourceRowIndex];
  const start = Math.min(sourcePosition, targetPosition);
  const end = Math.max(sourcePosition, targetPosition);
  return visibleRowIndexes.slice(start, end + 1);
}

function getImportFillTarget(field, clientX, clientY) {
  const target = document.elementFromPoint(clientX, clientY);
  const cellElement = target instanceof Element ? target.closest('.tabulator-cell') : null;
  if (!cellElement || cellElement.getAttribute('tabulator-field') !== field) return null;
  const rowElement = cellElement.closest('.tabulator-row');
  const row = (importTable?.getRows?.('active') || [])
    .find((candidate) => candidate.getElement?.() === rowElement);
  const rowIndex = Number(row?.getData?.().__sfocRowIndex);
  return Number.isInteger(rowIndex) ? { rowIndex, cellElement } : null;
}

function startImportFillGesture(cell, value, pointerEvent, commit) {
  const field = cell.getField();
  const sourceRowIndex = Number(cell.getRow().getData().__sfocRowIndex);
  if (!Number.isInteger(sourceRowIndex)) return;
  let target = { rowIndex: sourceRowIndex, cellElement: cell.getElement?.() };
  let highlightedCell = null;

  const clearHighlight = () => {
    highlightedCell?.classList.remove('data-import-fill-target');
    highlightedCell = null;
  };
  const selectTarget = (event) => {
    const nextTarget = getImportFillTarget(field, event.clientX, event.clientY);
    if (!nextTarget) return;
    target = nextTarget;
    if (highlightedCell === nextTarget.cellElement) return;
    clearHighlight();
    highlightedCell = nextTarget.cellElement;
    highlightedCell.classList.add('data-import-fill-target');
  };
  const stop = (event) => {
    selectTarget(event);
    document.removeEventListener('pointermove', selectTarget);
    document.removeEventListener('pointerup', stop);
    document.removeEventListener('pointercancel', cancel);
    clearHighlight();
    if (target.rowIndex === sourceRowIndex) return;
    const rowIndexes = getImportFillRowIndexes(sourceRowIndex, target.rowIndex);
    commit();
    requestAnimationFrame(() => updateImportColumnRows(field, rowIndexes, value));
  };
  const cancel = () => {
    document.removeEventListener('pointermove', selectTarget);
    document.removeEventListener('pointerup', stop);
    document.removeEventListener('pointercancel', cancel);
    clearHighlight();
  };

  pointerEvent.preventDefault();
  pointerEvent.stopPropagation();
  document.addEventListener('pointermove', selectTarget);
  document.addEventListener('pointerup', stop);
  document.addEventListener('pointercancel', cancel);
}

function importCellEditor(cell, onRendered, success, cancel) {
  const editor = document.createElement('div');
  editor.className = 'data-import-cell-editor';
  const input = document.createElement('input');
  input.className = 'data-import-cell-editor-input';
  input.type = 'text';
  input.value = String(cell.getValue() ?? '');
  input.setAttribute('aria-label', cell.getColumn().getDefinition().title || cell.getField());
  const fillHandle = document.createElement('button');
  fillHandle.type = 'button';
  fillHandle.className = 'data-import-fill-handle';
  fillHandle.tabIndex = -1;
  fillHandle.setAttribute('aria-label', t('dataImport.fillHandle'));
  fillHandle.title = t('dataImport.fillHandle');
  editor.append(input, fillHandle);

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    success(input.value);
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  });
  fillHandle.addEventListener('pointerdown', (event) => {
    startImportFillGesture(cell, input.value, event, commit);
  });
  fillHandle.addEventListener('dblclick', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const rowIndexes = parsedImport?.rows?.map((_, rowIndex) => rowIndex) || [];
    commit();
    requestAnimationFrame(() => updateImportColumnRows(cell.getField(), rowIndexes, input.value));
  });
  onRendered(() => input.focus({ preventScroll: true }));
  return editor;
}

function syncEditedImportCell(cell) {
  const match = /^__sfocColumn(\d+)$/.exec(cell.getField());
  const rowIndex = Number(cell.getRow().getData().__sfocRowIndex);
  if (!match || !Number.isInteger(rowIndex) || !parsedImport?.rows?.[rowIndex]) return;
  parsedImport.rows[rowIndex][Number(match[1])] = String(cell.getValue() ?? '');
  importRunComplete = false;
  importRowStatuses = [];
  importTable?.refreshFilter?.();
}

function syncImportTableEdits(table = importTable) {
  if (!parsedImport?.rows?.length) return;
  const tableRows = table?.getData?.('all');
  if (!Array.isArray(tableRows)) return;
  tableRows.forEach((row) => {
    const rowIndex = Number(row?.__sfocRowIndex);
    if (!Number.isInteger(rowIndex) || !parsedImport.rows[rowIndex]) return;
    parsedImport.headers.forEach((_, columnIndex) => {
      parsedImport.rows[rowIndex][columnIndex] = String(row[`__sfocColumn${columnIndex}`] ?? '');
    });
  });
}

function activeImportRowIndexes() {
  const activeRows = importTable?.getData?.('active');
  if (!Array.isArray(activeRows)) return null;
  return new Set(
    activeRows
      .map((row) => Number(row?.__sfocRowIndex))
      .filter(Number.isInteger)
  );
}

function renderImportTable() {
  const mount = document.getElementById('dataWorkbenchImportTableMount');
  if (!mount) return;

  const headers = parsedImport?.headers || [];
  const rows = parsedImport?.rows || [];
  const showStatus = importRunComplete && importRowStatuses.some((status) => status != null);
  if (!headers.length) {
    disposeTabulatorTheme(importTable);
    importTable?.destroy();
    importTable = null;
    importTableSource = null;
    importTableColumnSignature = '';
    ++importTableRenderVersion;
    mount.innerHTML = `<p class="data-workbench-empty">${escapeHtml(t('dataImport.noResults'))}</p>`;
    updateImportFilterSummary(null);
    return;
  }

  const data = rows.map((row, rowIndex) => {
    const item = { __sfocRowIndex: rowIndex };
    headers.forEach((_, columnIndex) => {
      item[`__sfocColumn${columnIndex}`] = row[columnIndex] != null ? String(row[columnIndex]) : '';
    });
    const status = importRowStatuses[rowIndex];
    item.__sfocStatus = status
      ? (status.status === 'Failed' && status.detail
        ? `${status.status}: ${status.detail}`
        : status.status === 'Succeeded' && status.detail
          ? `${status.status} (${status.detail})`
          : status.status)
      : '';
    return item;
  });
  const columns = headers.map((header, columnIndex) => {
    const field = `__sfocColumn${columnIndex}`;
    return {
      title: importColumnTitle(header),
      field,
      editor: importCellEditor,
      headerFilter: 'input',
      width: importColumnWidth(header),
      minWidth: 120,
      formatter: (cell) => escapeHtml(cell.getValue())
    };
  });
  if (showStatus) {
    columns.push({
      title: t('dataImport.colStatus'),
      field: '__sfocStatus',
      headerSort: true,
      width: importColumnWidth(t('dataImport.colStatus'), 180),
      minWidth: 180,
      formatter: (cell) => escapeHtml(cell.getValue())
    });
  }
  const columnSignature = `${headers.join('\u001f')}|status:${showStatus ? 1 : 0}`;
  if (
    importTable
    && !importTable.destroyed
    && importTable.__sfocBuilt === true
    && importTableSource === parsedImport
    && importTableColumnSignature === columnSignature
  ) {
    const currentTable = importTable;
    void Promise.resolve(currentTable.replaceData(data)).then(() => {
      if (currentTable === importTable && !currentTable.destroyed) {
        applyTabulatorTheme(currentTable);
        updateImportFilterSummary(currentTable);
      }
    }).catch(() => {});
    return;
  }

  const savedState = captureImportTableState(importTable);
  disposeTabulatorTheme(importTable);
  importTable?.destroy();
  importTable = null;
  importTableSource = null;
  importTableColumnSignature = '';
  const renderVersion = ++importTableRenderVersion;
  mount.innerHTML = '';

  void loadTabulator().then((Tabulator) => {
    if (!mount.isConnected || renderVersion !== importTableRenderVersion) return;
    const table = new Tabulator(mount, {
      data,
      layout: 'fitDataStretch',
      height: 'min(52vh, 560px)',
      index: '__sfocRowIndex',
      nestedFieldSeparator: false,
      placeholder: t('dataImport.noResults'),
      renderVertical: 'virtual',
      renderHorizontal: 'virtual',
      renderVerticalBuffer: 560,
      rowHeight: 28,
      headerFilterLiveFilterDelay: 250,
      editTriggerEvent: 'dblclick',
      selectableRows: true,
      selectableRowsPersistence: false,
      columns,
      rowFormatter: styleTabulatorRow
    });
    // Tabulator difiere `_create`; una instancia antigua no debe reconstruir el
    // mount si entretanto se ha cargado otro fichero.
    if (typeof table._create === 'function') {
      const createTable = table._create;
      table._create = function createCurrentImportTableOnly() {
        if (
          this.destroyed
          || !mount.isConnected
          || renderVersion !== importTableRenderVersion
          || importTable !== this
        ) return;
        return createTable.call(this);
      };
    }
    importTable = table;
    table.__sfocBuilt = false;
    importTableSource = parsedImport;
    importTableColumnSignature = columnSignature;
    table.on('tableBuilt', () => {
      if (table !== importTable || renderVersion !== importTableRenderVersion) return;
      table.__sfocBuilt = true;
      restoreImportTableState(table, savedState, new Set(columns.map(({ field }) => field)));
      updateImportFilterSummary(table);
    });
    table.on('cellEdited', syncEditedImportCell);
    table.on('dataFiltered', () => updateImportFilterSummary(table));
    applyTabulatorTheme(table);
  }).catch(() => {
    if (renderVersion === importTableRenderVersion) {
      importTable = null;
      importTableSource = null;
      importTableColumnSignature = '';
      mount.textContent = t('dataImport.noResults');
    }
  });
}

async function parseImport({ silent = false, clearPaste = false } = {}) {
  const text = document.getElementById('dataWorkbenchImportPaste')?.value || '';
  if (!text.trim()) {
    if (!silent) showToast(t('dataImport.pasteRequired'), 'warn');
    return;
  }
  return loadParsedImport(parseImportData(text), { silent, clearPaste });
}

async function loadParsedImport(data, { silent = false, clearPaste = false } = {}) {
  parsedImport = data;
  importRunComplete = false;
  importRowStatuses = [];
  const objectApiName = document.getElementById('dataWorkbenchImportObjectSelect')?.value || '';
  let describe = null;
  if (objectApiName) {
    try {
      describe = await loadDescribe(objectApiName);
    } catch {
      describe = null;
    }
  } else {
    const idCol = parsedImport.headers.find((h) => /^id$/i.test(h.trim()));
    if (idCol && parsedImport.rows[0]) {
      const idx = parsedImport.headers.indexOf(idCol);
      const idVal = parsedImport.rows[0][idx];
      const resolved = resolveObjectApiNameFromId(globalSobjects, idVal);
      if (resolved) {
        document.getElementById('dataWorkbenchImportObjectSelect').value = resolved;
        describe = await loadDescribe(resolved);
      }
    }
  }
  importDescribe = describe;
  renderCsvMapping(parsedImport, describe);
  renderImportTable();
  if (clearPaste) {
    const paste = document.getElementById('dataWorkbenchImportPaste');
    if (paste) paste.value = '';
  }
  if (!silent) setStatus(t('dataWorkbench.csvLoaded', { rows: parsedImport.rows.length }));
}

async function applyStagedImport() {
  const staged = consumeStagedImportData();
  if (!staged?.rows?.length || !staged?.headers?.length) return false;

  const headers = staged.headers.map((header) => String(header || '').trim()).filter(Boolean);
  if (!headers.length) return false;
  parsedImport = {
    format: 'query',
    headers,
    rows: staged.rows.map((row) => headers.map((header) => row?.[header] == null ? '' : String(row[header])))
  };
  importRunComplete = false;
  importRowStatuses = [];
  const select = /** @type {HTMLInputElement | null} */ (document.getElementById('dataWorkbenchImportObjectSelect'));
  const objectApiName = String(staged.objectApiName || '');
  if (select && objectApiName && globalSobjects.some((sobject) => sobject.name === objectApiName)) {
    select.value = objectApiName;
  }
  const operation = /** @type {HTMLSelectElement | null} */ (document.getElementById('dataWorkbenchImportOperation'));
  if (operation) operation.value = 'update';
  let describe = null;
  if (select?.value) {
    try {
      describe = await loadDescribe(select.value);
    } catch {
      describe = null;
    }
  }
  importDescribe = describe;
  setActiveTab('import');
  renderCsvMapping(parsedImport, describe);
  renderImportTable();
  setStatus(t('dataImport.receivedFromQuery', { rows: parsedImport.rows.length }));
  return true;
}

function addImportRow() {
  if (!parsedImport?.headers?.length) {
    showToast(t('dataImport.pasteRequired'), 'warn');
    return;
  }
  parsedImport.rows.push(new Array(parsedImport.headers.length).fill(''));
  importRunComplete = false;
  importRowStatuses = [];
  renderImportTable();
}

function getSelectedImportRowIndexes() {
  const selected = importTable?.getSelectedData?.() || [];
  return new Set(selected.map((row) => Number(row.__sfocRowIndex)).filter(Number.isInteger));
}

function getImportRowsToDelete() {
  const allRowIndexes = new Set((parsedImport?.rows || []).map((_, rowIndex) => rowIndex));
  const selectedRowIndexes = getSelectedImportRowIndexes();
  const hasActiveFilters = (importTable?.getHeaderFilters?.() || [])
    .some(({ value }) => String(value ?? '').trim());
  const filteredRowIndexes = hasActiveFilters
    ? new Set((importTable?.getData?.('active') || [])
      .map((row) => Number(row?.__sfocRowIndex))
      .filter(Number.isInteger))
    : new Set();
  const rowIndexes = new Set([...selectedRowIndexes, ...filteredRowIndexes]);

  if (!selectedRowIndexes.size && !hasActiveFilters) {
    return { rowIndexes: allRowIndexes, deletesAll: true };
  }
  return { rowIndexes, deletesAll: false };
}

function deleteImportRows(rowIndexes) {
  if (!rowIndexes.size || !parsedImport?.rows) {
    showToast(t('dataImport.noRowsSelected'), 'warn');
    return;
  }
  parsedImport.rows = parsedImport.rows.filter((_, index) => !rowIndexes.has(index));
  importRowStatuses = importRowStatuses.filter((_, index) => !rowIndexes.has(index));
  importRunComplete = false;
  renderImportTable();
  setStatus(t('dataImport.rowsDeleted', { count: rowIndexes.size }));
}

async function confirmDeleteSelectedImportRows() {
  if (!parsedImport?.rows?.length) {
    showToast(t('dataImport.noRowsToDelete'), 'warn');
    return;
  }
  const { rowIndexes, deletesAll } = getImportRowsToDelete();
  if (!rowIndexes.size) {
    showToast(t('dataImport.noRowsToDelete'), 'warn');
    return;
  }
  if (!await confirmSfocToolAction(
    t(deletesAll ? 'dataImport.confirmDeleteAllRows' : 'dataImport.confirmDeleteRows', { count: rowIndexes.size }),
    t('dataImport.deleteRows'),
    { title: t('dataImport.deleteRows'), variant: 'destructive', icon: 'trash' }
  )) return;
  deleteImportRows(rowIndexes);
}

function setImportFileName(name) {
  const el = document.getElementById('dataWorkbenchImportFileName');
  if (!el) return;
  const label = String(name || '').trim();
  if (label) {
    el.textContent = label;
    el.classList.add('data-import-file-name--selected');
    el.title = label;
  } else {
    el.textContent = t('dataImport.noFile');
    el.classList.remove('data-import-file-name--selected');
    el.title = '';
  }
}

function getImportFileFormat(file) {
  const name = String(file?.name || '').trim().toLowerCase();
  if (name.endsWith('.csv')) return 'csv';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) return 'excel';
  return '';
}

function hasAllowedImportFileMimeType(file, format) {
  const mimeType = String(file?.type || '').trim().toLowerCase();
  return !mimeType || IMPORT_FILE_MIME_TYPES[format]?.has(mimeType);
}

function clearInvalidImportFile() {
  setImportFileName('');
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('dataWorkbenchImportFile'));
  if (input) input.value = '';
}

async function loadExcelImportFile(file) {
  const readXlsxFile = globalThis.readXlsxFile;
  if (typeof readXlsxFile !== 'function') {
    clearInvalidImportFile();
    showToast(t('dataImport.fileInvalidContent'), 'error');
    return;
  }
  try {
    const sheets = await readXlsxFile(file, { parseNumber: (value) => value });
    const validation = validateExcelImportRows(sheets?.[0]?.data);
    if (!validation.ok) {
      clearInvalidImportFile();
      showToast(t('dataImport.fileInvalidContent'), 'warn');
      return;
    }
    await loadParsedImport(validation.data, { silent: true, clearPaste: true });
  } catch {
    clearInvalidImportFile();
    showToast(t('dataImport.fileInvalidContent'), 'warn');
  }
}

function onImportFileSelected(file) {
  if (!file) {
    setImportFileName('');
    return;
  }
  const format = getImportFileFormat(file);
  if (!format) {
    clearInvalidImportFile();
    showToast(t('dataImport.fileTypeUnsupported'), 'warn');
    return;
  }
  if (!file.size) {
    clearInvalidImportFile();
    showToast(t('dataImport.fileInvalidContent'), 'warn');
    return;
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    clearInvalidImportFile();
    showToast(t('dataImport.fileTooLarge', { max: '10 MB' }), 'warn');
    return;
  }
  if (!hasAllowedImportFileMimeType(file, format)) {
    clearInvalidImportFile();
    showToast(t('dataImport.fileMimeUnsupported'), 'warn');
    return;
  }
  setImportFileName(file.name);
  if (format === 'excel') {
    void loadExcelImportFile(file);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result != null ? String(reader.result) : '';
    const validation = validateImportFileContent(text, format);
    if (!validation.ok) {
      clearInvalidImportFile();
      showToast(t('dataImport.fileInvalidContent'), 'warn');
      return;
    }
    const paste = document.getElementById('dataWorkbenchImportPaste');
    if (paste) paste.value = text.replace(/^\uFEFF/, '');
    void loadParsedImport(validation.data, { silent: true, clearPaste: true });
  };
  reader.onerror = () => {
    clearInvalidImportFile();
    showToast(t('dataWorkbench.csvReadError'), 'error');
  };
  reader.readAsText(file, 'UTF-8');
}

async function runImport() {
  if (guardToolAction('bulk_import') || guardToolAction('dml_execute')) return;
  const orgId = getOrgId();
  const objectApiName = document.getElementById('dataWorkbenchImportObjectSelect')?.value || '';
  const operation = document.getElementById('dataWorkbenchImportOperation')?.value || 'insert';
  const threads = Math.max(1, Math.min(6, Number(document.getElementById('dataWorkbenchImportThreads')?.value) || 6));
  const batchSize = Math.max(1, Math.min(200, Number(document.getElementById('dataWorkbenchImportBatchSize')?.value) || 200));
  if (!orgId || !objectApiName) {
    showToast(t('dataWorkbench.pickObject'), 'warn');
    return;
  }
  if (!parsedImport?.rows?.length) {
    showToast(t('dataWorkbench.csvRequired'), 'warn');
    return;
  }
  syncImportTableEdits();
  const columnMap = collectCsvColumnMap();
  const pendingMappings = [...document.querySelectorAll('.data-workbench-csv-map-input')]
    .filter((input) => !isImportMappingValue(input.value));
  pendingMappings.forEach(updateImportMappingRow);
  if (pendingMappings.length) {
    showToast(t('dataImport.mappingRequired'), 'warn');
    return;
  }
  const { records, rowIndexes } = buildImportRecordsFromParsed(columnMap, activeImportRowIndexes());
  if (!records.length) {
    showToast(t('dataWorkbench.csvNoMapped'), 'warn');
    return;
  }
  if (importOperationRequiresId(operation) && records.some((record) => !String(record.Id || '').trim())) {
    showToast(t('dataImport.idRequiredForOperation', { operation: operation.toUpperCase() }), 'warn');
    return;
  }

  if (!await confirmSfocOrgAction({
    orgId,
    description: t('modal.confirmDataImport', {
      operation,
      count: records.length,
      object: objectApiName
    }),
    confirmLabel: t('modal.action.importRecords'),
    risk: operation === 'delete' || operation === 'hardDelete' ? 'destructive' : 'write',
    variant: operation === 'delete' || operation === 'hardDelete' ? 'destructive' : 'standard'
  })) return;

  importRunComplete = true;
  importRowStatuses = new Array(parsedImport.rows.length).fill(null);
  rowIndexes.forEach((rowIdx) => {
    importRowStatuses[rowIdx] = { status: t('dataImport.queued'), detail: '' };
  });
  renderImportTable();
  showToastWithSpinner(t('dataImport.running'));

  try {
    const res = await bg({
      type: 'dataWorkbench:importBatch',
      orgId,
      operation,
      objectApiName,
      records,
      batchSize,
      threads
    });
    if (!res?.ok) throw new Error(res?.error || t('dataWorkbench.dmlFailed'));
    const results = Array.isArray(res.results) ? res.results : [];
    importRowStatuses = new Array(parsedImport.rows.length).fill(null);
    results.forEach((r, i) => {
      const rowIdx = rowIndexes[i];
      if (rowIdx == null) return;
      importRowStatuses[rowIdx] = {
        status: r.success ? 'Succeeded' : 'Failed',
        detail: r.success ? (r.id || '') : (r.errors?.join('; ') || t('dataImport.failed'))
      };
    });
    renderImportTable();
    const ok = results.filter((r) => r.success).length;
    setStatus(t('dataImport.summary', { ok, total: records.length }));
    showToast(t('dataWorkbench.dmlSuccess'), 'success');
    void logToolUsage('DataWorkbench', 'import', { ok: true, rowCount: records.length });
  } catch (e) {
    void handleToolError(e, { artifact_type: 'DataWorkbench', phase: 'import' });
    showToast(String(e?.message || e), 'error');
  } finally {
    dismissSpinnerToast();
  }
}

function onRecordIdInput() {
  const recordId = document.getElementById('dataWorkbenchRecordIdInput')?.value?.trim() || '';
  if (!recordId) return;
  const resolved = resolveObjectApiNameFromId(globalSobjects, recordId);
  if (resolved) {
    const sel = document.getElementById('dataWorkbenchObjectSelect');
    if (sel && !sel.value) sel.value = resolved;
  }
}

async function onImportObjectChange() {
  const objectApiName = document.getElementById('dataWorkbenchImportObjectSelect')?.value?.trim() || '';
  importDescribe = null;
  if (objectApiName) {
    try {
      importDescribe = await loadDescribe(objectApiName);
    } catch (e) {
      showToast(String(e?.message || e), 'error');
    }
  }
  renderCsvMapping(parsedImport, importDescribe);
}

function skipImportColumn(target) {
  const row = target.closest('.data-workbench-csv-map-row');
  const input = row?.querySelector('.data-workbench-csv-map-input');
  if (!(input instanceof HTMLInputElement)) return;
  input.value = '_';
  updateImportMappingRow(input);
  input.focus();
}

function skipAllImportColumns() {
  document.querySelectorAll('.data-workbench-csv-map-input').forEach((input) => {
    if (input.value.trim()) return;
    input.value = '_';
    updateImportMappingRow(input);
  });
}

export function setupDataWorkbenchPanel() {
  bindObjectPicker('dataWorkbenchImportObjectSelect', 'dataWorkbenchImportObjectResults', () => void onImportObjectChange());
  document.getElementById('dataWorkbenchImportObjectSelect')?.addEventListener('change', () => void onImportObjectChange());
  document.getElementById('dataWorkbenchImportOperation')?.addEventListener('change', () => {
    renderCsvMapping(parsedImport, importDescribe);
  });
  const mapping = document.getElementById('dataWorkbenchCsvMapping');
  mapping?.addEventListener('input', (event) => {
    const input = /** @type {HTMLInputElement} */ (event.target).closest('.data-workbench-csv-map-input');
    if (!input) return;
    updateImportMappingRow(input);
    renderImportFieldResults(input, input.parentElement?.querySelector('.data-workbench-autocomplete-results'));
  });
  mapping?.addEventListener('focusin', (event) => {
    const input = /** @type {HTMLInputElement} */ (event.target).closest('.data-workbench-csv-map-input');
    if (input) renderImportFieldResults(input, input.parentElement?.querySelector('.data-workbench-autocomplete-results'));
  });
  mapping?.addEventListener('focusout', (event) => {
    const input = /** @type {HTMLInputElement} */ (event.target).closest('.data-workbench-csv-map-input');
    const panel = input?.parentElement?.querySelector('.data-workbench-autocomplete-results');
    if (input && panel) setTimeout(() => hideAutocomplete(input, panel), 120);
  });
  mapping?.addEventListener('click', (event) => {
    const skip = /** @type {HTMLElement} */ (event.target).closest('[data-skip-csv-col]');
    if (skip) {
      skipImportColumn(skip);
      return;
    }
    const option = /** @type {HTMLElement} */ (event.target).closest('[data-sf-field]');
    if (!option) return;
    const input = option.closest('.data-workbench-autocomplete')?.querySelector('.data-workbench-csv-map-input');
    if (!(input instanceof HTMLInputElement)) return;
    input.value = option.dataset.sfField || '';
    updateImportMappingRow(input);
    hideAutocomplete(input, option.closest('.data-workbench-autocomplete')?.querySelector('.data-workbench-autocomplete-results'));
  });
  document.getElementById('dataWorkbenchImportSkipAllBtn')?.addEventListener('click', skipAllImportColumns);
  document.getElementById('dataWorkbenchImportPaste')?.addEventListener('input', () => {
    if (importPasteParseTimer) clearTimeout(importPasteParseTimer);
    importPasteParseTimer = window.setTimeout(() => {
      importPasteParseTimer = 0;
      void parseImport({ silent: true, clearPaste: true });
    }, 350);
  });
  document.getElementById('dataWorkbenchImportRunBtn')?.addEventListener('click', () => void runImport());
  document.getElementById('dataWorkbenchImportDeleteRowsBtn')?.addEventListener('click', () => void confirmDeleteSelectedImportRows());
  document.getElementById('dataWorkbenchImportFileBtn')?.addEventListener('click', () => {
    document.getElementById('dataWorkbenchImportFile')?.click();
  });
  document.getElementById('dataWorkbenchImportFile')?.addEventListener('change', (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    onImportFileSelected(input.files?.[0] || null);
  });
}

export async function refreshDataWorkbenchPanel() {
  if (getSelectedArtifactType() !== 'DataWorkbench') return;
  setDataWorkbenchView();
  globalSobjects = [];
  lastDescribe = null;
  lastLayout = null;
  lastRecord = null;
  editorRows = [];
  editorMode = 'view';
  clearFieldEditingState();
  parsedImport = null;
  importDescribe = null;
  importWritableFieldNames = new Set();
  importRowStatuses = [];
  importRunComplete = false;
  renderCsvMapping(null, null);
  renderImportTable();
  setImportFileName('');
  const fileInput = document.getElementById('dataWorkbenchImportFile');
  if (fileInput) fileInput.value = '';
  await loadGlobal();
  await applyStagedImport();
}
