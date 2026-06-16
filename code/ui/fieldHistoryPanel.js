import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t, getCurrentLang } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { isValidSalesforceRecordId } from '../../shared/fieldHistoryApi.js';
import { handleToolResponseFailure } from '../../shared/reportToolError.js';

const MIN_SUGGEST_LEN = 2;

/** @type {Array<Record<string, unknown>>} */
let lastRows = [];
let currentPage = 1;

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
    pageSize: document.getElementById('fieldHistoryPageSize'),
    prevPage: document.getElementById('fieldHistoryPrevPage'),
    nextPage: document.getElementById('fieldHistoryNextPage'),
    pageLabel: document.getElementById('fieldHistoryPageLabel'),
    tbody: document.getElementById('fieldHistoryTbody'),
    empty: document.getElementById('fieldHistoryEmpty')
  };
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
    /** En history rows, Field suele ser la etiqueta (p. ej. "Account Name"), no el API name. */
    opt.value = f.label || f.apiName;
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

function applyClientFilters(rows) {
  const { user, text } = getFilterElements();
  const userValue = String(user?.value || '').trim();
  const textNeedle = normalizeLower(text?.value);
  return (rows || []).filter((r) => {
    const userId = String(r?.CreatedById || '').trim();
    const userKey = userId || String(r?.CreatedBy?.Username || '').trim() || String(r?.CreatedBy?.Name || '').trim();
    if (userValue && userKey !== userValue) return false;
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
    users.push({ key, label: name || username || key });
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
    opt.textContent = entry.label;
    user.appendChild(opt);
  }
  if ([...user.options].some((o) => o.value === current)) user.value = current;
}

function updatePaginationUi(totalFilteredRows) {
  const { pageSize, prevPage, nextPage, pageLabel } = getFilterElements();
  const perPage = Math.max(1, Number(pageSize?.value || 25));
  const totalPages = Math.max(1, Math.ceil(totalFilteredRows / perPage));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  if (prevPage) prevPage.disabled = currentPage <= 1;
  if (nextPage) nextPage.disabled = currentPage >= totalPages;
  if (pageLabel) {
    pageLabel.textContent = t('fieldHistory.pageLabel', {
      page: String(currentPage),
      pages: String(totalPages),
      total: String(totalFilteredRows)
    });
  }
}

function renderRows() {
  const { tbody, empty, pageSize } = getFilterElements();
  if (!tbody || !empty) return;
  const rows = applyClientFilters(lastRows);
  const perPage = Math.max(1, Number(pageSize?.value || 25));
  updatePaginationUi(rows.length);
  const start = (currentPage - 1) * perPage;
  const pageRows = rows.slice(start, start + perPage);
  tbody.innerHTML = '';
  if (!pageRows.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  for (const row of pageRows) {
    const tr = document.createElement('tr');
    const userName = String(row?.CreatedBy?.Name || '').trim();
    const userUsername = String(row?.CreatedBy?.Username || '').trim();
    const userId = String(row?.CreatedById || '').trim();
    const userCell = escapeHtml(userName || userUsername || userId || '—');
    const fieldText = row?.Field ? escapeHtml(String(row.Field)) : '—';
    const oldText = row?.OldValue != null && row.OldValue !== '' ? escapeHtml(String(row.OldValue)) : '—';
    const newText = row?.NewValue != null && row.NewValue !== '' ? escapeHtml(String(row.NewValue)) : '—';
    tr.innerHTML = `
      <td>${formatDateTime(row?.CreatedDate)}</td>
      <td>${userCell}</td>
      <td>${fieldText}</td>
      <td class="field-history-value-cell" title="${oldText}">${oldText}</td>
      <td class="field-history-value-cell" title="${newText}">${newText}</td>
    `;
    tbody.appendChild(tr);
  }
}

function ensureDefaultDateRange() {
  const { since, until } = getFilterElements();
  if (!since || !until) return;
  if (!since.value || !until.value) {
    const now = new Date();
    const prev = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const toInputValue = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    if (!since.value) since.value = toInputValue(prev);
    if (!until.value) until.value = toInputValue(now);
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

async function loadFieldHistory() {
  const { status, recordId, since, until, loadBtn } = getFilterElements();
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
  const sinceIso = since?.value ? new Date(since.value).toISOString() : '';
  const untilIso = until?.value ? new Date(until.value).toISOString() : '';
  if (!sinceIso || !untilIso || new Date(sinceIso).getTime() > new Date(untilIso).getTime()) {
    if (status) status.textContent = t('fieldHistory.invalidRange');
    return;
  }
  if (status) status.textContent = t('fieldHistory.loading');
  if (loadBtn) loadBtn.disabled = true;
  showToastWithSpinner(t('fieldHistory.loading'));
  const fieldNames = getSelectedFieldNames();
  try {
    const res = await bg({
      type: 'fieldHistory:list',
      orgId: state.leftOrgId,
      objectApiName: historyContext.objectApiName,
      historyObject: historyContext.historyObject,
      parentField: historyContext.parentField,
      recordId: rid,
      sinceIso,
      untilIso,
      fieldNames: fieldNames.length ? fieldNames : undefined
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
    populateUserOptions(lastRows);
    if (status) status.textContent = '';
    renderRows();
    showToast(t('fieldHistory.loaded'), 'success');
    void logFieldHistoryQuery({
      objectApiName: historyContext.objectApiName,
      rowCount: lastRows.length,
      hasFieldFilter: fieldNames.length > 0
    });
  } finally {
    if (loadBtn) loadBtn.disabled = !historyContext?.historyEnabled;
    dismissSpinnerToast();
  }
}

export async function refreshFieldHistoryPanel() {
  const { status } = getFilterElements();
  ensureDefaultDateRange();
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
    nextPage
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
      currentPage = 1;
      renderRows();
    });
  if (text)
    text.addEventListener('input', () => {
      currentPage = 1;
      renderRows();
    });
  if (fieldFilter)
    fieldFilter.addEventListener('change', () => {
      /* server filter on next load only */
    });
  if (pageSize)
    pageSize.addEventListener('change', () => {
      currentPage = 1;
      renderRows();
    });
  if (prevPage)
    prevPage.addEventListener('click', () => {
      currentPage = Math.max(1, currentPage - 1);
      renderRows();
    });
  if (nextPage)
    nextPage.addEventListener('click', () => {
      currentPage += 1;
      renderRows();
    });

  ensureDefaultDateRange();
  renderTrackedFields();
}
