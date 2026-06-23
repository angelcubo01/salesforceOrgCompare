import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { getApexTestsTraceDebugLevel } from '../../shared/extensionSettings.js';
import { handleToolResponseFailure } from '../../shared/reportToolError.js';

const SEARCH_DEBOUNCE_MS = 280;
const MIN_SUGGEST_LEN = 2;
const MAX_TRACE_WINDOW_MS = 24 * 60 * 60 * 1000;

let searchTimer = null;
let suggestGeneration = 0;
/** @type {{ id: string, name: string, username: string } | null} */
let selectedUser = null;

function els() {
  return {
    modal: document.getElementById('debugLogTraceModal'),
    userInput: document.getElementById('debugLogTraceUserInput'),
    userIdHidden: document.getElementById('debugLogTraceUserId'),
    suggestions: document.getElementById('debugLogTraceUserSuggestions'),
    levelSelect: document.getElementById('debugLogTraceLevelSelect'),
    startInput: document.getElementById('debugLogTraceStartInput'),
    endInput: document.getElementById('debugLogTraceEndInput'),
    submitBtn: document.getElementById('debugLogTraceSubmitBtn'),
    cancelBtn: document.getElementById('debugLogTraceCancelBtn'),
    openBtn: document.getElementById('debugLogBrowserAddTraceBtn')
  };
}

function toInputValue(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function setDefaultDates() {
  const { startInput, endInput } = els();
  if (!startInput || !endInput) return;
  const now = new Date();
  const end = new Date(now.getTime() + 30 * 60 * 1000);
  startInput.value = toInputValue(now);
  endInput.value = toInputValue(end);
}

function hideSuggestions() {
  const { suggestions } = els();
  if (!suggestions) return;
  suggestions.innerHTML = '';
  suggestions.hidden = true;
}

function clearSelectedUser() {
  selectedUser = null;
  const { userIdHidden } = els();
  if (userIdHidden) userIdHidden.value = '';
}

function formatUserLabel(item) {
  const name = String(item?.name || '').trim();
  const username = String(item?.username || '').trim();
  if (name && username) return `${name} (${username})`;
  return name || username || '';
}

function renderSuggestionsLoading() {
  const { suggestions } = els();
  if (!suggestions) return;
  suggestions.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'debug-log-trace-user-suggestion is-status';
  row.setAttribute('role', 'status');
  row.textContent = t('debugLogs.traceUserSearching');
  suggestions.appendChild(row);
  suggestions.hidden = false;
}

function renderSuggestionsList(items) {
  const { suggestions } = els();
  if (!suggestions) return;
  suggestions.innerHTML = '';
  if (!items?.length) {
    const empty = document.createElement('div');
    empty.className = 'debug-log-trace-user-suggestion is-status';
    empty.setAttribute('role', 'status');
    empty.textContent = t('debugLogs.traceUserEmpty');
    suggestions.appendChild(empty);
    suggestions.hidden = false;
    return;
  }
  for (const it of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'debug-log-trace-user-suggestion';
    btn.textContent = formatUserLabel(it);
    btn.addEventListener('mousedown', (ev) => ev.preventDefault());
    btn.addEventListener('click', () => pickUser(it));
    suggestions.appendChild(btn);
  }
  suggestions.hidden = false;
}

function pickUser(item) {
  const { userInput, userIdHidden } = els();
  selectedUser = {
    id: String(item?.id || '').replace(/[^a-zA-Z0-9]/g, ''),
    name: String(item?.name || '').trim(),
    username: String(item?.username || '').trim()
  };
  if (userInput) userInput.value = formatUserLabel(selectedUser);
  if (userIdHidden) userIdHidden.value = selectedUser.id;
  hideSuggestions();
}

async function runUserSearch() {
  const { userInput } = els();
  if (!userInput) return;
  if (!state.leftOrgId) {
    hideSuggestions();
    return;
  }
  const q = String(userInput.value || '').trim();
  if (q.length < MIN_SUGGEST_LEN) {
    hideSuggestions();
    return;
  }
  if (selectedUser && formatUserLabel(selectedUser) === q) {
    hideSuggestions();
    return;
  }
  clearSelectedUser();
  const gen = ++suggestGeneration;
  renderSuggestionsLoading();
  try {
    const res = await bg({
      type: 'debugLogs:searchUsers',
      orgId: state.leftOrgId,
      queryText: q
    });
    if (gen !== suggestGeneration) return;
    if (!res?.ok) {
      hideSuggestions();
      return;
    }
    renderSuggestionsList(Array.isArray(res.items) ? res.items : []);
  } catch {
    if (gen !== suggestGeneration) return;
    hideSuggestions();
  }
}

function scheduleUserSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void runUserSearch(), SEARCH_DEBOUNCE_MS);
}

async function loadDebugLevels() {
  const { levelSelect } = els();
  if (!levelSelect) return;
  levelSelect.innerHTML = '';
  const loadingOpt = document.createElement('option');
  loadingOpt.value = '';
  loadingOpt.textContent = t('debugLogs.traceLevelLoading');
  levelSelect.appendChild(loadingOpt);
  levelSelect.disabled = true;

  if (!state.leftOrgId) {
    loadingOpt.textContent = t('debugLogs.selectOrg');
    return;
  }

  try {
    const res = await bg({
      type: 'debugLogs:listDebugLevels',
      orgId: state.leftOrgId
    });
    levelSelect.innerHTML = '';
    if (!res?.ok || !Array.isArray(res.levels) || !res.levels.length) {
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = t('debugLogs.traceLevelsLoadError');
      levelSelect.appendChild(emptyOpt);
      return;
    }
    const preferred = getApexTestsTraceDebugLevel();
    let preferredFound = false;
    for (const lvl of res.levels) {
      const opt = document.createElement('option');
      opt.value = lvl.id;
      const label = lvl.label || lvl.developerName || lvl.id;
      opt.textContent = lvl.developerName ? `${label} (${lvl.developerName})` : label;
      if (lvl.developerName === preferred) {
        opt.selected = true;
        preferredFound = true;
      }
      levelSelect.appendChild(opt);
    }
    if (!preferredFound && levelSelect.options.length) {
      levelSelect.selectedIndex = 0;
    }
  } catch {
    levelSelect.innerHTML = '';
    const errOpt = document.createElement('option');
    errOpt.value = '';
    errOpt.textContent = t('debugLogs.traceLevelsLoadError');
    levelSelect.appendChild(errOpt);
  } finally {
    levelSelect.disabled = false;
  }
}

function closeModal() {
  const { modal } = els();
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  hideSuggestions();
  clearSelectedUser();
}

export function openDebugLogTraceModal() {
  if (!state.leftOrgId) {
    showToast(t('debugLogs.selectOrg'), 'warn');
    return;
  }
  const { modal, userInput, submitBtn } = els();
  if (!modal) return;
  if (userInput) userInput.value = '';
  clearSelectedUser();
  setDefaultDates();
  if (submitBtn) submitBtn.disabled = false;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  void loadDebugLevels();
  userInput?.focus();
}

/** @returns {string|null} mensaje de error i18n o null si válido */
export function validateTraceForm({ userId, debugLevelId, startIso, expirationIso }) {
  if (!userId) return t('debugLogs.traceUserRequired');
  if (!debugLevelId) return t('debugLogs.traceLevelRequired');
  if (!startIso || !expirationIso) return t('debugLogs.traceInvalidRange');
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(expirationIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return t('debugLogs.traceInvalidRange');
  }
  if (endMs - startMs > MAX_TRACE_WINDOW_MS) {
    return t('debugLogs.traceMaxWindow');
  }
  return null;
}

async function submitTrace() {
  const { userIdHidden, levelSelect, startInput, endInput, submitBtn } = els();
  const userId = String(userIdHidden?.value || selectedUser?.id || '').replace(/[^a-zA-Z0-9]/g, '');
  const debugLevelId = String(levelSelect?.value || '').replace(/[^a-zA-Z0-9]/g, '');
  const startIso = startInput?.value ? new Date(startInput.value).toISOString() : '';
  const expirationIso = endInput?.value ? new Date(endInput.value).toISOString() : '';

  const validationError = validateTraceForm({ userId, debugLevelId, startIso, expirationIso });
  if (validationError) {
    showToast(validationError, 'warn');
    return;
  }
  if (!state.leftOrgId) {
    showToast(t('debugLogs.selectOrg'), 'warn');
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  showToastWithSpinner(t('debugLogs.traceCreating'));
  try {
    const res = await bg({
      type: 'debugLogs:createTrace',
      orgId: state.leftOrgId,
      userId,
      debugLevelId,
      startIso,
      expirationIso
    });
    if (!res?.ok) {
      const msg =
        res?.reason === 'NO_SID'
          ? t('toast.noSession')
          : res?.error || t('debugLogs.traceError');
      void handleToolResponseFailure(res, { artifact_type: 'DebugLogs', phase: 'create_trace' });
      showToast(msg, 'error');
      return;
    }
    const userLabel = selectedUser ? formatUserLabel(selectedUser) : userId;
    showToast(t('debugLogs.traceSuccess', { user: userLabel }), 'info');
    closeModal();
  } catch {
    showToast(t('debugLogs.traceError'), 'error');
  } finally {
    dismissSpinnerToast();
    if (submitBtn) submitBtn.disabled = false;
  }
}

export function setupDebugLogTraceModal() {
  const { modal, userInput, openBtn, cancelBtn, submitBtn } = els();
  if (!modal) return;

  openBtn?.addEventListener('click', () => openDebugLogTraceModal());
  cancelBtn?.addEventListener('click', () => closeModal());
  submitBtn?.addEventListener('click', () => void submitTrace());

  modal.querySelector('[data-debug-log-trace-close="1"]')?.addEventListener('click', () => closeModal());

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (modal.classList.contains('hidden')) return;
    closeModal();
  });

  userInput?.addEventListener('input', () => {
    if (selectedUser && userInput.value !== formatUserLabel(selectedUser)) {
      clearSelectedUser();
    }
    scheduleUserSearch();
  });

  userInput?.addEventListener('blur', () => {
    setTimeout(() => hideSuggestions(), 150);
  });

  document.addEventListener('click', (e) => {
    const target = /** @type {Node | null} */ (e.target);
    if (!target || modal.classList.contains('hidden')) return;
    const wrap = modal.querySelector('.debug-log-trace-modal-user-wrap');
    if (wrap && !wrap.contains(target)) hideSuggestions();
  });
}
