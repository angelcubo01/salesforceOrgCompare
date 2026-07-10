import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { handleToolError } from '../../shared/reportToolError.js';
import { guardToolAction } from './featureControlsUi.js';
import { filterSobjects, resolveObjectApiNameFromId } from '../../shared/objectDescribeApi.js';
import { parseFieldsFromForm, buildRecordPayload } from '../../shared/dataWorkbenchApi.js';
import {
  autoMapColumns,
  parseImportData
} from '../../shared/dataWorkbenchCsv.js';
import { buildRecordEditorRows, buildUpdatePayloadFromRows } from '../../shared/recordEditorModel.js';
import { buildRecordViewUrl } from '../../shared/idActionsApi.js';
import { logToolUsage } from './toolUsageLog.js';

/** @type {'recordEditor' | 'import'} */
let activeTab = 'recordEditor';
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
const IMPORT_PREVIEW_MAX_ROWS = 500;
let loadInFlight = false;

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

function setActiveTab(tab) {
  activeTab = tab;
  document.querySelectorAll('[data-dw-tab]').forEach((btn) => {
    const id = btn.getAttribute('data-dw-tab');
    btn.classList.toggle('active', id === tab);
    btn.setAttribute('aria-selected', id === tab ? 'true' : 'false');
  });
  document.getElementById('dataWorkbenchTabRecordEditor')?.classList.toggle('hidden', tab !== 'recordEditor');
  document.getElementById('dataWorkbenchTabImport')?.classList.toggle('hidden', tab !== 'import');
}

function populateObjectSelect(selectId, sobjects) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const search = document.getElementById('dataWorkbenchObjectSearch')?.value || '';
  const filtered = filterSobjects(sobjects, search, '').slice(0, 500);
  const prev = sel.value;
  sel.innerHTML = `<option value="">${escapeHtml(t('dataWorkbench.selectObject'))}</option>`;
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
    populateObjectSelect('dataWorkbenchObjectSelect', globalSobjects);
    populateObjectSelect('dataWorkbenchImportObjectSelect', globalSobjects);
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
  if (operation === 'purge' && !window.confirm(t('dataWorkbench.purgeConfirm'))) return;
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
  const fields = Array.isArray(describe?.fields) ? describe.fields : [];
  const auto = autoMapColumns(csv.headers, fields);
  wrap.innerHTML = csv.headers
    .map((h) => {
      const mapped = auto[h] || '';
      const grey = mapped ? '' : 'data-import-unmapped';
      return `<label class="data-workbench-csv-map-row ${grey}">
        <span class="data-workbench-csv-col">${escapeHtml(h)}</span>
        <input type="text" class="sfoc-query-input data-workbench-csv-map-input" data-csv-col="${escapeHtml(h)}" value="${escapeHtml(mapped)}" placeholder="${escapeHtml(t('dataWorkbench.sfFieldPlaceholder'))}" />
      </label>`;
    })
    .join('');
}

function collectCsvColumnMap() {
  /** @type {Record<string, string>} */
  const map = {};
  document.querySelectorAll('.data-workbench-csv-map-input').forEach((el) => {
    const input = /** @type {HTMLInputElement} */ (el);
    const col = input.dataset.csvCol || '';
    const sf = input.value.trim();
    if (col && sf) map[col] = sf;
  });
  return map;
}

function buildImportRecordsFromParsed(columnMap) {
  /** @type {Record<string, string>[]} */
  const records = [];
  /** @type {number[]} */
  const rowIndexes = [];
  if (!parsedImport?.rows?.length) return { records, rowIndexes };
  for (let idx = 0; idx < parsedImport.rows.length; idx++) {
    const row = parsedImport.rows[idx];
    /** @type {Record<string, string>} */
    const rec = {};
    parsedImport.headers.forEach((header, i) => {
      const sfField = columnMap[header];
      if (!sfField) return;
      rec[sfField] = row[i] != null ? String(row[i]) : '';
    });
    if (Object.keys(rec).length > 0) {
      records.push(rec);
      rowIndexes.push(idx);
    }
  }
  return { records, rowIndexes };
}

function renderImportTable() {
  const thead = document.getElementById('dataWorkbenchImportResultsThead');
  const tbody = document.getElementById('dataWorkbenchImportResultsTbody');
  if (!tbody) return;

  const headers = parsedImport?.headers || [];
  const rows = parsedImport?.rows || [];
  const showStatus = importRunComplete && importRowStatuses.some((s) => s != null);
  const colCount = Math.max(headers.length + (showStatus ? 1 : 0), 1);

  const headerRow = thead?.querySelector('tr');
  if (headerRow) {
    headerRow.innerHTML = '';
    for (const h of headers) {
      const th = document.createElement('th');
      th.textContent = h;
      headerRow.appendChild(th);
    }
    if (showStatus) {
      const th = document.createElement('th');
      th.textContent = t('dataImport.colStatus');
      headerRow.appendChild(th);
    }
  }

  tbody.innerHTML = '';
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${colCount}" class="data-workbench-empty">${escapeHtml(t('dataImport.noResults'))}</td></tr>`;
    return;
  }

  const visibleRows = rows.slice(0, IMPORT_PREVIEW_MAX_ROWS);
  visibleRows.forEach((row, i) => {
    const tr = document.createElement('tr');
    const status = importRowStatuses[i];
    if (showStatus && status) {
      if (status.status === 'Succeeded') tr.classList.add('data-import-status-ok');
      else if (status.status === 'Failed') tr.classList.add('data-import-status-fail');
    }
    for (let c = 0; c < headers.length; c++) {
      const td = document.createElement('td');
      td.textContent = row[c] != null ? String(row[c]) : '';
      tr.appendChild(td);
    }
    if (showStatus) {
      const td = document.createElement('td');
      if (status) {
        td.textContent =
          status.status === 'Failed' && status.detail
            ? `${status.status}: ${status.detail}`
            : status.status === 'Succeeded' && status.detail
              ? `${status.status} (${status.detail})`
              : status.status;
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });

  if (rows.length > IMPORT_PREVIEW_MAX_ROWS) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="${colCount}" class="data-workbench-empty">${escapeHtml(
      t('dataImport.previewTruncated', { shown: IMPORT_PREVIEW_MAX_ROWS, total: rows.length })
    )}</td>`;
    tbody.appendChild(tr);
  }
}

async function parseImport() {
  const text = document.getElementById('dataWorkbenchImportPaste')?.value || '';
  if (!text.trim()) {
    showToast(t('dataImport.pasteRequired'), 'warn');
    return;
  }
  parsedImport = parseImportData(text);
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
  renderCsvMapping(parsedImport, describe);
  renderImportTable();
  setStatus(t('dataWorkbench.csvLoaded', { rows: parsedImport.rows.length }));
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

function onImportFileSelected(file) {
  if (!file) {
    setImportFileName('');
    return;
  }
  setImportFileName(file.name);
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result != null ? String(reader.result) : '';
    const paste = document.getElementById('dataWorkbenchImportPaste');
    if (paste) paste.value = text;
    void parseImport();
  };
  reader.onerror = () => showToast(t('dataWorkbench.csvReadError'), 'error');
  reader.readAsText(file, 'UTF-8');
}

async function runImport() {
  if (guardToolAction('dml_execute')) return;
  const orgId = getOrgId();
  const objectApiName = document.getElementById('dataWorkbenchImportObjectSelect')?.value || '';
  const operation = document.getElementById('dataWorkbenchImportOperation')?.value || 'insert';
  const externalIdField = document.getElementById('dataWorkbenchImportExternalId')?.value?.trim() || 'Id';
  const batchSize = Number(document.getElementById('dataWorkbenchImportBatchSize')?.value) || 200;
  if (!orgId || !objectApiName) {
    showToast(t('dataWorkbench.pickObject'), 'warn');
    return;
  }
  if (!parsedImport?.rows?.length) {
    showToast(t('dataWorkbench.csvRequired'), 'warn');
    return;
  }
  const columnMap = collectCsvColumnMap();
  const { records, rowIndexes } = buildImportRecordsFromParsed(columnMap);
  if (!records.length) {
    showToast(t('dataWorkbench.csvNoMapped'), 'warn');
    return;
  }

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
      externalIdField,
      batchSize
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

export function setupDataWorkbenchPanel() {
  document.querySelectorAll('[data-dw-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-dw-tab');
      if (tab === 'recordEditor' || tab === 'import') setActiveTab(tab);
    });
  });
  document.getElementById('dataWorkbenchObjectSearch')?.addEventListener('input', () => {
    populateObjectSelect('dataWorkbenchObjectSelect', globalSobjects);
    populateObjectSelect('dataWorkbenchImportObjectSelect', globalSobjects);
  });
  document.getElementById('dataWorkbenchRecordIdInput')?.addEventListener('change', onRecordIdInput);
  document.getElementById('dataWorkbenchLoadRecordBtn')?.addEventListener('click', () => void loadRecord());
  document.getElementById('dataWorkbenchSaveBtn')?.addEventListener('click', () => void saveRecord());
  document.getElementById('dataWorkbenchCancelEditBtn')?.addEventListener('click', cancelEdit);
  document.getElementById('dataWorkbenchCreateBtn')?.addEventListener('click', () => void startCreate());
  document.getElementById('dataWorkbenchRecordEditorTbody')?.addEventListener('click', (ev) => {
    const btn = /** @type {HTMLElement} */ (ev.target).closest('[data-edit-field]');
    if (!btn) return;
    ev.preventDefault();
    toggleFieldEdit(btn.getAttribute('data-edit-field') || '');
  });
  document.getElementById('dataWorkbenchDeleteBtn')?.addEventListener('click', () => void runRecordDml('delete'));
  document.getElementById('dataWorkbenchUndeleteBtn')?.addEventListener('click', () => void runRecordDml('undelete'));
  document.getElementById('dataWorkbenchPurgeBtn')?.addEventListener('click', () => void runRecordDml('purge'));
  document.getElementById('dataWorkbenchOpenInSfBtn')?.addEventListener('click', () => void openRecordInSalesforce());
  document.getElementById('dataWorkbenchImportParseBtn')?.addEventListener('click', () => void parseImport());
  document.getElementById('dataWorkbenchImportRunBtn')?.addEventListener('click', () => void runImport());
  document.getElementById('dataWorkbenchImportFileBtn')?.addEventListener('click', () => {
    document.getElementById('dataWorkbenchImportFile')?.click();
  });
  document.getElementById('dataWorkbenchImportFile')?.addEventListener('change', (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    onImportFileSelected(input.files?.[0] || null);
  });

  document.addEventListener('keydown', (e) => {
    if (getSelectedArtifactType() !== 'DataWorkbench') return;
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      if (hasPendingEdits()) {
        e.preventDefault();
        void saveRecord();
      }
    }
  });
}

export async function refreshDataWorkbenchPanel() {
  if (getSelectedArtifactType() !== 'DataWorkbench') return;
  setActiveTab('recordEditor');
  globalSobjects = [];
  lastDescribe = null;
  lastLayout = null;
  lastRecord = null;
  editorRows = [];
  editorMode = 'view';
  clearFieldEditingState();
  parsedImport = null;
  importRowStatuses = [];
  importRunComplete = false;
  updateEditorActionButtons();
  renderRecordEditorTable();
  renderCsvMapping(null, null);
  renderImportTable();
  setImportFileName('');
  const fileInput = document.getElementById('dataWorkbenchImportFile');
  if (fileInput) fileInput.value = '';
  await loadGlobal();
}
