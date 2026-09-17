import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { openApexLogViewerWithPayload } from '../lib/openApexLogViewer.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { escapeHtml } from '../../shared/htmlEscape.js';
import { handleToolResponseFailure } from '../../shared/reportToolError.js';
import { getDebugLogsDefaultRangeHours } from '../../shared/extensionSettings.js';
import { confirmSfocOrgAction } from './sfocModal.js';
import { createDateTimeRangePicker } from './dateTimeRangePicker.js';
import { createTablePagination } from './tablePagination.js';
import { getSalesforceNow } from './salesforceServerClock.js';
import {
  formatDateTimeForDisplay,
  isValidUtcRange,
  toLocalDateTimeValue,
  toUtcIsoFromLocalDateTime
} from '../../shared/salesforceTime.js';

const CONTEXT_PLACEHOLDER = '—';

let lastRows = [];
let currentPage = 1;
let lastLoadSignature = '';
let enrichSeq = 0;
let enrichInFlight = false;
/** Ids de logs cuyo body ya se pidió para Type/Name/Method (por página visitada). */
const bodyEnrichedIds = new Set();
/** Ids en vuelo en la petición de enriquecimiento actual. */
const enrichingIds = new Set();
let isLoading = false;
let dateRangePicker = null;
let appliedFilters = { user: '', operation: '', status: '', text: '' };
let appliedDraftSignature = '';
const pagination = createTablePagination({ initialPageSize: 25 });
let sortState = { key: 'StartTime', direction: 'desc' };
let tableState = 'initial';

function rowExecutionFields(row) {
  if (!row?.contextFromBody) {
    return {
      Type: CONTEXT_PLACEHOLDER,
      Name: CONTEXT_PLACEHOLDER,
      Method: CONTEXT_PLACEHOLDER
    };
  }
  return {
    Type: String(row.Type || 'N/A'),
    Name: String(row.Name || 'N/A'),
    Method: String(row.Method || 'N/A')
  };
}

function normalizeLogRow(row) {
  const base = row && typeof row === 'object' ? { ...row } : {};
  return {
    ...base,
    contextFromBody: !!base.contextFromBody
  };
}

function normalizeSfId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

async function resolveUserNamesForLogs(rows) {
  const ids = [
    ...new Set(
      (rows || [])
        .map((r) => String(r?.LogUserId || '').replace(/[^a-zA-Z0-9]/g, ''))
        .filter(Boolean)
    )
  ];
  if (!ids.length || !state.leftOrgId) return rows || [];
  const res = await bg({
    type: 'debugLogs:resolveUsers',
    orgId: state.leftOrgId,
    userIds: ids
  });
  if (!res?.ok || !res?.namesById || typeof res.namesById !== 'object') return rows || [];
  const byId = new Map(Object.entries(res.namesById).map(([k, v]) => [normalizeSfId(k), String(v || '').trim()]));
  return (rows || []).map((r) => {
    const normalizedId = normalizeSfId(r?.LogUserId);
    const resolvedName = byId.get(normalizedId) || '';
    return {
      ...r,
      ...(resolvedName ? { UserName: resolvedName } : {})
    };
  });
}

function getOrgInstanceUrl(orgId) {
  const org = (state.orgsList || []).find((o) => String(o.id) === String(orgId));
  return org?.instanceUrl || '';
}

function sanitizeApexViewerDownloadFileName(name) {
  const s = String(name || '')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return s || 'file';
}

function getFilterElements() {
  return {
    panelInner: document.querySelector('.debug-log-browser-panel-inner'),
    status: document.getElementById('debugLogBrowserStatus'),
    clockNotice: document.getElementById('debugLogBrowserClockNotice'),
    loading: document.getElementById('debugLogBrowserLoading'),
    refreshBtn: document.getElementById('debugLogBrowserRefreshBtn'),
    deleteAllBtn: document.getElementById('debugLogBrowserDeleteAllBtn'),
    user: document.getElementById('debugLogBrowserUserFilter'),
    operation: document.getElementById('debugLogBrowserOperationFilter'),
    rowStatus: document.getElementById('debugLogBrowserStatusFilter'),
    text: document.getElementById('debugLogBrowserTextFilter'),
    applyFilters: document.getElementById('debugLogBrowserApplyFiltersBtn'),
    resetFilters: document.getElementById('debugLogBrowserResetFiltersBtn'),
    since: document.getElementById('debugLogBrowserSince'),
    until: document.getElementById('debugLogBrowserUntil'),
    pageSize: document.getElementById('debugLogBrowserPageSize'),
    firstPage: document.getElementById('debugLogBrowserFirstPage'),
    prevPage: document.getElementById('debugLogBrowserPrevPage'),
    nextPage: document.getElementById('debugLogBrowserNextPage'),
    lastPage: document.getElementById('debugLogBrowserLastPage'),
    pageInput: document.getElementById('debugLogBrowserPageInput'),
    pageLabel: document.getElementById('debugLogBrowserPageLabel'),
    tbody: document.getElementById('debugLogBrowserTbody'),
    empty: document.getElementById('debugLogBrowserEmpty'),
    contextLoading: document.getElementById('debugLogBrowserContextLoading')
  };
}

function renderLoadingSkeleton() {
  const { tbody } = getFilterElements();
  if (!tbody) return;
  tbody.innerHTML = Array.from({ length: 7 }, () => {
    const cells = Array.from(
      { length: 10 },
      () => '<td><span class="debug-log-browser-skeleton-bar"></span></td>'
    ).join('');
    return `<tr class="debug-log-browser-skeleton-row" aria-hidden="true">${cells}</tr>`;
  }).join('');
}

function setLoadingState(loading) {
  isLoading = loading;
  const { panelInner, loading: loadingEl, empty, status, refreshBtn, deleteAllBtn, user, operation, since, until, pageSize, prevPage, nextPage } =
    getFilterElements();
  panelInner?.classList.toggle('is-loading', loading);
  loadingEl?.classList.toggle('hidden', !loading);
  if (loading) {
    empty?.classList.add('hidden');
    if (status) status.textContent = '';
    renderLoadingSkeleton();
  }
  updateContextLoadingUi();
  for (const el of [refreshBtn, deleteAllBtn, user, operation, since, until, pageSize, prevPage, nextPage]) {
    if (el) el.disabled = !!loading;
  }
}

function shouldShowContextLoading() {
  if (isLoading) return false;
  const { pageRows } = getVisiblePageRows();
  if (!pageRows.length) return false;
  if (enrichInFlight) return true;
  return pageRows.some((row) => {
    const id = normalizeSfId(row?.Id);
    return id && !row?.contextFromBody && !bodyEnrichedIds.has(id);
  });
}

function updateContextLoadingUi() {
  const { contextLoading } = getFilterElements();
  if (!contextLoading) return;
  const show = shouldShowContextLoading();
  contextLoading.classList.toggle('hidden', !show);
  const textEl = contextLoading.querySelector('.debug-log-browser-context-loading-text');
  if (textEl) textEl.textContent = t('debugLogs.loadingContext');
}

function formatDateTime(value) {
  if (!value) return '—';
  return formatDateTimeForDisplay(value) || String(value);
}

function applyClientFilters(rows) {
  const selectedUserId = normalizeSfId(appliedFilters.user);
  const opNeedle = String(appliedFilters.operation || '').trim().toLowerCase();
  const statusNeedle = String(appliedFilters.status || '').trim().toLowerCase();
  const textNeedle = String(appliedFilters.text || '').trim().toLowerCase();
  return (rows || []).filter((r) => {
    const userId = normalizeSfId(r?.LogUserId);
    const op = String(r?.Operation || '').toLowerCase();
    if (selectedUserId && userId !== selectedUserId) return false;
    if (opNeedle && !op.includes(opNeedle)) return false;
    if (statusNeedle && String(r?.Status || '').toLowerCase() !== statusNeedle) return false;
    if (textNeedle) {
      const haystack = [r?.Type, r?.Name, r?.Method].map((value) => String(value || '').toLowerCase()).join(' ');
      if (!haystack.includes(textNeedle)) return false;
    }
    return true;
  }).sort((left, right) => {
    const a = left?.[sortState.key] ?? '';
    const b = right?.[sortState.key] ?? '';
    const av = Number.isFinite(Date.parse(a)) ? Date.parse(a) : (Number.isFinite(Number(a)) ? Number(a) : String(a).toLowerCase());
    const bv = Number.isFinite(Date.parse(b)) ? Date.parse(b) : (Number.isFinite(Number(b)) ? Number(b) : String(b).toLowerCase());
    const result = av < bv ? -1 : av > bv ? 1 : 0;
    return sortState.direction === 'asc' ? result : -result;
  });
}

function captureDraftFilters() {
  const { user, operation, rowStatus, text } = getFilterElements();
  return {
    user: String(user?.value || ''),
    operation: String(operation?.value || ''),
    status: String(rowStatus?.value || ''),
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
  const sinceIso = toUtcIsoFromLocalDateTime(since?.value);
  const untilIso = toUtcIsoFromLocalDateTime(until?.value);
  const valid = Boolean(sinceIso)
    && (dateRangePicker?.until?.isNowMode || isValidUtcRange(sinceIso, untilIso));
  applyFilters.disabled = !valid || captureDraftSignature() === appliedDraftSignature;
}

async function applyDraftFilters() {
  appliedFilters = captureDraftFilters();
  appliedDraftSignature = captureDraftSignature();
  currentPage = 1;
  cancelPageEnrichment();
  lastLoadSignature = '';
  await refreshDebugLogBrowserPanel();
}

function resetDraftFilters() {
  const { user, operation, rowStatus, text } = getFilterElements();
  if (user) user.value = '';
  if (operation) operation.value = '';
  if (rowStatus) rowStatus.value = '';
  if (text) text.value = '';
  appliedFilters = captureDraftFilters();
  appliedDraftSignature = captureDraftSignature();
  currentPage = 1;
  cancelPageEnrichment();
  renderRowsAndEnrich();
  updateFilterActionState();
}

function formatBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 2)} MB`;
}

function populateOperationOptions(rows) {
  const { operation } = getFilterElements();
  if (!operation) return;
  const current = String(operation.value || '');
  const ops = [...new Set((rows || []).map((r) => String(r?.Operation || '').trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b)
  );
  operation.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = t('debugLogs.operationAll');
  operation.appendChild(allOpt);
  for (const op of ops) {
    const opt = document.createElement('option');
    opt.value = op;
    opt.textContent = op;
    operation.appendChild(opt);
  }
  if ([...operation.options].some((o) => o.value === current)) operation.value = current;
}

function populateUserOptions(rows) {
  const { user } = getFilterElements();
  if (!user) return;
  const current = String(user.value || '');
  const users = [
    ...new Map(
      (rows || [])
        .map((r) => {
          const id = String(r?.LogUserId || '').trim();
          if (!id) return null;
          const name = String(r?.UserName || r?.LogUser?.Name || '').trim();
          const username = String(r?.LogUser?.Username || '').trim();
          return [id, { id, name: name || username || id, username }];
        })
        .filter(Boolean)
    ).values()
  ].sort((a, b) => a.name.localeCompare(b.name));
  user.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = t('debugLogs.userAll');
  user.appendChild(allOpt);
  for (const u of users) {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.username && u.name !== u.username ? `${u.name} — ${u.username}` : u.name;
    opt.title = u.id;
    user.appendChild(opt);
  }
  if ([...user.options].some((o) => o.value === current)) user.value = current;
}

function updatePaginationUi(totalFilteredRows) {
  const { pageSize, firstPage, prevPage, nextPage, lastPage, pageInput, pageLabel } = getFilterElements();
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
    const from = totalFilteredRows ? (currentPage - 1) * pagination.pageSize + 1 : 0;
    const to = Math.min(currentPage * pagination.pageSize, totalFilteredRows);
    pageLabel.textContent = t('pagination.showing', { from: String(from), to: String(to), total: String(totalFilteredRows) });
  }
}

function getRowsPerPage() {
  return pagination.pageSize;
}

function getVisiblePageRows() {
  const rows = applyClientFilters(lastRows);
  const slice = pagination.getSlice(rows);
  currentPage = pagination.page;
  return {
    rows,
    pageRows: slice.rows,
    perPage: pagination.pageSize
  };
}

function mergeEnrichedRows(enrichedRows) {
  const byId = new Map(
    (enrichedRows || [])
      .map((r) => {
        const id = normalizeSfId(r?.Id);
        return id ? [id, r] : null;
      })
      .filter(Boolean)
  );
  if (!byId.size) return;
  lastRows = lastRows.map((row) => {
    const hit = byId.get(normalizeSfId(row?.Id));
    if (!hit) return row;
    return {
      ...row,
      ...hit,
      contextFromBody: true
    };
  });
}

function cancelPageEnrichment() {
  enrichSeq += 1;
  enrichInFlight = false;
  enrichingIds.clear();
}

function getPageEnrichmentCandidates() {
  const { pageRows } = getVisiblePageRows();
  return pageRows.filter((row) => {
    const id = normalizeSfId(row?.Id);
    return id && !bodyEnrichedIds.has(id);
  });
}

function schedulePageBodyEnrichment() {
  if (isLoading || !state.leftOrgId || enrichInFlight) return;
  void enrichVisiblePageRows();
}

async function enrichVisiblePageRows() {
  if (!state.leftOrgId || enrichInFlight) return;
  const pending = getPageEnrichmentCandidates();
  if (!pending.length) return;
  const seq = ++enrichSeq;
  enrichInFlight = true;
  enrichingIds.clear();
  for (const row of pending) {
    const id = normalizeSfId(row?.Id);
    if (id) {
      bodyEnrichedIds.add(id);
      enrichingIds.add(id);
    }
  }
  renderRows();
  try {
    const res = await bg({
      type: 'debugLogs:enrichRows',
      orgId: state.leftOrgId,
      maxBodyFetches: pending.length,
      rows: pending.map((r) => ({
        Id: r.Id,
        Location: r.Location,
        Operation: r.Operation
      }))
    });
    if (seq !== enrichSeq) return;
    if (!res?.ok) {
      void handleToolResponseFailure(res, { artifact_type: 'DebugLogs', phase: 'enrich_rows' });
      return;
    }
    mergeEnrichedRows(res.rows);
  } catch {
    /* bodyEnrichedIds se conserva: no reintentar en bucle ni dejar el spinner colgado */
  } finally {
    if (seq === enrichSeq) {
      enrichInFlight = false;
      enrichingIds.clear();
      renderRows();
    }
  }
}

function renderRows() {
  const { tbody, empty } = getFilterElements();
  if (!tbody || !empty) return;
  if (isLoading) return;
  const { rows, pageRows } = getVisiblePageRows();
  updatePaginationUi(rows.length);
  tbody.innerHTML = '';
  if (!pageRows.length) {
    empty.classList.add('hidden');
    const tr = document.createElement('tr');
    tr.className = 'sfoc-table-empty-row';
    const td = document.createElement('td');
    td.colSpan = 10;
    td.textContent = tableState === 'no-session' ? t('toast.noSession') : t('debugLogs.empty');
    if (tableState === 'no-session') {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'debug-log-browser-open-btn sfoc-table-empty-retry';
      retry.textContent = t('filters.retry');
      retry.addEventListener('click', () => {
        lastLoadSignature = '';
        void refreshDebugLogBrowserPanel();
      });
      td.appendChild(retry);
    }
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  empty.classList.add('hidden');
  for (const row of pageRows) {
    const tr = document.createElement('tr');
    const logId = row?.Id ? String(row.Id) : '';
    const userName = String(row?.UserName || row?.LogUser?.Name || '').trim();
    const userId = row?.LogUserId ? String(row.LogUserId) : '';
    const userCell = userName || userId || '—';
    const ctx = rowExecutionFields(row);
    const logIdNorm = normalizeSfId(logId);
    const pendingContext = !!logIdNorm && !row?.contextFromBody;
    const statusText = row?.Status ? String(row.Status) : '—';
    tr.innerHTML = `
      <td class="debug-log-browser-status-cell">${escapeHtml(statusText)}</td>
      <td>${escapeHtml(formatDateTime(row?.StartTime))}</td>
      <td>${escapeHtml(userCell)}</td>
      <td>${escapeHtml(row?.Operation ? String(row.Operation) : '—')}</td>
      <td>${escapeHtml(Number.isFinite(Number(row?.DurationMilliseconds)) ? String(row.DurationMilliseconds) : '—')}</td>
      <td>${escapeHtml(formatBytes(row?.LogLength))}</td>
      <td class="debug-log-browser-context-cell${pendingContext ? ' is-pending' : ''}">${escapeHtml(ctx.Type)}</td>
      <td class="debug-log-browser-context-cell${pendingContext ? ' is-pending' : ''}">${escapeHtml(ctx.Name)}</td>
      <td class="debug-log-browser-context-cell${pendingContext ? ' is-pending' : ''}">${escapeHtml(ctx.Method)}</td>
      <td class="debug-log-browser-action-cell"></td>
    `;
    const actionCell = tr.querySelector('.debug-log-browser-action-cell');
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'debug-log-browser-open-btn';
    openBtn.textContent = t('debugLogs.openLog');
    openBtn.disabled = !logId;
    openBtn.addEventListener('click', async () => {
      if (!state.leftOrgId || !logId) return;
      showToastWithSpinner(t('debugLogs.openingLog'));
      try {
        const bodyRes = await bg({
          type: 'debugLogs:getBody',
          orgId: state.leftOrgId,
          logId
        });
        if (!bodyRes?.ok) {
          const msg =
            bodyRes?.reason === 'NO_SID'
              ? t('toast.noSession')
              : bodyRes?.error || t('debugLogs.loadLogError');
          void handleToolResponseFailure(bodyRes, { artifact_type: 'DebugLogs', phase: 'get_body' });
          showToast(msg, 'error');
          return;
        }
        const ok = await openApexLogViewerWithPayload(
          `${t('docTitle.apexLog')} · ${logId}`,
          String(bodyRes.body || ''),
          {
            downloadFileName: `${sanitizeApexViewerDownloadFileName(logId)}.log`,
            defaultTab: 'summary',
            orgId: state.leftOrgId || '',
            instanceUrl: getOrgInstanceUrl(state.leftOrgId),
            logId
          }
        );
        if (!ok) showToast(t('debugLogs.openLogError'), 'error');
      } finally {
        dismissSpinnerToast();
      }
    });
    actionCell?.appendChild(openBtn);
    tbody.appendChild(tr);
  }
  updateContextLoadingUi();
}

function renderRowsAndEnrich() {
  renderRows();
  schedulePageBodyEnrichment();
}

async function loadLogs() {
  const { status } = getFilterElements();
  if (!state.leftOrgId) {
    if (status) status.textContent = t('debugLogs.selectOrg');
    return;
  }
  const range = await resolveQueryRange();
  if (!range.ok) {
    if (status) status.textContent = t('debugLogs.invalidRange');
    return;
  }
  setLoadingState(true);
  showToastWithSpinner(t('debugLogs.loading'));
  try {
    const res = await bg({
      type: 'debugLogs:list',
      orgId: state.leftOrgId,
      sinceIso: range.sinceIso,
      untilIso: range.untilIso
    });
    if (!res?.ok) {
      const msg = res?.reason === 'NO_SID' ? t('toast.noSession') : res?.error || t('debugLogs.loadError');
      void handleToolResponseFailure(res, { artifact_type: 'DebugLogs', phase: 'list' });
      tableState = res?.reason === 'NO_SID' ? 'no-session' : 'error';
      if (status) status.textContent = res?.reason === 'NO_SID' ? '' : msg;
      if (res?.reason !== 'NO_SID') showToast(msg, 'error');
      lastRows = [];
      currentPage = 1;
      return;
    }
    const rawRows = Array.isArray(res.logs) ? res.logs : [];
    tableState = rawRows.length ? 'loaded' : 'empty';
    lastRows = (await resolveUserNamesForLogs(rawRows)).map(normalizeLogRow);
    currentPage = 1;
    cancelPageEnrichment();
    bodyEnrichedIds.clear();
    populateUserOptions(lastRows);
    populateOperationOptions(lastRows);
    if (status) status.textContent = '';
  } catch {
    tableState = 'error';
    lastRows = [];
    currentPage = 1;
    if (status) status.textContent = t('debugLogs.loadError');
    showToast(t('debugLogs.loadError'), 'error');
  } finally {
    setLoadingState(false);
    dismissSpinnerToast();
    renderRowsAndEnrich();
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
    const hours = getDebugLogsDefaultRangeHours();
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
  const nowMode = dateRangePicker?.until?.isNowMode || until?.dataset.salesforceNow === 'true';
  if (!sinceIso) return { ok: false };
  if (nowMode) {
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

async function refreshLogsNow() {
  if (!state.leftOrgId) {
    showToast(t('debugLogs.selectOrg'), 'error');
    return;
  }
  await ensureDefaultDateRange({ refresh: true });
  lastLoadSignature = '';
  await refreshDebugLogBrowserPanel();
}

export async function refreshDebugLogBrowserPanel() {
  const { status, since, until } = getFilterElements();
  await ensureDefaultDateRange();
  if (!state.leftOrgId) {
    setLoadingState(false);
    if (status) status.textContent = t('debugLogs.selectOrg');
    return;
  }
  if (getSelectedArtifactType() !== 'DebugLogBrowser') return;
  const sig = `${state.leftOrgId}|${since?.value || ''}|${dateRangePicker?.until?.isNowMode ? 'salesforce-now' : until?.value || ''}`;
  if (sig !== lastLoadSignature) {
    lastLoadSignature = sig;
    await loadLogs();
  } else if (!isLoading) {
    renderRowsAndEnrich();
  }
}

export function setupDebugLogBrowserPanel() {
  const { user, operation, since, until, pageSize, firstPage, prevPage, nextPage, lastPage, pageInput, rowStatus, text, applyFilters, resetFilters } =
    getFilterElements();
  const applyOnEnter = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void applyDraftFilters();
    }
  };
  for (const field of [user, operation, rowStatus, text, since, until]) {
    field?.addEventListener('keydown', applyOnEnter);
  }
  const refreshBtn = document.getElementById('debugLogBrowserRefreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', () => void applyDraftFilters());
  applyFilters?.addEventListener('click', () => void applyDraftFilters());
  resetFilters?.addEventListener('click', () => resetDraftFilters());
  dateRangePicker = createDateTimeRangePicker({
    sinceInput: since,
    untilInput: until,
    sinceLabel: t('debugLogs.filterSince'),
    untilLabel: t('debugLogs.filterUntil'),
    onDraftChange: updateFilterActionState
  });
  for (const field of [user, operation, rowStatus, text]) {
    field?.addEventListener('input', updateFilterActionState);
    field?.addEventListener('change', updateFilterActionState);
  }
  if (pageSize)
    pageSize.addEventListener('change', () => {
      pagination.setPageSize(pageSize.value, applyClientFilters(lastRows).length);
      currentPage = pagination.page;
      cancelPageEnrichment();
      renderRowsAndEnrich();
    });
  if (prevPage)
    prevPage.addEventListener('click', () => {
      currentPage = pagination.previous(applyClientFilters(lastRows).length);
      cancelPageEnrichment();
      renderRowsAndEnrich();
    });
  if (nextPage)
    nextPage.addEventListener('click', () => {
      currentPage = pagination.next(applyClientFilters(lastRows).length);
      cancelPageEnrichment();
      renderRowsAndEnrich();
    });
  firstPage?.addEventListener('click', () => {
    currentPage = pagination.first(applyClientFilters(lastRows).length);
    cancelPageEnrichment();
    renderRowsAndEnrich();
  });
  lastPage?.addEventListener('click', () => {
    currentPage = pagination.last(applyClientFilters(lastRows).length);
    cancelPageEnrichment();
    renderRowsAndEnrich();
  });
  pageInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    currentPage = pagination.setPage(pageInput.value, applyClientFilters(lastRows).length);
    cancelPageEnrichment();
    renderRowsAndEnrich();
  });
  const deleteAllBtn = document.getElementById('debugLogBrowserDeleteAllBtn');
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', async () => {
      if (!state.leftOrgId) {
        showToast(t('debugLogs.selectOrg'), 'error');
        return;
      }
      if (!await confirmSfocOrgAction({
        orgId: state.leftOrgId,
        description: t('debugLogs.deleteAllConfirm'),
        confirmLabel: t('modal.action.deleteLogs'),
        risk: 'destructive'
      })) return;
      deleteAllBtn.disabled = true;
      showToastWithSpinner(t('debugLogs.deletingAll'));
      try {
        const res = await bg({
          type: 'debugLogs:deleteAll',
          orgId: state.leftOrgId
        });
        if (!res?.ok) {
          const msg =
            res?.reason === 'NO_SID' ? t('toast.noSession') : res?.error || t('debugLogs.deleteAllError');
          void handleToolResponseFailure(res, { artifact_type: 'DebugLogs', phase: 'delete_all' });
          showToast(msg, 'error');
          return;
        }
        const total = Number(res.total ?? 0);
        const deleted = Number(res.deleted ?? 0);
        const failed = Number(res.failed ?? 0);
        if (!total) {
          showToast(t('debugLogs.deleteAllNone'), 'info');
        } else {
          const toastType = failed > 0 ? 'warn' : 'info';
          showToast(
            t('debugLogs.deleteAllDone', {
              deleted: String(deleted),
              failed: String(failed),
              total: String(total)
            }),
            toastType
          );
        }
        lastLoadSignature = '';
        await refreshDebugLogBrowserPanel();
      } finally {
        dismissSpinnerToast();
        deleteAllBtn.disabled = false;
      }
    });
  }
  void ensureDefaultDateRange().then(() => {
    if (!appliedDraftSignature) appliedDraftSignature = captureDraftSignature();
    updateFilterActionState();
  });
  document.querySelectorAll('#debugLogBrowserTableWrap th[data-sort]').forEach((header) => {
    header.addEventListener('click', () => {
      const key = header.dataset.sort;
      sortState = { key, direction: sortState.key === key && sortState.direction === 'asc' ? 'desc' : 'asc' };
      document.querySelectorAll('#debugLogBrowserTableWrap th[data-sort]').forEach((cell) => cell.removeAttribute('aria-sort'));
      header.setAttribute('aria-sort', sortState.direction === 'asc' ? 'ascending' : 'descending');
      currentPage = 1;
      renderRowsAndEnrich();
    });
  });
}
