import { bg } from '../core/bridge.js';
import { t, getCurrentLang } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { buildOrgPicklistLabel } from '../../shared/orgPrefs.js';
import { buildCompanyInfoUrl, buildTrustPageUrl, hasTrustAlert } from '../../shared/trustStatusApi.js';
import { handleToolError } from '../../shared/reportToolError.js';
import { buildSessionDetailRows } from '../../shared/sessionInfoApi.js';
import {
  canExpandSessionDetail,
  escapeHtml,
  renderSessionDetailGridHtml,
  toggleExpandedOrg
} from './environmentStatusPanelHelpers.js';

const COL_COUNT = 10;

/** @type {'all' | 'prod' | 'sandbox' | 'alerts'} */
let activeFilter = 'all';
/** @type {Record<string, unknown>[]} */
let lastRows = [];
let lastFetchedAt = '';
/** @type {Set<string>} */
let expandedOrgIds = new Set();
/** @type {Map<string, import('../../shared/sessionInfoApi.js').buildSessionDetailPayload extends (...args: any) => infer R ? R : never>} */
const sessionDetailCache = new Map();
/** @type {Set<string>} */
const sessionDetailLoading = new Set();

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

function sessionDetailLabels() {
  return {
    userId: t('envStatus.detailUserId'),
    username: t('envStatus.detailUsername'),
    name: t('envStatus.detailName'),
    orgId: t('envStatus.colOrgId'),
    orgName: t('envStatus.detailOrgName'),
    orgType: t('envStatus.colType'),
    isSandbox: t('envStatus.detailSandbox'),
    namespace: t('envStatus.detailNamespace'),
    timezone: t('envStatus.detailTimezone'),
    locale: t('envStatus.detailLocale'),
    instanceName: t('envStatus.colInstance'),
    instanceUrl: t('envStatus.detailInstanceUrl'),
    savedApi: t('envStatus.detailSavedApi'),
    liveApi: t('envStatus.detailLiveApi'),
    restEndpoint: t('envStatus.detailRestEndpoint'),
    userInfoEndpoint: t('envStatus.detailUserInfoEndpoint'),
    yes: t('envStatus.yes'),
    no: t('envStatus.no')
  };
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
 * @param {string} orgId
 * @param {string} instanceUrl
 * @param {import('../../shared/sessionInfoApi.js').buildSessionDetailPayload extends (...args: any) => infer R ? R : never | undefined} detail
 * @param {'loading' | 'error' | 'ready'} state
 * @param {string} [errorMessage]
 */
function buildDetailRowInner(orgId, instanceUrl, detail, state, errorMessage = '') {
  if (state === 'loading') {
    return `<p class="env-status-detail-loading">${escapeHtml(t('envStatus.sessionDetailLoading'))}</p>`;
  }
  if (state === 'error') {
    return `<p class="env-status-detail-error" role="alert">${escapeHtml(errorMessage || t('envStatus.sessionDetailError'))}</p>`;
  }
  const rows = buildSessionDetailRows(sessionDetailLabels(), detail);
  const grid = renderSessionDetailGridHtml(rows);
  return `
    <div class="env-status-detail-inner">
      <h3 class="env-status-detail-title">${escapeHtml(t('envStatus.sessionDetailTitle'))}</h3>
      ${grid}
      <div class="env-status-detail-actions">
        <button type="button" class="env-status-action-btn" data-open="${escapeHtml(instanceUrl)}">${escapeHtml(t('envStatus.openOrg'))}</button>
        <button type="button" class="env-status-action-btn" data-copy-org-id="${escapeHtml(orgId)}">${escapeHtml(t('envStatus.copyOrgId'))}</button>
        <button type="button" class="env-status-action-btn" data-clear-describe="${escapeHtml(orgId)}">${escapeHtml(t('envStatus.clearDescribeCache'))}</button>
      </div>
    </div>
  `;
}

/**
 * @param {string} orgId
 * @param {string} instanceUrl
 */
function createDetailRow(orgId, instanceUrl) {
  const tr = document.createElement('tr');
  tr.className = 'env-status-detail-row';
  tr.dataset.detailFor = orgId;
  const td = document.createElement('td');
  td.colSpan = COL_COUNT;
  td.className = 'env-status-detail-cell';
  const cached = sessionDetailCache.get(orgId);
  const loading = sessionDetailLoading.has(orgId);
  if (loading) {
    td.innerHTML = buildDetailRowInner(orgId, instanceUrl, undefined, 'loading');
  } else if (cached) {
    td.innerHTML = buildDetailRowInner(orgId, instanceUrl, cached, 'ready');
  } else {
    td.innerHTML = buildDetailRowInner(orgId, instanceUrl, undefined, 'loading');
  }
  tr.appendChild(td);
  return tr;
}

/**
 * @param {HTMLTableRowElement} detailTr
 * @param {string} orgId
 * @param {string} instanceUrl
 */
function refreshDetailRowContent(detailTr, orgId, instanceUrl) {
  const td = detailTr.querySelector('td');
  if (!td) return;
  const cached = sessionDetailCache.get(orgId);
  const loading = sessionDetailLoading.has(orgId);
  const err = detailTr.dataset.detailError || '';
  if (loading) {
    td.innerHTML = buildDetailRowInner(orgId, instanceUrl, undefined, 'loading');
  } else if (cached) {
    td.innerHTML = buildDetailRowInner(orgId, instanceUrl, cached, 'ready');
    wireDetailRowActions(td);
  } else if (err) {
    td.innerHTML = buildDetailRowInner(orgId, instanceUrl, undefined, 'error', err);
  }
}

/**
 * @param {ParentNode} root
 */
function wireDetailRowActions(root) {
  root.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-open');
      if (!url) return;
      void chrome.tabs.create({ url });
    });
  });
  root.querySelectorAll('[data-copy-org-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-copy-org-id');
      if (!id) return;
      try {
        await navigator.clipboard.writeText(id);
        showToast(t('envStatus.orgIdCopied'), 'success');
      } catch {
        showToast(t('envStatus.orgIdCopyFailed'), 'error');
      }
    });
  });
  root.querySelectorAll('[data-clear-describe]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-clear-describe');
      if (!id) return;
      void clearDescribeCache(id);
    });
  });
}

/**
 * @param {string} orgId
 */
async function clearDescribeCache(orgId) {
  try {
    const res = await bg({ type: 'environmentStatus:clearDescribeCache', orgId });
    if (!res?.ok) throw new Error(res?.error || 'Failed');
    showToast(t('envStatus.describeCacheCleared'), 'success');
  } catch (e) {
    showToast(String(e?.message || e), 'error');
  }
}

/**
 * @param {string} orgId
 * @param {string} instanceUrl
 * @param {HTMLTableRowElement} detailTr
 */
async function loadSessionDetail(orgId, instanceUrl, detailTr) {
  if (sessionDetailCache.has(orgId) || sessionDetailLoading.has(orgId)) return;
  sessionDetailLoading.add(orgId);
  refreshDetailRowContent(detailTr, orgId, instanceUrl);
  try {
    const res = await bg({ type: 'environmentStatus:getSessionDetail', orgId });
    if (!res?.ok) {
      const msg =
        res?.reason === 'NO_SID' ? t('envStatus.sessionExpired') : res?.error || t('envStatus.sessionDetailError');
      detailTr.dataset.detailError = msg;
      throw new Error(msg);
    }
    sessionDetailCache.set(orgId, res.detail);
    delete detailTr.dataset.detailError;
  } catch (e) {
    if (!detailTr.dataset.detailError) {
      detailTr.dataset.detailError = String(e?.message || e);
    }
    void handleToolError(e, { artifact_type: 'EnvironmentStatus', phase: 'session_detail', org_id: orgId });
  } finally {
    sessionDetailLoading.delete(orgId);
    refreshDetailRowContent(detailTr, orgId, instanceUrl);
  }
}

/**
 * @param {string} orgId
 * @param {HTMLTableRowElement} mainTr
 * @param {string} instanceUrl
 */
async function toggleRowExpand(orgId, mainTr, instanceUrl) {
  expandedOrgIds = toggleExpandedOrg(orgId, expandedOrgIds);
  const expanded = expandedOrgIds.has(orgId);
  const expandBtn = mainTr.querySelector('[data-env-expand]');
  if (expandBtn) {
    expandBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    expandBtn.classList.toggle('env-status-expand-open', expanded);
  }
  const existing = mainTr.nextElementSibling;
  if (existing?.classList?.contains('env-status-detail-row') && existing.dataset.detailFor === orgId) {
    existing.remove();
  }
  if (!expanded) return;
  const detailTr = createDetailRow(orgId, instanceUrl);
  mainTr.insertAdjacentElement('afterend', detailTr);
  wireDetailRowActions(detailTr);
  if (!sessionDetailCache.has(orgId)) {
    await loadSessionDetail(orgId, instanceUrl, detailTr);
  } else {
    refreshDetailRowContent(detailTr, orgId, instanceUrl);
  }
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
  const orgId = String(row.orgId || sf?.id || saved.id || '');
  const instanceUrl = String(saved.instanceUrl || '');
  const auth = String(row.auth || '');
  const companyUrl = buildCompanyInfoUrl(instanceUrl);
  const trustUrl = buildTrustPageUrl(instanceKey);
  const isSandbox = isSandboxRow(row);
  const alert = rowHasAlert(row);
  const tr = document.createElement('tr');
  tr.dataset.orgId = orgId;
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

  const sessionActive = canExpandSessionDetail(auth);
  const sessionCell = sessionActive
    ? `<span class="env-status-auth env-status-auth-active">${escapeHtml(t('envStatus.sessionActive'))}</span>${
        sessionUser?.username || sessionUser?.name
          ? `<div class="env-status-session-user">${escapeHtml(sessionUser.name || sessionUser.username)}</div>`
          : ''
      }`
    : `<span class="env-status-auth env-status-auth-expired">${escapeHtml(t('envStatus.sessionExpired'))}</span>`;

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
  const isExpanded = expandedOrgIds.has(orgId);
  const expandBtn = sessionActive
    ? `<button type="button" class="env-status-expand-btn${isExpanded ? ' env-status-expand-open' : ''}" data-env-expand="${escapeHtml(orgId)}" aria-expanded="${isExpanded ? 'true' : 'false'}" aria-label="${escapeHtml(t('envStatus.expandSession'))}" title="${escapeHtml(t('envStatus.expandSession'))}"><span class="env-status-expand-chevron" aria-hidden="true"></span><span class="env-status-expand-label">${escapeHtml(t('envStatus.expandSession'))}</span></button>`
    : `<button type="button" class="env-status-expand-btn env-status-expand-disabled" disabled title="${escapeHtml(t('envStatus.sessionExpired'))}"><span class="env-status-expand-chevron" aria-hidden="true"></span></button>`;

  const envCell = `<div class="env-status-env-cell">${expandBtn}<div class="env-status-env-text">${escapeHtml(envName)}${
    sfName && sfName !== envName ? `<div class="env-status-sub">${escapeHtml(sfName)}</div>` : ''
  }<div class="env-status-sub"><a href="${escapeHtml(instanceUrl)}" target="_blank" rel="noopener noreferrer" class="env-status-link">${escapeHtml(safeHost(instanceUrl))}</a></div>${errorHtml}</div></div>`;

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
    const saved = /** @type {Record<string, unknown>} */ (row.saved || {});
    const orgId = String(row.orgId || saved.id || '');
    const instanceUrl = String(saved.instanceUrl || '');
    const mainTr = renderRow(row, aliases, groups);
    tbody.appendChild(mainTr);
    if (expandedOrgIds.has(orgId) && canExpandSessionDetail(String(row.auth || ''))) {
      const detailTr = createDetailRow(orgId, instanceUrl);
      tbody.appendChild(detailTr);
      wireDetailRowActions(detailTr);
      if (!sessionDetailCache.has(orgId) && !sessionDetailLoading.has(orgId)) {
        void loadSessionDetail(orgId, instanceUrl, detailTr);
      }
    }
  }

  tbody.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-open');
      if (!url) return;
      void chrome.tabs.create({ url });
    });
  });

  tbody.querySelectorAll('[data-env-expand]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-env-expand');
      if (!id) return;
      const mainTr = btn.closest('tr');
      if (!mainTr) return;
      const row = lastRows.find((r) => String(r.orgId || /** @type {Record<string, unknown>} */ (r.saved || {}).id) === id);
      const saved = row ? /** @type {Record<string, unknown>} */ (row.saved || {}) : {};
      const instanceUrl = String(saved.instanceUrl || '');
      void toggleRowExpand(id, mainTr, instanceUrl);
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
