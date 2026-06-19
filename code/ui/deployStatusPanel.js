import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t, getCurrentLang } from '../../shared/i18n.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { renderDonutChart } from '../lib/orgLimitsCharts.js';
import { buildSetupDeployDetailsUrl, isDeployInProgress, collectSlowTests, DEPLOY_SLOW_TEST_THRESHOLD_MS, hasCoverageFailureInRow, hasCoverageFailureInSoap } from '../../shared/deployStatusApi.js';
import { handleToolError } from '../../shared/reportToolError.js';
import { getReturnContext, returnToQuickEditEditor } from '../lib/quickEditDeployContext.js';

const POLL_ACTIVE_MS = 3000;
const POLL_IDLE_MS = 15000;
const PAGE_SIZE = 10;
const DONUT_SIZE = 176;
const ACTIVE_DONUT_SIZE = 152;

const COLOR_SUCCESS = '#22c55e';
const COLOR_PROGRESS = '#0176d3';
const COLOR_ERROR = '#ef4444';
const COLOR_NEUTRAL = '#64748b';

/** @type {ReturnType<typeof setTimeout> | null} */
let pollTimeout = null;
let lastFetchedAt = 0;
let selectedAsyncId = '';
let failedPage = 0;
let succeededPage = 0;
/** @type {'summary' | 'detail'} */
let viewMode = 'summary';
let componentSearchQuery = '';
let cancelInFlight = false;
let summaryBootstrapped = false;
let lastDeployPanelOrgId = '';
/** @type {Map<string, { coverageWarningCount: number }>} */
const deployRowHintById = new Map();
/** @type {Record<string, unknown> | null} */
let lastPollData = null;

function setPanelLoading(loading) {
  document.getElementById('deployStatusLoading')?.classList.toggle('hidden', !loading);
}

function resolveDeployStatus(row, soap = {}) {
  const rowStatus = String(row?.status || '').trim();
  const soapStatus = String(soap?.status || '').trim();
  const inProgress = isDeployInProgress(rowStatus) || isDeployInProgress(soapStatus);
  if (inProgress) return soapStatus || rowStatus;
  if (rowStatus) return rowStatus;
  return soapStatus;
}

function isSoapDetailReady(soap) {
  return !!(soap && (soap.status || typeof soap.done === 'boolean'));
}

function coalesceDetailSoap(row, soap) {
  if (isSoapDetailReady(soap)) return soap;
  const status = String(row?.status || '');
  return {
    status,
    success: status === 'Succeeded',
    done: ['Succeeded', 'Failed', 'Canceled'].includes(status),
    numberComponentsDeployed: row?.componentsDeployed ?? 0,
    numberComponentsTotal: row?.componentsTotal ?? 0,
    numberComponentErrors: row?.componentErrors ?? 0,
    numberTestsCompleted: row?.testsCompleted ?? 0,
    numberTestsTotal: row?.testsTotal ?? 0,
    numberTestErrors: row?.testErrors ?? 0,
    componentFailures: [],
    componentSuccesses: [],
    runTestResult: null
  };
}

function getStatusTitle(row, soap) {
  const checkOnly = !!row?.checkOnly;
  const status = resolveDeployStatus(row, soap);
  if (status === 'Succeeded') {
    return checkOnly ? t('deployStatus.titleValidationSucceeded') : t('deployStatus.titleDeploymentSucceeded');
  }
  if (status === 'Failed') {
    return checkOnly ? t('deployStatus.titleValidationFailed') : t('deployStatus.titleDeploymentFailed');
  }
  if (isDeployInProgress(status)) {
    return checkOnly ? t('deployStatus.titleValidationInProgress') : t('deployStatus.titleDeploymentInProgress');
  }
  if (status === 'Canceled') return t('deployStatus.titleDeploymentCanceled');
  const prefix = checkOnly ? 'Validate' : 'Deploy';
  return `${prefix}: ${status || '—'}`;
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} [soap]
 */
function resolveDeployVisualState(row, soap = {}) {
  const checkOnly = !!row?.checkOnly;
  const status = resolveDeployStatus(row, soap);
  const mode = checkOnly ? 'validate' : 'deploy';

  let outcome = 'unknown';
  if (status === 'Succeeded') outcome = 'succeeded';
  else if (status === 'Failed') outcome = 'failed';
  else if (status === 'Canceled') outcome = 'canceled';
  else if (status === 'Pending') outcome = 'pending';
  else if (status === 'InProgress' || isDeployInProgress(status)) outcome = 'progress';

  return { mode, outcome };
}

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

function formatBytes(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 0) return '—';
  return `${num.toLocaleString(getCurrentLang() === 'en' ? 'en-GB' : 'es-ES')} bytes`;
}

function formatElapsed(startDate, endDate) {
  if (!startDate) return '—';
  const start = new Date(startDate).getTime();
  const end = endDate ? new Date(endDate).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '—';
  const sec = Math.max(0, Math.floor((end - start) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function getBadgeIconChar(outcome) {
  if (outcome === 'succeeded') return '✓';
  if (outcome === 'failed') return '✕';
  if (outcome === 'progress') return '◔';
  if (outcome === 'pending') return '…';
  return '−';
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} [soap]
 */
function buildStatusLabelText(row, soap = {}) {
  const { mode, outcome } = resolveDeployVisualState(row, soap);
  const keys = {
    deploy: {
      failed: 'deployStatus.statusDeployFailed',
      succeeded: 'deployStatus.statusDeploySucceeded',
      progress: 'deployStatus.statusDeployInProgress',
      pending: 'deployStatus.statusDeployPending',
      canceled: 'deployStatus.statusDeployCanceled',
      unknown: 'deployStatus.statusDeployUnknown'
    },
    validate: {
      failed: 'deployStatus.statusValidateFailed',
      succeeded: 'deployStatus.statusValidateSucceeded',
      progress: 'deployStatus.statusValidateInProgress',
      pending: 'deployStatus.statusValidatePending',
      canceled: 'deployStatus.statusValidateCanceled',
      unknown: 'deployStatus.statusValidateUnknown'
    }
  };
  const key = keys[mode]?.[outcome] || keys.deploy.unknown;
  return t(key);
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} [soap]
 * @param {{ useLongTitle?: boolean }} [opts]
 */
function buildStatusBadgeHtml(row, soap = {}, opts = {}) {
  const { mode, outcome } = resolveDeployVisualState(row, soap);
  const text = opts.useLongTitle ? getStatusTitle(row, soap) : buildStatusLabelText(row, soap);
  const icon = getBadgeIconChar(outcome);
  return `<span class="deploy-status-badge" role="status">
    <span class="deploy-status-badge-icon is-${escapeHtml(mode)} is-${escapeHtml(outcome)}" aria-hidden="true">${icon}</span>
    <span class="deploy-status-badge-text">${escapeHtml(text)}</span>
  </span>`;
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} [soap]
 */
function hasDeployFailure(row, soap = {}) {
  const status = resolveDeployStatus(row, soap);
  const compErrors = Number(soap.numberComponentErrors ?? row?.componentErrors) || 0;
  const testErrors = Number(soap.numberTestErrors ?? row?.testErrors) || 0;
  const componentFailures = soap.componentFailures?.length || 0;
  const testFailures = soap.runTestResult?.failures?.length || 0;
  const coverageWarnings = soap.runTestResult?.codeCoverageWarnings?.length || 0;

  return (
    status === 'Failed' ||
    compErrors > 0 ||
    testErrors > 0 ||
    componentFailures > 0 ||
    testFailures > 0 ||
    coverageWarnings > 0
  );
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} [soap]
 */
function getDonutColor(row, soap = {}) {
  if (hasDeployFailure(row, soap)) return COLOR_ERROR;

  const status = resolveDeployStatus(row, soap);
  const inProgress = isDeployInProgress(status);
  const done = soap.done || ['Succeeded', 'Failed', 'Canceled'].includes(status);

  if (done && status === 'Succeeded') return COLOR_SUCCESS;
  if (inProgress) return COLOR_PROGRESS;
  return COLOR_NEUTRAL;
}

function renderProgressDonut(slotEl, labelEl, processed, total, color, size = DONUT_SIZE) {
  if (!slotEl || !labelEl) return;
  const proc = Math.max(0, Number(processed) || 0);
  const tot = Math.max(0, Number(total) || 0);
  labelEl.classList.remove('is-muted');
  if (tot <= 0) {
    slotEl.innerHTML = '';
    labelEl.textContent = '—';
    labelEl.classList.remove('is-fraction');
    return;
  }
  const pct = Math.min(1, proc / tot);
  renderDonutChart(slotEl, pct, color, size);
  labelEl.textContent = `${proc}/${tot}`;
  labelEl.classList.add('is-fraction');
}

function renderTestsDonut(slotEl, labelEl, row, soap, size = DONUT_SIZE) {
  const testsTotal = Number(soap?.numberTestsTotal ?? row?.testsTotal) || 0;
  const testsCompleted = Number(soap?.numberTestsCompleted ?? row?.testsCompleted) || 0;
  const runTests = row?.runTestsEnabled || testsTotal > 0;

  if (!runTests && testsTotal === 0) {
    slotEl.innerHTML = '';
    labelEl.textContent = t('deployStatus.testsNotRequired');
    labelEl.classList.add('is-muted');
    labelEl.classList.remove('is-fraction');
    return;
  }

  labelEl.classList.remove('is-muted');
  const color = getDonutColor(row, soap);
  renderProgressDonut(slotEl, labelEl, testsCompleted, testsTotal, color, size);
}

function clearDeployRowHintCache() {
  deployRowHintById.clear();
}

function mergeFailedCoverageHints(hints) {
  if (!hints || typeof hints !== 'object') return;
  for (const [asyncId, hint] of Object.entries(hints)) {
    if (!asyncId || !hint || typeof hint !== 'object') continue;
    const count = Number(hint.coverageWarningCount) || 0;
    if (count <= 0) continue;
    deployRowHintById.set(String(asyncId), { coverageWarningCount: count });
  }
}

function cacheDeployRowHintsFromSoap(asyncId, soap) {
  const id = String(asyncId || '').trim();
  if (!id || !soap) return;

  const coverageWarningCount = soap.runTestResult?.codeCoverageWarnings?.length || 0;
  const coverageFailure = hasCoverageFailureInSoap(soap);
  if (coverageWarningCount <= 0 && !coverageFailure) return;

  deployRowHintById.set(id, {
    coverageWarningCount: coverageWarningCount || 1
  });
}

function getDeployRowHints(asyncId) {
  return deployRowHintById.get(String(asyncId || '')) || null;
}

function getCachedSoapForRow(row) {
  const id = String(row?.asyncId || '');
  if (!id || !lastPollData) return null;
  if (lastPollData.active?.asyncId === id && lastPollData.activeSoap) return lastPollData.activeSoap;
  if (lastPollData.detail?.row?.asyncId === id && lastPollData.detail?.soap) return lastPollData.detail.soap;
  return null;
}

function isCoverageFailure(row, soap) {
  return hasCoverageFailureInSoap(soap) || hasCoverageFailureInRow(row);
}

function buildErrorsSummary(row) {
  const soap = getCachedSoapForRow(row);
  const hints = getDeployRowHints(row?.asyncId);
  const compErr = Number(row?.componentErrors) || 0;
  const testErr = Number(row?.testErrors) || 0;
  const parts = [];
  if (compErr > 0) {
    parts.push(compErr === 1 ? t('deployStatus.oneError') : t('deployStatus.nErrors', { count: compErr }));
  }
  if (testErr > 0) {
    parts.push(
      testErr === 1 ? t('deployStatus.oneTestFailure') : t('deployStatus.nTestFailures', { count: testErr })
    );
  }

  const coverageCount =
    soap?.runTestResult?.codeCoverageWarnings?.length || hints?.coverageWarningCount || 0;
  if (coverageCount > 0) {
    parts.push(
      coverageCount === 1
        ? t('deployStatus.oneCoverageFailure')
        : t('deployStatus.nCoverageFailures', { count: coverageCount })
    );
  } else if (isCoverageFailure(row, soap)) {
    parts.push(t('deployStatus.coverageFailure'));
  }

  return parts.join(', ') || '—';
}

function applyViewMode() {
  const panel = document.getElementById('deployStatusPanel');
  panel?.classList.toggle('deploy-status-is-detail', viewMode === 'detail');
  document.getElementById('deployStatusSummaryView')?.classList.toggle('hidden', viewMode === 'detail');
  document.getElementById('deployStatusDetailView')?.classList.toggle('hidden', viewMode !== 'detail');
  syncDeployDetailBackButton();
}

function emptySummaryPollData() {
  return {
    active: null,
    failedHistory: { records: [], totalCount: 0, page: 0, pageSize: PAGE_SIZE },
    succeededHistory: { records: [], totalCount: 0, page: 0, pageSize: PAGE_SIZE }
  };
}

function resetDeployStatusPanelToHome() {
  stopDeployStatusPolling();
  viewMode = 'summary';
  selectedAsyncId = '';
  failedPage = 0;
  succeededPage = 0;
  componentSearchQuery = '';
  lastPollData = null;
  summaryBootstrapped = false;
  clearDeployRowHintCache();
  applyViewMode();
  showPanelError('');
  const searchInput = /** @type {HTMLInputElement | null} */ (document.getElementById('deployStatusComponentsSearch'));
  if (searchInput) searchInput.value = '';
  renderSummaryView(emptySummaryPollData());
  [
    'deployStatusFailuresSection',
    'deployStatusTestFailuresSection',
    'deployStatusCoverageWarningsSection',
    'deployStatusSlowTestsSection',
    'deployStatusComponentsSection'
  ].forEach((id) => document.getElementById(id)?.classList.add('hidden'));
  document.getElementById('deployStatusGlobalError')?.classList.add('hidden');
  setPanelLoading(false);
}

function syncDeployDetailBackButton() {
  const backBtn = document.getElementById('deployStatusBackBtn');
  const editorBtn = document.getElementById('deployStatusBackToEditorBtn');
  const ctx = getReturnContext();
  if (editorBtn) editorBtn.hidden = true;
  if (!backBtn) return;
  if (ctx && viewMode === 'detail') {
    const labelKey =
      ctx.tool === 'LightningQuickEdit'
        ? 'deployStatus.backToLightningEditor'
        : 'deployStatus.backToApexEditor';
    backBtn.textContent = `← ${t(labelKey)}`;
  } else {
    backBtn.textContent = t('deployStatus.backToSummary');
  }
}

function findRowByAsyncId(data, asyncId) {
  const id = String(asyncId || '');
  if (!id || !data) return null;
  if (data.active?.asyncId === id) return data.active;
  for (const bucket of [data.failedHistory, data.succeededHistory, data.pendingHistory]) {
    const hit = bucket?.records?.find((r) => r.asyncId === id);
    if (hit) return hit;
  }
  if (data.detail?.row?.asyncId === id) return data.detail.row;
  return null;
}

function showPanelError(message) {
  const el = document.getElementById('deployStatusPanelError');
  if (!el) return;
  if (!message) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.textContent = message;
  el.classList.remove('hidden');
}

function navigateToDetail(asyncId) {
  selectedAsyncId = asyncId || '';
  componentSearchQuery = '';
  const searchInput = /** @type {HTMLInputElement | null} */ (document.getElementById('deployStatusComponentsSearch'));
  if (searchInput) searchInput.value = '';
  viewMode = 'detail';
  applyViewMode();
  showPanelError('');

  const cached = lastPollData?.detail?.row?.asyncId === selectedAsyncId ? lastPollData.detail : null;
  const stub = cached?.row || findRowByAsyncId(lastPollData, selectedAsyncId);
  if (stub) {
    renderDetailView({
      detail: {
        row: stub,
        soap: cached?.soap && isSoapDetailReady(cached.soap) ? cached.soap : null
      }
    });
  }

  updateDeployStatusPollingState();
  void tickDeployStatus({ showLoading: true });
}

function navigateToSummary() {
  viewMode = 'summary';
  selectedAsyncId = '';
  applyViewMode();
  showPanelError('');
  if (lastPollData) renderSummaryView(lastPollData);
  updateDeployStatusPollingState();
  void tickDeployStatus();
}

function handleDeployDetailBack() {
  if (getReturnContext()) {
    void returnToQuickEditEditor();
    return;
  }
  navigateToSummary();
}

function openDeployDetail(asyncId) {
  navigateToDetail(asyncId);
}

/** Abre la vista detalle de un deploy (p. ej. desde Quick Edit). */
export function openDeployStatusDetail(asyncId) {
  openDeployDetail(asyncId);
}

function closeDeployDetail() {
  handleDeployDetailBack();
}

function buildMetaListHtml(row) {
  const modeLabel = row.checkOnly ? t('deployStatus.modeValidate') : t('deployStatus.modeDeploy');
  return `
    <ul class="deploy-status-meta-list">
      <li><span class="deploy-status-meta-label">${escapeHtml(t('deployStatus.metaName'))}</span> <span class="deploy-status-mono">${escapeHtml(row.asyncId)}</span></li>
      <li><span class="deploy-status-meta-label">${escapeHtml(t('deployStatus.metaType'))}</span> ${escapeHtml(row.type || 'API')}</li>
      <li><span class="deploy-status-meta-label">${escapeHtml(t('deployStatus.metaDeployedBy'))}</span> ${escapeHtml(row.createdByName || '—')}</li>
      <li><span class="deploy-status-meta-label">${escapeHtml(t('deployStatus.metaStart'))}</span> ${escapeHtml(formatDateTime(row.startDate))}</li>
      <li><span class="deploy-status-meta-label">${escapeHtml(t('deployStatus.metaEnd'))}</span> ${escapeHtml(formatDateTime(row.completedDate))}</li>
      <li><span class="deploy-status-meta-label">${escapeHtml(t('deployStatus.metaElapsed'))}</span> ${escapeHtml(formatElapsed(row.startDate, row.completedDate))}</li>
      <li><span class="deploy-status-meta-label">${escapeHtml(t('deployStatus.metaFiles'))}</span> ${escapeHtml(String(row.numberFiles || 0))}</li>
      <li><span class="deploy-status-meta-label">${escapeHtml(t('deployStatus.metaZipSize'))}</span> ${escapeHtml(formatBytes(row.zipSize))}</li>
      <li><span class="deploy-status-meta-label">${escapeHtml(t('deployStatus.metaMode'))}</span> ${escapeHtml(modeLabel)}</li>
      <li><span class="deploy-status-meta-label">${escapeHtml(t('deployStatus.metaTestLevel'))}</span> ${escapeHtml(row.testLevel || '—')}</li>
      <li><span class="deploy-status-meta-label">${escapeHtml(t('deployStatus.metaRollback'))}</span> ${escapeHtml(row.rollbackOnError ? t('deployStatus.yes') : t('deployStatus.no'))}</li>
    </ul>
  `;
}

function buildActiveChartsHtml() {
  return `
    <div class="deploy-status-pipeline deploy-status-active-charts" aria-label="${escapeHtml(t('deployStatus.progressLabel'))}">
      <div class="deploy-status-pipeline-step is-active">
        <div class="deploy-status-chart-header">
          <span class="deploy-status-chart-num">1</span>
          <span class="deploy-status-chart-title">${escapeHtml(t('deployStatus.chartComponents'))}</span>
        </div>
        <div class="deploy-status-chart-wrap deploy-status-chart-wrap--compact">
          <div id="deployStatusActiveComponentChart" class="deploy-status-chart-slot"></div>
          <div id="deployStatusActiveComponentLabel" class="deploy-status-chart-label"></div>
        </div>
      </div>
      <div class="deploy-status-pipeline-connector" aria-hidden="true"></div>
      <div class="deploy-status-pipeline-step">
        <div class="deploy-status-chart-header">
          <span class="deploy-status-chart-num">2</span>
          <span class="deploy-status-chart-title">${escapeHtml(t('deployStatus.chartTests'))}</span>
        </div>
        <div class="deploy-status-chart-wrap deploy-status-chart-wrap--compact">
          <div id="deployStatusActiveTestsChart" class="deploy-status-chart-slot"></div>
          <div id="deployStatusActiveTestsLabel" class="deploy-status-chart-label"></div>
        </div>
      </div>
    </div>
  `;
}

function renderDonutsForRow(row, soap, chartIds = {}, donutSize = DONUT_SIZE) {
  const viewSoap = coalesceDetailSoap(row, soap);
  const compDeployed = viewSoap.numberComponentsDeployed ?? row.componentsDeployed;
  const compTotal = viewSoap.numberComponentsTotal ?? row.componentsTotal;
  const donutColor = getDonutColor(row, viewSoap);

  renderProgressDonut(
    document.getElementById(chartIds.componentChart || 'deployStatusComponentChart'),
    document.getElementById(chartIds.componentLabel || 'deployStatusComponentLabel'),
    compDeployed,
    compTotal,
    donutColor,
    donutSize
  );
  renderTestsDonut(
    document.getElementById(chartIds.testsChart || 'deployStatusTestsChart'),
    document.getElementById(chartIds.testsLabel || 'deployStatusTestsLabel'),
    row,
    viewSoap,
    donutSize
  );
}

const ACTIVE_DEPLOY_CHART_IDS = {
  componentChart: 'deployStatusActiveComponentChart',
  componentLabel: 'deployStatusActiveComponentLabel',
  testsChart: 'deployStatusActiveTestsChart',
  testsLabel: 'deployStatusActiveTestsLabel'
};

function renderStackTraceCell(stackTrace) {
  if (!stackTrace) return '—';
  return `<details class="deploy-status-stack-details">
    <summary>${escapeHtml(t('deployStatus.viewStackTrace'))}</summary>
    <pre class="deploy-status-stack-pre">${escapeHtml(stackTrace)}</pre>
  </details>`;
}

/**
 * @param {{ records: Array<Record<string, unknown>>, totalCount: number, page: number, pageSize: number }} history
 * @param {'failed'|'succeeded'} bucket
 */
function renderHistoryTable(history, bucket) {
  const tbodyId = bucket === 'failed' ? 'deployStatusFailedTbody' : 'deployStatusSucceededTbody';
  const navId = bucket === 'failed' ? 'deployStatusFailedNav' : 'deployStatusSucceededNav';
  const tbody = document.getElementById(tbodyId);
  const nav = document.getElementById(navId);
  if (!tbody || !nav) return;

  tbody.innerHTML = '';
  const records = history?.records || [];
  if (!records.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="${bucket === 'failed' ? 5 : 4}" class="deploy-status-empty-row">${escapeHtml(t('deployStatus.historyEmpty'))}</td>`;
    tbody.appendChild(tr);
  } else {
    for (const row of records) {
      const tr = document.createElement('tr');
      tr.classList.toggle('deploy-status-row-selected', row.asyncId === selectedAsyncId);
      tr.dataset.asyncId = String(row.asyncId || '');
      const dateVal = row.completedDate || row.startDate;
      if (bucket === 'failed') {
        tr.innerHTML = `
          <td><button type="button" class="deploy-status-link-btn" data-view-deploy="${escapeHtml(row.asyncId)}">${escapeHtml(t('deployStatus.viewDetails'))}</button></td>
          <td class="deploy-status-mono">${escapeHtml(row.asyncId)}</td>
          <td>${buildStatusBadgeHtml(row)}</td>
          <td>${escapeHtml(buildErrorsSummary(row))}</td>
          <td>${escapeHtml(formatDateTime(dateVal))}</td>
        `;
      } else {
        tr.innerHTML = `
          <td><button type="button" class="deploy-status-link-btn" data-view-deploy="${escapeHtml(row.asyncId)}">${escapeHtml(t('deployStatus.viewDetails'))}</button></td>
          <td class="deploy-status-mono">${escapeHtml(row.asyncId)}</td>
          <td>${buildStatusBadgeHtml(row)}</td>
          <td>${escapeHtml(formatDateTime(dateVal))}</td>
        `;
      }
      tbody.appendChild(tr);
    }
  }

  const total = Number(history?.totalCount) || 0;
  const page = Number(history?.page) || 0;
  const pageSize = Number(history?.pageSize) || PAGE_SIZE;
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  const hasPrev = page > 0;
  const hasNext = (page + 1) * pageSize < total;

  nav.innerHTML = `
    <button type="button" class="deploy-status-page-btn" data-page-bucket="${bucket}" data-page-dir="prev" ${hasPrev ? '' : 'disabled'}>${escapeHtml(t('deployStatus.prev'))}</button>
    <span class="deploy-status-page-info">${escapeHtml(t('deployStatus.pageInfo', { from, to, total }))}</span>
    <button type="button" class="deploy-status-page-btn" data-page-bucket="${bucket}" data-page-dir="next" ${hasNext ? '' : 'disabled'}>${escapeHtml(t('deployStatus.next'))}</button>
  `;
}

function renderActiveCard(data) {
  const section = document.getElementById('deployStatusActiveSection');
  const card = document.getElementById('deployStatusActiveCard');
  if (!section || !card) return;

  const active = data?.active;
  if (!active) {
    section.classList.add('hidden');
    section.classList.remove('deploy-status-active-section--has-card');
    card.classList.add('hidden');
    card.innerHTML = '';
    return;
  }

  section.classList.remove('hidden');
  card.classList.remove('hidden');

  const inProgress = isDeployInProgress(active.status);
  section.classList.toggle('deploy-status-active-section--has-card', true);
  card.className = `deploy-status-active-card${inProgress ? ' is-in-progress' : ''}`;

  card.innerHTML = `
    <div class="deploy-status-active-top">
      <div class="deploy-status-active-head">
        ${buildStatusBadgeHtml(active, data?.activeSoap || {}, { useLongTitle: true })}
        ${
          inProgress
            ? `<span class="deploy-status-active-live-chip" title="${escapeHtml(t('deployStatus.live'))}">
            <span class="deploy-status-active-live-dot" aria-hidden="true"></span>
            <span class="deploy-status-active-live-text">${escapeHtml(formatElapsed(active.startDate, active.completedDate))}</span>
          </span>`
            : ''
        }
      </div>
      ${buildActiveChartsHtml()}
    </div>
    <dl class="deploy-status-active-meta-grid">
      <div class="deploy-status-active-meta-item">
        <dt>${escapeHtml(t('deployStatus.metaName'))}</dt>
        <dd class="deploy-status-mono">${escapeHtml(active.asyncId)}</dd>
      </div>
      <div class="deploy-status-active-meta-item">
        <dt>${escapeHtml(t('deployStatus.metaDeployedBy'))}</dt>
        <dd>${escapeHtml(active.createdByName || '—')}</dd>
      </div>
      <div class="deploy-status-active-meta-item">
        <dt>${escapeHtml(t('deployStatus.metaStart'))}</dt>
        <dd>${escapeHtml(formatDateTime(active.startDate))}</dd>
      </div>
      ${
        !inProgress
          ? `<div class="deploy-status-active-meta-item">
        <dt>${escapeHtml(t('deployStatus.metaElapsed'))}</dt>
        <dd>${escapeHtml(formatElapsed(active.startDate, active.completedDate))}</dd>
      </div>`
          : ''
      }
    </dl>
    <div class="deploy-status-active-actions">
      <button type="button" class="deploy-status-primary-btn" data-view-deploy="${escapeHtml(active.asyncId)}">${escapeHtml(t('deployStatus.viewDetails'))}</button>
      ${
        inProgress
          ? `<button type="button" class="deploy-status-cancel-btn" data-cancel-deploy="${escapeHtml(active.asyncId)}">${escapeHtml(t('deployStatus.cancelDeploy'))}</button>`
          : ''
      }
    </div>
  `;
  renderDonutsForRow(active, data?.activeSoap || {}, ACTIVE_DEPLOY_CHART_IDS, ACTIVE_DONUT_SIZE);
}

function matchesComponentSearch(component, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${component.componentType || ''} ${component.fullName || ''}`.toLowerCase();
  return hay.includes(q);
}

function renderGlobalError(row, soap) {
  const el = document.getElementById('deployStatusGlobalError');
  if (!el) return;
  const msg = String(soap?.errorMessage || row?.errorMessage || '').trim();
  if (!msg) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.classList.remove('hidden');
  el.textContent = msg;
}

function renderComponentsSection(soap) {
  const section = document.getElementById('deployStatusComponentsSection');
  const tbody = document.getElementById('deployStatusComponentsTbody');
  const searchInfo = document.getElementById('deployStatusComponentsSearchInfo');
  if (!section || !tbody) return;

  const successes = soap?.componentSuccesses || [];
  const filtered = successes.filter((c) => matchesComponentSearch(c, componentSearchQuery));

  section.classList.toggle('hidden', !successes.length);
  tbody.innerHTML = '';

  if (searchInfo) {
    if (componentSearchQuery.trim() && successes.length) {
      searchInfo.textContent = t('deployStatus.searchResultsCount', {
        shown: filtered.length,
        total: successes.length
      });
      searchInfo.classList.remove('hidden');
    } else {
      searchInfo.classList.add('hidden');
      searchInfo.textContent = '';
    }
  }

  if (!filtered.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="4" class="deploy-status-empty-row">${escapeHtml(
      componentSearchQuery.trim() ? t('deployStatus.searchNoResults') : t('deployStatus.historyEmpty')
    )}</td>`;
    tbody.appendChild(tr);
    return;
  }

  for (const c of filtered) {
    const action = c.deleted ? 'Deleted' : c.created ? 'Created' : c.changed ? 'Changed' : 'Unchanged';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(c.componentType)}</td>
      <td class="deploy-status-mono">${escapeHtml(c.fullName)}</td>
      <td>${escapeHtml(action)}</td>
      <td>${escapeHtml(t('deployStatus.componentOk'))}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderFailuresSection(soap) {
  const section = document.getElementById('deployStatusFailuresSection');
  const tbody = document.getElementById('deployStatusFailuresTbody');
  if (!section || !tbody) return;

  const failures = soap?.componentFailures || [];
  section.classList.toggle('hidden', !failures.length);
  tbody.innerHTML = '';
  for (const f of failures) {
    const line =
      f.lineNumber || f.columnNumber
        ? ` (${t('deployStatus.line')} ${f.lineNumber || '?'}${f.columnNumber ? `, ${t('deployStatus.col')}: ${f.columnNumber}` : ''})`
        : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(f.componentType)}</td>
      <td class="deploy-status-mono">${escapeHtml(f.fullName)}</td>
      <td>
        <div>${escapeHtml(f.problem || '')}${escapeHtml(line)}</div>
        ${f.fileName ? `<div class="deploy-status-error-file">${escapeHtml(f.fileName)}</div>` : ''}
      </td>
      <td>${escapeHtml(f.problemType || '')}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderTestFailuresSection(soap) {
  const section = document.getElementById('deployStatusTestFailuresSection');
  const tbody = document.getElementById('deployStatusTestFailuresTbody');
  if (!section || !tbody) return;

  const failures = soap?.runTestResult?.failures || [];
  section.classList.toggle('hidden', !failures.length);
  tbody.innerHTML = '';
  for (const f of failures) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="deploy-status-mono">${escapeHtml(f.className)}</td>
      <td>${escapeHtml(f.methodName)}</td>
      <td>${escapeHtml(f.message)}</td>
      <td>${renderStackTraceCell(f.stackTrace)}</td>
      <td>${escapeHtml(f.time ? `${f.time} ms` : '—')}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderCoverageWarningsSection(soap) {
  const section = document.getElementById('deployStatusCoverageWarningsSection');
  const tbody = document.getElementById('deployStatusCoverageWarningsTbody');
  if (!section || !tbody) return;

  const warnings = soap?.runTestResult?.codeCoverageWarnings || [];
  section.classList.toggle('hidden', !warnings.length);
  tbody.innerHTML = '';
  for (const w of warnings) {
    const classLabel =
      [w.namespace, w.name].filter(Boolean).join('.') || w.id || t('deployStatus.coverageFailure');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="deploy-status-mono">${escapeHtml(classLabel)}</td>
      <td>${escapeHtml(w.message)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderSlowTestsSection(soap) {
  const section = document.getElementById('deployStatusSlowTestsSection');
  const tbody = document.getElementById('deployStatusSlowTestsTbody');
  const hint = document.getElementById('deployStatusSlowTestsHint');
  if (!section || !tbody) return;

  const slowTests = collectSlowTests(soap?.runTestResult);
  section.classList.toggle('hidden', !slowTests.length);
  tbody.innerHTML = '';

  if (hint) {
    if (slowTests.length) {
      hint.textContent = t('deployStatus.slowTestsHint', {
        seconds: String(DEPLOY_SLOW_TEST_THRESHOLD_MS / 1000)
      });
      hint.classList.remove('hidden');
    } else {
      hint.classList.add('hidden');
      hint.textContent = '';
    }
  }

  for (const row of slowTests) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="deploy-status-mono">${escapeHtml(row.className)}</td>
      <td>${escapeHtml(row.methodName)}</td>
      <td>${escapeHtml(`${row.timeMs} ms`)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function updateCancelButton(row, soap) {
  const btn = document.getElementById('deployStatusCancelBtn');
  if (!btn) return;
  const inProgress = isDeployInProgress(soap?.status || row?.status);
  btn.classList.toggle('hidden', !inProgress);
  btn.disabled = cancelInFlight;
  btn.dataset.cancelDeploy = inProgress ? String(row?.asyncId || '') : '';
}

function renderDetailView(data) {
  const detail = data?.detail;
  if (!detail?.row) return;

  const row = detail.row;
  const rawSoap = detail.soap || {};
  const soapReady = isSoapDetailReady(rawSoap);
  const viewSoap = coalesceDetailSoap(row, rawSoap);
  const org = (state.orgsList || []).find((o) => o.id === state.leftOrgId);
  const instanceUrl = org?.instanceUrl || '';
  const setupUrl = instanceUrl ? buildSetupDeployDetailsUrl(instanceUrl, row.asyncId) : '#';

  const titleEl = document.getElementById('deployStatusDetailViewTitle');
  if (titleEl) titleEl.innerHTML = buildStatusBadgeHtml(row, viewSoap, { useLongTitle: true });

  const idEl = document.getElementById('deployStatusDetailViewId');
  if (idEl) idEl.textContent = row.asyncId || '';

  const metaEl = document.getElementById('deployStatusDetailViewMeta');
  if (metaEl) metaEl.innerHTML = buildMetaListHtml(row);

  const setupEl = document.getElementById('deployStatusDetailViewSetup');
  if (setupEl) {
    setupEl.innerHTML = `<a href="${escapeHtml(setupUrl)}" target="_blank" rel="noopener noreferrer" class="deploy-status-setup-link">${escapeHtml(t('deployStatus.openInSetup'))}</a>`;
  }

  renderDonutsForRow(row, rawSoap);

  if (soapReady) {
    cacheDeployRowHintsFromSoap(row.asyncId, rawSoap);
    renderGlobalError(row, rawSoap);
    renderFailuresSection(rawSoap);
    renderTestFailuresSection(rawSoap);
    renderCoverageWarningsSection(rawSoap);
    renderSlowTestsSection(rawSoap);
    renderComponentsSection(rawSoap);
  } else {
    renderGlobalError(row, {});
    [
      'deployStatusFailuresSection',
      'deployStatusTestFailuresSection',
      'deployStatusCoverageWarningsSection',
      'deployStatusSlowTestsSection',
      'deployStatusComponentsSection'
    ].forEach((id) => document.getElementById(id)?.classList.add('hidden'));
  }

  updateCancelButton(row, viewSoap);
}

function renderSummaryView(data) {
  mergeFailedCoverageHints(data?.failedCoverageHints);
  if (data?.active?.asyncId && data.activeSoap) {
    cacheDeployRowHintsFromSoap(data.active.asyncId, data.activeSoap);
  }
  if (data?.detail?.row?.asyncId && data.detail?.soap) {
    cacheDeployRowHintsFromSoap(data.detail.row.asyncId, data.detail.soap);
  }
  renderActiveCard(data);
  renderHistoryTable(data?.failedHistory, 'failed');
  renderHistoryTable(data?.succeededHistory, 'succeeded');
}

function renderPanel(data) {
  applyViewMode();
  if (viewMode === 'detail') {
    renderDetailView(data);
  } else {
    renderSummaryView(data);
  }
}

function updateStatusBar(data, isLive) {
  const liveBadge = document.getElementById('deployStatusLiveBadge');
  liveBadge?.classList.toggle('hidden', !isLive || viewMode === 'detail');
}

function hasInFlightDeploy(data) {
  if (viewMode === 'summary' && data?.active) return true;
  if (viewMode !== 'detail') return false;
  const detail = data?.detail;
  if (!detail?.row) return false;
  return isDeployInProgress(detail.soap?.status || detail.row.status);
}

function computePollDelayMs(data) {
  return hasInFlightDeploy(data) ? POLL_ACTIVE_MS : POLL_IDLE_MS;
}

export function stopDeployStatusPolling() {
  if (pollTimeout) {
    clearTimeout(pollTimeout);
    pollTimeout = null;
  }
}

function scheduleDeployPollLoop() {
  if (pollTimeout) clearTimeout(pollTimeout);
  pollTimeout = window.setTimeout(() => {
    pollTimeout = null;
    if (getSelectedArtifactType() !== 'DeployStatus') {
      return;
    }
    void tickDeployStatus().finally(() => {
      if (getSelectedArtifactType() === 'DeployStatus') {
        scheduleDeployPollLoop();
      }
    });
  }, computePollDelayMs(lastPollData));
}

export function updateDeployStatusPollingState() {
  stopDeployStatusPolling();
  if (getSelectedArtifactType() !== 'DeployStatus') return;
  scheduleDeployPollLoop();
}

async function tickDeployStatus(opts = {}) {
  if (!state.leftOrgId) return;
  const showLoading = !!opts.showLoading;
  if (showLoading) setPanelLoading(true);
  try {
    const res = await bg({
      type: 'deployStatus:poll',
      orgId: state.leftOrgId,
      selectedAsyncId: viewMode === 'detail' ? selectedAsyncId : '',
      failedPage,
      succeededPage,
      pageSize: PAGE_SIZE,
      fetchDetail: viewMode === 'detail' && !!selectedAsyncId,
      knownCoverageHintIds: [...deployRowHintById.keys()]
    });
    if (!res?.ok) {
      if (viewMode === 'summary') {
        showPanelError(
          res?.reason === 'NO_SID' ? t('deployStatus.noSession') : res?.error || t('deployStatus.fetchError')
        );
      }
      return;
    }
    lastPollData = res;
    mergeFailedCoverageHints(res.failedCoverageHints);
    lastFetchedAt = Date.now();
    showPanelError('');
    renderPanel(res);
    updateStatusBar(res, hasInFlightDeploy(res));
  } catch (e) {
    void handleToolError(e, { artifact_type: 'DeployStatus', phase: 'poll' });
  } finally {
    if (showLoading) setPanelLoading(false);
  }
}

async function handleCancelDeploy(asyncId) {
  if (!asyncId || cancelInFlight) return;
  if (!window.confirm(t('deployStatus.cancelConfirm', { id: asyncId }))) return;

  cancelInFlight = true;
  updateCancelButton({ asyncId, status: 'InProgress' }, { status: 'InProgress' });
  try {
    const res = await bg({
      type: 'deployStatus:cancel',
      orgId: state.leftOrgId,
      asyncId
    });
    if (!res?.ok) {
      window.alert(res?.error || t('deployStatus.cancelError'));
      return;
    }
    if (viewMode === 'detail' && selectedAsyncId === asyncId) {
      navigateToSummary();
    }
    await tickDeployStatus();
    updateDeployStatusPollingState();
  } catch (e) {
    void handleToolError(e, { artifact_type: 'DeployStatus', phase: 'cancel' });
  } finally {
    cancelInFlight = false;
    if (lastPollData?.detail) updateCancelButton(lastPollData.detail.row, lastPollData.detail.soap);
  }
}

export async function refreshDeployStatusPanel() {
  if (getSelectedArtifactType() !== 'DeployStatus') {
    stopDeployStatusPolling();
    viewMode = 'summary';
    selectedAsyncId = '';
    summaryBootstrapped = false;
    lastDeployPanelOrgId = '';
    applyViewMode();
    setPanelLoading(false);
    return;
  }
  if (!state.leftOrgId) {
    resetDeployStatusPanelToHome();
    lastDeployPanelOrgId = '';
    showPanelError(t('deployStatus.selectOrg'));
    stopDeployStatusPolling();
    return;
  }

  const orgChanged = lastDeployPanelOrgId !== '' && lastDeployPanelOrgId !== state.leftOrgId;
  if (orgChanged) {
    resetDeployStatusPanelToHome();
  }
  lastDeployPanelOrgId = state.leftOrgId;

  const showLoading = viewMode === 'summary' && !summaryBootstrapped;
  await tickDeployStatus({ showLoading });
  if (viewMode === 'summary') summaryBootstrapped = true;
  updateDeployStatusPollingState();
}

/** Vuelve al resumen y recarga despliegues al cambiar la org izquierda. */
export function onDeployStatusOrgChange() {
  if (getSelectedArtifactType() !== 'DeployStatus') return;
  void refreshDeployStatusPanel();
}

export function setupDeployStatusPanel() {
  applyViewMode();

  document.getElementById('deployStatusRefreshBtn')?.addEventListener('click', () => {
    void refreshDeployStatusPanel();
  });

  document.getElementById('deployStatusBackBtn')?.addEventListener('click', () => {
    handleDeployDetailBack();
  });

  document.getElementById('deployStatusBackToEditorBtn')?.addEventListener('click', () => {
    void returnToQuickEditEditor();
  });

  document.getElementById('deployStatusCancelBtn')?.addEventListener('click', () => {
    const btn = document.getElementById('deployStatusCancelBtn');
    const asyncId = btn?.getAttribute('data-cancel-deploy') || selectedAsyncId;
    void handleCancelDeploy(asyncId);
  });

  document.getElementById('deployStatusComponentsSearch')?.addEventListener('input', (ev) => {
    componentSearchQuery = /** @type {HTMLInputElement} */ (ev.target).value;
    if (lastPollData?.detail?.soap) renderComponentsSection(lastPollData.detail.soap);
  });

  document.getElementById('deployStatusPanel')?.addEventListener('click', (ev) => {
    const target = /** @type {HTMLElement} */ (ev.target);

    const cancelBtn = target.closest('[data-cancel-deploy]');
    if (cancelBtn) {
      const asyncId = cancelBtn.getAttribute('data-cancel-deploy') || '';
      void handleCancelDeploy(asyncId);
      return;
    }

    const viewBtn = target.closest('[data-view-deploy]');
    if (viewBtn) {
      navigateToDetail(viewBtn.getAttribute('data-view-deploy') || '');
      return;
    }

    const pageBtn = target.closest('[data-page-bucket]');
    if (pageBtn && !pageBtn.hasAttribute('disabled')) {
      const bucket = pageBtn.getAttribute('data-page-bucket');
      const dir = pageBtn.getAttribute('data-page-dir');
      if (bucket === 'failed') {
        failedPage = Math.max(0, failedPage + (dir === 'next' ? 1 : -1));
      } else if (bucket === 'succeeded') {
        succeededPage = Math.max(0, succeededPage + (dir === 'next' ? 1 : -1));
      }
      void refreshDeployStatusPanel();
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (getSelectedArtifactType() !== 'DeployStatus') return;
    if (viewMode !== 'detail') return;
    ev.preventDefault();
    handleDeployDetailBack();
  });

  window.addEventListener(
    'pagehide',
    (ev) => {
      if (ev.persisted) return;
      stopDeployStatusPolling();
    },
    { capture: true }
  );
}
