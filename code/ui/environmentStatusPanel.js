import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t, getCurrentLang } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { buildOrgPicklistLabel } from '../../shared/orgPrefs.js';
import { buildCompanyInfoUrl, buildTrustPageUrl, hasTrustAlert } from '../../shared/trustStatusApi.js';
import { handleToolError } from '../../shared/reportToolError.js';

/** @type {'all' | 'prod' | 'sandbox' | 'alerts'} */
let activeFilter = 'all';
/** @type {Record<string, unknown>[]} */
let lastRows = [];
let lastFetchedAt = '';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
    minute: '2-digit'
  });
}

function safeHost(instanceUrl) {
  try {
    return new URL(String(instanceUrl)).hostname;
  } catch {
    return '—';
  }
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, string>} aliases
 * @param {Record<string, string>} groups
 */
function getEnvLabel(row, aliases, groups) {
  const saved = /** @type {Record<string, unknown>} */ (row.saved || {});
  const org = {
    id: saved.id,
    displayName: saved.displayName,
    label: saved.label,
    instanceUrl: saved.instanceUrl
  };
  return buildOrgPicklistLabel(org, { aliases, groups });
}

/**
 * @param {Record<string, unknown>} row
 */
function isSandboxRow(row) {
  const sf = /** @type {Record<string, unknown> | null} */ (row.sf);
  const saved = /** @type {Record<string, unknown>} */ (row.saved || {});
  if (sf && typeof sf.isSandbox === 'boolean') return sf.isSandbox;
  return !!saved.isSandbox;
}

/**
 * @param {Record<string, unknown>} row
 */
function isConnectedRow(row) {
  return row.auth === 'active';
}

/**
 * @param {Record<string, unknown>} row
 */
function rowHasAlert(row) {
  if ((row.errors || []).length > 0) return true;
  const instanceKey = String(row.instanceKey || '');
  const trust = /** @type {Record<string, unknown> | null} */ (row.trust);
  return hasTrustAlert(instanceKey, trust);
}

/**
 * @param {Record<string, unknown>} row
 */
function filterRow(row) {
  if (!isConnectedRow(row)) return false;
  if (activeFilter === 'prod' && isSandboxRow(row)) return false;
  if (activeFilter === 'sandbox' && !isSandboxRow(row)) return false;
  if (activeFilter === 'alerts' && !rowHasAlert(row)) return false;
  return true;
}

function syncFilterButtons() {
  document.querySelectorAll('[data-env-status-filter]').forEach((btn) => {
    const val = btn.getAttribute('data-env-status-filter');
    btn.classList.toggle('env-status-filter-active', val === activeFilter);
    btn.setAttribute('aria-pressed', val === activeFilter ? 'true' : 'false');
  });
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, string>} aliases
 * @param {Record<string, string>} groups
 */
function renderRow(row, aliases, groups) {
  const saved = /** @type {Record<string, unknown>} */ (row.saved || {});
  const sf = /** @type {Record<string, unknown> | null} */ (row.sf);
  const trust = /** @type {Record<string, unknown> | null} */ (row.trust);
  const sessionUser = /** @type {Record<string, string> | null} */ (row.sessionUser);
  const instanceKey = String(row.instanceKey || '');
  const orgId = String(sf?.id || saved.id || '');
  const instanceUrl = String(saved.instanceUrl || '');
  const companyUrl = buildCompanyInfoUrl(instanceUrl);
  const trustUrl = buildTrustPageUrl(instanceKey);
  const isSandbox = isSandboxRow(row);
  const alert = rowHasAlert(row);
  const tr = document.createElement('tr');
  if (alert) tr.classList.add('env-status-row-alert');

  const typeBadge = isSandbox
    ? `<span class="env-status-badge env-status-badge-sandbox">${escapeHtml(t('envStatus.badgeSandbox'))}</span>`
    : `<span class="env-status-badge env-status-badge-prod">${escapeHtml(t('envStatus.badgeProd'))}</span>`;
  const orgType = sf?.organizationType ? `<span class="env-status-org-type">${escapeHtml(String(sf.organizationType))}</span>` : '';

  const liveApi = row.liveApiVersion ? String(row.liveApiVersion) : '—';
  const apiCell = escapeHtml(liveApi);

  const trustStatus = trust?.status ? String(trust.status) : '—';
  const incidentCount = Number(row.incidentCount || 0);
  let trustCell = escapeHtml(trustStatus);
  if (incidentCount > 0) {
    trustCell += ` <span class="env-status-incident-chip">${escapeHtml(t('envStatus.incidents', { count: incidentCount }))}</span>`;
  }
  if (instanceKey) {
    trustCell = `<a href="${escapeHtml(trustUrl)}" target="_blank" rel="noopener noreferrer" class="env-status-link">${trustCell}</a>`;
  }

  const nextMaint = row.nextMaintenance
    ? formatDateTime(/** @type {Record<string, string>} */ (row.nextMaintenance).plannedStartTime)
    : '—';

  const sessionCell = `<span class="env-status-auth env-status-auth-active">${escapeHtml(t('envStatus.sessionActive'))}</span>${
    sessionUser?.username || sessionUser?.name
      ? `<div class="env-status-session-user">${escapeHtml(sessionUser.name || sessionUser.username)}</div>`
      : ''
  }`;

  const errors = /** @type {string[]} */ (row.errors || []);
  const errorHtml =
    errors.length > 0
      ? `<div class="env-status-errors">${errors.map((e) => escapeHtml(e)).join('<br>')}${
          instanceKey
            ? ` <a href="${escapeHtml(trustUrl)}" target="_blank" rel="noopener noreferrer" class="env-status-link">${escapeHtml(t('envStatus.viewTrust'))}</a>`
            : ''
        }</div>`
      : '';

  const releaseVersion = trust?.releaseVersion ? String(trust.releaseVersion) : '—';
  const instanceCell = instanceKey
    ? `<a href="${escapeHtml(trustUrl)}" target="_blank" rel="noopener noreferrer" class="env-status-link">${escapeHtml(instanceKey)}</a>`
    : '—';

  const orgIdCell = orgId
    ? `<a href="${escapeHtml(companyUrl)}" target="_blank" rel="noopener noreferrer" class="env-status-link env-status-mono">${escapeHtml(orgId)}</a>`
    : '—';

  const envName = getEnvLabel(row, aliases, groups);
  const sfName = sf?.name ? String(sf.name) : saved.displayName ? String(saved.displayName) : '';
  const envCell = `${escapeHtml(envName)}${
    sfName && sfName !== envName ? `<div class="env-status-sub">${escapeHtml(sfName)}</div>` : ''
  }<div class="env-status-sub"><a href="${escapeHtml(instanceUrl)}" target="_blank" rel="noopener noreferrer" class="env-status-link">${escapeHtml(safeHost(instanceUrl))}</a></div>${errorHtml}`;

  tr.innerHTML = `
    <td>${envCell}</td>
    <td>${typeBadge}${orgType}</td>
    <td>${orgIdCell}</td>
    <td>${instanceCell}</td>
    <td>${escapeHtml(releaseVersion)}</td>
    <td>${apiCell}</td>
    <td>${trustCell}</td>
    <td>${escapeHtml(nextMaint)}</td>
    <td>${sessionCell}</td>
    <td class="env-status-actions">
      <button type="button" class="env-status-action-btn" data-open="${escapeHtml(instanceUrl)}">${escapeHtml(t('envStatus.openOrg'))}</button>
    </td>
  `;
  return tr;
}

async function renderTable() {
  const tbody = document.getElementById('environmentStatusTbody');
  const empty = document.getElementById('environmentStatusEmpty');
  const updated = document.getElementById('environmentStatusUpdated');
  if (!tbody) return;

  const extras = await chrome.storage.sync.get(['orgAliases', 'orgGroups']);
  const aliases = extras.orgAliases || {};
  const groups = extras.orgGroups || {};

  const filtered = lastRows.filter(filterRow);
  tbody.innerHTML = '';

  if (updated && lastFetchedAt) {
    updated.textContent = t('envStatus.lastUpdated', { when: formatDateTime(lastFetchedAt) });
  }

  if (!filtered.length) {
    if (empty) {
      empty.hidden = false;
      const connectedCount = lastRows.filter(isConnectedRow).length;
      empty.textContent =
        lastRows.length === 0
          ? t('envStatus.emptyNoOrgs')
          : connectedCount === 0
            ? t('envStatus.emptyNoConnected')
            : t('envStatus.emptyFilter');
    }
    return;
  }

  if (empty) empty.hidden = true;
  for (const row of filtered) {
    tbody.appendChild(renderRow(row, aliases, groups));
  }

  tbody.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-open');
      if (!url) return;
      void chrome.tabs.create({ url });
    });
  });
}

async function runLoad() {
  if (getSelectedArtifactType() !== 'EnvironmentStatus') return;
  const status = document.getElementById('environmentStatusStatus');
  showToastWithSpinner(t('envStatus.loading'));
  if (status) status.textContent = t('envStatus.loading');
  try {
    const res = await bg({ type: 'environmentStatus:getAll' });
    if (!res?.ok) throw new Error(res?.error || 'Fetch failed');
    lastRows = Array.isArray(res.rows) ? res.rows : [];
    lastFetchedAt = String(res.fetchedAt || new Date().toISOString());
    await renderTable();
    if (status) status.textContent = '';
  } catch (e) {
    void handleToolError(e, { artifact_type: 'EnvironmentStatus', phase: 'fetch' });
    if (status) status.textContent = t('envStatus.fetchError');
    showToast(String(e?.message || e), 'error');
  } finally {
    dismissSpinnerToast();
  }
}

export async function refreshEnvironmentStatusPanel() {
  if (getSelectedArtifactType() !== 'EnvironmentStatus') return;
  const status = document.getElementById('environmentStatusStatus');
  if (!lastRows.length) {
    if (status) status.textContent = '';
    void runLoad();
    return;
  }
  if (status) status.textContent = '';
}

export function setupEnvironmentStatusPanel() {
  const refreshBtn = document.getElementById('environmentStatusRefreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', () => void runLoad());

  document.querySelectorAll('[data-env-status-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = btn.getAttribute('data-env-status-filter');
      if (val === 'all' || val === 'prod' || val === 'sandbox' || val === 'alerts') {
        activeFilter = val;
        syncFilterButtons();
        void renderTable();
      }
    });
  });
  syncFilterButtons();
}

export async function reloadEnvironmentStatusIfActive() {
  if (getSelectedArtifactType() !== 'EnvironmentStatus') return;
  void runLoad();
}
