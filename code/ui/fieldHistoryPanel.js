import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t, getCurrentLang } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import {
  isValidSalesforceRecordId,
  expandTrackedFieldsForHistorySoql,
  parseSalesforceDateTime,
  fieldHistoryDisplayLabel,
  formatFieldHistoryValue
} from '../../shared/fieldHistoryApi.js';
import { escapeHtml } from '../../shared/htmlEscape.js';
import { handleToolResponseFailure } from '../../shared/reportToolError.js';
import { getFieldHistoryDefaultRangeDays } from '../../shared/extensionSettings.js';
import { createDateTimeRangePicker } from './dateTimeRangePicker.js';
import { createTablePagination } from './tablePagination.js';
import { getSalesforceNow } from './salesforceServerClock.js';
import {
  isValidUtcRange,
  toLocalDateTimeValue,
  toUtcIsoFromLocalDateTime
} from '../../shared/salesforceTime.js';

const MIN_SUGGEST_LEN = 2;

/** @type {Array<Record<string, unknown>>} */
let lastRows = [];
let currentPage = 1;
let historyLoading = false;
let filterEventsPaused = false;
let dateRangePicker = null;
let appliedFilters = { user: '', text: '', fields: [] };
const pagination = createTablePagination({ initialPageSize: 25 });

/** @type {{ objectApiName: string, historyObject: string, parentField: string, trackedFields: Array<{ apiName: string, label: string, type: string }>, historyEnabled: boolean, historyQueryable: boolean } | null} */
let historyContext = null;

function getFilterElements() {
  return {
    status: document.getElementById('fieldHistoryStatus'),
    objectInput: document.getElementById('fieldHistoryObjectInput'),
    objectSuggestions: document.getElementById('fieldHistoryObjectSuggestions'),
    loadObjectBtn: document.getElementById('fieldHistoryLoadObjectBtn'),
    trackedTbody: document.getElementById('fieldHistoryTrackedTbody'),
    trackedEmpty: document.getElementById('fieldHistoryTrackedEmpty'),
    trackedWrap: document.getElementById('fieldHistoryTrackedWrap'),
    recordId: document.getElementById('fieldHistoryRecordId'),
    fieldFilter: document.getElementById('fieldHistoryFieldFilter'),
    user: document.getElementById('fieldHistoryUserFilter'),
    text: document.getElementById('fieldHistoryTextFilter'),
    since: document.getElementById('fieldHistorySince'),
    until: document.getElementById('fieldHistoryUntil'),
    loadBtn: document.getElementById('fieldHistoryLoadBtn'),
    resetFilters: document.getElementById('fieldHistoryResetFiltersBtn'),
    clockNotice: document.getElementById('fieldHistoryClockNotice'),
    pageSize: document.getElementById('fieldHistoryPageSize'),
    firstPage: document.getElementById('fieldHistoryFirstPage'),
    prevPage: document.getElementById('fieldHistoryPrevPage'),
    nextPage: document.getElementById('fieldHistoryNextPage'),
    lastPage: document.getElementById('fieldHistoryLastPage'),
    pageInput: document.getElementById('fieldHistoryPageInput'),
    pageLabel: document.getElementById('fieldHistoryPageLabel'),
    tbody: document.getElementById('fieldHistoryTbody'),
    empty: document.getElementById('fieldHistoryEmpty')
  };
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = parseSalesforceDateTime(value) || new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const lang = getCurrentLang() === 'en' ? 'en-GB' : 'es-ES';
  return d.toLocaleString(lang, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function normalizeSfId(value) {
  const s = String(value || '').trim();
  return s.length >= 15 ? s.slice(0, 15) : s;
}

function fieldDisplayLabel(fieldKey) {
  return fieldHistoryDisplayLabel(fieldKey, historyContext?.trackedFields || []);
}

function appendHistoryCell(tr, text, className) {
  const td = document.createElement('td');
  if (className) td.className = className;
  const value = String(text ?? '').trim();
  if (value) {
    td.textContent = value;
    if (className) td.title = value;
  } else {
    td.textContent = '—';
  }
  tr.appendChild(td);
}

function appendFieldHistoryRow(tbody, row) {
  const tr = document.createElement('tr');
  const userName = String(row?.CreatedBy?.Name || '').trim();
  const userUsername = String(row?.CreatedBy?.Username || '').trim();
  const userId = String(row?.CreatedById || '').trim();
  appendHistoryCell(tr, formatDateTime(row?.CreatedDate));
  appendHistoryCell(tr, userName || userUsername || userId || '—');
  appendHistoryCell(tr, row?.Field ? fieldDisplayLabel(row.Field) : '—');
  appendHistoryCell(
    tr,
    formatFieldHistoryValue(row?.OldValue),
    'field-history-value-cell'
  );
  appendHistoryCell(
    tr,
    formatFieldHistoryValue(row?.NewValue),
    'field-history-value-cell'
  );
  tbody.appendChild(tr);
}

function normalizeLower(value) {
  return String(value || '').trim().toLowerCase();
}

function hideObjectSuggestions() {
  const { objectSuggestions } = getFilterElements();
  if (objectSuggestions) {
    objectSuggestions.innerHTML = '';
    objectSuggestions.classList.add('hidden');
  }
}

function renderObjectSuggestions(items, onPick) {
  const { objectSuggestions } = getFilterElements();
  if (!objectSuggestions) return;
  objectSuggestions.innerHTML = '';
  if (!items?.length) {
    objectSuggestions.classList.add('hidden');
    return;
  }
  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'field-history-suggestion-item';
    btn.textContent = item.name || item.label || '';
    btn.addEventListener('click', () => {
      onPick(item);
      hideObjectSuggestions();
    });
    objectSuggestions.appendChild(btn);
  }
  objectSuggestions.classList.remove('hidden');
}

async function runObjectSuggestions() {
  const { objectInput } = getFilterElements();
  const q = String(objectInput?.value || '').trim();
  if (!state.leftOrgId || q.length < MIN_SUGGEST_LEN) {
    hideObjectSuggestions();
    return;
  }
  try {
    const res = await bg({
      type: 'permissionsDiff:searchResource',
      orgId: state.leftOrgId,
      resourceType: 'object',
      queryText: q,
      objectApiName: ''
    });
    const items = res?.ok && Array.isArray(res.items) ? res.items : [];
    renderObjectSuggestions(items, (item) => {
      if (objectInput) objectInput.value = item.name || '';
    });
  } catch {
    hideObjectSuggestions();
  }
}

function renderTrackedFields() {
  const { trackedTbody, trackedEmpty, trackedWrap, loadBtn } = getFilterElements();
  if (!trackedTbody || !trackedEmpty) return;
  trackedTbody.innerHTML = '';
  const fields = historyContext?.trackedFields || [];
  const enabled = !!historyContext?.historyEnabled;
  if (loadBtn) loadBtn.disabled = !enabled;
  if (!fields.length) {
    trackedEmpty.classList.remove('hidden');
    trackedEmpty.textContent = enabled
      ? t('fieldHistory.trackedFieldsFallback')
      : t('fieldHistory.noTrackedFields');
    trackedWrap?.classList.add('field-history-tracked-empty-state');
    populateFieldFilterOptions([]);
    return;
  }
  trackedEmpty.classList.add('hidden');
  trackedWrap?.classList.remove('field-history-tracked-empty-state');
  for (const f of fields) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(f.apiName)}</td>
      <td>${escapeHtml(f.label)}</td>
      <td>${escapeHtml(f.type)}</td>
    `;
    trackedTbody.appendChild(tr);
  }
  populateFieldFilterOptions(fields);
}

function populateFieldFilterOptions(fields) {
  const { fieldFilter } = getFilterElements();
  if (!fieldFilter) return;
  const current = [...fieldFilter.selectedOptions].map((o) => o.value);
  fieldFilter.innerHTML = '';
  for (const f of fields) {
    const opt = document.createElement('option');
    /** La columna Field en history usa API name o etiqueta según el campo. */
    opt.value = f.apiName || f.label;
    opt.textContent = f.apiName && f.label !== f.apiName ? `${f.label} (${f.apiName})` : f.label || f.apiName;
    fieldFilter.appendChild(opt);
  }
  for (const v of current) {
    const match = [...fieldFilter.options].find((o) => o.value === v);
    if (match) match.selected = true;
  }
}

function getSelectedFieldNames() {
  const { fieldFilter } = getFilterElements();
  if (!fieldFilter) return [];
  return [...fieldFilter.selectedOptions].map((o) => o.value).filter(Boolean);
}

function captureDraftFilters() {
  const { user, text } = getFilterElements();
  return {
    user: String(user?.value || ''),
    text: String(text?.value || ''),
    fields: getSelectedFieldNames()
  };
}

function updateFilterActionState() {
  const { loadBtn, since, until, recordId } = getFilterElements();
  if (!loadBtn || !historyContext?.historyEnabled) return;
  const sinceIso = toUtcIsoFromLocalDateTime(since?.value);
  const untilIso = toUtcIsoFromLocalDateTime(until?.value);
  loadBtn.disabled = !isValidSalesforceRecordId(recordId?.value)
    || !sinceIso
    || (!dateRangePicker?.until?.isNowMode && !isValidUtcRange(sinceIso, untilIso));
}

function applyClientFilters(rows) {
  const userValue = String(appliedFilters.user || '').trim();
  const textNeedle = normalizeLower(appliedFilters.text);
  return (rows || []).filter((r) => {
    const userId = String(r?.CreatedById || '').trim();
    const userKey = userId || String(r?.CreatedBy?.Username || '').trim() || String(r?.CreatedBy?.Name || '').trim();
    if (userValue) {
      const selectedNorm = normalizeSfId(userValue);
      const rowNorm = normalizeSfId(userKey);
      const exactMatch = userKey === userValue;
      const idMatch = selectedNorm && rowNorm && selectedNorm === rowNorm;
      if (!exactMatch && !idMatch) return false;
    }
    if (textNeedle) {
      const oldV = normalizeLower(r?.OldValue);
      const newV = normalizeLower(r?.NewValue);
      const fieldV = normalizeLower(r?.Field);
      if (!oldV.includes(textNeedle) && !newV.includes(textNeedle) && !fieldV.includes(textNeedle)) {
        return false;
      }
    }
    return true;
  });
}

function populateUserOptions(rows) {
  const { user } = getFilterElements();
  if (!user) return;
  const current = String(user.value || '');
  const seen = new Set();
  const users = [];
  for (const row of rows || []) {
    const id = String(row?.CreatedById || '').trim();
    const username = String(row?.CreatedBy?.Username || '').trim();
    const name = String(row?.CreatedBy?.Name || '').trim();
    const key = id || username || name;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    users.push({ key, label: name || username || key, username });
  }
  users.sort((a, b) => a.label.localeCompare(b.label));
  user.innerHTML = '';
  const all = document.createElement('option');
  all.value = '';
  all.textContent = t('fieldHistory.userAll');
  user.appendChild(all);
  for (const entry of users) {
    const opt = document.createElement('option');
    opt.value = entry.key;
    opt.textContent = entry.username && entry.label !== entry.username ? `${entry.label} — ${entry.username}` : entry.label;
    opt.title = entry.key;
    user.appendChild(opt);
  }
  if ([...user.options].some((o) => o.value === current)) user.value = current;
  else user.value = '';
}

function updatePaginationUi(totalFilteredRows) {
  const { firstPage, prevPage, nextPage, lastPage, pageInput, pageLabel } = getFilterElements();
  pagination.setPage(currentPage, totalFilteredRows);
  currentPage = pagination.page;
  const totalPages = pagination.totalPages;
  if (prevPage) prevPage.disabled = currentPage <= 1;
  if (nextPage) nextPage.disabled = currentPage >= totalPages;
  if (firstPage) firstPage.disabled = currentPage <= 1;
  if (lastPage) lastPage.disabled = currentPage >= totalPages;
  if (pageInput) {
    pageInput.disabled = totalFilteredRows === 0;
    pageInput.max = String(totalPages);
    pageInput.value = String(currentPage);
  }
  if (pageLabel) {
    pageLabel.classList.toggle('hidden', totalFilteredRows === 0);
    const from = totalFilteredRows ? (currentPage - 1) * pagination.pageSize + 1 : 0;
    const to = Math.min(currentPage * pagination.pageSize, totalFilteredRows);
    pageLabel.textContent = t('pagination.showing', { from: String(from), to: String(to), total: String(totalFilteredRows) });
  }
}

function renderRows(opts = {}) {
  const { tbody, empty } = getFilterElements();
  if (!tbody || !empty) return;
  if (!opts.force && historyLoading) return;
  const rows = applyClientFilters(lastRows);
  const pageRows = pagination.getSlice(rows).rows;
  currentPage = pagination.page;
  tbody.replaceChildren();
  if (!pageRows.length) {
    empty.classList.remove('hidden');
    const tr = document.createElement('tr');
    tr.className = 'sfoc-table-empty-row';
    tr.innerHTML = `<td colspan="5">${escapeHtml(t('fieldHistory.empty'))}</td>`;
    tbody.appendChild(tr);
    updatePaginationUi(rows.length);
    return;
  }
  empty.classList.add('hidden');
  for (const row of pageRows) {
    try {
      appendFieldHistoryRow(tbody, row);
    } catch (e) {
      console.error('[fieldHistory] row render failed', e, row);
    }
  }
  if (!tbody.children.length) {
    empty.classList.remove('hidden');
  }
  updatePaginationUi(rows.length);
}

function setClockNotice(clock) {
  const { clockNotice } = getFilterElements();
  if (clockNotice) clockNotice.classList.add('hidden');
}

async function ensureDefaultDateRange(opts = {}) {
  const { since, until } = getFilterElements();
  if (!since || !until) return;
  if (!since.value || !until.value) {
    const clock = state.leftOrgId
      ? await getSalesforceNow(state.leftOrgId, { refresh: opts.refresh === true }).catch(() => null)
      : null;
    setClockNotice(clock);
    const now = new Date(clock?.nowMs || Date.now());
    const days = getFieldHistoryDefaultRangeDays();
    const prev = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    if (!since.value) {
      const value = toLocalDateTimeValue(prev);
      if (dateRangePicker?.since) dateRangePicker.since.setValue(value);
      else since.value = value;
    }
    if (!until.value) {
      if (dateRangePicker?.until) dateRangePicker.until.setNowMode(true);
      else until.value = toLocalDateTimeValue(now);
    }
  }
}

async function logFieldHistoryQuery(meta) {
  try {
    await bg({
      type: 'usage:log',
      entry: {
        kind: 'codeComparison',
        action: 'fieldHistoryQuery',
        artifactType: 'FieldHistory',
        descriptor: {
          objectApiName: meta.objectApiName || '',
          rowCount: meta.rowCount ?? 0,
          section: meta.hasFieldFilter ? 'filtered' : 'all'
        },
        leftOrgId: state.leftOrgId,
        rightOrgId: null,
        comparisonUrl: typeof window !== 'undefined' ? window.location.href : '',
        leftFilesCount: 0,
        rightFilesCount: 0
      }
    });
  } catch {
    /* telemetry optional */
  }
}

async function loadObjectContext() {
  const { status, objectInput, loadBtn } = getFilterElements();
  if (!state.leftOrgId) {
    if (status) status.textContent = t('fieldHistory.selectOrg');
    return;
  }
  const objectName = String(objectInput?.value || '').trim();
  if (!objectName) {
    if (status) status.textContent = t('fieldHistory.objectRequired');
    return;
  }
  if (status) status.textContent = t('fieldHistory.loadingObject');
  if (loadBtn) loadBtn.disabled = true;
  showToastWithSpinner(t('fieldHistory.loadingObject'));
  try {
    const res = await bg({
      type: 'fieldHistory:context',
      orgId: state.leftOrgId,
      objectApiName: objectName
    });
    if (!res?.ok) {
      const msg = res?.reason === 'NO_SID' ? t('toast.noSession') : res?.error || t('fieldHistory.contextError');
      void handleToolResponseFailure(res, { artifact_type: 'FieldHistory', phase: 'context' });
      if (status) status.textContent = msg;
      showToast(msg, 'error');
      historyContext = null;
      renderTrackedFields();
      return;
    }
    historyContext = {
      objectApiName: res.objectApiName,
      historyObject: res.historyObject,
      parentField: res.parentField,
      trackedFields: Array.isArray(res.trackedFields) ? res.trackedFields : [],
      historyEnabled: !!res.historyEnabled,
      historyQueryable: !!res.historyQueryable
    };
    if (objectInput) objectInput.value = res.objectApiName;
    lastRows = [];
    currentPage = 1;
    renderRows();
    renderTrackedFields();
    updateFilterActionState();
    if (!res.historyEnabled) {
      if (status) status.textContent = t('fieldHistory.objectHistoryDisabled');
      showToast(t('fieldHistory.objectHistoryDisabled'), 'warn');
    } else if (!res.trackedFields?.length) {
      if (status) status.textContent = t('fieldHistory.trackedFieldsFallback');
      showToast(t('fieldHistory.historyEnabledNoFieldList'), 'success');
    } else {
      if (status) status.textContent = t('fieldHistory.contextReady', { count: String(res.trackedFields.length) });
      showToast(t('fieldHistory.contextReady', { count: String(res.trackedFields.length) }), 'success');
    }
  } finally {
    const { loadBtn: lb } = getFilterElements();
    if (lb) lb.disabled = !historyContext?.historyEnabled;
    dismissSpinnerToast();
  }
}

async function resolveQueryRange() {
  const { since, until } = getFilterElements();
  const sinceIso = toUtcIsoFromLocalDateTime(since?.value);
  if (!sinceIso) return { ok: false };
  if (dateRangePicker?.until?.isNowMode || until?.dataset.salesforceNow === 'true') {
    const clock = await getSalesforceNow(state.leftOrgId, { refresh: true }).catch(() => null);
    setClockNotice(clock);
    return {
      ok: true,
      sinceIso,
      untilIso: clock?.serverAvailable ? new Date(clock.nowMs).toISOString() : ''
    };
  }
  const untilIso = toUtcIsoFromLocalDateTime(until?.value);
  return { ok: isValidUtcRange(sinceIso, untilIso), sinceIso, untilIso };
}

async function loadFieldHistory() {
  const { status, recordId, loadBtn } = getFilterElements();
  if (!state.leftOrgId) {
    if (status) status.textContent = t('fieldHistory.selectOrg');
    return;
  }
  if (!historyContext?.historyEnabled) {
    if (status) status.textContent = t('fieldHistory.loadObjectFirst');
    return;
  }
  const rid = String(recordId?.value || '').trim();
  if (!isValidSalesforceRecordId(rid)) {
    if (status) status.textContent = t('fieldHistory.invalidRecordId');
    return;
  }
  const range = await resolveQueryRange();
  if (!range.ok) {
    if (status) status.textContent = t('fieldHistory.invalidRange');
    return;
  }
  if (status) status.textContent = t('fieldHistory.loading');
  if (loadBtn) loadBtn.disabled = true;
  historyLoading = true;
  showToastWithSpinner(t('fieldHistory.loading'));
  appliedFilters = captureDraftFilters();
  const fieldNames = appliedFilters.fields;
  const expandedFieldNames = fieldNames.length
    ? expandTrackedFieldsForHistorySoql(fieldNames, historyContext.trackedFields)
    : undefined;
  try {
    const res = await bg({
      type: 'fieldHistory:list',
      orgId: state.leftOrgId,
      objectApiName: historyContext.objectApiName,
      historyObject: historyContext.historyObject,
      parentField: historyContext.parentField,
      recordId: rid,
      sinceIso: range.sinceIso,
      untilIso: range.untilIso,
      fieldNames: expandedFieldNames?.length ? expandedFieldNames : undefined
    });
    if (!res?.ok) {
      const msg = res?.reason === 'NO_SID' ? t('toast.noSession') : res?.error || t('fieldHistory.loadError');
      void handleToolResponseFailure(res, { artifact_type: 'FieldHistory', phase: 'list' });
      if (status) status.textContent = msg;
      showToast(msg, 'error');
      return;
    }
    lastRows = Array.isArray(res.rows) ? res.rows : [];
    currentPage = 1;
    filterEventsPaused = true;
    try {
      const { user } = getFilterElements();
      if (user) user.value = '';
      populateUserOptions(lastRows);
      if (status) status.textContent = '';
      renderRows({ force: true });
    } finally {
      filterEventsPaused = false;
    }
    showToast(t('fieldHistory.loaded'), 'success');
    void logFieldHistoryQuery({
      objectApiName: historyContext.objectApiName,
      rowCount: lastRows.length,
      hasFieldFilter: fieldNames.length > 0
    });
  } finally {
    historyLoading = false;
    if (loadBtn) loadBtn.disabled = !historyContext?.historyEnabled;
    dismissSpinnerToast();
  }
}

export async function refreshFieldHistoryPanel() {
  const { status } = getFilterElements();
  await ensureDefaultDateRange();
  if (!state.leftOrgId) {
    if (status) status.textContent = t('fieldHistory.selectOrg');
    return;
  }
  if (getSelectedArtifactType() !== 'FieldHistory') return;
  if (status && !historyContext) status.textContent = '';
}

export function setupFieldHistoryPanel() {
  const {
    objectInput,
    loadObjectBtn,
    loadBtn,
    user,
    text,
    fieldFilter,
    pageSize,
    prevPage,
    nextPage,
    firstPage,
    lastPage,
    pageInput,
    since,
    until,
    recordId,
    resetFilters
  } = getFilterElements();

  let suggestTimer = null;
  objectInput?.addEventListener('input', () => {
    historyContext = null;
    renderTrackedFields();
    clearTimeout(suggestTimer);
    suggestTimer = setTimeout(() => void runObjectSuggestions(), 200);
  });
  objectInput?.addEventListener('blur', () => {
    setTimeout(hideObjectSuggestions, 150);
  });
  loadObjectBtn?.addEventListener('click', () => void loadObjectContext());
  objectInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void loadObjectContext();
    }
  });

  loadBtn?.addEventListener('click', () => void loadFieldHistory());

  if (user)
    user.addEventListener('change', () => {
      if (filterEventsPaused) return;
      updateFilterActionState();
    });
  if (text)
    text.addEventListener('input', () => {
      if (filterEventsPaused) return;
      updateFilterActionState();
    });
  if (fieldFilter)
    fieldFilter.addEventListener('change', () => {
      updateFilterActionState();
    });
  recordId?.addEventListener('input', updateFilterActionState);
  dateRangePicker = createDateTimeRangePicker({
    sinceInput: since,
    untilInput: until,
    sinceLabel: t('fieldHistory.filterSince'),
    untilLabel: t('fieldHistory.filterUntil'),
    onDraftChange: updateFilterActionState
  });
  for (const field of [recordId, user, text, fieldFilter, since, until]) {
    field?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (!loadBtn?.disabled) void loadFieldHistory();
      }
    });
  }
  resetFilters?.addEventListener('click', () => {
    if (user) user.value = '';
    if (text) text.value = '';
    if (fieldFilter) [...fieldFilter.options].forEach((option) => { option.selected = false; });
    appliedFilters = captureDraftFilters();
    currentPage = 1;
    renderRows();
    updateFilterActionState();
  });
  if (pageSize)
    pageSize.addEventListener('change', () => {
      pagination.setPageSize(pageSize.value, applyClientFilters(lastRows).length);
      currentPage = pagination.page;
      renderRows();
    });
  if (prevPage)
    prevPage.addEventListener('click', () => {
      currentPage = pagination.previous(applyClientFilters(lastRows).length);
      renderRows();
    });
  if (nextPage)
    nextPage.addEventListener('click', () => {
      currentPage = pagination.next(applyClientFilters(lastRows).length);
      renderRows();
    });
  firstPage?.addEventListener('click', () => {
    currentPage = pagination.first(applyClientFilters(lastRows).length);
    renderRows();
  });
  lastPage?.addEventListener('click', () => {
    currentPage = pagination.last(applyClientFilters(lastRows).length);
    renderRows();
  });
  pageInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    currentPage = pagination.setPage(pageInput.value, applyClientFilters(lastRows).length);
    renderRows();
  });

  void ensureDefaultDateRange().then(updateFilterActionState);
  renderTrackedFields();
}
