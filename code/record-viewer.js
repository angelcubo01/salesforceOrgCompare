import { loadLang, t } from '../shared/i18n.js';
import { loadExtensionSettings, applyUiThemeToDocument } from '../shared/extensionSettings.js';
import { setupStandaloneCommandPalette } from '../shared/commandPaletteBridge.js';
import {
  canEditRecordField,
  buildRecordViewerPatch,
  recordViewerEditorType,
  recordViewerPicklistOptions
} from '../shared/recordViewerCore.js';
import { applyTabulatorTheme, disposeTabulatorTheme, styleTabulatorRow } from './ui/tabulatorTheme.js';
import { createRecordViewerQuickActionsController } from './recordViewerQuickActions.js';

let table = null;
let payload = null;
let filter = 'all';
let saving = false;
let loadSequence = 0;
let quickActions = null;
let permissionDetails = null;
let permissionDetailsRequest = 0;
let quickActionToConfigure = new URL(location.href).searchParams.get('quickAction') || '';

const $ = (id) => document.getElementById(id);
const bg = (message) => chrome.runtime.sendMessage(message);
const rv = (key, params) => t(`recordViewer.${key}`, params);

function setStatus(message, error = false) {
  const el = $('recordViewerStatus');
  el.textContent = message || '';
  el.classList.toggle('is-error', error);
}

function setLoading(active, message = '') {
  const overlay = $('recordViewerLoading');
  overlay.classList.toggle('hidden', !active);
  overlay.setAttribute('aria-busy', String(active));
  document.body.setAttribute('aria-busy', String(active));
  if (message) $('recordViewerLoadingText').textContent = message;
}

function setInlineLoading(active, message = '') {
  const indicator = $('recordViewerSaving');
  indicator.classList.toggle('hidden', !active);
  indicator.setAttribute('aria-busy', String(active));
  document.body.setAttribute('aria-busy', String(active));
  document.body.classList.toggle('record-viewer-is-updating', active);
  $('recordViewerSummary').classList.toggle('is-updating', active);
  $('recordViewerReload').disabled = active;
  $('recordViewerQuickActionsButton').disabled = active;
  if (message) $('recordViewerSavingText').textContent = message;
}

function closePermissionDetails() {
  if (!permissionDetails) return;
  permissionDetails.anchor.setAttribute('aria-expanded', 'false');
  permissionDetails.element.remove();
  permissionDetails = null;
}

function positionPermissionDetails(anchor, element) {
  const bounds = anchor.getBoundingClientRect();
  const maxLeft = Math.max(12, window.innerWidth - 340);
  element.style.left = `${Math.min(Math.max(12, bounds.left), maxLeft)}px`;
  element.style.top = `${Math.min(window.innerHeight - 80, bounds.bottom + 8)}px`;
}

async function togglePermissionDetails(anchor, details) {
  const key = `${details.resourceType}:${details.fieldName || ''}:${details.permission}`;
  if (permissionDetails?.key === key && permissionDetails.anchor === anchor) {
    closePermissionDetails();
    return;
  }
  closePermissionDetails();
  const element = document.createElement('section');
  element.className = 'record-viewer-permission-details';
  element.setAttribute('role', 'dialog');
  const header = document.createElement('div');
  header.className = 'record-viewer-permission-details-header';
  const title = document.createElement('strong');
  title.textContent = rv('permissionSourcesTitle', { permission: details.label });
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'record-viewer-permission-details-close';
  close.textContent = '×';
  close.title = rv('permissionSourcesClose');
  close.setAttribute('aria-label', rv('permissionSourcesClose'));
  close.addEventListener('click', closePermissionDetails);
  header.append(title, close);
  const body = document.createElement('div');
  const loading = document.createElement('p');
  loading.textContent = rv('permissionSourcesLoading');
  body.append(loading);
  element.append(header, body);
  document.body.append(element);
  positionPermissionDetails(anchor, element);
  anchor.setAttribute('aria-expanded', 'true');
  permissionDetails = { key, anchor, element };
  const request = ++permissionDetailsRequest;
  try {
    const result = await bg({
      type: 'recordViewer:permissionSources', requestId: payload?.requestId,
      ...payload?.direct, resourceType: details.resourceType,
      fieldName: details.fieldName || '', permission: details.permission
    });
    if (request !== permissionDetailsRequest || permissionDetails?.element !== element) return;
    body.replaceChildren();
    const sources = Array.isArray(result?.sources) ? result.sources : [];
    if (!result?.ok || !sources.length) {
      const empty = document.createElement('p');
      empty.textContent = result?.ok ? rv('permissionSourcesEmpty') : rv('permissionSourcesUnavailable');
      body.append(empty);
      return;
    }
    const list = document.createElement('ul');
    for (const source of sources) {
      const item = document.createElement('li');
      const type = document.createElement('span');
      type.textContent = source.type === 'Profile'
        ? rv('permissionSourceProfile')
        : source.type === 'PermissionSetGroup'
          ? rv('permissionSourceGroup') : rv('permissionSourceSet');
      const name = document.createElement('strong');
      name.textContent = source.name;
      item.append(type, name);
      list.append(item);
    }
    body.append(list);
    positionPermissionDetails(anchor, element);
  } catch {
    if (request !== permissionDetailsRequest || permissionDetails?.element !== element) return;
    body.replaceChildren();
    const unavailable = document.createElement('p');
    unavailable.textContent = rv('permissionSourcesUnavailable');
    body.append(unavailable);
  }
}

function permissionIcon(label, icon, value, onActivate = null) {
  if (value !== true) return null;
  const el = document.createElement('span');
  el.className = `perm-flag perm-flag--${icon} record-viewer-permission-icon`;
  el.title = label;
  el.setAttribute('aria-label', label);
  if (!onActivate) {
    el.setAttribute('role', 'img');
    el.tabIndex = 0;
    return el;
  }
  el.classList.add('is-interactive');
  el.setAttribute('role', 'button');
  el.setAttribute('aria-expanded', 'false');
  el.tabIndex = 0;
  el.addEventListener('click', onActivate);
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate(event);
    }
  });
  return el;
}

function recordDisplayName(record = {}) {
  const candidates = ['Name', 'Subject', 'CaseNumber', 'Title', 'WorkOrderNumber', 'ContractNumber'];
  return candidates.map((field) => record[field]).find((value) => value != null && String(value).trim()) || '';
}

function renderRecordHeader() {
  const title = recordDisplayName(payload?.record) || payload?.record?.Id || payload?.objectLabel || rv('loading');
  document.body.classList.add('record-viewer-loaded');
  $('recordViewerObjectLabel').textContent = payload?.objectLabel || payload?.objectApiName || '';
  $('recordViewerTitle').textContent = title;
  $('recordViewerIdentity').textContent = [
    payload?.record?.Id,
    payload?.org?.label,
    payload?.org?.isSandbox === false ? rv('production') : rv('sandbox')
  ].filter(Boolean).join(' · ');
  document.title = `[SFOC] ${title}`;
}

function renderPermissions() {
  renderRecordHeader();
  const objectContainer = $('recordViewerObjectPermissions');
  const recordContainer = $('recordViewerAccess');
  objectContainer.replaceChildren();
  recordContainer.replaceChildren();

  const objectPermissions = payload?.objectPermissions || {};
  [
    [rv('read'), 'read', objectPermissions.readable],
    [rv('create'), 'create', objectPermissions.createable],
    [rv('edit'), 'edit', objectPermissions.updateable],
    [rv('delete'), 'delete', objectPermissions.deletable],
    [rv('viewAll'), 'viewall', objectPermissions.viewAll],
    [rv('modifyAll'), 'modall', objectPermissions.modifyAll]
  ].forEach(([label, icon, value]) => {
    const permission = permissionIcon(label, icon, value, (event) => {
      void togglePermissionDetails(event.currentTarget, {
        resourceType: 'object', permission: icon, label
      });
    });
    if (permission) objectContainer.append(permission);
  });

  const access = payload?.recordAccess;
  [
    [rv('canRead'), 'read', access?.HasReadAccess],
    [rv('canEdit'), 'edit', access?.HasEditAccess],
    [rv('canDelete'), 'delete', access?.HasDeleteAccess],
    [rv('canTransfer'), 'transfer', access?.HasTransferAccess]
  ].forEach(([label, icon, value]) => {
    const permission = permissionIcon(label, icon, value);
    if (permission) recordContainer.append(permission);
  });
}

function editReasonLabel(reason) {
  const labels = {
    OBJECT_NOT_UPDATEABLE: rv('reasonObject'),
    RECORD_NOT_EDITABLE: rv('reasonRecord'),
    RECORD_ACCESS_UNKNOWN: rv('reasonRecordUnknown'),
    FIELD_NOT_ACCESSIBLE: rv('reasonFieldAccess'),
    FIELD_NOT_UPDATEABLE: rv('reasonFieldUpdate'),
    FIELD_CALCULATED: rv('reasonCalculated'),
    FIELD_AUTONUMBER: rv('reasonAutonumber'),
    FIELD_SYSTEM: rv('reasonSystem'),
    ORG_READ_ONLY: rv('reasonOrgReadOnly'),
    WRITE_POLICY: rv('reasonWritePolicy')
  };
  return labels[reason] || rv('permissionUnavailable');
}

function rowFor(field) {
  const readable = field.accessible !== false;
  const decision = canEditRecordField({
    objectPermissions: payload.objectPermissions,
    recordAccess: payload.recordAccess,
    field,
    orgReadOnly: payload.orgReadOnly,
    writePolicyAllowed: true
  });
  const value = readable && field.valuePresent ? payload.record[field.name] : null;
  return {
    id: field.name,
    apiName: field.name,
    label: field.label || field.name,
    type: field.type || '',
    meta: field,
    originalValue: value,
    pendingValue: value,
    readable,
    editable: decision.editable,
    editReason: decision.reason,
    changed: false,
    error: '',
    permission: decision.editable ? rv('readWrite') : rv('readOnly')
  };
}

function dateTimeLocalValue(value) {
  if (value == null || value === '') return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value).slice(0, 19);
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function salesforceTimeValue(value) {
  const match = String(value ?? '').match(/^(\d{2}:\d{2})(?::(\d{2}))?/);
  return match ? `${match[1]}:${match[2] || '00'}` : '';
}

function recordValueEditor(cell, onRendered, success, cancel) {
  const row = cell.getRow().getData();
  const type = String(row.type).toLowerCase();
  const editorType = recordViewerEditorType(type);
  const currentValue = cell.getValue();
  let editor;
  let readValue;

  if (editorType === 'list' || editorType === 'booleanList') {
    editor = document.createElement('select');
    const options = editorType === 'booleanList'
      ? [
          ...(row.meta.nillable ? [{ label: 'empty', value: '' }] : []),
          { label: 'true', value: 'true' },
          { label: 'false', value: 'false' }
        ]
      : recordViewerPicklistOptions(row.meta, rv('emptyValue'));
    const currentText = currentValue == null
      ? ''
      : editorType === 'booleanList'
        ? String(currentValue).toLowerCase()
        : String(currentValue);
    const currentIsAvailable = options.some((option) => option.value === currentText);
    if (!options.length || (!row.meta.nillable && currentText === '') || (currentText && !currentIsAvailable)) {
      const placeholder = document.createElement('option');
      placeholder.value = currentText;
      placeholder.textContent = currentText && !currentIsAvailable
        ? currentText
        : options.length ? rv('selectValue') : rv('noPicklistValues');
      placeholder.disabled = true;
      placeholder.selected = true;
      editor.append(placeholder);
    }
    for (const option of options) {
      const element = document.createElement('option');
      element.value = option.value;
      element.textContent = option.label;
      editor.append(element);
    }
    editor.value = currentText;
    readValue = () => {
      if (editor.value === '' && row.meta.nillable) return null;
      return editorType === 'booleanList' ? editor.value === 'true' : editor.value;
    };
  } else if (editorType === 'textarea') {
    editor = document.createElement('textarea');
    editor.value = currentValue == null ? '' : String(currentValue);
    readValue = () => editor.value;
  } else {
    editor = document.createElement('input');
    editor.type = editorType === 'number'
      ? 'number'
      : editorType === 'date'
        ? 'date'
        : editorType === 'datetime'
          ? 'datetime-local'
          : editorType === 'time'
            ? 'time'
            : 'text';
    if (editorType === 'datetime' || editorType === 'time') editor.step = '1';
    editor.value = editorType === 'datetime'
      ? dateTimeLocalValue(currentValue)
      : editorType === 'time'
        ? salesforceTimeValue(currentValue)
        : currentValue == null ? '' : String(currentValue);
    readValue = () => {
      if (editor.value === '' && row.meta.nillable && editorType !== 'input') return null;
      if (editorType === 'number') return editor.value === '' ? null : Number(editor.value);
      if (editorType === 'datetime') {
        const date = new Date(editor.value);
        return Number.isFinite(date.getTime()) ? date.toISOString() : editor.value;
      }
      if (editorType === 'time') {
        if (!editor.value) return null;
        const [hours = '00', minutes = '00', seconds = '00'] = editor.value.split(':');
        return `${hours}:${minutes}:${seconds}.000Z`;
      }
      return editor.value;
    };
  }

  editor.className = `record-viewer-cell-editor record-viewer-cell-editor--${editorType}`;
  let finished = false;
  const commit = () => {
    if (finished) return;
    finished = true;
    success(readValue());
  };
  const abort = () => {
    if (finished) return;
    finished = true;
    cancel();
  };

  editor.addEventListener('blur', commit);
  if (editorType === 'list' || editorType === 'booleanList') editor.addEventListener('change', commit);
  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      abort();
    } else if (event.key === 'Enter' && (editorType !== 'textarea' || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      commit();
    }
  });
  onRendered(() => {
    editor.focus({ preventScroll: true });
    if (editorType === 'input') editor.select?.();
    if (editorType === 'list' || editorType === 'booleanList') {
      try { editor.showPicker?.(); } catch {}
    }
  });
  return editor;
}

function appendChangedMarker(container, cell) {
  const row = cell.getRow().getData();
  if (!row.changed) return;
  const status = document.createElement('span');
  status.className = 'record-viewer-value-status';
  const marker = document.createElement('span');
  marker.className = 'record-viewer-edited-marker';
  marker.textContent = rv('edited');
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'record-viewer-undo-action';
  reset.textContent = '↶';
  reset.title = rv('discardOne');
  reset.setAttribute('aria-label', rv('discardOne'));
  reset.setAttribute('data-action', 'undo-row');
  reset.addEventListener('click', () => undoRow(cell.getRow()));
  status.append(marker, reset);
  container.append(status);
}

function valueFormatter(cell) {
  const row = cell.getRow().getData();
  const el = document.createElement('span');
  el.className = 'record-viewer-value';
  const value = cell.getValue();
  if (!row.readable) {
    el.textContent = rv('noAccessValue');
    return el;
  }

  if (row.meta.type === 'reference' && value) {
    const id = String(value);
    const menu = document.createElement('span');
    menu.className = 'record-viewer-reference-menu';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'record-viewer-relation';
    button.textContent = id;
    button.title = id;
    button.addEventListener('click', () => openRelated(id));
    const actions = document.createElement('span');
    actions.className = 'record-viewer-relation-actions';
    const sf = document.createElement('button');
    sf.type = 'button';
    sf.className = 'record-viewer-relation-action record-viewer-relation-action--sf';
    sf.textContent = rv('viewInSalesforce');
    sf.title = rv('viewInSalesforce');
    sf.addEventListener('click', () => window.open(`${payload.org.instanceUrl}/${encodeURIComponent(id)}`, '_blank', 'noopener'));
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'record-viewer-relation-action record-viewer-relation-action--copy';
    copy.textContent = rv('copyId');
    copy.title = rv('copyId');
    copy.addEventListener('click', () => navigator.clipboard.writeText(id));
    actions.append(sf, copy);
    menu.append(button, actions);
    el.append(menu);
  } else {
    el.append(document.createTextNode(value == null ? '' : String(value)));
  }
  appendChangedMarker(el, cell);
  return el;
}

async function openRelated(recordId) {
  if (!payload?.org?.id) return;
  const result = await bg({ type: 'sfInject:openRecordViewer', orgId: payload.org.id, recordId });
  if (!result?.ok) setStatus(rv('openRelationFailed'), true);
}

function fieldPermissionFormatter(cell) {
  const row = cell.getRow().getData();
  const el = document.createElement('span');
  el.className = 'record-viewer-field-permissions';
  el.title = row.editable ? rv('readWrite') : editReasonLabel(row.editReason);
  const readLabel = rv('read');
  const editLabel = rv('edit');
  const openSources = (event, permission, label) => {
    void togglePermissionDetails(event.currentTarget, {
      resourceType: 'field', fieldName: row.apiName, permission, label
    });
  };
  const read = permissionIcon(readLabel, 'read', row.readable, (event) => openSources(event, 'read', readLabel));
  const edit = permissionIcon(editLabel, 'edit', row.editable, (event) => openSources(event, 'edit', editLabel));
  if (read) el.append(read);
  if (edit) el.append(edit);
  return el;
}

function undoRow(tabulatorRow) {
  const data = tabulatorRow.getData();
  data.pendingValue = data.originalValue;
  data.changed = false;
  data.error = '';
  tabulatorRow.reformat();
  refreshPending();
  refreshFilter();
}

function actionFormatter(cell) {
  const row = cell.getRow().getData();
  const wrap = document.createElement('span');
  wrap.className = 'record-viewer-row-actions';
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'record-viewer-copy-action';
  copy.textContent = rv('copy');
  copy.title = rv('copy');
  copy.disabled = !row.readable;
  copy.addEventListener('click', () => navigator.clipboard.writeText(String(row.pendingValue ?? '')).catch(() => setStatus(rv('copyFailed'), true)));
  wrap.append(copy);
  return wrap;
}

function matches(row) {
  const query = $('recordViewerSearch').value.trim().toLowerCase();
  if (query && ![row.apiName, row.label, row.type, row.readable ? row.pendingValue : ''].some((value) => String(value ?? '').toLowerCase().includes(query))) return false;
  if (filter === 'editable') return row.editable;
  if (filter === 'readonly') return row.readable && !row.editable;
  if (filter === 'noaccess') return !row.readable;
  if (filter === 'changed') return row.changed;
  if (filter === 'error') return !!row.error;
  return true;
}

function refreshFilter() {
  table?.setFilter(matches);
}

function refreshPending() {
  const rows = table?.getData() || [];
  const count = rows.filter((row) => row.changed).length + (quickActions?.pendingCount() || 0);
  $('recordViewerPending').classList.toggle('hidden', !count);
  $('recordViewerPendingText').textContent = rv('pendingCount', { count });
  $('recordViewerSave').disabled = !count || saving;
  $('recordViewerDiscard').disabled = !count || saving;
}

async function renderTable() {
  const { TabulatorFull: Tabulator } = await import('../vendor/tabulator/tabulator_esm.min.js');
  disposeTabulatorTheme(table);
  table?.destroy();
  table = new Tabulator($('recordViewerTable'), {
    data: payload.describe.fields.map(rowFor),
    index: 'id',
    layout: 'fitColumns',
    height: 'calc(100vh - 360px)',
    placeholder: rv('noRows'),
    virtualDom: true,
    headerSort: true,
    editTriggerEvent: 'dblclick',
    columns: [
      { title: rv('apiName'), field: 'apiName', minWidth: 250, widthGrow: 2, frozen: true },
      { title: rv('label'), field: 'label', minWidth: 240, widthGrow: 2 },
      { title: rv('type'), field: 'type', minWidth: 150, widthGrow: 1 },
      {
        title: rv('value'),
        field: 'pendingValue',
        formatter: valueFormatter,
        editable: (cell) => cell.getRow().getData().editable,
        editor: recordValueEditor,
        variableHeight: true,
        minWidth: 300,
        widthGrow: 2
      },
      { title: rv('permissions'), field: 'permission', formatter: fieldPermissionFormatter, minWidth: 180, widthGrow: 1, frozen: true },
      { title: rv('actions'), formatter: actionFormatter, width: 125, headerSort: false }
    ],
    rowFormatter(row) {
      styleTabulatorRow(row);
      const data = row.getData();
      row.getElement().classList.toggle('record-viewer-row-changed', !!data.changed);
      row.getElement().classList.toggle('record-viewer-row-error', !!data.error);
      row.getElement().title = data.error || '';
    }
  });
  table.on('cellEdited', (cell) => {
    const tabulatorRow = cell.getRow();
    const row = tabulatorRow.getData();
    row.pendingValue = cell.getValue();
    row.changed = JSON.stringify(row.pendingValue) !== JSON.stringify(row.originalValue);
    row.error = '';
    tabulatorRow.reformat();
    refreshPending();
    refreshFilter();
  });
  applyTabulatorTheme(table);
  refreshPending();
}

function viewerUrlContext() {
  const query = new URL(location.href).searchParams;
  return {
    requestId: query.get('request') || '',
    orgId: query.get('orgId') || '',
    recordId: query.get('recordId') || '',
    instance: query.get('instance') || ''
  };
}

async function loadSupplementaryPermissions(sequence, context) {
  const loadingMessage = rv('loadExtraPermissions');
  setStatus(loadingMessage);
  const result = await bg({ type: 'recordViewer:loadPermissions', ...context });
  if (sequence !== loadSequence || !payload) return;
  if (result?.ok && result.objectApiName === payload.objectApiName) {
    payload.objectPermissions = { ...payload.objectPermissions, ...result.objectPermissions };
    renderPermissions();
  }
  if ($('recordViewerStatus').textContent === loadingMessage) setStatus('');
}

async function load(options = {}) {
  const busy = options.busy || 'fullscreen';
  const sequence = ++loadSequence;
  const context = viewerUrlContext();
  if (!context.requestId && !context.recordId) {
    if (busy === 'fullscreen') setLoading(false);
    if (busy === 'inline') setInlineLoading(false);
    setStatus(rv('invalidRequest'), true);
    return false;
  }

  if (busy === 'fullscreen') setLoading(true, rv('loadFields'));
  if (busy === 'inline') setInlineLoading(true, rv('loadFields'));
  setStatus('');
  try {
    const result = await bg({ type: 'recordViewer:load', ...context });
    if (sequence !== loadSequence) return false;
    if (!result?.ok) {
      setStatus(result?.reason === 'NO_SID' ? rv('noSession') : rv('loadFailed'), true);
      return false;
    }
    closePermissionDetails();
    payload = result;
    renderPermissions();
    await renderTable();
    quickActions?.setPayload(payload);
    if (quickActionToConfigure) {
      quickActions?.openAction(quickActionToConfigure);
      quickActionToConfigure = '';
    }
    setStatus('');
    void loadSupplementaryPermissions(sequence, { requestId: payload.requestId, ...payload.direct });
    return true;
  } catch {
    if (sequence === loadSequence) setStatus(rv('loadFailed'), true);
    return false;
  } finally {
    if (sequence === loadSequence && busy === 'fullscreen') setLoading(false);
    if (sequence === loadSequence && busy === 'inline') setInlineLoading(false);
  }
}

function applySaveErrors(errors) {
  for (const error of Array.isArray(errors) ? errors : []) {
    for (const field of error?.fields || []) {
      const row = table?.getRow(field);
      if (!row) continue;
      const data = row.getData();
      data.error = error.message || rv('validationError');
      void row.update(data);
    }
  }
  refreshFilter();
}

async function persistUpdates(updates) {
  if (saving || !payload || !updates.length) return { ok: false, error: rv('saveFailed') };
  saving = true;
  refreshPending();
  setInlineLoading(true, rv('saving'));
  setStatus(rv('saving'));
  try {
    const result = await bg({
      type: 'recordViewer:save',
      requestId: payload.requestId,
      ...payload.direct,
      updates
    });
    if (!result?.ok) {
      const error = result?.reason === 'CONCURRENT_UPDATE' ? rv('concurrent') : rv('saveFailed');
      setStatus(error, true);
      applySaveErrors(result?.errors);
      if (result?.reason === 'CONCURRENT_UPDATE' && Array.isArray(result.fields)) {
        applySaveErrors([{ fields: result.fields, message: rv('concurrent') }]);
      }
      return { ok: false, error, reason: result?.reason };
    }
    const loaded = await load({ busy: 'none' });
    return loaded ? { ok: true } : { ok: false, error: rv('loadFailed') };
  } catch {
    setStatus(rv('saveFailed'), true);
    return { ok: false, error: rv('saveFailed') };
  } finally {
    saving = false;
    setInlineLoading(false);
    refreshPending();
  }
}

async function save() {
  if (saving || !table || !payload) return;
  const rows = table.getData();
  const fields = buildRecordViewerPatch(rows);
  if (!Object.keys(fields).length) return;
  const baseValues = Object.fromEntries(rows
    .filter((row) => Object.prototype.hasOwnProperty.call(fields, row.apiName))
    .map((row) => [row.apiName, row.originalValue]));
  const result = await persistUpdates([{
    path: [],
    recordId: payload.record.Id,
    fields,
    baseValues,
    lastModifiedDate: payload.record.LastModifiedDate
  }]);
  if (result.ok) setStatus(rv('saved'));
}

async function executeQuickAction(action, updates) {
  if (saving) return { ok: false, error: rv('saving') };
  if (hasPendingChanges() && !window.confirm(rv('quickActionDiscardPendingConfirm'))) {
    setStatus('');
    return { ok: false, cancelled: true };
  }
  return persistUpdates(updates);
}

function discard() {
  for (const row of table?.getRows() || []) {
    if (row.getData().changed) undoRow(row);
  }
  quickActions?.discardAll();
  refreshPending();
}

function hasPendingChanges() {
  return !!table?.getData().some((row) => row.changed) || !!quickActions?.hasPendingChanges();
}

function setUiText() {
  $('recordViewerTitle').textContent = rv('title');
  $('recordViewerObjectPermissionsTitle').textContent = rv('objectPermissions');
  $('recordViewerAccessTitle').textContent = rv('recordAccess');
  $('recordViewerSearch').placeholder = rv('search');
  $('recordViewerLoadingText').textContent = rv('loading');
  $('recordViewerSavingText').textContent = rv('saving');
  const labels = { all: 'all', editable: 'editable', readonly: 'readOnly', noaccess: 'noAccess', changed: 'changed', error: 'withErrors' };
  for (const [filterId, key] of Object.entries(labels)) {
    document.querySelector(`[data-filter="${filterId}"]`).textContent = rv(key);
  }
  $('recordViewerSf').textContent = rv('viewInSalesforce');
  $('recordViewerCopy').textContent = rv('copyId');
  $('recordViewerReload').textContent = rv('reload');
  $('recordViewerSave').textContent = rv('save');
  $('recordViewerDiscard').textContent = rv('discard');
  $('recordViewerQuickActionsButton').textContent = rv('quickActions');
  $('recordViewerQuickActionsTitle').textContent = rv('quickActions');
  $('recordViewerQuickActionAdd').title = rv('quickActionNewTitle');
  $('recordViewerQuickActionAdd').setAttribute('aria-label', rv('quickActionNewTitle'));
  $('recordViewerQuickActionModalEyebrow').textContent = rv('quickActionAutomation');
  $('recordViewerQuickActionNameLabel').textContent = rv('quickActionName');
  $('recordViewerQuickActionEnvironmentsLabel').textContent = rv('quickActionEnvironments');
  $('recordViewerQuickActionChangesTitle').textContent = rv('quickActionChanges');
  $('recordViewerQuickActionChangesHint').textContent = rv('quickActionChangesHint');
  $('recordViewerQuickActionAddChange').textContent = rv('quickActionAddChange');
  $('recordViewerQuickActionCancel').textContent = t('common.cancel');
  $('recordViewerQuickActionSave').textContent = rv('quickActionSaveConfiguration');
  $('recordViewerQuickActionDelete').textContent = rv('quickActionDelete');
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadLang();
  await loadExtensionSettings();
  applyUiThemeToDocument(document);
  setUiText();
  quickActions = createRecordViewerQuickActionsController({
    bg,
    tr: rv,
    getPayload: () => payload,
    executeUpdates: executeQuickAction,
    setStatus
  });
  document.addEventListener('pointerdown', (event) => {
    if (permissionDetails && !permissionDetails.element.contains(event.target) && !permissionDetails.anchor.contains(event.target)) {
      closePermissionDetails();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && permissionDetails) closePermissionDetails();
  });
  window.addEventListener('resize', closePermissionDetails);
  await quickActions.init();
  await load();

  $('recordViewerSearch').addEventListener('input', refreshFilter);
  $('recordViewerFilters').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-filter]');
    if (!button) return;
    filter = button.dataset.filter;
    for (const candidate of $('recordViewerFilters').querySelectorAll('button')) {
      candidate.setAttribute('aria-pressed', String(candidate === button));
    }
    refreshFilter();
  });
  $('recordViewerReload').addEventListener('click', () => {
    if (hasPendingChanges() && !window.confirm(rv('reloadDiscardConfirm'))) return;
    void load({ busy: payload ? 'inline' : 'fullscreen' });
  });
  $('recordViewerCopy').addEventListener('click', () => navigator.clipboard.writeText(String(payload?.record?.Id || '')).catch(() => setStatus(rv('copyFailed'), true)));
  $('recordViewerSf').addEventListener('click', () => {
    if (payload?.org?.instanceUrl && payload?.objectApiName && payload?.record?.Id) {
      window.open(`${payload.org.instanceUrl}/lightning/r/${encodeURIComponent(payload.objectApiName)}/${encodeURIComponent(payload.record.Id)}/view`, '_blank', 'noopener');
    }
  });
  $('recordViewerSave').addEventListener('click', save);
  $('recordViewerDiscard').addEventListener('click', discard);
  window.addEventListener('beforeunload', (event) => {
    if (!hasPendingChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  });
});

setupStandaloneCommandPalette();
