import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t, getCurrentLang } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';

let lastRows = [];
let currentPage = 1;
let lastLoadSignature = '';

function getFilterElements() {
  return {
    status: document.getElementById('setupAuditStatus'),
    user: document.getElementById('setupAuditUserFilter'),
    section: document.getElementById('setupAuditSectionFilter'),
    action: document.getElementById('setupAuditActionFilter'),
    text: document.getElementById('setupAuditTextFilter'),
    since: document.getElementById('setupAuditSince'),
    until: document.getElementById('setupAuditUntil'),
    pageSize: document.getElementById('setupAuditPageSize'),
    prevPage: document.getElementById('setupAuditPrevPage'),
    nextPage: document.getElementById('setupAuditNextPage'),
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
  const { user, section, action, text } = getFilterElements();
  const userValue = String(user?.value || '').trim();
  const sectionNeedle = normalizeLower(section?.value);
  const actionNeedle = normalizeLower(action?.value);
  const textNeedle = normalizeLower(text?.value);
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
    users.push({ key, label });
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
    opt.textContent = entry.label;
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
  const { pageSize, prevPage, nextPage, pageLabel } = getFilterElements();
  const perPage = Math.max(1, Number(pageSize?.value || 25));
  const totalPages = Math.max(1, Math.ceil(totalFilteredRows / perPage));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  if (prevPage) prevPage.disabled = currentPage <= 1;
  if (nextPage) nextPage.disabled = currentPage >= totalPages;
  if (pageLabel) {
    pageLabel.textContent = t('setupAudit.pageLabel', {
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

async function loadAuditTrail() {
  const { status, since, until } = getFilterElements();
  if (!state.leftOrgId) {
    if (status) status.textContent = t('setupAudit.selectOrg');
    return;
  }
  const sinceIso = since?.value ? new Date(since.value).toISOString() : '';
  const untilIso = until?.value ? new Date(until.value).toISOString() : '';
  if (!sinceIso || !untilIso || new Date(sinceIso).getTime() > new Date(untilIso).getTime()) {
    if (status) status.textContent = t('setupAudit.invalidRange');
    return;
  }
  if (status) status.textContent = t('setupAudit.loading');
  showToastWithSpinner(t('setupAudit.loading'));
  try {
    const res = await bg({
      type: 'setupAuditTrail:list',
      orgId: state.leftOrgId,
      sinceIso,
      untilIso
    });
    if (!res?.ok) {
      const msg = res?.reason === 'NO_SID' ? t('toast.noSession') : res?.error || t('setupAudit.loadError');
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
  ensureDefaultDateRange();
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
  const { user, section, action, text, since, until, pageSize, prevPage, nextPage } = getFilterElements();
  if (user)
    user.addEventListener('change', () => {
      currentPage = 1;
      renderRows();
    });
  if (section)
    section.addEventListener('change', () => {
      if (action) action.value = '';
      populateActionOptions(lastRows);
      currentPage = 1;
      renderRows();
    });
  if (action)
    action.addEventListener('change', () => {
      currentPage = 1;
      renderRows();
    });
  if (text)
    text.addEventListener('input', () => {
      currentPage = 1;
      renderRows();
    });
  const triggerReload = () => {
    lastLoadSignature = '';
    void refreshSetupAuditTrailPanel();
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
  ensureDefaultDateRange();
}
