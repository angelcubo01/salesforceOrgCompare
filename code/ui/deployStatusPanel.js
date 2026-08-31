import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t, getCurrentLang } from '../../shared/i18n.js';
import { decodeHtmlEntities } from '../../shared/htmlEntities.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { renderDonutChart } from '../lib/orgLimitsCharts.js';
import { buildSetupDeployDetailsUrl, isDeployInProgress, isDeployActivelyRunning, isSoapActivelyRunning, collectSlowTests, DEPLOY_SLOW_TEST_THRESHOLD_MS, hasCoverageFailureInRow, hasCoverageFailureInSoap, resolveDeployProgressDetail } from '../../shared/deployStatusApi.js';
import {
  buildDeployCoverageRows,
  canShowDeployCoverage,
  formatDeployCoveragePercent
} from '../../shared/deployCoverage.js';
import { randomStagingId } from '../../shared/randomId.js';
import { showToast } from './toast.js';
import { handleToolError } from '../../shared/reportToolError.js';
import { getReturnContext, returnToQuickEditEditor } from '../lib/quickEditDeployContext.js';
import { confirmSfocOrgAction, mountSfocOverlay, unmountSfocOverlay } from './sfocModal.js';
import { openApexSourceViewerWithPayload } from '../lib/openApexSourceViewer.js';

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
/** @type {ReturnType<typeof setInterval> | null} */
let elapsedTickTimer = null;
/** @type {number | null} */
let liveElapsedStartMs = null;
/** @type {number | null} */
let liveElapsedEndMs = null;
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
let selectedDeploySourceOrgId = '';
/** @type {Map<string, { state: 'loading'|'ready'|'error', detail?: Record<string, unknown>, error?: string }>} */
const inlineFailedDeployDetails = new Map();
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
  if (isSoapActivelyRunning(soap)) return 'InProgress';
  if (rowStatus === 'InProgress') return rowStatus;
  if (soapStatus === 'InProgress' || soapStatus === 'In Progress') return soapStatus;
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
    runTestResult: null,
    stateDetail: ''
  };
}

function renderRunningTestHint(elementId, row, soap) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const display = resolveDeployProgressDetail(row, soap);
  if (!display.text) {
    el.classList.add('hidden');
    el.innerHTML = '';
    el.removeAttribute('title');
    return;
  }
  el.classList.remove('hidden');
  if (display.showRunningTestLabel) {
    el.innerHTML = `<span class="deploy-status-running-test-label">${escapeHtml(t('deployStatus.runningTestLabel'))}</span><span class="deploy-status-running-test-name">${escapeHtml(display.text)}</span>`;
  } else {
    el.innerHTML = `<span class="deploy-status-running-test-detail">${escapeHtml(display.text)}</span>`;
  }
  el.title = display.text;
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

function decodeDeployText(value) {
  return decodeHtmlEntities(value);
}

function isApexClassName(value) {
  return /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(String(value || ''));
}

function isApexClassComponent(value) {
  return String(value || '').replace(/[\s_-]/g, '').toLowerCase() === 'apexclass';
}

function parseApexStackTraceFrames(value) {
  const text = String(value || '');
  const frames = [];
  const re = /Class\.([A-Za-z_][A-Za-z0-9_]*)\.[A-Za-z_][A-Za-z0-9_]*:\s*line\s+(\d+)(?:,\s*column\s+\d+)?/gi;
  let match;
  while ((match = re.exec(text))) {
    const initialLine = Number(match[2]);
    if (!Number.isSafeInteger(initialLine) || initialLine <= 0) continue;
    frames.push({ className: match[1], initialLine, start: match.index, end: match.index + match[0].length });
  }
  return frames;
}

function sourceLinkHtml(className, initialLine, label = className) {
  if (!isApexClassName(className)) return escapeHtml(label);
  const line = Number(initialLine);
  const lineAttr = Number.isSafeInteger(line) && line > 0 ? ` data-deploy-source-line="${line}"` : '';
  return `<a href="#" class="deploy-status-source-link" data-deploy-source-class="${escapeHtml(className)}"${lineAttr} title="${escapeHtml(t('deployStatus.openSourceHint'))}">${escapeHtml(label)}</a>`;
}

function renderStackTraceSourceLinks(stackTrace, fallbackClassName = '') {
  const trace = decodeDeployText(stackTrace);
  const frames = parseApexStackTraceFrames(trace);
  if (!frames.length) return fallbackClassName && trace ? sourceLinkHtml(fallbackClassName, undefined, trace) : escapeHtml(trace || '—');
  let cursor = 0;
  let html = '';
  for (const frame of frames) {
    html += escapeHtml(trace.slice(cursor, frame.start));
    html += sourceLinkHtml(frame.className, frame.initialLine, trace.slice(frame.start, frame.end));
    cursor = frame.end;
  }
  return html + escapeHtml(trace.slice(cursor));
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

function parseDeployDateMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function formatElapsedSeconds(totalSec) {
  const sec = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatElapsedFromMs(startMs, endMs = Date.now()) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return '—';
  return formatElapsedSeconds((endMs - startMs) / 1000);
}

function formatElapsed(startDate, endDate) {
  const startMs = parseDeployDateMs(startDate);
  if (!Number.isFinite(startMs)) return '—';
  const endMs = endDate ? parseDeployDateMs(endDate) : Date.now();
  return formatElapsedFromMs(startMs, endMs);
}

function resolveLiveElapsedStartMs(row, soap = {}) {
  return (
    parseDeployDateMs(row?.startDate) ??
    parseDeployDateMs(row?.createdDate) ??
    parseDeployDateMs(soap?.startDate) ??
    parseDeployDateMs(soap?.createdDate)
  );
}

function updateLiveElapsedDom() {
  if (!Number.isFinite(liveElapsedStartMs)) return;
  const text = formatElapsedFromMs(liveElapsedStartMs, liveElapsedEndMs ?? Date.now());
  for (const el of document.querySelectorAll('[data-deploy-live-elapsed]')) {
    el.textContent = text;
  }
}

function stopDeployElapsedTicker() {
  if (elapsedTickTimer) {
    clearInterval(elapsedTickTimer);
    elapsedTickTimer = null;
  }
  liveElapsedStartMs = null;
  liveElapsedEndMs = null;
}

function syncDeployElapsedTicker(data) {
  let row = null;
  let soap = null;
  if (viewMode === 'detail' && data?.detail?.row) {
    row = data.detail.row;
    soap = data.detail.soap;
  } else if (data?.active && isDeployActivelyRunning(data.active, data?.activeSoap)) {
    row = data.active;
    soap = data.activeSoap;
  }

  if (!row || !isDeployActivelyRunning(row, soap)) {
    stopDeployElapsedTicker();
    return;
  }

  const startMs = resolveLiveElapsedStartMs(row, soap);
  if (!Number.isFinite(startMs)) {
    stopDeployElapsedTicker();
    return;
  }

  liveElapsedStartMs = startMs;
  liveElapsedEndMs = null;
  updateLiveElapsedDom();

  if (!elapsedTickTimer) {
    elapsedTickTimer = window.setInterval(() => {
      if (!Number.isFinite(liveElapsedStartMs)) {
        stopDeployElapsedTicker();
        return;
      }
      updateLiveElapsedDom();
    }, 1000);
  }
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
    pendingQueue: { records: [], totalCount: 0 },
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
  inlineFailedDeployDetails.clear();
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
  const summaryBtn = document.getElementById('deployStatusViewSummaryBtn');
  const editorBtn = document.getElementById('deployStatusBackToEditorBtn');
  const ctx = getReturnContext();
  if (editorBtn) editorBtn.hidden = true;
  if (!backBtn) return;

  const fromQuickEdit = !!(ctx && viewMode === 'detail');
  if (summaryBtn) summaryBtn.hidden = !fromQuickEdit;

  if (fromQuickEdit) {
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
  for (const bucket of [data.failedHistory, data.succeededHistory, data.pendingQueue, data.pendingHistory]) {
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

function buildDeployTypeLabel(row) {
  return row?.checkOnly ? t('deployStatus.pendingTypeValidation') : t('deployStatus.pendingTypeDeploy');
}

function formatSubmittedByLine(row) {
  const who = String(row?.createdByName || '').trim() || '—';
  const when = formatDateTime(row?.createdDate || row?.startDate);
  return when === '—' ? who : `${who}, ${when}`;
}

function buildMetaListHtml(row, soap = {}) {
  const modeLabel = row.checkOnly ? t('deployStatus.modeValidate') : t('deployStatus.modeDeploy');
  const inProgress = isDeployActivelyRunning(row, soap);
  const elapsedHtml = inProgress
    ? `<span data-deploy-live-elapsed>${escapeHtml(
        formatElapsedFromMs(resolveLiveElapsedStartMs(row, soap) ?? NaN)
      )}</span>`
    : escapeHtml(formatElapsed(row.startDate, row.completedDate));
  return `
    <ul class="deploy-status-meta-list">
      <li><span class="deploy-status-meta-label">${escapeHtml(t('deployStatus.metaName'))}</span> <span class="deploy-status-mono">${escapeHtml(row.asyncId)}</span></li>
      <li><span class="deploy-status-meta-label">${escapeHtml(t('deployStatus.metaType'))}</span> ${escapeHtml(row.type || 'API')}</li>
      <li><span class="deploy-status-meta-label">${escapeHtml(t('deployStatus.metaDeployedBy'))}</span> ${escapeHtml(row.createdByName || '—')}</li>
      <li><span class="deploy-status-meta-label">${escapeHtml(t('deployStatus.metaStart'))}</span> ${escapeHtml(formatDateTime(row.startDate))}</li>
      <li><span class="deploy-status-meta-label">${escapeHtml(t('deployStatus.metaEnd'))}</span> ${escapeHtml(formatDateTime(row.completedDate))}</li>
      <li><span class="deploy-status-meta-label">${escapeHtml(t('deployStatus.metaElapsed'))}</span> ${elapsedHtml}</li>
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
    <div class="deploy-status-charts-stack">
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
      <p id="deployStatusActiveRunningTest" class="deploy-status-running-test hidden" role="status" aria-live="polite"></p>
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
  const runningTestId = chartIds.runningTest;
  if (runningTestId) {
    renderRunningTestHint(runningTestId, row, soap || viewSoap);
  }
}

const ACTIVE_DEPLOY_CHART_IDS = {
  componentChart: 'deployStatusActiveComponentChart',
  componentLabel: 'deployStatusActiveComponentLabel',
  testsChart: 'deployStatusActiveTestsChart',
  testsLabel: 'deployStatusActiveTestsLabel',
  runningTest: 'deployStatusActiveRunningTest'
};

const DETAIL_DEPLOY_CHART_IDS = {
  runningTest: 'deployStatusRunningTest'
};

function renderStackTraceCell(stackTrace, fallbackClassName = '') {
  if (!stackTrace) return '—';
  return `<details class="deploy-status-stack-details">
    <summary>${escapeHtml(t('deployStatus.viewStackTrace'))}</summary>
    <pre class="deploy-status-stack-pre">${renderStackTraceSourceLinks(stackTrace, fallbackClassName)}</pre>
  </details>`;
}

function activeDeploySourceOrgs() {
  return (state.orgsList || []).filter((org) => state.authStatuses?.[org.id] === 'active');
}

function ensureDeploySourceOrgSelection(orgs = activeDeploySourceOrgs()) {
  const preferred = selectedDeploySourceOrgId || state.leftOrgId || '';
  selectedDeploySourceOrgId = orgs.some((org) => org.id === preferred) ? preferred : '';
  return selectedDeploySourceOrgId;
}

function sourceOrgLabel(org) {
  return String(org?.label || org?.displayName || org?.instanceUrl || org?.id || '');
}

function refreshDeploySourceOrgPicker() {
  const select = document.getElementById('deployStatusSourceOrgSelect');
  if (!select) return;
  const orgs = activeDeploySourceOrgs();
  ensureDeploySourceOrgSelection(orgs);
  select.innerHTML = '';
  if (!orgs.length) {
    select.appendChild(new Option(t('deployStatus.sourceOrgEmpty'), ''));
    select.disabled = true;
    return;
  }
  select.disabled = false;
  if (!selectedDeploySourceOrgId) select.appendChild(new Option(t('deployStatus.sourceOrgChoose'), ''));
  for (const org of orgs) select.appendChild(new Option(sourceOrgLabel(org), org.id));
  select.value = selectedDeploySourceOrgId;
}

async function openDeployStatusApexSource(className, initialLine) {
  const orgId = selectedDeploySourceOrgId;
  if (!orgId) {
    showToast(t('deployStatus.sourceOrgRequired'), 'warn');
    return;
  }
  const res = await bg({ type: 'deployStatus:getApexSource', orgId, className, initialLine });
  if (!res?.ok) {
    const message =
      res?.reason === 'NO_SID'
        ? t('deployStatus.noSession')
        : res?.reason === 'NOT_FOUND'
          ? t('deployStatus.sourceNotFound')
          : res?.error || t('deployStatus.sourceOpenError');
    showToast(message, 'warn');
    return;
  }
  const name = String(res.name || className);
  const org = (state.orgsList || []).find((item) => String(item.id) === String(orgId));
  const opened = await openApexSourceViewerWithPayload(
    `${name}.cls · ${t('docTitle.apexSource')}`,
    String(res.body || ''),
    {
      downloadFileName: `${name}.cls`, initialLine, orgId,
      orgLabel: org?.label || '', instanceUrl: org?.instanceUrl || ''
    }
  );
  if (!opened) showToast(t('deployStatus.sourceOpenError'), 'warn');
}

function renderInlineSourceOrgPicker() {
  const orgs = activeDeploySourceOrgs();
  ensureDeploySourceOrgSelection(orgs);
  const options = !orgs.length
    ? `<option value="">${escapeHtml(t('deployStatus.sourceOrgEmpty'))}</option>`
    : `${selectedDeploySourceOrgId ? '' : `<option value="">${escapeHtml(t('deployStatus.sourceOrgChoose'))}</option>`}${orgs.map((org) => `<option value="${escapeHtml(org.id)}"${org.id === selectedDeploySourceOrgId ? ' selected' : ''}>${escapeHtml(sourceOrgLabel(org))}</option>`).join('')}`;
  return `<label class="deploy-status-inline-source-picker"><span>${escapeHtml(t('deployStatus.sourceOrgLabel'))}</span><select data-deploy-inline-source-org ${orgs.length ? '' : 'disabled'}>${options}</select></label>`;
}

function renderInlineComponentFailures(failures) {
  if (!failures.length) return '';
  const rows = failures.map((failure) => {
    const componentType = decodeDeployText(failure?.componentType);
    const fullName = decodeDeployText(failure?.fullName);
    const problem = decodeDeployText(failure?.problem);
    const fileName = decodeDeployText(failure?.fileName);
    const line = failure?.lineNumber || failure?.columnNumber
      ? ` (${t('deployStatus.line')} ${failure.lineNumber || '?'}${failure.columnNumber ? `, ${t('deployStatus.col')}: ${failure.columnNumber}` : ''})`
      : '';
    return `<tr><td>${isApexClassComponent(componentType) ? sourceLinkHtml(fullName, failure?.lineNumber) : escapeHtml(fullName)}</td><td>${escapeHtml(componentType)}</td><td>${escapeHtml(problem)}${escapeHtml(line)}${fileName ? `<div class="deploy-status-error-file">${escapeHtml(fileName)}</div>` : ''}</td></tr>`;
  }).join('');
  return `<section><h4>${escapeHtml(t('deployStatus.sectionFailures'))}</h4><div class="deploy-status-table-wrap"><table class="deploy-status-table"><thead><tr><th>${escapeHtml(t('deployStatus.colName'))}</th><th>${escapeHtml(t('deployStatus.colType'))}</th><th>${escapeHtml(t('deployStatus.colProblem'))}</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function renderInlineTestFailures(failures) {
  if (!failures.length) return '';
  const rows = failures.map((failure) => {
    const className = decodeDeployText(failure?.className);
    const methodName = decodeDeployText(failure?.methodName);
    const message = decodeDeployText(failure?.message);
    const stackTrace = decodeDeployText(failure?.stackTrace);
    const classFrame = parseApexStackTraceFrames(stackTrace).find((frame) => frame.className === className);
    const initialLine = classFrame?.initialLine;
    return `<tr><td>${sourceLinkHtml(className, initialLine)}</td><td>${className && methodName ? sourceLinkHtml(className, initialLine, methodName) : escapeHtml(methodName)}</td><td>${escapeHtml(message)}</td><td>${renderStackTraceCell(stackTrace, className)}</td></tr>`;
  }).join('');
  return `<section><h4>${escapeHtml(t('deployStatus.sectionTestFailures'))}</h4><div class="deploy-status-table-wrap"><table class="deploy-status-table"><thead><tr><th>${escapeHtml(t('deployStatus.colClass'))}</th><th>${escapeHtml(t('deployStatus.colMethod'))}</th><th>${escapeHtml(t('deployStatus.colMessage'))}</th><th>${escapeHtml(t('deployStatus.colStackTrace'))}</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function renderInlineCoverageWarnings(warnings) {
  if (!warnings.length) return '';
  const rows = warnings.map((warning) => `<tr><td>${escapeHtml([decodeDeployText(warning?.namespace), decodeDeployText(warning?.name)].filter(Boolean).join('.') || decodeDeployText(warning?.id) || t('deployStatus.coverageFailure'))}</td><td>${escapeHtml(decodeDeployText(warning?.message))}</td></tr>`).join('');
  return `<section><h4>${escapeHtml(t('deployStatus.sectionCoverageWarnings'))}</h4><div class="deploy-status-table-wrap"><table class="deploy-status-table"><thead><tr><th>${escapeHtml(t('deployStatus.colClass'))}</th><th>${escapeHtml(t('deployStatus.colMessage'))}</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function renderInlineFailedDeployDetail(detail) {
  const soap = detail?.soap || detail || {};
  const globalError = decodeDeployText(soap.errorMessage || detail?.row?.errorMessage).trim();
  const components = Array.isArray(soap.componentFailures) ? soap.componentFailures : [];
  const tests = Array.isArray(soap.runTestResult?.failures) ? soap.runTestResult.failures : [];
  const warnings = Array.isArray(soap.runTestResult?.codeCoverageWarnings) ? soap.runTestResult.codeCoverageWarnings : [];
  const componentFailures = renderInlineComponentFailures(components);
  const testFailures = renderInlineTestFailures(tests);
  const content = [
    globalError ? `<div class="deploy-status-global-error">${escapeHtml(globalError)}</div>` : '',
    componentFailures || testFailures ? renderInlineSourceOrgPicker() : '',
    componentFailures,
    testFailures,
    renderInlineCoverageWarnings(warnings)
  ].filter(Boolean).join('') || `<p class="deploy-status-inline-empty">${escapeHtml(t('deployStatus.historyEmpty'))}</p>`;
  return `<div class="deploy-status-inline-detail">${content}</div>`;
}

function rerenderInlineFailedDeployments() {
  if (viewMode === 'summary' && lastPollData?.failedHistory) renderHistoryTable(lastPollData.failedHistory, 'failed');
}

async function toggleInlineFailedDeployDetails(asyncId) {
  const id = String(asyncId || '');
  if (!id || !state.leftOrgId) return;
  if (inlineFailedDeployDetails.has(id)) {
    inlineFailedDeployDetails.delete(id);
    rerenderInlineFailedDeployments();
    return;
  }
  inlineFailedDeployDetails.set(id, { state: 'loading' });
  rerenderInlineFailedDeployments();
  const res = await bg({ type: 'deployStatus:detail', orgId: state.leftOrgId, asyncId: id });
  const current = inlineFailedDeployDetails.get(id);
  if (!current || current.state !== 'loading') return;
  if (res?.ok && res.detail) {
    inlineFailedDeployDetails.set(id, { state: 'ready', detail: res.detail });
  } else {
    inlineFailedDeployDetails.set(id, {
      state: 'error',
      error: res?.reason === 'NO_SID' ? t('deployStatus.noSession') : res?.error || t('deployStatus.fetchError')
    });
  }
  rerenderInlineFailedDeployments();
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
        const asyncId = String(row.asyncId || '');
        const inlineDetail = inlineFailedDeployDetails.get(asyncId);
        tr.innerHTML = `
          <td><button type="button" class="deploy-status-inline-toggle" data-toggle-deploy-inline="${escapeHtml(asyncId)}" aria-expanded="${inlineDetail ? 'true' : 'false'}" aria-label="${escapeHtml(t('deployStatus.viewDetails'))}" title="${escapeHtml(t('deployStatus.viewDetails'))}"></button><button type="button" class="deploy-status-link-btn" data-view-deploy="${escapeHtml(row.asyncId)}">${escapeHtml(t('deployStatus.viewDetails'))}</button></td>
          <td class="deploy-status-mono">${escapeHtml(row.asyncId)}</td>
          <td>${buildStatusBadgeHtml(row)}</td>
          <td>${escapeHtml(buildErrorsSummary(row))}</td>
          <td>${escapeHtml(formatDateTime(dateVal))}</td>
        `;
        tbody.appendChild(tr);
        if (inlineDetail) {
          const detailRow = document.createElement('tr');
          detailRow.className = 'deploy-status-inline-detail-row';
          const detailCell = document.createElement('td');
          detailCell.colSpan = 5;
          if (inlineDetail.state === 'loading') {
            detailCell.innerHTML = `<div class="deploy-status-inline-detail deploy-status-inline-loading">${escapeHtml(t('deployStatus.loading'))}</div>`;
          } else if (inlineDetail.state === 'error') {
            detailCell.innerHTML = `<div class="deploy-status-inline-detail deploy-status-inline-error">${escapeHtml(decodeDeployText(inlineDetail.error || t('deployStatus.fetchError')))}</div>`;
          } else {
            detailCell.innerHTML = renderInlineFailedDeployDetail(inlineDetail.detail);
          }
          detailRow.appendChild(detailCell);
          tbody.appendChild(detailRow);
        }
      } else {
        tr.innerHTML = `
          <td><button type="button" class="deploy-status-link-btn" data-view-deploy="${escapeHtml(row.asyncId)}">${escapeHtml(t('deployStatus.viewDetails'))}</button></td>
          <td class="deploy-status-mono">${escapeHtml(row.asyncId)}</td>
          <td>${buildStatusBadgeHtml(row)}</td>
          <td>${escapeHtml(formatDateTime(dateVal))}</td>
        `;
      }
      if (bucket !== 'failed') tbody.appendChild(tr);
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

function renderPendingQueueTable(pendingQueue, activeAsyncId = '') {
  const section = document.getElementById('deployStatusPendingSection');
  const tbody = document.getElementById('deployStatusPendingTbody');
  if (!section || !tbody) return;

  const activeId = String(activeAsyncId || '');
  const records = (pendingQueue?.records || []).filter((row) => String(row?.asyncId || '') !== activeId);
  section.classList.toggle('hidden', !records.length);
  tbody.innerHTML = '';

  if (!records.length) return;

  for (const row of records) {
    const tr = document.createElement('tr');
    tr.classList.toggle('deploy-status-row-selected', row.asyncId === selectedAsyncId);
    tr.dataset.asyncId = String(row.asyncId || '');
    tr.innerHTML = `
      <td>
        <button type="button" class="deploy-status-link-btn deploy-status-cancel-link" data-cancel-deploy="${escapeHtml(row.asyncId)}">${escapeHtml(t('deployStatus.cancelDeploy'))}</button>
        <button type="button" class="deploy-status-link-btn" data-view-deploy="${escapeHtml(row.asyncId)}">${escapeHtml(t('deployStatus.viewDetails'))}</button>
      </td>
      <td class="deploy-status-mono">${escapeHtml(row.asyncId)}</td>
      <td>${escapeHtml(buildDeployTypeLabel(row))}</td>
      <td>${escapeHtml(formatSubmittedByLine(row))}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderActiveCard(data) {
  const section = document.getElementById('deployStatusActiveSection');
  const card = document.getElementById('deployStatusActiveCard');
  if (!section || !card) return;

  const active = data?.active;
  const activeSoap = data?.activeSoap || null;
  const running = !!active && isDeployActivelyRunning(active, activeSoap);
  if (!running) {
    section.classList.add('hidden');
    section.classList.remove('deploy-status-active-section--has-card');
    card.classList.add('hidden');
    card.innerHTML = '';
    return;
  }

  section.classList.remove('hidden');
  card.classList.remove('hidden');

  const inProgress = running;
  section.classList.toggle('deploy-status-active-section--has-card', true);
  card.className = `deploy-status-active-card${inProgress ? ' is-in-progress' : ''}`;
  const activeStartDate =
    active.startDate ||
    active.createdDate ||
    activeSoap?.startDate ||
    activeSoap?.createdDate;

  card.innerHTML = `
    <div class="deploy-status-active-top">
      <div class="deploy-status-active-head">
        ${buildStatusBadgeHtml(active, activeSoap, { useLongTitle: true })}
        ${
          inProgress
            ? `<span class="deploy-status-active-live-chip" title="${escapeHtml(t('deployStatus.live'))}">
            <span class="deploy-status-active-live-dot" aria-hidden="true"></span>
            <span class="deploy-status-active-live-text" data-deploy-live-elapsed>${escapeHtml(formatElapsed(activeStartDate, active.completedDate))}</span>
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
        <dd>${escapeHtml(formatDateTime(activeStartDate))}</dd>
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
  renderDonutsForRow(active, activeSoap || {}, ACTIVE_DEPLOY_CHART_IDS, ACTIVE_DONUT_SIZE);
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
  const msg = decodeDeployText(soap?.errorMessage || row?.errorMessage).trim();
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
    const componentType = decodeDeployText(f.componentType);
    const fullName = decodeDeployText(f.fullName);
    const problem = decodeDeployText(f.problem);
    const fileName = decodeDeployText(f.fileName);
    const problemType = decodeDeployText(f.problemType);
    const line =
      f.lineNumber || f.columnNumber
        ? ` (${t('deployStatus.line')} ${f.lineNumber || '?'}${f.columnNumber ? `, ${t('deployStatus.col')}: ${f.columnNumber}` : ''})`
        : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(componentType)}</td>
      <td class="deploy-status-mono">${isApexClassComponent(componentType) ? sourceLinkHtml(fullName, f.lineNumber) : escapeHtml(fullName)}</td>
      <td>
        <div>${escapeHtml(problem)}${escapeHtml(line)}</div>
        ${fileName ? `<div class="deploy-status-error-file">${escapeHtml(fileName)}</div>` : ''}
      </td>
      <td>${escapeHtml(problemType)}</td>
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
    const className = decodeDeployText(f.className);
    const methodName = decodeDeployText(f.methodName);
    const message = decodeDeployText(f.message);
    const stackTrace = decodeDeployText(f.stackTrace);
    const classFrame = parseApexStackTraceFrames(stackTrace).find((frame) => frame.className === className);
    const initialLine = classFrame?.initialLine;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="deploy-status-mono">${sourceLinkHtml(className, initialLine)}</td>
      <td>${className && methodName ? sourceLinkHtml(className, initialLine, methodName) : escapeHtml(methodName)}</td>
      <td>${escapeHtml(message)}</td>
      <td>${renderStackTraceCell(stackTrace, className)}</td>
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
      [decodeDeployText(w.namespace), decodeDeployText(w.name)].filter(Boolean).join('.') || decodeDeployText(w.id) || t('deployStatus.coverageFailure');
    const message = decodeDeployText(w.message);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="deploy-status-mono">${escapeHtml(classLabel)}</td>
      <td>${escapeHtml(message)}</td>
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

function updateDeployCoverageButton(row, soap) {
  const btn = document.getElementById('deployStatusCoverageBtn');
  if (!btn) return;
  const show = canShowDeployCoverage(soap, row);
  btn.classList.toggle('hidden', !show);
  btn.disabled = !show;
}

function closeDeployCoverageModal() {
  const modal = document.getElementById('deployStatusCoverageModal');
  if (!modal) return;
  unmountSfocOverlay(modal);
  const body = document.getElementById('deployStatusCoverageModalBody');
  if (body) body.innerHTML = '';
}

async function openDeployCoverageLineViewer(orgId, asyncId, classOrTriggerId, classLabel, uncoveredLines) {
  const res = await bg({
    type: 'deployStatus:getCoverageLineView',
    orgId,
    asyncId,
    classOrTriggerId,
    className: classLabel || '',
    uncoveredLines: uncoveredLines || []
  });
  if (!res?.ok) {
    showToast(
      res?.reason === 'NO_SID' ? t('deployStatus.noSession') : res?.error || t('deployStatus.coverageLinesError'),
      'warn'
    );
    return;
  }
  const key = randomStagingId('sfoc_cv_');
  try {
    await chrome.storage.local.set({
      [key]: {
        title: `${classLabel || res.name || classOrTriggerId} · ${t('docTitle.apexCoverage')}`,
        body: res.body != null ? String(res.body) : '',
        coveredLines: Array.isArray(res.coveredLines) ? res.coveredLines : [],
        uncoveredLines: Array.isArray(res.uncoveredLines) ? res.uncoveredLines : [],
        orgId
      }
    });
  } catch {
    showToast(t('deployStatus.coverageLinesStorageError'), 'warn');
    return;
  }
  const url = chrome.runtime.getURL(`code/apex-coverage-viewer.html?k=${encodeURIComponent(key)}`);
  window.open(url, '_blank');
}

function renderDeployCoverageModalBody(soap, asyncId) {
  const body = document.getElementById('deployStatusCoverageModalBody');
  if (!body) return;

  const classes = buildDeployCoverageRows(soap?.runTestResult?.codeCoverage, 0);

  body.innerHTML = '';

  if (!classes.length) {
    const empty = document.createElement('p');
    empty.className = 'apex-tests-coverage-empty';
    empty.textContent = t('deployStatus.coverageEmpty');
    body.appendChild(empty);
    return;
  }

  const filterRow = document.createElement('div');
  filterRow.className = 'apex-tests-coverage-filter-row';
  const filterInput = document.createElement('input');
  filterInput.type = 'search';
  filterInput.className = 'apex-tests-coverage-filter-input';
  filterInput.setAttribute('aria-label', t('deployStatus.coverageFilterAria'));
  filterInput.placeholder = t('deployStatus.coverageFilterPh');
  filterRow.appendChild(filterInput);
  body.appendChild(filterRow);

  const scroll = document.createElement('div');
  scroll.className = 'apex-tests-coverage-table-scroll';
  const tbl = document.createElement('table');
  tbl.className = 'apex-tests-coverage-table';
  tbl.innerHTML = `<thead><tr>
    <th>${escapeHtml(t('deployStatus.coverageColClass'))}</th>
    <th>${escapeHtml(t('deployStatus.coverageColPercent'))}</th>
    <th>${escapeHtml(t('deployStatus.coverageColLines'))}</th>
    <th scope="col" class="apex-tests-coverage-th-editor">${escapeHtml(t('deployStatus.coverageColEditor'))}</th>
  </tr></thead>`;
  const tb = document.createElement('tbody');
  const orgId = state.leftOrgId;
  for (const row of classes) {
    const rtr = document.createElement('tr');
    const c1 = document.createElement('td');
    c1.textContent = row.name || row.id || '—';
    const c2 = document.createElement('td');
    c2.className = 'apex-tests-coverage-pct';
    c2.textContent = formatDeployCoveragePercent(row.percent);
    const c3 = document.createElement('td');
    c3.className = 'apex-tests-coverage-pct';
    c3.textContent = `${row.covered} / ${row.total}`;
    const c4 = document.createElement('td');
    c4.className = 'apex-tests-coverage-td-editor';
    const btnEd = document.createElement('button');
    btnEd.type = 'button';
    btnEd.className = 'apex-tests-coverage-view-btn';
    btnEd.textContent = t('deployStatus.coverageOpenEditor');
    btnEd.addEventListener('click', (e) => {
      e.stopPropagation();
      void openDeployCoverageLineViewer(orgId, asyncId, row.id, row.name || '', row.uncoveredLines);
    });
    c4.appendChild(btnEd);
    rtr.appendChild(c1);
    rtr.appendChild(c2);
    rtr.appendChild(c3);
    rtr.appendChild(c4);
    tb.appendChild(rtr);
  }
  tbl.appendChild(tb);
  scroll.appendChild(tbl);
  body.appendChild(scroll);

  filterInput.addEventListener('input', () => {
    const q = filterInput.value.trim().toLowerCase();
    for (const rtr of tb.querySelectorAll('tr')) {
      const nameCell = rtr.cells[0];
      const hay = (nameCell?.textContent || '').toLowerCase();
      rtr.style.display = !q || hay.includes(q) ? '' : 'none';
    }
  });
}

async function openDeployCoverageModal() {
  const detail = lastPollData?.detail;
  const row = detail?.row;
  const soap = detail?.soap;
  const asyncId = String(row?.asyncId || selectedAsyncId || '').trim();
  if (!asyncId || !state.leftOrgId) return;

  const modal = document.getElementById('deployStatusCoverageModal');
  const body = document.getElementById('deployStatusCoverageModalBody');
  if (!modal || !body) return;

  mountSfocOverlay(modal, {
    initialFocus: document.getElementById('deployStatusCoverageModalClose'),
    onEscape: closeDeployCoverageModal
  });

  const titleEl = document.getElementById('deployStatusCoverageModalTitle');
  if (titleEl) {
    titleEl.textContent = t('deployStatus.coverageModalTitle');
  }

  body.innerHTML = `<p class="apex-tests-coverage-loading">${escapeHtml(t('deployStatus.coverageLoading'))}</p>`;

  let viewSoap = soap && isSoapDetailReady(soap) ? soap : null;
  if (!viewSoap || !viewSoap.runTestResult?.codeCoverage?.length) {
    const res = await bg({
      type: 'deployStatus:detail',
      orgId: state.leftOrgId,
      asyncId
    });
    if (!res?.ok) {
      body.innerHTML = `<p class="apex-tests-coverage-error">${escapeHtml(
        res?.reason === 'NO_SID' ? t('deployStatus.noSession') : res?.error || t('deployStatus.coverageLoadError')
      )}</p>`;
      return;
    }
    viewSoap = res.detail?.soap || null;
  }

  if (!viewSoap) {
    body.innerHTML = `<p class="apex-tests-coverage-error">${escapeHtml(t('deployStatus.coverageLoadError'))}</p>`;
    return;
  }

  renderDeployCoverageModalBody(viewSoap, asyncId);
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

  const sourcePickerHost = document.getElementById('deployStatusSourceOrgPickerHost');

  const titleEl = document.getElementById('deployStatusDetailViewTitle');
  if (titleEl) titleEl.innerHTML = buildStatusBadgeHtml(row, viewSoap, { useLongTitle: true });

  const idEl = document.getElementById('deployStatusDetailViewId');
  if (idEl) idEl.textContent = row.asyncId || '';

  const metaEl = document.getElementById('deployStatusDetailViewMeta');
  if (metaEl) metaEl.innerHTML = buildMetaListHtml(row, viewSoap);

  const setupEl = document.getElementById('deployStatusDetailViewSetup');
  if (setupEl) {
    setupEl.innerHTML = `<a href="${escapeHtml(setupUrl)}" target="_blank" rel="noopener noreferrer" class="deploy-status-setup-link">${escapeHtml(t('deployStatus.openInSetup'))}</a>`;
  }

  renderDonutsForRow(row, rawSoap, DETAIL_DEPLOY_CHART_IDS);

  if (soapReady) {
    const sourceAvailable = (rawSoap.componentFailures || []).some((failure) => isApexClassComponent(failure?.componentType) && isApexClassName(failure?.fullName)) ||
      (rawSoap.runTestResult?.failures || []).some((failure) => isApexClassName(decodeDeployText(failure?.className)) || parseApexStackTraceFrames(decodeDeployText(failure?.stackTrace)).length > 0);
    sourcePickerHost?.classList.toggle('hidden', !sourceAvailable);
    if (sourceAvailable) refreshDeploySourceOrgPicker();
    cacheDeployRowHintsFromSoap(row.asyncId, rawSoap);
    renderGlobalError(row, rawSoap);
    renderFailuresSection(rawSoap);
    renderTestFailuresSection(rawSoap);
    renderCoverageWarningsSection(rawSoap);
    renderSlowTestsSection(rawSoap);
    renderComponentsSection(rawSoap);
  } else {
    sourcePickerHost?.classList.add('hidden');
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
  updateDeployCoverageButton(row, soapReady ? rawSoap : viewSoap);
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
  renderPendingQueueTable(data?.pendingQueue || data?.pendingHistory, data?.active?.asyncId);
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
  syncDeployElapsedTicker(data);
}

function updateStatusBar(data, isLive) {
  const liveBadge = document.getElementById('deployStatusLiveBadge');
  liveBadge?.classList.toggle('hidden', !isLive || viewMode === 'detail');
}

function hasInFlightDeploy(data) {
  const activeRunning = !!data?.active && isDeployActivelyRunning(data.active, data?.activeSoap);
  const pendingCount =
    Number(data?.pendingQueue?.totalCount ?? data?.pendingQueue?.records?.length ?? data?.pendingHistory?.totalCount ?? 0) ||
    0;
  if (viewMode === 'summary' && (activeRunning || pendingCount > 0)) return true;
  if (viewMode !== 'detail') return false;
  const detail = data?.detail;
  if (!detail?.row) return false;
  return isDeployActivelyRunning(detail.row, detail.soap);
}

function computePollDelayMs(data) {
  return hasInFlightDeploy(data) ? POLL_ACTIVE_MS : POLL_IDLE_MS;
}

export function stopDeployStatusPolling() {
  if (pollTimeout) {
    clearTimeout(pollTimeout);
    pollTimeout = null;
  }
  stopDeployElapsedTicker();
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
  if (!await confirmSfocOrgAction({
    orgId: state.leftOrgId,
    description: t('deployStatus.cancelConfirm', { id: asyncId }),
    confirmLabel: t('modal.action.cancelDeployment'),
    risk: 'write'
  })) return;

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
  refreshDeploySourceOrgPicker();

  document.getElementById('deployStatusSourceOrgSelect')?.addEventListener('change', (ev) => {
    selectedDeploySourceOrgId = /** @type {HTMLSelectElement} */ (ev.target).value || '';
  });

  document.getElementById('deployStatusRefreshBtn')?.addEventListener('click', () => {
    void refreshDeployStatusPanel();
  });

  document.getElementById('deployStatusLookupBtn')?.addEventListener('click', () => {
    const input = document.getElementById('deployStatusLookupInput');
    const asyncId = input?.value?.trim() || '';
    if (!asyncId) {
      showToast(t('deployStatus.lookupMissing'), 'warn');
      return;
    }
    navigateToDetail(asyncId);
    void refreshDeployStatusPanel();
  });

  document.getElementById('deployStatusBackBtn')?.addEventListener('click', () => {
    handleDeployDetailBack();
  });

  document.getElementById('deployStatusViewSummaryBtn')?.addEventListener('click', () => {
    navigateToSummary();
  });

  document.getElementById('deployStatusBackToEditorBtn')?.addEventListener('click', () => {
    void returnToQuickEditEditor();
  });

  document.getElementById('deployStatusCancelBtn')?.addEventListener('click', () => {
    const btn = document.getElementById('deployStatusCancelBtn');
    const asyncId = btn?.getAttribute('data-cancel-deploy') || selectedAsyncId;
    void handleCancelDeploy(asyncId);
  });

  document.getElementById('deployStatusCoverageBtn')?.addEventListener('click', () => {
    void openDeployCoverageModal();
  });

  document.getElementById('deployStatusCoverageModalClose')?.addEventListener('click', () => {
    closeDeployCoverageModal();
  });

  document.getElementById('deployStatusCoverageModal')?.addEventListener('click', (ev) => {
    const target = /** @type {HTMLElement} */ (ev.target);
    if (target.closest('[data-deploy-coverage-close]')) closeDeployCoverageModal();
  });

  document.getElementById('deployStatusComponentsSearch')?.addEventListener('input', (ev) => {
    componentSearchQuery = /** @type {HTMLInputElement} */ (ev.target).value;
    if (lastPollData?.detail?.soap) renderComponentsSection(lastPollData.detail.soap);
  });

  document.getElementById('deployStatusPanel')?.addEventListener('click', (ev) => {
    const target = /** @type {HTMLElement} */ (ev.target);

    const sourceLink = target.closest('[data-deploy-source-class]');
    if (sourceLink) {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.ctrlKey || ev.metaKey) {
        const className = sourceLink.getAttribute('data-deploy-source-class') || '';
        const initialLine = Number(sourceLink.getAttribute('data-deploy-source-line'));
        void openDeployStatusApexSource(
          className,
          Number.isSafeInteger(initialLine) && initialLine > 0 ? initialLine : undefined
        );
      }
      return;
    }

    const inlineToggle = target.closest('[data-toggle-deploy-inline]');
    if (inlineToggle) {
      void toggleInlineFailedDeployDetails(inlineToggle.getAttribute('data-toggle-deploy-inline') || '');
      return;
    }

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

  document.getElementById('deployStatusPanel')?.addEventListener('change', (ev) => {
    const target = /** @type {HTMLElement} */ (ev.target);
    if (!target.matches('[data-deploy-inline-source-org]')) return;
    selectedDeploySourceOrgId = /** @type {HTMLSelectElement} */ (target).value || '';
    refreshDeploySourceOrgPicker();
    rerenderInlineFailedDeployments();
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (getSelectedArtifactType() !== 'DeployStatus') return;
    const covModal = document.getElementById('deployStatusCoverageModal');
    if (covModal && !covModal.classList.contains('hidden')) {
      ev.preventDefault();
      closeDeployCoverageModal();
      return;
    }
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
