import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t, getCurrentLang } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { apexViewerIdbPut } from '../lib/apexViewerIdb.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';

let lastRows = [];
let currentPage = 1;
let lastLoadSignature = '';

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

function sanitizeApexViewerDownloadFileName(name) {
  const s = String(name || '')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return s || 'file';
}

async function openApexLogViewerWithPayload(title, content, viewerOpts = {}) {
  const downloadFileName =
    viewerOpts.downloadFileName != null && String(viewerOpts.downloadFileName).trim()
      ? sanitizeApexViewerDownloadFileName(viewerOpts.downloadFileName)
      : undefined;
  const staged = await bg({
    type: 'apexViewer:stage',
    title,
    content,
    ...(downloadFileName ? { downloadFileName } : {})
  });
  if (staged.ok && staged.id) {
    window.open(
      chrome.runtime.getURL(`code/apex-log-viewer.html?sid=${encodeURIComponent(staged.id)}`),
      '_blank'
    );
    return true;
  }
  const storageKey = `sfoc_dlb_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  try {
    await chrome.storage.local.set({
      [storageKey]: { title, content, ...(downloadFileName ? { downloadFileName } : {}) }
    });
    window.open(
      chrome.runtime.getURL(`code/apex-log-viewer.html?k=${encodeURIComponent(storageKey)}`),
      '_blank'
    );
    return true;
  } catch {
    /* fallback */
  }
  try {
    const idbId = `idb_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
    await apexViewerIdbPut(idbId, { title, content, ...(downloadFileName ? { downloadFileName } : {}) });
    window.open(
      chrome.runtime.getURL(`code/apex-log-viewer.html?idb=${encodeURIComponent(idbId)}`),
      '_blank'
    );
    return true;
  } catch {
    return false;
  }
}

function getFilterElements() {
  return {
    status: document.getElementById('debugLogBrowserStatus'),
    user: document.getElementById('debugLogBrowserUserFilter'),
    operation: document.getElementById('debugLogBrowserOperationFilter'),
    since: document.getElementById('debugLogBrowserSince'),
    until: document.getElementById('debugLogBrowserUntil'),
    pageSize: document.getElementById('debugLogBrowserPageSize'),
    prevPage: document.getElementById('debugLogBrowserPrevPage'),
    nextPage: document.getElementById('debugLogBrowserNextPage'),
    pageLabel: document.getElementById('debugLogBrowserPageLabel'),
    tbody: document.getElementById('debugLogBrowserTbody'),
    empty: document.getElementById('debugLogBrowserEmpty')
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

function applyClientFilters(rows) {
  const { user, operation } = getFilterElements();
  const selectedUserId = normalizeSfId(user?.value || '');
  const opNeedle = String(operation?.value || '').trim().toLowerCase();
  return (rows || []).filter((r) => {
    const userId = normalizeSfId(r?.LogUserId);
    const op = String(r?.Operation || '').toLowerCase();
    if (selectedUserId && userId !== selectedUserId) return false;
    if (opNeedle && !op.includes(opNeedle)) return false;
    return true;
  });
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
          const name = String(r?.UserName || r?.LogUser?.Name || '').trim() || id;
          return [id, { id, name }];
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
    opt.textContent = u.name;
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
    pageLabel.textContent = t('debugLogs.pageLabel', {
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
    const logId = row?.Id ? String(row.Id) : '';
    const userName = String(row?.UserName || row?.LogUser?.Name || '').trim();
    const userId = row?.LogUserId ? String(row.LogUserId) : '';
    const userCell = userName || userId || '—';
    tr.innerHTML = `
      <td class="debug-log-browser-id-cell">${logId || '—'}</td>
      <td>${formatDateTime(row?.StartTime)}</td>
      <td>${userCell}</td>
      <td>${row?.Operation ? String(row.Operation) : '—'}</td>
      <td>${Number.isFinite(Number(row?.DurationMilliseconds)) ? String(row.DurationMilliseconds) : '—'}</td>
      <td>${formatBytes(row?.LogLength)}</td>
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
          showToast(msg, 'error');
          return;
        }
        const ok = await openApexLogViewerWithPayload(
          `${t('docTitle.apexLog')} · ${logId}`,
          String(bodyRes.body || ''),
          { downloadFileName: `${sanitizeApexViewerDownloadFileName(logId)}.log` }
        );
        if (!ok) showToast(t('debugLogs.openLogError'), 'error');
      } finally {
        dismissSpinnerToast();
      }
    });
    actionCell?.appendChild(openBtn);
    tbody.appendChild(tr);
  }
}

async function loadLogs() {
  const { status, since, until } = getFilterElements();
  if (!state.leftOrgId) {
    if (status) status.textContent = t('debugLogs.selectOrg');
    return;
  }
  const sinceIso = since?.value ? new Date(since.value).toISOString() : '';
  const untilIso = until?.value ? new Date(until.value).toISOString() : '';
  if (!sinceIso || !untilIso) {
    if (status) status.textContent = t('debugLogs.invalidRange');
    return;
  }
  if (new Date(sinceIso).getTime() > new Date(untilIso).getTime()) {
    if (status) status.textContent = t('debugLogs.invalidRange');
    return;
  }
  if (status) status.textContent = t('debugLogs.loading');
  showToastWithSpinner(t('debugLogs.loading'));
  try {
    const res = await bg({
      type: 'debugLogs:list',
      orgId: state.leftOrgId,
      sinceIso,
      untilIso
    });
    if (!res?.ok) {
      const msg = res?.reason === 'NO_SID' ? t('toast.noSession') : res?.error || t('debugLogs.loadError');
      if (status) status.textContent = msg;
      showToast(msg, 'error');
      return;
    }
    const rawRows = Array.isArray(res.logs) ? res.logs : [];
    lastRows = await resolveUserNamesForLogs(rawRows);
    currentPage = 1;
    populateUserOptions(lastRows);
    populateOperationOptions(lastRows);
    if (status) status.textContent = '';
    renderRows();
  } finally {
    dismissSpinnerToast();
  }
}

function ensureDefaultDateRange() {
  const { since, until } = getFilterElements();
  if (!since || !until) return;
  if (!since.value || !until.value) {
    const now = new Date();
    const prev = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const toInputValue = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    if (!since.value) since.value = toInputValue(prev);
    if (!until.value) until.value = toInputValue(now);
  }
}

export async function refreshDebugLogBrowserPanel() {
  const { status, since, until } = getFilterElements();
  ensureDefaultDateRange();
  if (!state.leftOrgId) {
    if (status) status.textContent = t('debugLogs.selectOrg');
    return;
  }
  if (status) status.textContent = '';
  if (getSelectedArtifactType() !== 'DebugLogBrowser') return;
  const sig = `${state.leftOrgId}|${since?.value || ''}|${until?.value || ''}`;
  if (sig !== lastLoadSignature) {
    lastLoadSignature = sig;
    await loadLogs();
  } else {
    renderRows();
  }
}

export function setupDebugLogBrowserPanel() {
  const { user, operation, since, until, pageSize, prevPage, nextPage } =
    getFilterElements();
  if (user)
    user.addEventListener('change', () => {
      currentPage = 1;
      renderRows();
    });
  if (operation)
    operation.addEventListener('change', () => {
      currentPage = 1;
      renderRows();
    });
  const triggerReload = () => {
    lastLoadSignature = '';
    void refreshDebugLogBrowserPanel();
  };
  if (since) since.addEventListener('change', triggerReload);
  if (until) until.addEventListener('change', triggerReload);
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
  const deleteAllBtn = document.getElementById('debugLogBrowserDeleteAllBtn');
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', async () => {
      if (!state.leftOrgId) {
        showToast(t('debugLogs.selectOrg'), 'error');
        return;
      }
      if (!window.confirm(t('debugLogs.deleteAllConfirm'))) return;
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
  ensureDefaultDateRange();
}
