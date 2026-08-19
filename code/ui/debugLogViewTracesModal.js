import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t, getCurrentLang } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { escapeHtml } from '../../shared/htmlEscape.js';
import { handleToolResponseFailure } from '../../shared/reportToolError.js';
import {
  isUserDebugTraceActive,
  isUserDebugTraceRecentlyInactive,
  isUserDebugTraceVisibleByDefault,
  canExtendOrReactivateUserDebugTrace,
  validateUserDebugTraceDates
} from '../../shared/salesforceApi.js';
import {
  openDebugLogTraceModal,
  isDebugLogTraceModalOpen,
  closeDebugLogTraceModal,
  setDebugLogTraceModalOnCreated
} from './debugLogTraceModal.js';

/** @type {Array<Record<string, unknown>>} */
let allTraces = [];
/** @type {Array<{ id: string, developerName: string, label: string }>} */
let cachedDebugLevels = [];
/** @type {Record<string, unknown> | null} */
let editingTrace = null;
let loadGeneration = 0;
let busyRowId = '';
let inlineMode = false;

function els() {
  return {
    modal: document.getElementById('debugLogViewTracesModal'),
    openBtn: document.getElementById('debugLogBrowserViewTracesBtn'),
    addTraceBtn: document.getElementById('debugLogViewTracesAddTraceBtn'),
    closeBtn: document.getElementById('debugLogViewTracesCloseBtn'),
    refreshBtn: document.getElementById('debugLogViewTracesRefreshBtn'),
    showInactive: document.getElementById('debugLogViewTracesShowInactive'),
    tbody: document.getElementById('debugLogViewTracesTbody'),
    loading: document.getElementById('debugLogViewTracesLoading'),
    empty: document.getElementById('debugLogViewTracesEmpty'),
    editModal: document.getElementById('debugLogEditTraceModal'),
    editUser: document.getElementById('debugLogEditTraceUser'),
    editLevel: document.getElementById('debugLogEditTraceLevelSelect'),
    editStart: document.getElementById('debugLogEditTraceStartInput'),
    editEnd: document.getElementById('debugLogEditTraceEndInput'),
    editSave: document.getElementById('debugLogEditTraceSaveBtn'),
    editCancel: document.getElementById('debugLogEditTraceCancelBtn')
  };
}

function toInputValue(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

function formatLevel(row) {
  const dev = String(row?.debugLevelDeveloperName || '').trim();
  const label = String(row?.debugLevelLabel || '').trim();
  if (dev && label && dev !== label) return `${label} (${dev})`;
  return dev || label || '—';
}

function traceDateValidationMessage(code) {
  if (code === 'MAX_WINDOW') return t('debugLogs.traceMaxWindow');
  return t('debugLogs.traceInvalidRange');
}

function canExtendTrace(row) {
  return canExtendOrReactivateUserDebugTrace(row);
}

function visibleTraces() {
  const { showInactive } = els();
  const includeInactive = !!showInactive?.checked;
  if (includeInactive) return allTraces;
  return allTraces.filter((row) => isUserDebugTraceVisibleByDefault(row));
}

function setLoading(on) {
  const { loading, tbody, empty } = els();
  loading?.classList.toggle('hidden', !on);
  if (on) {
    if (tbody) tbody.innerHTML = '';
    empty?.classList.add('hidden');
  }
}

function isEditOpen() {
  const { editModal } = els();
  return editModal && !editModal.classList.contains('hidden');
}

function closeEditModal() {
  const { editModal, editSave } = els();
  editingTrace = null;
  if (editModal) {
    editModal.classList.add('hidden');
    editModal.setAttribute('aria-hidden', 'true');
  }
  if (editSave) editSave.disabled = false;
}

async function ensureDebugLevels() {
  if (cachedDebugLevels.length || !state.leftOrgId) return cachedDebugLevels;
  const res = await bg({
    type: 'debugLogs:listDebugLevels',
    orgId: state.leftOrgId
  });
  if (res?.ok && Array.isArray(res.levels)) {
    cachedDebugLevels = res.levels;
  }
  return cachedDebugLevels;
}

function populateLevelSelect(selectedId) {
  const { editLevel } = els();
  if (!editLevel) return;
  editLevel.innerHTML = '';
  for (const lvl of cachedDebugLevels) {
    const opt = document.createElement('option');
    opt.value = lvl.id;
    const label = lvl.label || lvl.developerName || lvl.id;
    opt.textContent = lvl.developerName ? `${label} (${lvl.developerName})` : label;
    if (lvl.id === selectedId) opt.selected = true;
    editLevel.appendChild(opt);
  }
}

async function openEditModal(row) {
  if (!row?.id || busyRowId) return;
  await ensureDebugLevels();
  if (!cachedDebugLevels.length) {
    showToast(t('debugLogs.traceLevelsLoadError'), 'error');
    return;
  }
  editingTrace = row;
  const { editModal, editUser, editStart, editEnd } = els();
  if (editUser) {
    editUser.textContent = String(row.userLabel || row.tracedEntityId || '');
  }
  populateLevelSelect(String(row.debugLevelId || ''));
  if (editStart && row.startIso) editStart.value = toInputValue(new Date(row.startIso));
  if (editEnd && row.expirationIso) editEnd.value = toInputValue(new Date(row.expirationIso));
  editModal?.classList.remove('hidden');
  editModal?.setAttribute('aria-hidden', 'false');
}

function renderTable() {
  const { tbody, empty } = els();
  if (!tbody) return;
  const rows = visibleTraces();
  tbody.innerHTML = '';
  if (!rows.length) {
    empty?.classList.remove('hidden');
    if (empty) {
      empty.textContent = allTraces.length
        ? t('debugLogs.viewTracesEmptyInactive')
        : t('debugLogs.viewTracesEmpty');
    }
    return;
  }
  empty?.classList.add('hidden');
  for (const row of rows) {
    const tr = document.createElement('tr');
    const active = isUserDebugTraceActive(row);
    const recentlyInactive = isUserDebugTraceRecentlyInactive(row);
    const statusKey = active ? 'debugLogs.viewTracesStatusActive' : 'debugLogs.viewTracesStatusInactive';
    const statusClass = active
      ? 'debug-log-view-traces-status debug-log-view-traces-status--active'
      : 'debug-log-view-traces-status debug-log-view-traces-status--inactive';
    const rowBusy = busyRowId === row.id;
    const extendable = canExtendTrace(row);
    const extendDisabled = !extendable || rowBusy;
    const extendTitle = extendable
      ? recentlyInactive
        ? t('debugLogs.viewTracesReactivate15')
        : t('debugLogs.viewTracesExtend15')
      : t('debugLogs.viewTracesExtendMaxWindow');
    const extendLabel = recentlyInactive
      ? t('debugLogs.viewTracesReactivate15')
      : t('debugLogs.viewTracesExtend15');
    const actionDisabled = rowBusy ? 'disabled' : '';
    tr.innerHTML = `
      <td>${escapeHtml(String(row.userLabel || row.tracedEntityId || '—'))}</td>
      <td>${escapeHtml(formatLevel(row))}</td>
      <td>${escapeHtml(formatDateTime(row.startIso))}</td>
      <td>${escapeHtml(formatDateTime(row.expirationIso))}</td>
      <td><span class="${statusClass}">${escapeHtml(t(statusKey))}</span></td>
      <td class="debug-log-view-traces-actions-cell">
        <div class="debug-log-view-traces-actions">
          ${
            active || recentlyInactive
              ? `<button type="button" class="debug-log-view-traces-extend-btn" ${extendDisabled ? 'disabled' : ''} title="${escapeHtml(extendTitle)}">${escapeHtml(extendLabel)}</button>`
              : ''
          }
          <button type="button" class="debug-log-view-traces-edit-btn" ${actionDisabled} title="${escapeHtml(t('debugLogs.viewTracesEdit'))}">${escapeHtml(t('debugLogs.viewTracesEdit'))}</button>
          <button type="button" class="debug-log-view-traces-delete-btn" ${actionDisabled} title="${escapeHtml(t('debugLogs.viewTracesDelete'))}">${escapeHtml(t('debugLogs.viewTracesDelete'))}</button>
        </div>
      </td>
    `;
    tr.querySelector('.debug-log-view-traces-extend-btn')?.addEventListener('click', () => void extendTrace(row));
    tr.querySelector('.debug-log-view-traces-edit-btn')?.addEventListener('click', () => void openEditModal(row));
    tr.querySelector('.debug-log-view-traces-delete-btn')?.addEventListener('click', () => void deleteTrace(row));
    tbody.appendChild(tr);
  }
}

async function loadTraces() {
  if (!state.leftOrgId) {
    showToast(t('debugLogs.selectOrg'), 'warn');
    return;
  }
  const gen = ++loadGeneration;
  setLoading(true);
  try {
    const res = await bg({
      type: 'debugLogs:listTraces',
      orgId: state.leftOrgId
    });
    if (gen !== loadGeneration) return;
    if (!res?.ok) {
      const msg =
        res?.reason === 'NO_SID' ? t('toast.noSession') : res?.error || t('debugLogs.viewTracesLoadError');
      void handleToolResponseFailure(res, { artifact_type: 'DebugLogs', phase: 'list_traces' });
      showToast(msg, 'error');
      allTraces = [];
      renderTable();
      return;
    }
    allTraces = Array.isArray(res.traces) ? res.traces : [];
    renderTable();
  } catch {
    if (gen !== loadGeneration) return;
    showToast(t('debugLogs.viewTracesLoadError'), 'error');
    allTraces = [];
    renderTable();
  } finally {
    if (gen === loadGeneration) setLoading(false);
  }
}

async function extendTrace(row) {
  if (!row?.id || !state.leftOrgId || busyRowId) return;
  if (!canExtendTrace(row)) {
    showToast(t('debugLogs.viewTracesExtendMaxWindow'), 'warn');
    return;
  }
  busyRowId = String(row.id);
  renderTable();
  showToastWithSpinner(t('debugLogs.viewTracesExtending'));
  try {
    const res = await bg({
      type: 'debugLogs:extendTrace',
      orgId: state.leftOrgId,
      traceFlagId: row.id,
      allowReactivate: isUserDebugTraceRecentlyInactive(row)
    });
    if (!res?.ok) {
      const msg =
        res?.reason === 'NO_SID'
          ? t('toast.noSession')
          : res?.error?.includes('24 hour') || res?.error?.includes('24 hours')
            ? t('debugLogs.viewTracesExtendMaxWindow')
            : res?.error || t('debugLogs.viewTracesExtendError');
      void handleToolResponseFailure(res, { artifact_type: 'DebugLogs', phase: 'extend_trace' });
      showToast(msg, 'error');
      return;
    }
    const idx = allTraces.findIndex((tr) => tr.id === row.id);
    if (idx >= 0) {
      allTraces[idx] = {
        ...allTraces[idx],
        ...(res.expirationIso ? { expirationIso: res.expirationIso } : {}),
        ...(res.startIso ? { startIso: res.startIso } : {})
      };
    }
    const successKey = res.reactivated
      ? 'debugLogs.viewTracesReactivateSuccess'
      : 'debugLogs.viewTracesExtendSuccess';
    showToast(
      res.cappedAtMax ? t('debugLogs.viewTracesExtendMaxWindow') : t(successKey),
      res.cappedAtMax ? 'warn' : 'info'
    );
    renderTable();
  } catch {
    showToast(t('debugLogs.viewTracesExtendError'), 'error');
  } finally {
    busyRowId = '';
    dismissSpinnerToast();
    renderTable();
  }
}

async function deleteTrace(row) {
  if (!row?.id || !state.leftOrgId || busyRowId) return;
  if (!window.confirm(t('debugLogs.viewTracesDeleteConfirm'))) return;
  busyRowId = String(row.id);
  renderTable();
  showToastWithSpinner(t('debugLogs.viewTracesDeleting'));
  try {
    const res = await bg({
      type: 'debugLogs:deleteTrace',
      orgId: state.leftOrgId,
      traceFlagId: row.id
    });
    if (!res?.ok) {
      const msg =
        res?.reason === 'NO_SID' ? t('toast.noSession') : res?.error || t('debugLogs.viewTracesDeleteError');
      void handleToolResponseFailure(res, { artifact_type: 'DebugLogs', phase: 'delete_trace' });
      showToast(msg, 'error');
      return;
    }
    allTraces = allTraces.filter((tr) => tr.id !== row.id);
    showToast(t('debugLogs.viewTracesDeleteSuccess'), 'info');
    renderTable();
  } catch {
    showToast(t('debugLogs.viewTracesDeleteError'), 'error');
  } finally {
    busyRowId = '';
    dismissSpinnerToast();
    renderTable();
  }
}

async function saveEditTrace() {
  if (!editingTrace?.id || !state.leftOrgId) return;
  const { editLevel, editStart, editEnd, editSave } = els();
  const debugLevelId = String(editLevel?.value || '').replace(/[^a-zA-Z0-9]/g, '');
  const startIso = editStart?.value ? new Date(editStart.value).toISOString() : '';
  const expirationIso = editEnd?.value ? new Date(editEnd.value).toISOString() : '';
  if (!debugLevelId) {
    showToast(t('debugLogs.traceLevelRequired'), 'warn');
    return;
  }
  const dateErr = validateUserDebugTraceDates({ startIso, expirationIso });
  if (dateErr) {
    showToast(traceDateValidationMessage(dateErr), 'warn');
    return;
  }
  if (editSave) editSave.disabled = true;
  showToastWithSpinner(t('debugLogs.viewTracesEditing'));
  try {
    const res = await bg({
      type: 'debugLogs:updateTrace',
      orgId: state.leftOrgId,
      traceFlagId: editingTrace.id,
      debugLevelId,
      startIso,
      expirationIso
    });
    if (!res?.ok) {
      const msg =
        res?.reason === 'NO_SID'
          ? t('toast.noSession')
          : res?.error?.includes('24 hour') || res?.error?.includes('24 hours')
            ? t('debugLogs.traceMaxWindow')
            : res?.error?.includes('after start')
              ? t('debugLogs.traceInvalidRange')
              : res?.error || t('debugLogs.viewTracesEditError');
      void handleToolResponseFailure(res, { artifact_type: 'DebugLogs', phase: 'update_trace' });
      showToast(msg, 'error');
      return;
    }
    const idx = allTraces.findIndex((tr) => tr.id === editingTrace.id);
    if (idx >= 0) {
      allTraces[idx] = {
        ...allTraces[idx],
        debugLevelId: res.debugLevelId || debugLevelId,
        debugLevelLabel: res.debugLevelLabel || allTraces[idx].debugLevelLabel,
        debugLevelDeveloperName: res.debugLevelDeveloperName || allTraces[idx].debugLevelDeveloperName,
        startIso: res.startIso || startIso,
        expirationIso: res.expirationIso || expirationIso
      };
    }
    showToast(t('debugLogs.viewTracesEditSuccess'), 'info');
    closeEditModal();
    renderTable();
  } catch {
    showToast(t('debugLogs.viewTracesEditError'), 'error');
  } finally {
    dismissSpinnerToast();
    if (editSave) editSave.disabled = false;
  }
}

function closeModal() {
  const { modal } = els();
  if (isDebugLogTraceModalOpen()) closeDebugLogTraceModal();
  closeEditModal();
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  loadGeneration++;
  allTraces = [];
  cachedDebugLevels = [];
  busyRowId = '';
}

function ensureInlineHost() {
  const panel = document.getElementById('debugLogBrowserPanel');
  if (!panel) return null;
  let host = document.getElementById('debugLogViewTracesInlineHost');
  if (!host) {
    host = document.createElement('section');
    host.id = 'debugLogViewTracesInlineHost';
    host.className = 'debug-log-view-traces-inline-host hidden';
    host.setAttribute('aria-label', t('debugLogs.viewTracesModalTitle'));
    panel.appendChild(host);
  }
  return host;
}

function tracePanel() {
  return document.querySelector('.debug-log-view-traces-modal-panel');
}

export function deactivateDebugLogViewTracesInline() {
  if (!inlineMode) return;
  const modal = document.getElementById('debugLogViewTracesModal');
  const host = document.getElementById('debugLogViewTracesInlineHost');
  const panel = tracePanel();
  document.querySelector('.debug-log-browser-panel-inner')?.classList.remove('hidden');
  host?.classList.add('hidden');
  panel?.classList.remove('debug-log-view-traces-modal-panel--inline');
  if (modal && panel && panel.parentElement !== modal) modal.appendChild(panel);
  inlineMode = false;
}

export async function openDebugLogViewTracesInline() {
  if (!state.leftOrgId) {
    showToast(t('debugLogs.selectOrg'), 'warn');
    return false;
  }
  const { modal, showInactive } = els();
  const host = ensureInlineHost();
  const panel = tracePanel();
  if (!modal || !host || !panel) return false;
  inlineMode = true;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.querySelector('.debug-log-browser-panel-inner')?.classList.add('hidden');
  host.classList.remove('hidden');
  panel.classList.add('debug-log-view-traces-modal-panel--inline');
  host.appendChild(panel);
  if (showInactive) showInactive.checked = false;
  cachedDebugLevels = [];
  await loadTraces();
  return true;
}

export function openDebugLogViewTracesModal() {
  if (!state.leftOrgId) {
    showToast(t('debugLogs.selectOrg'), 'warn');
    return;
  }
  const { modal, showInactive } = els();
  if (!modal) return;
  deactivateDebugLogViewTracesInline();
  if (showInactive) showInactive.checked = false;
  cachedDebugLevels = [];
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  void loadTraces();
}

export function setupDebugLogViewTracesModal() {
  const { modal, openBtn, addTraceBtn, closeBtn, refreshBtn, showInactive, editCancel, editSave } = els();
  if (!modal) return;

  setDebugLogTraceModalOnCreated(() => void loadTraces());

  openBtn?.addEventListener('click', () => openDebugLogViewTracesModal());
  addTraceBtn?.addEventListener('click', () => openDebugLogTraceModal());
  closeBtn?.addEventListener('click', () => {
    if (inlineMode) deactivateDebugLogViewTracesInline();
    else closeModal();
  });
  refreshBtn?.addEventListener('click', () => void loadTraces());
  showInactive?.addEventListener('change', () => renderTable());
  editCancel?.addEventListener('click', () => closeEditModal());
  editSave?.addEventListener('click', () => void saveEditTrace());

  modal.querySelector('[data-debug-log-view-traces-close="1"]')?.addEventListener('click', () => closeModal());

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (isDebugLogTraceModalOpen()) return;
    if (isEditOpen()) {
      closeEditModal();
      return;
    }
    if (modal.classList.contains('hidden')) return;
    closeModal();
  });
}
