import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t, getCurrentLang } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { handleToolResponseFailure } from '../../shared/reportToolError.js';
import { getSetupAuditDefaultRangeHours } from '../../shared/extensionSettings.js';
import { createDateTimeRangePicker } from './dateTimeRangePicker.js';
import { createTablePagination } from './tablePagination.js';
import { getSalesforceNow } from './salesforceServerClock.js';
import {
  isValidUtcRange,
  toLocalDateTimeValue,
  toUtcIsoFromLocalDateTime
} from '../../shared/salesforceTime.js';

let lastRows = [];
let currentPage = 1;
let lastLoadSignature = '';
let dateRangePicker = null;
let appliedFilters = { user: '', section: '', action: '', text: '' };
let appliedDraftSignature = '';
const pagination = createTablePagination({ initialPageSize: 25 });

function getFilterElements() {
  return {
    status: document.getElementById('setupAuditStatus'),
    clockNotice: document.getElementById('setupAuditClockNotice'),
    user: document.getElementById('setupAuditUserFilter'),
    section: document.getElementById('setupAuditSectionFilter'),
    action: document.getElementById('setupAuditActionFilter'),
    text: document.getElementById('setupAuditTextFilter'),
    applyFilters: document.getElementById('setupAuditApplyFiltersBtn'),
    resetFilters: document.getElementById('setupAuditResetFiltersBtn'),
    since: document.getElementById('setupAuditSince'),
    until: document.getElementById('setupAuditUntil'),
    pageSize: document.getElementById('setupAuditPageSize'),
    firstPage: document.getElementById('setupAuditFirstPage'),
    prevPage: document.getElementById('setupAuditPrevPage'),
    nextPage: document.getElementById('setupAuditNextPage'),
    lastPage: document.getElementById('setupAuditLastPage'),
    pageInput: document.getElementById('setupAuditPageInput'),
    pageLabel: document.getElementById('setupAuditPageLabel'),
    tbody: document.getElementById('setupAuditTbody'),
    empty: document.getElementById('setupAuditEmpty')
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

function applyClientFilters(rows) {
  const userValue = String(appliedFilters.user || '').trim();
  const sectionNeedle = normalizeLower(appliedFilters.section);
  const actionNeedle = normalizeLower(appliedFilters.action);
  const textNeedle = normalizeLower(appliedFilters.text);
  return (rows || []).filter((r) => {
    const userId = String(r?.CreatedById || '').trim();
    const userKey = userId || String(r?.CreatedBy?.Username || '').trim() || String(r?.CreatedBy?.Name || '').trim();
    const rowSection = normalizeLower(r?.Section);
    const rowAction = normalizeLower(r?.Action);
    const rowDisplay = normalizeLower(r?.Display);
    if (userValue && userKey !== userValue) return false;
    if (sectionNeedle && rowSection !== sectionNeedle) return false;
    if (actionNeedle && rowAction !== actionNeedle) return false;
    if (textNeedle && !rowAction.includes(textNeedle) && !rowDisplay.includes(textNeedle)) return false;
    return true;
  });
}

function captureDraftFilters() {
  const { user, section, action, text } = getFilterElements();
  return {
    user: String(user?.value || ''),
    section: String(section?.value || ''),
    action: String(action?.value || ''),
    text: String(text?.value || '')
  };
}

function captureDraftSignature() {
  const { since, until } = getFilterElements();
  return JSON.stringify({
    ...captureDraftFilters(),
    since: String(since?.value || ''),
    until: dateRangePicker?.until?.isNowMode ? 'salesforce-now' : String(until?.value || '')
  });
}

function updateFilterActionState() {
  const { applyFilters, since, until } = getFilterElements();
  if (!applyFilters) return;
  const datesValid = Boolean(toUtcIsoFromLocalDateTime(since?.value))
    && (dateRangePicker?.until?.isNowMode || isValidUtcRange(
      toUtcIsoFromLocalDateTime(since?.value),
      toUtcIsoFromLocalDateTime(until?.value)
    ));
  applyFilters.disabled = !datesValid || captureDraftSignature() === appliedDraftSignature;
}

async function applyDraftFilters() {
  appliedFilters = captureDraftFilters();
  appliedDraftSignature = captureDraftSignature();
  currentPage = 1;
  lastLoadSignature = '';
  updateFilterActionState();
  await refreshSetupAuditTrailPanel();
}

function resetDraftFilters() {
  const { user, section, action, text } = getFilterElements();
  if (user) user.value = '';
  if (section) section.value = '';
  if (action) action.value = '';
  if (text) text.value = '';
  populateActionOptions(lastRows);
  appliedFilters = captureDraftFilters();
  appliedDraftSignature = captureDraftSignature();
  currentPage = 1;
  updateFilterActionState();
  renderRows();
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
    const label = name || username || key;
    users.push({ key, label, username });
  }
  users.sort((a, b) => a.label.localeCompare(b.label));
  user.innerHTML = '';
  const all = document.createElement('option');
  all.value = '';
  all.textContent = t('setupAudit.userAll');
  user.appendChild(all);
  for (const entry of users) {
    const opt = document.createElement('option');
    opt.value = entry.key;
    opt.textContent = entry.username && entry.label !== entry.username ? `${entry.label} — ${entry.username}` : entry.label;
    opt.title = entry.key;
    user.appendChild(opt);
  }
  if ([...user.options].some((o) => o.value === current)) user.value = current;
}

function populateSectionOptions(rows) {
  const { section } = getFilterElements();
  if (!section) return;
  const current = String(section.value || '');
  const values = [...new Set((rows || []).map((r) => String(r?.Section || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  section.innerHTML = '';
  const all = document.createElement('option');
  all.value = '';
  all.textContent = t('setupAudit.sectionAll');
  section.appendChild(all);
  for (const value of values) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    section.appendChild(opt);
  }
  if ([...section.options].some((o) => o.value === current)) section.value = current;
}

function populateActionOptions(rows) {
  const { section, action } = getFilterElements();
  if (!action) return;
  const current = String(action.value || '');
  const selectedSection = normalizeLower(section?.value);
  action.innerHTML = '';
  if (!selectedSection) {
    const prompt = document.createElement('option');
    prompt.value = '';
    prompt.textContent = t('setupAudit.actionSelectSectionFirst');
    action.appendChild(prompt);
    action.disabled = true;
    return;
  }
  const values = [
    ...new Set(
      (rows || [])
        .filter((r) => normalizeLower(r?.Section) === selectedSection)
        .map((r) => String(r?.Action || '').trim())
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b));
  const all = document.createElement('option');
  all.value = '';
  all.textContent = t('setupAudit.actionAll');
  action.appendChild(all);
  for (const value of values) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    action.appendChild(opt);
  }
  action.disabled = false;
  if ([...action.options].some((o) => o.value === current)) action.value = current;
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

function renderRows() {
  const { tbody, empty } = getFilterElements();
  if (!tbody || !empty) return;
  const rows = applyClientFilters(lastRows);
  updatePaginationUi(rows.length);
  const pageRows = pagination.getSlice(rows).rows;
  currentPage = pagination.page;
  tbody.innerHTML = '';
  if (!pageRows.length) {
    empty.classList.remove('hidden');
    const tr = document.createElement('tr');
    tr.className = 'sfoc-table-empty-row';
    tr.innerHTML = `<td colspan="5">${escapeHtml(t('setupAudit.empty'))}</td>`;
    tbody.appendChild(tr);
    return;
  }
  empty.classList.add('hidden');
  for (const row of pageRows) {
    const tr = document.createElement('tr');
    const userName = String(row?.CreatedBy?.Name || '').trim();
    const userUsername = String(row?.CreatedBy?.Username || '').trim();
    const userId = String(row?.CreatedById || '').trim();
    const userCell = escapeHtml(userName || userUsername || userId || '—');
    const sectionText = row?.Section ? escapeHtml(String(row.Section)) : '—';
    const actionText = row?.Action ? escapeHtml(String(row.Action)) : '—';
    const displayText = row?.Display ? escapeHtml(String(row.Display)) : '—';
    tr.innerHTML = `
      <td>${formatDateTime(row?.CreatedDate)}</td>
      <td>${userCell}</td>
      <td>${sectionText}</td>
      <td>${actionText}</td>
      <td class="setup-audit-display-cell" title="${displayText}">${displayText}</td>
    `;
    tbody.appendChild(tr);
  }
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
    const hours = getSetupAuditDefaultRangeHours();
    const prev = new Date(now.getTime() - hours * 60 * 60 * 1000);
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

async function resolveQueryRange() {
  const { since, until } = getFilterElements();
  const sinceIso = toUtcIsoFromLocalDateTime(since?.value);
  if (!sinceIso) return { ok: false };
  if (dateRangePicker?.until?.isNowMode) {
    const clock = await getSalesforceNow(state.leftOrgId, { refresh: true }).catch(() => null);
    setClockNotice(clock);
    return { ok: true, sinceIso, untilIso: clock?.serverAvailable ? new Date(clock.nowMs).toISOString() : '' };
  }
  const untilIso = toUtcIsoFromLocalDateTime(until?.value);
  return { ok: isValidUtcRange(sinceIso, untilIso), sinceIso, untilIso };
}

async function loadAuditTrail() {
  const { status } = getFilterElements();
  if (!state.leftOrgId) {
    if (status) status.textContent = t('setupAudit.selectOrg');
    return;
  }
  const range = await resolveQueryRange();
  if (!range.ok) {
    if (status) status.textContent = t('setupAudit.invalidRange');
    return;
  }
  if (status) status.textContent = t('setupAudit.loading');
  showToastWithSpinner(t('setupAudit.loading'));
  try {
    const res = await bg({
      type: 'setupAuditTrail:list',
      orgId: state.leftOrgId,
      sinceIso: range.sinceIso,
      untilIso: range.untilIso
    });
    if (!res?.ok) {
      const msg = res?.reason === 'NO_SID' ? t('toast.noSession') : res?.error || t('setupAudit.loadError');
      void handleToolResponseFailure(res, { artifact_type: 'SetupAuditTrail', phase: 'list' });
      if (status) status.textContent = msg;
      showToast(msg, 'error');
      return;
    }
    lastRows = Array.isArray(res.rows) ? res.rows : [];
    currentPage = 1;
    populateUserOptions(lastRows);
    populateSectionOptions(lastRows);
    populateActionOptions(lastRows);
    if (status) status.textContent = '';
    renderRows();
  } finally {
    dismissSpinnerToast();
  }
}

export async function refreshSetupAuditTrailPanel() {
  const { status, since, until } = getFilterElements();
  await ensureDefaultDateRange();
  if (!state.leftOrgId) {
    if (status) status.textContent = t('setupAudit.selectOrg');
    return;
  }
  if (status) status.textContent = '';
  if (getSelectedArtifactType() !== 'SetupAuditTrail') return;
  const sig = `${state.leftOrgId}|${since?.value || ''}|${until?.value || ''}`;
  if (sig !== lastLoadSignature) {
    lastLoadSignature = sig;
    await loadAuditTrail();
  } else {
    renderRows();
  }
}

export function setupSetupAuditTrailPanel() {
  const { user, section, action, text, since, until, pageSize, firstPage, prevPage, nextPage, lastPage, pageInput, applyFilters, resetFilters } = getFilterElements();
  const onDraftChange = () => updateFilterActionState();
  if (user)
    user.addEventListener('change', onDraftChange);
  if (section)
    section.addEventListener('change', () => {
      if (action) action.value = '';
      populateActionOptions(lastRows);
      onDraftChange();
    });
  if (action)
    action.addEventListener('change', onDraftChange);
  if (text)
    text.addEventListener('input', onDraftChange);
  dateRangePicker = createDateTimeRangePicker({
    sinceInput: since,
    untilInput: until,
    sinceLabel: t('setupAudit.filterSince'),
    untilLabel: t('setupAudit.filterUntil'),
    onDraftChange
  });
  for (const field of [user, section, action, text, since, until]) {
    field?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (!applyFilters?.disabled) void applyDraftFilters();
      }
    });
  }
  applyFilters?.addEventListener('click', () => void applyDraftFilters());
  resetFilters?.addEventListener('click', resetDraftFilters);
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
  void ensureDefaultDateRange().then(() => {
    if (!appliedDraftSignature) appliedDraftSignature = captureDraftSignature();
    updateFilterActionState();
  });
}
