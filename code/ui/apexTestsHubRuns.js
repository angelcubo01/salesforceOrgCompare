import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { t, getCurrentLang } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { buildOrgPicklistLabel } from '../../shared/orgPrefs.js';
import { extractApexTestRunJobId } from '../../shared/extractApexTestRunJobId.js';
import { logApexTestRunUsage } from './apexTestUsageLog.js';
import { handleToolError } from '../../shared/reportToolError.js';
import { exportApexTestRun } from './apexTestsExport.js';
import { openApexLogViewerWithPayload } from '../lib/openApexLogViewer.js';
import {
  getApexTestsPollIntervalMs,
  getExtensionSettingsSnapshot,
  getApexTestsMaxTrackedJobs,
  loadExtensionSettings,
  getApexTestsCoverageMinPercent,
  getApexTestsSkipCodeCoverage
} from '../../shared/extensionSettings.js';
import { parseApexStackFrameLine } from '../../shared/apexStackTraceParse.js';
import { escapeHtml } from '../../shared/htmlEscape.js';
import { sanitizeUiError } from '../../shared/sanitizeUiError.js';
import { randomStagingId } from '../../shared/randomId.js';
import {
  APEX_TEST_JOBS_TTL_MS,
  pruneExpiredStoredJobs
} from '../../shared/apexTestRunJobPrune.js';
import { apexTestRunHasFailures } from '../../shared/apexTestRunStatus.js';
import { sfApexIdKey, apexRunMatchesStoredJobId } from '../../shared/apexTestJobIdMatch.js';

const STORAGE_KEY = 'apexTestRunJobs';
const MAX_POLLS_ALL_MISSING = 10;
const HUB_POLL_ACTIVE_MS = 2000;
const HUB_POLL_IDLE_MS = 15000;

let hubTableDelegationBound = false;
let otherRunsDelegationBound = false;

let pollTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let hubPollTimeout = null;
let expandedMethodsTimer = null;
/** Rondas seguidas con todos los jobs «missing» (Id aún no visible); luego se para el polling. */
let consecutiveAllMissingPolls = 0;
let pollInFlight = false;
/** Si llega un tick mientras hay render en curso, se repite al terminar (p. ej. tras re-ejecutar). */
let pendingHubTick = false;
/** @type {string | null} clave `orgId:jobId` */
let expandedRunKey = null;
/** @type {Map<string, { rows: unknown[], error?: string }>} */
const failuresCache = new Map();
/** @type {Map<string, { rows: unknown[], error?: string }>} */
const methodsCache = new Map();
/** @type {{ key: string, res: { ok: boolean, runs?: unknown[], reason?: string, error?: string } } | null} */
let lastPollResult = null;
let coverageModalInitialized = false;
let viewTestModalInitialized = false;
let viewLogModalInitialized = false;
/** @type {{ orgId: string, options: { classId: string | null, className: string | null, label: string }[] } | null} */
let viewTestPickContext = null;

let apexRunsMoreMenuDismissBound = false;

function closeAllApexRunsMoreMenus() {
  for (const menu of document.querySelectorAll('.apex-tests-runs-more-menu.is-open')) {
    menu.classList.remove('is-open');
    menu.style.top = '';
    menu.style.left = '';
    menu.style.right = '';
    menu.style.bottom = '';
  }
  for (const btn of document.querySelectorAll('.apex-tests-runs-more-btn[aria-expanded="true"]')) {
    btn.setAttribute('aria-expanded', 'false');
  }
}

function positionApexRunsMoreMenu(btn, menu) {
  const r = btn.getBoundingClientRect();
  const gap = 4;
  menu.style.top = `${r.bottom + gap}px`;
  menu.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  menu.style.left = 'auto';
  menu.style.bottom = 'auto';
  const menuRect = menu.getBoundingClientRect();
  if (menuRect.bottom > window.innerHeight - 8) {
    menu.style.top = 'auto';
    menu.style.bottom = `${window.innerHeight - r.top + gap}px`;
  }
}

function ensureApexRunsMoreMenuDismiss() {
  if (apexRunsMoreMenuDismissBound) return;
  apexRunsMoreMenuDismissBound = true;
  document.addEventListener('click', () => closeAllApexRunsMoreMenus());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllApexRunsMoreMenus();
  });
}

function createApexRunActionIconSvg(kind) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = (d) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  };
  switch (kind) {
    case 'coverage':
      path('M12 20V10');
      path('M18 20V4');
      path('M6 20v-4');
      break;
    case 'log':
      path('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z');
      path('M14 2v6h6');
      path('M16 13H8');
      path('M16 17H8');
      break;
    case 'view':
      path('M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z');
      path('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z');
      break;
    case 'rerun':
      path('M21 12a9 9 0 1 1-2.64-6.36');
      path('M21 3v6h-6');
      break;
    case 'rerun-fail':
      path('M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z');
      path('M12 9v4');
      path('M12 17h.01');
      break;
    case 'abort':
      path('M18 6 6 18');
      path('M6 6l12 12');
      break;
    case 'more':
      path('M12 12h.01');
      path('M19 12h.01');
      path('M5 12h.01');
      break;
    default:
      path('M12 12h.01');
  }
  return svg;
}

/**
 * @param {{ icon: string, label: string, variant?: string, disabled?: boolean, title?: string, onClick?: (e: Event) => void }} opts
 */
function createApexRunActionButton(opts) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'apex-tests-runs-action-btn';
  if (opts.variant) btn.classList.add(`apex-tests-runs-action-btn--${opts.variant}`);
  btn.disabled = !!opts.disabled;
  btn.title = opts.title || opts.label;
  btn.setAttribute('aria-label', opts.label);
  const icon = document.createElement('span');
  icon.className = 'apex-tests-runs-action-icon';
  icon.appendChild(createApexRunActionIconSvg(opts.icon));
  const txt = document.createElement('span');
  txt.className = 'apex-tests-runs-action-label';
  txt.textContent = opts.label;
  btn.appendChild(icon);
  btn.appendChild(txt);
  if (opts.onClick) btn.addEventListener('click', opts.onClick);
  return btn;
}

function createApexRunsActionGroup(children) {
  const g = document.createElement('div');
  g.className = 'apex-tests-runs-action-group';
  for (const c of children) {
    if (c) g.appendChild(c);
  }
  return g;
}

/**
 * @param {{ disabled?: boolean, onExportCsv: () => void, onExportJson: () => void, extraItems?: { label: string, onClick: () => void, disabled?: boolean }[] }} opts
 */
function createApexRunsMoreOptionsMenu(opts) {
  const wrap = document.createElement('div');
  wrap.className = 'apex-tests-runs-more-wrap';

  const btn = createApexRunActionButton({
    icon: 'more',
    label: t('apexTests.runsMoreOptions'),
    disabled: !!opts.disabled
  });
  btn.classList.add('apex-tests-runs-more-btn');
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');

  const menu = document.createElement('div');
  menu.className = 'apex-tests-runs-more-menu';
  menu.setAttribute('role', 'menu');

  for (const item of opts.extraItems || []) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'apex-tests-runs-more-item';
    el.setAttribute('role', 'menuitem');
    el.textContent = item.label;
    el.disabled = !!item.disabled;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllApexRunsMoreMenus();
      if (el.disabled) return;
      item.onClick();
    });
    menu.appendChild(el);
  }

  const itemCsv = document.createElement('button');
  itemCsv.type = 'button';
  itemCsv.className = 'apex-tests-runs-more-item';
  itemCsv.setAttribute('role', 'menuitem');
  itemCsv.textContent = t('apexTests.exportCsvMenuItem');

  const itemJson = document.createElement('button');
  itemJson.type = 'button';
  itemJson.className = 'apex-tests-runs-more-item';
  itemJson.setAttribute('role', 'menuitem');
  itemJson.textContent = t('apexTests.exportJsonMenuItem');

  menu.appendChild(itemCsv);
  menu.appendChild(itemJson);
  wrap.appendChild(btn);
  wrap.appendChild(menu);

  menu.addEventListener('click', (e) => e.stopPropagation());

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (btn.disabled) return;
    const willOpen = !menu.classList.contains('is-open');
    closeAllApexRunsMoreMenus();
    if (willOpen) {
      menu.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      positionApexRunsMoreMenu(btn, menu);
    }
  });

  itemCsv.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllApexRunsMoreMenus();
    if (btn.disabled) return;
    opts.onExportCsv();
  });

  itemJson.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllApexRunsMoreMenus();
    if (btn.disabled) return;
    opts.onExportJson();
  });

  return wrap;
}

export async function clearAllApexTestRunHistory() {
  if (!window.confirm(t('apexTests.runsClearHistoryConfirm'))) return;
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: [] });
  } catch {
    /* ignore */
  }
  failuresCache.clear();
  methodsCache.clear();
  lastPollResult = null;
  expandedRunKey = null;
  consecutiveAllMissingPolls = 0;
  closeAllApexRunsMoreMenus();
  closeHubExpandedDetail();
  showToast(t('apexTests.runsClearHistoryDone'), 'success');
  void tickApexTestsHubRuns();
}

let clearRunsBtnBound = false;

export function initApexTestsClearRunsButton() {
  if (clearRunsBtnBound) return;
  const btn = document.getElementById('apexTestsClearRunsBtn');
  if (!btn) return;
  clearRunsBtnBound = true;
  btn.addEventListener('click', () => void clearAllApexTestRunHistory());
}

function syncClearRunsButtonState(listLength) {
  const btn = document.getElementById('apexTestsClearRunsBtn');
  if (btn) btn.disabled = !(listLength > 0);
}

function parseOtherRunJobStartedMs(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isFinite(n) && /^\d+$/.test(s)) {
    if (n >= 1e12) return n;
    if (n >= 1e9) return n * 1000;
    return n;
  }
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : parsed;
}

function filterOtherRunsJobsByRetention(jobs) {
  const cutoff = Date.now() - APEX_TEST_JOBS_TTL_MS;
  return (jobs || []).filter((j) => {
    const ms = parseOtherRunJobStartedMs(j?.date);
    if (ms == null) return true;
    return ms >= cutoff;
  });
}

export function initApexTestsCoverageModal() {
  if (coverageModalInitialized) return;
  coverageModalInitialized = true;
  const modal = document.getElementById('apexTestsCoverageModal');
  const closeBtn = document.getElementById('apexTestsCoverageModalClose');
  const backdrop = modal?.querySelector('[data-apex-coverage-close]');
  const close = () => {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  };
  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) close();
  });
}

export function initApexTestsViewTestModal() {
  if (viewTestModalInitialized) return;
  viewTestModalInitialized = true;
  const modal = document.getElementById('apexTestsViewTestModal');
  const closeBtn = document.getElementById('apexTestsViewTestModalClose');
  const openBtn = document.getElementById('apexTestsViewTestModalOpen');
  const body = document.getElementById('apexTestsViewTestModalBody');
  const backdrop = modal?.querySelector('[data-apex-view-test-close]');
  const close = () => {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    viewTestPickContext = null;
    if (body) body.innerHTML = '';
  };
  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  openBtn?.addEventListener('click', () => {
    if (!viewTestPickContext || !body) return;
    const picked = body.querySelector('input[name="apexTestsViewTestPick"]:checked');
    const ix = picked && picked.value !== '' ? Number(picked.value) : 0;
    const opt = viewTestPickContext.options[ix];
    if (!opt) return;
    const oid = viewTestPickContext.orgId;
    close();
    void openApexTestClassInMonaco(oid, opt);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) close();
  });
}

export function initApexTestsViewLogModal() {
  if (viewLogModalInitialized) return;
  viewLogModalInitialized = true;
  const modal = document.getElementById('apexTestsViewLogModal');
  const closeBtn = document.getElementById('apexTestsViewLogModalClose');
  const body = document.getElementById('apexTestsViewLogModalBody');
  const backdrop = modal?.querySelector('[data-apex-view-log-close]');
  const close = () => {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    if (body) body.innerHTML = '';
  };
  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) close();
  });
}

/**
 * @param {string} stackText
 * @param {string} orgId
 */
function buildStackTracePreWithCtrlLinks(stackText, orgId) {
  const pre = document.createElement('pre');
  pre.className = 'apex-tests-runs-stacktrace-pre';
  const lines = String(stackText).split(/\r?\n/);
  lines.forEach((line, i) => {
    if (i > 0) pre.appendChild(document.createTextNode('\n'));
    const parsed = parseApexStackFrameLine(line);
    if (parsed) {
      const span = document.createElement('span');
      span.className = 'apex-tests-stacktrace-frame';
      span.textContent = line;
      span.dataset.apexStackClass = parsed.className;
      span.dataset.apexStackLine = String(parsed.line);
      pre.appendChild(span);
    } else {
      pre.appendChild(document.createTextNode(line));
    }
  });
  pre.addEventListener('click', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    const span = e.target.closest('.apex-tests-stacktrace-frame');
    if (!span) return;
    e.preventDefault();
    e.stopPropagation();
    const cn = span.dataset.apexStackClass;
    const ln = parseInt(span.dataset.apexStackLine, 10);
    if (!cn || !Number.isFinite(ln)) return;
    void openApexTestClassInMonaco(
      orgId,
      { className: cn, classId: null, label: cn },
      { initialLine: ln }
    );
  });
  return pre;
}

function testClassOptionsFromRunBody(runBody) {
  if (!runBody || typeof runBody !== 'object') return [];
  const tests = runBody.tests;
  if (!Array.isArray(tests) || !tests.length) return [];
  const seen = new Set();
  const out = [];
  for (const entry of tests) {
    if (!entry || typeof entry !== 'object') continue;
    const classId = entry.classId != null ? String(entry.classId).trim() : '';
    const className = entry.className != null ? String(entry.className).trim() : '';
    if (!classId && !className) continue;
    const key = classId || `name:${className}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = className || shortId(classId);
    out.push({
      classId: classId || null,
      className: className || null,
      label
    });
  }
  return out;
}

/** Nombre seguro para fichero (descarga visor); sin ruta. */
function sanitizeApexViewerDownloadFileName(name) {
  const s = String(name || '')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return s || 'file';
}

async function openApexTestClassInMonaco(orgId, pick, opts = {}) {
  const res = await bg({
    type: 'apexTests:getTestClassSource',
    orgId,
    classId: pick.classId || undefined,
    className: pick.className || undefined
  });
  if (!res.ok) {
    const msg =
      res.reason === 'NO_SID'
        ? t('toast.noSession')
        : String(res.error) === 'NOT_FOUND'
          ? t('apexTests.viewTestNotFound')
          : res.error || t('apexTests.viewTestError');
    showToast(msg, 'error');
    return;
  }
  const name = res.name || pick.label || 'ApexClass';
  const initialLine =
    opts.initialLine != null && Number.isFinite(Number(opts.initialLine))
      ? Math.max(1, Math.floor(Number(opts.initialLine)))
      : undefined;
  const downloadFileName = `${sanitizeApexViewerDownloadFileName(name.replace(/\.cls$/i, ''))}.cls`;
  const ok = await openApexLogViewerWithPayload(
    `${name}.cls · ${t('docTitle.apexTestClass')}`,
    res.body != null ? String(res.body) : '',
    {
      ...(initialLine != null ? { initialLine } : {}),
      downloadFileName
    }
  );
  if (!ok) showToast(t('apexTests.viewTestStorageError'), 'warn');
}

function openViewTestPicker(orgId, runBody) {
  const options = testClassOptionsFromRunBody(runBody);
  if (!options.length) {
    showToast(t('apexTests.viewTestNoClasses'), 'warn');
    return;
  }
  if (options.length === 1) {
    void openApexTestClassInMonaco(orgId, options[0]);
    return;
  }
  const modal = document.getElementById('apexTestsViewTestModal');
  const body = document.getElementById('apexTestsViewTestModalBody');
  if (!modal || !body) return;
  viewTestPickContext = { orgId: String(orgId), options };
  body.innerHTML = '';
  options.forEach((opt, ix) => {
    const lab = document.createElement('label');
    lab.className = 'apex-tests-view-test-option';
    const inp = document.createElement('input');
    inp.type = 'radio';
    inp.name = 'apexTestsViewTestPick';
    inp.value = String(ix);
    if (ix === 0) inp.checked = true;
    const sp = document.createElement('span');
    sp.textContent = opt.label;
    lab.appendChild(inp);
    lab.appendChild(sp);
    lab.addEventListener('click', () => {
      inp.checked = true;
    });
    body.appendChild(lab);
  });
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function formatCoveragePercent(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n * 1000) / 10} %`;
}

async function openRunCoverageModal(orgId, jobIdForApi) {
  const modal = document.getElementById('apexTestsCoverageModal');
  const body = document.getElementById('apexTestsCoverageModalBody');
  if (!modal || !body) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  await loadExtensionSettings();
  const minCoveragePercent = getApexTestsCoverageMinPercent();
  const titleEl = document.getElementById('apexTestsCoverageModalTitle');
  if (titleEl) {
    titleEl.textContent = t('apexTests.coverageModalTitle', { minPercent: minCoveragePercent });
  }
  body.innerHTML = `<p class="apex-tests-coverage-loading">${t('apexTests.coverageLoading')}</p>`;
  const res = await bg({
    type: 'apexTests:getRunCoverage',
    orgId,
    jobId: jobIdForApi,
    minCoveragePercent
  });
  if (!res.ok) {
    const errMsg =
      res.reason === 'NO_SID'
        ? t('toast.noSession')
        : sanitizeUiError(res.error) || t('apexTests.coverageLoadError');
    body.innerHTML = `<p class="apex-tests-coverage-error">${escapeHtml(errMsg)}</p>`;
    return;
  }
  const thresh = Math.min(1, Math.max(0, minCoveragePercent / 100));
  const classes = (res.classes || []).filter((row) => {
    const p = Number(row.percent);
    return Number.isFinite(p) && p + 1e-9 >= thresh;
  });
  if (!classes.length) {
    body.innerHTML = `<p class="apex-tests-coverage-empty">${t('apexTests.coverageEmpty')}</p>`;
    return;
  }
  const filterRow = document.createElement('div');
  filterRow.className = 'apex-tests-coverage-filter-row';
  const filterInput = document.createElement('input');
  filterInput.type = 'search';
  filterInput.className = 'apex-tests-coverage-filter-input';
  filterInput.setAttribute('aria-label', t('apexTests.coverageFilterAria'));
  filterInput.placeholder = t('apexTests.coverageFilterPh');
  filterRow.appendChild(filterInput);

  const scroll = document.createElement('div');
  scroll.className = 'apex-tests-coverage-table-scroll';

  const tbl = document.createElement('table');
  tbl.className = 'apex-tests-coverage-table';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>
    <th>${t('apexTests.coverageColClass')}</th>
    <th>${t('apexTests.coverageColPercent')}</th>
    <th>${t('apexTests.coverageColLines')}</th>
    <th scope="col" class="apex-tests-coverage-th-editor">${t('apexTests.coverageColEditor')}</th>
  </tr>`;
  tbl.appendChild(thead);
  const tb = document.createElement('tbody');
  for (const row of classes) {
    const rtr = document.createElement('tr');
    const c1 = document.createElement('td');
    c1.textContent = row.name || row.id || '—';
    const c2 = document.createElement('td');
    c2.className = 'apex-tests-coverage-pct';
    c2.textContent = formatCoveragePercent(row.percent);
    const c3 = document.createElement('td');
    c3.className = 'apex-tests-coverage-pct';
    c3.textContent = `${row.covered} / ${row.total}`;
    const c4 = document.createElement('td');
    c4.className = 'apex-tests-coverage-td-editor';
    const btnEd = document.createElement('button');
    btnEd.type = 'button';
    btnEd.className = 'apex-tests-coverage-view-btn';
    btnEd.textContent = t('apexTests.coverageOpenEditor');
    btnEd.addEventListener('click', (e) => {
      e.stopPropagation();
      void openCoverageLineViewer(orgId, jobIdForApi, row.id, row.name || '');
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

  filterInput.addEventListener('input', () => {
    const q = filterInput.value.trim().toLowerCase();
    for (const rtr of tb.querySelectorAll('tr')) {
      const nameCell = rtr.cells[0];
      const hay = (nameCell?.textContent || '').toLowerCase();
      rtr.style.display = !q || hay.includes(q) ? '' : 'none';
    }
  });

  body.innerHTML = '';
  body.appendChild(filterRow);
  body.appendChild(scroll);
}

async function openCoverageLineViewer(orgId, jobId, classOrTriggerId, classLabel) {
  const res = await bg({
    type: 'apexTests:getCoverageLineView',
    orgId,
    jobId,
    classOrTriggerId,
    className: classLabel || ''
  });
  if (!res.ok) {
    showToast(
      res.reason === 'NO_SID'
        ? t('toast.noSession')
        : res.error === 'NO_TEST_RESULTS'
          ? t('apexTests.coverageLinesNoTests')
          : res.error || t('apexTests.coverageLinesError'),
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
    showToast(t('apexTests.coverageLinesStorageError'), 'warn');
    return;
  }
  const url = chrome.runtime.getURL(`code/apex-coverage-viewer.html?k=${encodeURIComponent(key)}`);
  window.open(url, '_blank');
}

export function closeHubExpandedDetail() {
  expandedRunKey = null;
  closeExpandedDetailRows();
  syncAllExpandButtonStates();
}

function classIdFromRunBodyForName(runBody, className) {
  if (!runBody || typeof runBody !== 'object' || !Array.isArray(runBody.tests)) return '';
  const want = String(className || '').trim();
  if (!want) return '';
  for (const te of runBody.tests) {
    if (!te || typeof te !== 'object') continue;
    const cn = te.className != null ? String(te.className).trim() : '';
    const cid = te.classId != null ? String(te.classId).trim() : '';
    if (cid && cn === want) return cid;
  }
  return '';
}

function apexClassIdFromResult(row) {
  const ac = row && row.ApexClass;
  if (ac && typeof ac === 'object' && ac.Id != null) return String(ac.Id).trim();
  return '';
}

async function rerunFailedMethodsFromJob(rowOrgId, jobId, storedJob) {
  const fails = await loadFailures(rowOrgId, jobId, { useCache: true });
  if (!fails.rows?.length) {
    showToast(t('apexTests.rerunFailuresEmpty'), 'warn');
    return;
  }
  /** @type {Map<string, { classId: string, methods: Set<string> }>} */
  const byClass = new Map();
  for (const r of fails.rows) {
    const cn = apexClassNameFromResult(r);
    const mn = r?.MethodName != null ? String(r.MethodName).trim() : '';
    if (!cn || cn === '—' || !mn) continue;
    if (!byClass.has(cn)) {
      byClass.set(cn, { classId: apexClassIdFromResult(r), methods: new Set() });
    } else {
      const entry = byClass.get(cn);
      if (!entry.classId) entry.classId = apexClassIdFromResult(r);
    }
    byClass.get(cn).methods.add(mn);
  }
  const tests = [];
  for (const [cn, { classId, methods }] of byClass) {
    const resolvedId =
      classId || classIdFromRunBodyForName(storedJob?.runBody, cn) || '';
    const entry = {
      testMethods: [...methods].sort((a, b) => a.localeCompare(b))
    };
    if (resolvedId) {
      entry.classId = resolvedId;
      entry.className = cn;
    } else {
      entry.className = cn;
    }
    tests.push(entry);
  }
  if (!tests.length) {
    showToast(t('apexTests.rerunFailuresEmpty'), 'warn');
    return;
  }
  const skipCodeCoverage =
    storedJob?.runBody && typeof storedJob.runBody === 'object' && storedJob.runBody.skipCodeCoverage === true
      ? true
      : getApexTestsSkipCodeCoverage();
  const runBody = { tests, testLevel: 'RunSpecifiedTests', skipCodeCoverage };
  const envLabel =
    (storedJob?.envLabel && String(storedJob.envLabel).trim()) ||
    storedJob?.displayEnv ||
    '';
  const res = await bg({ type: 'apexTests:run', orgId: rowOrgId, runBody });
  if (!res.ok) {
    showToast(
      res.reason === 'NO_SID' ? t('toast.noSession') : res.error || t('apexTests.runError'),
      'error'
    );
    return;
  }
  const id = extractApexTestRunJobId(res.result);
  void logApexTestRunUsage(rowOrgId, runBody);
  if (id) {
    await rememberApexTestRunJob(rowOrgId, id, envLabel, runBody, res.traceFlagId);
    showToast(t('apexTests.rerunFailuresStarted', { id }), 'success');
    void tickApexTestsHubRuns();
  } else {
    showToast(t('apexTests.runOkNoId'), 'warn');
  }
}

async function rerunStoredApexJob(rowOrgId, storedJob) {
  let jid = storedJob?.jobId;
  let rb = storedJob?.runBody;
  let envLabelForRemember =
    (storedJob?.envLabel && String(storedJob.envLabel).trim()) ||
    storedJob?.displayEnv ||
    '';
  try {
    const list = await loadAllStoredJobs();
    const fresh = list.find(
      (x) => String(x.orgId) === String(rowOrgId) && String(x.jobId) === String(jid)
    );
    if (fresh?.runBody && typeof fresh.runBody === 'object') {
      rb = fresh.runBody;
    }
    if (fresh?.jobId != null) jid = fresh.jobId;
    if (fresh?.envLabel != null && String(fresh.envLabel).trim()) {
      envLabelForRemember = String(fresh.envLabel).trim().slice(0, 240);
    }
  } catch {
    /* usar storedJob tal cual */
  }
  if (!rb || typeof rb !== 'object') {
    showToast(t('apexTests.rerunNoSnapshot'), 'warn');
    return;
  }
  const polls = lastPollResult?.pollsByOrgId;
  const poll = polls?.[String(rowOrgId)];
  if (poll?.ok && jid != null) {
    const run = pickRunForStoredJob(poll, jid);
    if (run.job && isApexAsyncJobInFlightStatus(run.job.Status)) {
      showToast(t('apexTests.rerunBlockedSelf'), 'warn');
      return;
    }
    const runMap = buildRunJobIdMap(poll);
    const list = await loadAllStoredJobs();
    if (hasOtherInFlightSameRunBody(String(rowOrgId), jid, rb, list, runMap)) {
      showToast(t('apexTests.rerunBlockedDuplicate'), 'warn');
      return;
    }
  }
  const res = await bg({ type: 'apexTests:run', orgId: rowOrgId, runBody: rb });
  if (!res.ok) {
    showToast(
      res.reason === 'NO_SID' ? t('toast.noSession') : res.error || t('apexTests.runError'),
      'error'
    );
    return;
  }
  const id = extractApexTestRunJobId(res.result);
  void logApexTestRunUsage(rowOrgId, rb);
  if (id) {
    await rememberApexTestRunJob(rowOrgId, id, envLabelForRemember, rb, res.traceFlagId);
    showToast(t('apexTests.rerunStarted', { id }), 'success');
    void tickApexTestsHubRuns();
  } else {
    showToast(t('apexTests.runOkNoId'), 'warn');
  }
}

/**
 * Tabla de Ids de ApexLog (mismo estilo que el modal de cobertura); botón por fila.
 * @param {string} orgId
 * @param {unknown} job
 * @param {string} displayJobId
 * @param {{ Id?: string }[]} logs
 */
function openViewLogRecordsModal(orgId, job, displayJobId, logs) {
  const modal = document.getElementById('apexTestsViewLogModal');
  const body = document.getElementById('apexTestsViewLogModalBody');
  const titleEl = document.getElementById('apexTestsViewLogModalTitle');
  if (!modal || !body) return;
  if (titleEl) titleEl.textContent = t('apexTests.viewLogModalTitle');
  body.innerHTML = '';

  const scroll = document.createElement('div');
  scroll.className = 'apex-tests-coverage-table-scroll';

  const tbl = document.createElement('table');
  tbl.className = 'apex-tests-coverage-table';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>
    <th>${t('apexTests.viewLogTableColId')}</th>
    <th>${t('apexTests.viewLogTableColType')}</th>
    <th>${t('apexTests.viewLogTableColName')}</th>
    <th>${t('apexTests.viewLogTableColMethod')}</th>
    <th scope="col" class="apex-tests-coverage-th-editor">${t('apexTests.viewLogTableColAction')}</th>
  </tr>`;
  tbl.appendChild(thead);
  const tb = document.createElement('tbody');
  const oid = String(orgId);
  const dj = String(displayJobId);

  const closeModal = () => {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    body.innerHTML = '';
  };

  for (const row of logs) {
    const rid = row.Id != null && String(row.Id).trim() ? String(row.Id).trim() : '';
    const rtr = document.createElement('tr');
    const c1 = document.createElement('td');
    c1.className = 'apex-tests-view-log-table-id-cell';
    c1.textContent = rid || '—';
    const c2 = document.createElement('td');
    c2.textContent = row?.Type ? String(row.Type) : 'N/A';
    const c3 = document.createElement('td');
    c3.textContent = row?.Name ? String(row.Name) : 'N/A';
    const c4 = document.createElement('td');
    c4.textContent = row?.Method ? String(row.Method) : 'N/A';
    const c5 = document.createElement('td');
    c5.className = 'apex-tests-coverage-td-editor';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'apex-tests-coverage-view-btn';
    btn.textContent = t('apexTests.viewLogOpen');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!rid) return;
      closeModal();
      void openTestRunLogTab(oid, job, dj, { logId: rid });
    });
    c5.appendChild(btn);
    rtr.appendChild(c1);
    rtr.appendChild(c2);
    rtr.appendChild(c3);
    rtr.appendChild(c4);
    rtr.appendChild(c5);
    tb.appendChild(rtr);
  }
  tbl.appendChild(tb);
  scroll.appendChild(tbl);
  body.appendChild(scroll);

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

async function openTestRunLogTab(orgId, job, displayJobId, opts = {}) {
  const logId = opts.logId != null ? String(opts.logId).trim() : '';
  const failJobId = job?.Id || displayJobId;
  showToastWithSpinner(t('apexTests.logOpening'));
  try {
    const res = await bg({
      type: 'apexTests:getTestRunLog',
      /** Sin esto, un `logId` residual en el mensaje abría el cuerpo sin pasar por la lista. */
      intent: logId ? 'body' : 'list',
      orgId,
      jobId: failJobId,
      ...(logId ? { logId } : {}),
      createdDate: job?.CreatedDate,
      completedDate: job?.CompletedDate,
      createdById: job?.CreatedById
    });
    if (!res.ok) {
      const msg =
        res.reason === 'NO_SID'
          ? t('toast.noSession')
          : String(res.error) === 'NO_APEX_LOGS_TRACES'
            ? t('apexTests.logNoLogsTraces')
            : String(res.error) === 'NO_LOG_USER'
              ? t('apexTests.logNoJobUser')
              : String(res.error) === 'NO_JOB_START'
                ? t('apexTests.logNoJobStart')
                : res.error || t('apexTests.logOpenError');
      showToast(msg, 'warn');
      return;
    }
    if (res.pick && Array.isArray(res.logs) && res.logs.length) {
      openViewLogRecordsModal(orgId, job, displayJobId, res.logs);
      return;
    }
    const lid =
      res.logId != null && String(res.logId).trim() ? String(res.logId).trim() : '';
    const parts = [t('docTitle.apexLog')];
    if (lid) parts.push(lid);
    const title = parts.join(' · ');
    const content = res.body != null ? String(res.body) : '';
    const downloadFileName = lid ? `${sanitizeApexViewerDownloadFileName(lid)}.log` : undefined;
    const ok = await openApexLogViewerWithPayload(title, content, {
      ...(downloadFileName ? { downloadFileName } : {})
    });
    if (!ok) showToast(t('apexTests.logOpenError'), 'warn');
  } finally {
    dismissSpinnerToast();
  }
}

function openTestRunLogFromHubRow(orgId, job, displayJobId) {
  void openTestRunLogTab(orgId, job, displayJobId, {});
}

function isRunnerVisible() {
  const r = document.getElementById('apexTestsRunnerView');
  return !!(r && !r.classList.contains('hidden'));
}

async function persistPrunedJobsIfNeeded(raw, pruned) {
  if (pruned.length === raw.length) return;
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: pruned });
  } catch {
    /* ignore */
  }
}

async function loadAllStoredJobs() {
  try {
    const res = await chrome.storage.local.get(STORAGE_KEY);
    const raw = Array.isArray(res[STORAGE_KEY]) ? res[STORAGE_KEY] : [];
    const pruned = pruneExpiredStoredJobs(raw);
    if (pruned.length !== raw.length) {
      try {
        await chrome.storage.local.set({ [STORAGE_KEY]: pruned });
      } catch {
        /* ignore */
      }
    }
    return pruned;
  } catch {
    return [];
  }
}

export async function rememberApexTestRunJob(orgId, jobId, envLabel, runBody, traceFlagId) {
  if (!orgId || !jobId) return;
  const oid = String(orgId);
  const jid = String(jobId);
  const label =
    envLabel != null && String(envLabel).trim() ? String(envLabel).trim().slice(0, 240) : '';
  let bodySnap = null;
  if (runBody && typeof runBody === 'object') {
    try {
      bodySnap = JSON.parse(JSON.stringify(runBody));
    } catch {
      bodySnap = null;
    }
  }
  const tf =
    traceFlagId != null && String(traceFlagId).trim()
      ? String(traceFlagId).replace(/[^a-zA-Z0-9]/g, '')
      : undefined;
  const list = pruneExpiredStoredJobs(await loadAllStoredJobs());
  const filtered = list.filter((j) => !(String(j.jobId) === jid && String(j.orgId) === oid));
  const row = { orgId: oid, jobId: jid, startedAt: Date.now(), envLabel: label, runBody: bodySnap };
  if (tf) row.traceFlagId = tf;
  const next = [row, ...filtered].slice(0, getApexTestsMaxTrackedJobs());
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
  } catch {
    /* ignore */
  }
  failuresCache.delete(`${oid}:${jid}`);
  methodsCache.delete(`${oid}:${jid}`);
  /* Nuevo job: invalidar cache de poll y el contador que puede parar el intervalo si todo iba «missing». */
  lastPollResult = null;
  consecutiveAllMissingPolls = 0;
  /* No llamar a tick aquí: si el runner sigue visible, tick aborta y la tabla no se actualiza. */
}

export function stopApexTestsHubPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (hubPollTimeout) {
    clearTimeout(hubPollTimeout);
    hubPollTimeout = null;
  }
  if (expandedMethodsTimer) {
    clearInterval(expandedMethodsTimer);
    expandedMethodsTimer = null;
  }
}

function hubHasInFlightRuns() {
  const polls = lastPollResult?.pollsByOrgId;
  if (!polls) return true;
  for (const p of Object.values(polls)) {
    if (!p?.ok || !Array.isArray(p.runs)) continue;
    for (const r of p.runs) {
      if (r.missing || !r.job) continue;
      if (isApexAsyncJobInFlightStatus(r.job.Status)) return true;
    }
  }
  return false;
}

function computeHubPollDelayMs() {
  const base = getApexTestsPollIntervalMs();
  if (expandedRunKey) return Math.min(base, HUB_POLL_ACTIVE_MS);
  if (hubHasInFlightRuns()) return Math.min(base, HUB_POLL_ACTIVE_MS);
  return base;
}

function scheduleHubPollLoop() {
  if (hubPollTimeout) clearTimeout(hubPollTimeout);
  hubPollTimeout = window.setTimeout(() => {
    hubPollTimeout = null;
    if (getSelectedArtifactType() !== 'ApexTests' || isRunnerVisible()) {
      scheduleHubPollLoop();
      return;
    }
    void tickApexTestsHubRuns();
    if (expandedRunKey) {
      void refreshExpandedJobStatusInPlace();
    }
    scheduleHubPollLoop();
  }, computeHubPollDelayMs());
}

/**
 * Al cerrar code.html solo se limpia estado en memoria; los jobs en storage persisten 24 h.
 */
export function setupClearApexTestJobsOnPageClose() {
  const clear = () => {
    stopApexTestsHubPolling();
    failuresCache.clear();
    methodsCache.clear();
    expandedRunKey = null;
    lastPollResult = null;
    consecutiveAllMissingPolls = 0;
  };
  window.addEventListener(
    'pagehide',
    (ev) => {
      if (ev.persisted) return;
      clear();
    },
    { capture: true }
  );
}

export function updateApexTestsHubPollingState() {
  stopApexTestsHubPolling();
  consecutiveAllMissingPolls = 0;
  if (getSelectedArtifactType() !== 'ApexTests') return;
  if (isRunnerVisible()) return;
  scheduleHubPollLoop();
  let expandedMethodsIntervalMs = 4000;
  try {
    const cfg = getExtensionSettingsSnapshot();
    const n = Number(cfg?.apexTestsExpandedMethodsPollIntervalMs);
    if (Number.isFinite(n) && n >= 1000) expandedMethodsIntervalMs = n;
  } catch {
    expandedMethodsIntervalMs = 4000;
  }
  expandedMethodsTimer = window.setInterval(() => {
    if (!expandedRunKey) return;
    if (getSelectedArtifactType() !== 'ApexTests' || isRunnerVisible()) return;
    void refreshExpandedMethodsInPlace();
  }, expandedMethodsIntervalMs);
  void tickApexTestsHubRuns();
}

export async function tickApexTestsHubRuns() {
  if (getSelectedArtifactType() !== 'ApexTests' || isRunnerVisible()) {
    if (!isRunnerVisible() && getSelectedArtifactType() !== 'ApexTests') stopApexTestsHubPolling();
    return;
  }
  if (pollInFlight) {
    pendingHubTick = true;
    return;
  }
  pollInFlight = true;
  try {
    await renderHubRunsTable();
  } finally {
    pollInFlight = false;
    if (pendingHubTick) {
      pendingHubTick = false;
      void tickApexTestsHubRuns();
    }
  }
}

function shortId(id) {
  const s = String(id || '');
  if (s.length <= 20) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

/** Fecha/hora local en que se encoló el run (guardado en `startedAt`). */
function formatTestRunStartedAt(startedAt) {
  const n = Number(startedAt);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const locale = getCurrentLang() === 'en' ? 'en-GB' : 'es-ES';
  try {
    return new Date(n).toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return '—';
  }
}

function classNameFromRunBodyForClassId(runBody, classId) {
  if (!runBody || typeof runBody !== 'object' || !Array.isArray(runBody.tests)) return '';
  const want = sfApexIdKey(classId);
  if (!want) return '';
  for (const te of runBody.tests) {
    if (!te || typeof te !== 'object' || !te.classId) continue;
    if (sfApexIdKey(te.classId) !== want) continue;
    const n = te.className != null ? String(te.className).trim() : '';
    if (n) return n;
  }
  return '';
}

/**
 * ApexTestQueueServlet devuelve a menudo `01p… · MiClase_Test`; en estado solo mostramos el nombre.
 */
function friendlyQueueTestClassLabel(raw, runBody) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const chunks = s.split(' · ');
  if (chunks.length >= 2) {
    const tail = chunks.slice(1).join(' · ').trim();
    if (tail) return tail;
    const head = chunks[0].trim();
    const fromBody = classNameFromRunBodyForClassId(runBody, head);
    if (fromBody) return fromBody;
    return head || s;
  }
  const narrow = s.match(/^(.+?)\s*·\s*(.+)$/);
  if (narrow) {
    const tail = narrow[2].trim();
    if (tail) return tail;
    const head = narrow[1].trim();
    const fromBody = classNameFromRunBodyForClassId(runBody, head);
    if (fromBody) return fromBody;
    return head || s;
  }
  const idOnly = s;
  if (/^01p[a-zA-Z0-9]{9,}$/i.test(idOnly) || /^[a-zA-Z0-9]{15}$/i.test(idOnly)) {
    const fromBody = classNameFromRunBodyForClassId(runBody, idOnly);
    if (fromBody) return fromBody;
  }
  return s;
}

/**
 * Texto para notificación al completar: nombres de clase (cola o runBody) o fallback neutro.
 */
function formatApexTestNotificationClassSummary(j, run, jobId) {
  const rb = j.runBody;
  const labels = [];
  const qrows = Array.isArray(run.queueRows) ? run.queueRows : [];
  for (const row of qrows) {
    const lab = friendlyQueueTestClassLabel(row.classname, rb);
    if (lab) labels.push(lab);
  }
  if (!labels.length && rb && typeof rb === 'object' && Array.isArray(rb.tests)) {
    for (const te of rb.tests) {
      if (!te || typeof te !== 'object') continue;
      let n = te.className != null && String(te.className).trim() ? String(te.className).trim() : '';
      if (!n && te.classId) n = classNameFromRunBodyForClassId(rb, te.classId);
      if (n) labels.push(n);
    }
  }
  const uniq = [...new Set(labels)].sort((a, b) => a.localeCompare(b));
  if (!uniq.length) return t('apexTests.notifyRunDoneFallback');
  let s = uniq.join(', ');
  if (s.length > 200) s = `${s.slice(0, 197)}…`;
  return s;
}

function runExpandKey(orgId, jobId) {
  return `${String(orgId)}:${String(jobId)}`;
}

function parseRunExpandKey(key) {
  const s = String(key || '');
  const i = s.indexOf(':');
  if (i < 0) return null;
  return { orgId: s.slice(0, i), jobId: s.slice(i + 1) };
}

async function enrichStoredJobsWithEnvLabels(list) {
  const extras = await chrome.storage.sync.get(['orgAliases', 'orgGroups']);
  const aliases = extras.orgAliases || {};
  const groups = extras.orgGroups || {};
  return list.map((j) => {
    const stored = j.envLabel != null && String(j.envLabel).trim();
    if (stored) return { ...j, displayEnv: String(j.envLabel).trim() };
    const org = state.orgsList.find((o) => String(o.id) === String(j.orgId));
    const displayEnv = org
      ? buildOrgPicklistLabel(org, { aliases, groups })
      : `${String(j.orgId).slice(0, 8)}…`;
    return { ...j, displayEnv };
  });
}

function formatOutcomeSummary(counts) {
  if (!counts || typeof counts !== 'object') return '—';
  const parts = [];
  const order = ['Pass', 'Fail', 'CompileFail', 'Skip'];
  for (const k of order) {
    if (counts[k]) parts.push(`${t(`apexTests.outcome.${k}`)}: ${counts[k]}`);
  }
  for (const [k, v] of Object.entries(counts)) {
    if (order.includes(k)) continue;
    if (v) parts.push(`${k}: ${v}`);
  }
  return parts.length ? parts.join(' · ') : '—';
}

function formatApexJobStatus(status) {
  const raw = status != null ? String(status).trim() : '';
  if (!raw) return '—';
  const key = `apexTests.jobStatus.${raw}`;
  const translated = t(key);
  return translated === key ? raw : translated;
}

function formatEffectiveApexJobStatus(status, outcomeCounts, job) {
  const raw = status != null ? String(status).trim() : '';
  if (raw === 'Completed' && apexTestRunHasFailures(outcomeCounts, job)) {
    const key = 'apexTests.jobStatus.CompletedWithFailures';
    const translated = t(key);
    return translated === key ? `${formatApexJobStatus(raw)} · ${t('apexTests.outcome.Fail')}` : translated;
  }
  return formatApexJobStatus(status);
}

function apexJobStatusVisual(status, outcomeCounts, job) {
  const raw = status != null ? String(status).trim() : '';
  if (!raw) {
    return { icon: 'dot', tone: 'unknown', label: '—' };
  }
  if (raw === 'Completed' && apexTestRunHasFailures(outcomeCounts, job)) {
    return {
      icon: 'x',
      tone: 'failed',
      label: formatEffectiveApexJobStatus(raw, outcomeCounts, job)
    };
  }
  switch (raw) {
    case 'Queued':
      return { icon: 'clock', tone: 'queued', label: formatApexJobStatus(raw) };
    case 'Processing':
      return { icon: 'spinner', tone: 'processing', label: formatApexJobStatus(raw) };
    case 'Preparing':
      return { icon: 'tool', tone: 'processing', label: formatApexJobStatus(raw) };
    case 'Holding':
      return { icon: 'pause', tone: 'queued', label: formatApexJobStatus(raw) };
    case 'AbortingJob':
      return { icon: 'stop', tone: 'aborted', label: formatApexJobStatus(raw) };
    case 'Completed':
      return { icon: 'check', tone: 'completed', label: formatApexJobStatus(raw) };
    case 'Failed':
      return { icon: 'x', tone: 'failed', label: formatApexJobStatus(raw) };
    case 'Aborted':
      return { icon: 'stop', tone: 'aborted', label: formatApexJobStatus(raw) };
    case 'Error':
      return { icon: 'alert', tone: 'failed', label: formatApexJobStatus(raw) };
    default:
      return { icon: 'dot', tone: 'unknown', label: formatApexJobStatus(raw) };
  }
}

function createStatusIconSvg(kind) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const path = (d) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  };
  const circle = (cx, cy, r, fill = 'none') => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', String(cx));
    c.setAttribute('cy', String(cy));
    c.setAttribute('r', String(r));
    c.setAttribute('fill', fill);
    svg.appendChild(c);
  };

  switch (kind) {
    case 'clock':
      circle(12, 12, 9);
      path('M12 7v5l3 2');
      break;
    case 'spinner':
      path('M21 12a9 9 0 1 1-2.64-6.36');
      path('M21 3v6h-6');
      break;
    case 'tool':
      path('M14.7 6.3a4 4 0 1 0 3 3L10 17l-3 1 1-3 6.7-6.7z');
      break;
    case 'pause':
      circle(12, 12, 9);
      path('M10 9v6');
      path('M14 9v6');
      break;
    case 'stop':
      circle(12, 12, 9);
      path('M9 9h6v6H9z');
      break;
    case 'check':
      circle(12, 12, 9);
      path('m8.5 12.5 2.5 2.5 4.5-5');
      break;
    case 'x':
      circle(12, 12, 9);
      path('m9 9 6 6');
      path('m15 9-6 6');
      break;
    case 'alert':
      path('M12 3 22 21H2L12 3z');
      path('M12 9v5');
      path('M12 18h.01');
      break;
    default:
      circle(12, 12, 3, 'currentColor');
      break;
  }
  return svg;
}

function jobProgressLabel(job) {
  if (!job || typeof job !== 'object') return '';
  const proc = job.JobItemsProcessed;
  const total = job.TotalJobItems;
  if (Number.isFinite(proc) && Number.isFinite(total) && total > 0) {
    return t('apexTests.jobProgress', { done: proc, total });
  }
  const ext = job.ExtendedStatus != null ? String(job.ExtendedStatus).trim() : '';
  const m = ext.match(/\((\d+)\s*\/\s*(\d+)\)/);
  if (m) return t('apexTests.jobProgress', { done: m[1], total: m[2] });
  return '';
}

function buildApexJobStatusNode(status, outcomeCounts, job) {
  const meta = apexJobStatusVisual(status, outcomeCounts, job);
  const wrap = document.createElement('span');
  wrap.className = `apex-tests-status-chip apex-tests-status-${meta.tone}`;
  const icon = document.createElement('span');
  icon.className = 'apex-tests-status-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.appendChild(createStatusIconSvg(meta.icon));
  const txt = document.createElement('span');
  txt.className = 'apex-tests-status-label';
  txt.textContent = meta.label;
  wrap.appendChild(icon);
  wrap.appendChild(txt);
  const prog = jobProgressLabel(job);
  if (prog) {
    const sub = document.createElement('span');
    sub.className = 'apex-tests-status-progress';
    sub.textContent = prog;
    wrap.appendChild(sub);
  }
  return wrap;
}

function apexClassNameFromResult(row) {
  const ac = row && row.ApexClass;
  if (ac && typeof ac === 'object' && ac.Name) return String(ac.Name);
  return '—';
}

function formatApexTestOutcome(outcome) {
  const raw = outcome != null ? String(outcome).trim() : '';
  if (!raw) return '—';
  const key = `apexTests.outcome.${raw}`;
  const translated = t(key);
  return translated === key ? raw : translated;
}

function escapeRegexLiteral(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findApexMethodLineFromSource(source, methodName) {
  const body = String(source || '');
  const name = String(methodName || '').trim();
  if (!body || !name) return null;
  const rx = new RegExp(`\\b${escapeRegexLiteral(name)}\\s*\\(`, 'm');
  const m = rx.exec(body);
  if (!m || m.index == null) return null;
  return body.slice(0, m.index).split(/\r?\n/).length;
}

async function openApexMethodFromRunRow(orgId, row) {
  const className = row?.ApexClass?.Name != null ? String(row.ApexClass.Name).trim() : '';
  const methodName = row?.MethodName != null ? String(row.MethodName).trim() : '';
  if (!className || !methodName) return;
  const res = await bg({
    type: 'apexTests:getTestClassSource',
    orgId,
    className
  });
  if (!res?.ok) {
    showToast(
      res?.reason === 'NO_SID'
        ? t('toast.noSession')
        : String(res?.error) === 'NOT_FOUND'
          ? t('apexTests.viewTestNotFound')
          : res?.error || t('apexTests.viewTestError'),
      'warn'
    );
    return;
  }
  const source = res.body != null ? String(res.body) : '';
  const line = findApexMethodLineFromSource(source, methodName);
  const pick = {
    classId: res.id != null ? String(res.id) : null,
    className,
    label: className
  };
  await openApexTestClassInMonaco(orgId, pick, line ? { initialLine: line } : {});
}

async function loadFailures(orgId, jobId, opts = {}) {
  const ck = runExpandKey(orgId, jobId);
  const useCache = opts.useCache !== false;
  if (useCache && failuresCache.has(ck)) return failuresCache.get(ck);
  const res = await bg({ type: 'apexTests:getRunFailures', orgId, jobId });
  if (!res.ok) {
    const err = {
      rows: [],
      error:
        res.reason === 'NO_SID'
          ? t('toast.noSession')
          : res.error || t('apexTests.runsLoadFailuresError')
    };
    if (useCache) failuresCache.set(ck, err);
    return err;
  }
  const ok = { rows: res.failures || [] };
  if (useCache) failuresCache.set(ck, ok);
  return ok;
}

async function loadRunMethods(orgId, jobId, opts = {}) {
  const ck = runExpandKey(orgId, jobId);
  const useCache = opts.useCache !== false;
  if (useCache && methodsCache.has(ck)) return methodsCache.get(ck);
  const res = await bg({ type: 'apexTests:getRunMethods', orgId, jobId });
  if (!res.ok) {
    const err = {
      rows: [],
      error:
        res.reason === 'NO_SID'
          ? t('toast.noSession')
          : res.error || t('apexTests.runsLoadMethodsError')
    };
    if (useCache) methodsCache.set(ck, err);
    return err;
  }
  const ok = { rows: res.methods || [] };
  if (useCache) methodsCache.set(ck, ok);
  return ok;
}

function isFailedApexTestOutcome(outcome) {
  const o = String(outcome ?? '').trim();
  return o === 'Fail' || o === 'CompileFail';
}

/** Une trazas de `getRunFailures` si el listado de métodos no las trae. */
function mergeFailureStackTracesIntoMethods(methodRows, failureRows) {
  if (!Array.isArray(methodRows) || !methodRows.length) return methodRows || [];
  if (!Array.isArray(failureRows) || !failureRows.length) return methodRows;
  const stackByKey = new Map();
  for (const f of failureRows) {
    const st = f?.StackTrace != null ? String(f.StackTrace).trim() : '';
    if (!st) continue;
    const cls = apexClassNameFromResult(f);
    const method = f?.MethodName != null ? String(f.MethodName).trim() : '';
    stackByKey.set(`${cls}::${method}`, st);
  }
  if (!stackByKey.size) return methodRows;
  return methodRows.map((row) => {
    const existing = row?.StackTrace != null ? String(row.StackTrace).trim() : '';
    if (existing) return row;
    const cls = apexClassNameFromResult(row);
    const method = row?.MethodName != null ? String(row.MethodName).trim() : '';
    const st = stackByKey.get(`${cls}::${method}`);
    return st ? { ...row, StackTrace: st } : row;
  });
}

function methodsNeedFailureStackEnrichment(methodRows) {
  if (!Array.isArray(methodRows) || !methodRows.length) return false;
  return methodRows.some((row) => {
    if (!isFailedApexTestOutcome(row.Outcome)) return false;
    const st = row?.StackTrace != null ? String(row.StackTrace).trim() : '';
    return !st;
  });
}

/** Traza de fallos en vivo (mientras el job corre) y al finalizar. */
async function enrichMethodsWithStackTraces(orgId, jobId, methodRows, { terminal = false } = {}) {
  if (!methodsNeedFailureStackEnrichment(methodRows)) return methodRows;
  const fails = await loadFailures(orgId, jobId, { useCache: !!terminal });
  if (fails.error || !fails.rows?.length) return methodRows;
  return mergeFailureStackTracesIntoMethods(methodRows, fails.rows);
}

function clearRunDetailCaches(orgId, jobId) {
  const ck = runExpandKey(orgId, jobId);
  methodsCache.delete(ck);
  failuresCache.delete(ck);
}

function removeDetailLoading(host) {
  host?.querySelector('.apex-tests-runs-detail-loading')?.remove();
}

function getRunDetailInnerScrollEl(host) {
  if (!host) return null;
  if (host.classList.contains('apex-tests-runs-detail-inner')) return host;
  return host.querySelector('.apex-tests-runs-detail-inner');
}

function restoreElementScroll(el, scrollTop) {
  if (!el) return;
  el.scrollTop = scrollTop;
  requestAnimationFrame(() => {
    el.scrollTop = scrollTop;
  });
}

function readDetailFilterPrefs(host) {
  const bar = host?.querySelector('.apex-tests-detail-filter-bar');
  if (!bar) return { failOnly: false, q: '' };
  return {
    failOnly: !!bar.querySelector('.apex-tests-detail-filter-fail-cb')?.checked,
    q: (bar.querySelector('.apex-tests-detail-filter-search')?.value || '').trim().toLowerCase()
  };
}

function isDetailFilterPrefsActive(prefs) {
  return !!(prefs.failOnly || prefs.q);
}

function syncAllMethodRowsVisibility(host, tb) {
  const prefs = readDetailFilterPrefs(host);
  /** @type {Map<string, object>} */
  const rowsByKey = new Map();
  try {
    for (const row of JSON.parse(tb.dataset.allRowsJson || '[]')) {
      rowsByKey.set(methodIdentityKey(row), row);
    }
  } catch {
    /* ignore */
  }
  for (const tr of tb.querySelectorAll('tr')) {
    const key = tr.dataset.methodKey || '';
    const row = rowsByKey.get(key);
    tr.hidden = row ? !rowMatchesDetailFilter(row, prefs.failOnly, prefs.q) : false;
  }
}

function getScrollAnchorKey(scrollEl, tb) {
  if (!scrollEl || !tb) return '';
  const target = scrollEl.scrollTop + 2;
  let anchor = '';
  for (const tr of tb.querySelectorAll('tr')) {
    if (tr.hidden) continue;
    if (tr.offsetTop <= target) anchor = tr.dataset.methodKey || anchor;
    else break;
  }
  return anchor;
}

function scrollToMethodAnchor(scrollEl, tb, anchorKey) {
  if (!scrollEl || !tb || !anchorKey) return;
  const tr = tb.querySelector(`tr[data-method-key="${CSS.escape(anchorKey)}"]`);
  if (!tr || tr.hidden) return;
  restoreElementScroll(scrollEl, Math.max(0, tr.offsetTop - 1));
}

function readDetailFilterState(host) {
  if (!host) return null;
  const bar = host.querySelector('.apex-tests-detail-filter-bar');
  if (!bar) return { failOnly: false, search: '' };
  return {
    failOnly: !!bar.querySelector('.apex-tests-detail-filter-fail-cb')?.checked,
    search: String(bar.querySelector('.apex-tests-detail-filter-search')?.value || '')
  };
}

function applyDetailFilterState(host, state) {
  if (!host || !state) return;
  const bar = host.querySelector('.apex-tests-detail-filter-bar');
  if (!bar) return;
  const cb = bar.querySelector('.apex-tests-detail-filter-fail-cb');
  const search = bar.querySelector('.apex-tests-detail-filter-search');
  if (cb) cb.checked = !!state.failOnly;
  if (search) search.value = state.search || '';
}

function applyDetailFilterToTbody(host, orgId) {
  void orgId;
  const tbl = host.querySelector('.apex-tests-runs-failures-table');
  const tb = tbl?.querySelector('tbody');
  if (!tb) return;
  const scrollEl = getMethodsTableScrollEl(host, tbl);
  const prefs = readDetailFilterPrefs(host);
  const nowFiltered = isDetailFilterPrefsActive(prefs);
  const wasFiltered = host.dataset.detailFilterActive === '1';

  if (!wasFiltered && nowFiltered && scrollEl) {
    host.dataset.unfilteredScrollTop = String(scrollEl.scrollTop);
  }

  syncAllMethodRowsVisibility(host, tb);

  if (wasFiltered && !nowFiltered && scrollEl) {
    const saved = Number(host.dataset.unfilteredScrollTop);
    if (Number.isFinite(saved)) restoreElementScroll(scrollEl, saved);
  }

  host.dataset.detailFilterActive = nowFiltered ? '1' : '';
}

function ensureDetailFilterToolbar(host, orgId, savedState = null) {
  let bar = host.querySelector('.apex-tests-detail-filter-bar');
  if (!bar) {
    bar = buildDetailFilterToolbar(host);
    const tbl = host.querySelector('.apex-tests-runs-failures-table');
    if (tbl) host.insertBefore(bar, tbl);
    else host.appendChild(bar);
    wireDetailFilterToolbar(host, orgId);
  }
  if (savedState) applyDetailFilterState(host, savedState);
  return bar;
}

function buildMethodsDetailTableHeadRow() {
  const tr = document.createElement('tr');
  tr.innerHTML = `<th>${t('apexTests.runsColClass')}</th>
    <th>${t('apexTests.runsColMethod')}</th>
    <th>${t('apexTests.runsColOutcome')}</th>
    <th>${t('apexTests.runsColMessage')}</th>
    <th>${t('apexTests.runsColStackTrace')}</th>`;
  return tr;
}

function findExpandedDetailRow(exKey) {
  const inner = document.querySelector(
    `.apex-tests-runs-detail-inner[data-expand-key="${CSS.escape(exKey)}"]`
  );
  return inner?.closest('.apex-tests-runs-detail-row, .apex-tests-other-runs-detail-row') || null;
}

function methodIdentityKey(row) {
  const cls = apexClassNameFromResult(row);
  const m = row?.MethodName != null ? String(row.MethodName).trim() : '';
  return `${cls}::${m}`;
}

function methodsIdentitySignature(rows) {
  if (!Array.isArray(rows) || !rows.length) return 'empty';
  return rows.map(methodIdentityKey).join('\n');
}

function rowMatchesDetailFilter(row, failOnly, q) {
  if (failOnly && !isFailedApexTestOutcome(row.Outcome)) return false;
  if (!q) return true;
  const cls = apexClassNameFromResult(row).toLowerCase();
  const m = row?.MethodName != null ? String(row.MethodName).trim().toLowerCase() : '';
  return cls.includes(q) || m.includes(q);
}

function appendMethodRow(tb, row, orgId) {
  const rtr = document.createElement('tr');
  const c1 = document.createElement('td');
  c1.textContent = apexClassNameFromResult(row);
  const c2 = document.createElement('td');
  const methodName = row?.MethodName != null ? String(row.MethodName).trim() : '';
  if (methodName) {
    const a = document.createElement('a');
    a.href = '#';
    a.className = 'apex-tests-runs-method-link';
    a.textContent = methodName;
    a.title = t('apexTests.methodOpenClickHint');
    a.addEventListener('click', (e) => {
      e.preventDefault();
      void openApexMethodFromRunRow(orgId, row);
    });
    c2.appendChild(a);
  } else {
    c2.textContent = '—';
  }
  const c3 = document.createElement('td');
  c3.textContent = formatApexTestOutcome(row.Outcome);
  const c4 = document.createElement('td');
  c4.className = 'apex-tests-runs-msg-cell';
  const msgText = row.Message != null ? String(row.Message).trim() : '';
  c4.textContent = msgText || '—';
  const c5 = document.createElement('td');
  c5.className = 'apex-tests-runs-stack-cell';
  const stackText = row?.StackTrace != null ? String(row.StackTrace).trim() : '';
  if (isFailedApexTestOutcome(row.Outcome) && stackText) {
    const pre = buildStackTracePreWithCtrlLinks(stackText, orgId);
    pre.title = t('apexTests.methodOpenCtrlClickHint');
    c5.appendChild(pre);
  } else {
    c5.textContent = '—';
  }
  rtr.appendChild(c1);
  rtr.appendChild(c2);
  rtr.appendChild(c3);
  rtr.appendChild(c4);
  rtr.appendChild(c5);
  rtr.dataset.methodKey = methodIdentityKey(row);
  tb.appendChild(rtr);
  return rtr;
}

function fillMethodsTbody(tb, rows, orgId, host = null) {
  const tbl = tb.closest('table');
  const scrollEl = host ? getMethodsTableScrollEl(host, tbl) : null;
  const anchorKey = scrollEl ? getScrollAnchorKey(scrollEl, tb) : '';
  const savedScroll = scrollEl?.scrollTop ?? 0;
  const prefs = host ? readDetailFilterPrefs(host) : { failOnly: false, q: '' };

  tb.innerHTML = '';
  const keys = [];
  for (const row of rows) {
    const tr = appendMethodRow(tb, row, orgId);
    if (host) {
      tr.hidden = !rowMatchesDetailFilter(row, prefs.failOnly, prefs.q);
    }
    keys.push(methodIdentityKey(row));
  }
  tb.dataset.renderedKeys = keys.join('\n');
  tb.dataset.identitySig = methodsIdentitySignature(rows);

  if (scrollEl) {
    if (anchorKey) scrollToMethodAnchor(scrollEl, tb, anchorKey);
    else restoreElementScroll(scrollEl, savedScroll);
  }
}

function getMethodsTableScrollEl(host, tbl) {
  const inner = getRunDetailInnerScrollEl(host);
  if (inner) return inner;
  return (
    tbl?.closest('.apex-tests-runs-table-scroll') ||
    tbl?.parentElement ||
    host
  );
}

/**
 * @returns {boolean} true si bastó añadir filas nuevas sin reemplazar la tabla
 */
function tryAppendNewMethodRows(host, tb, methodRows, orgId) {
  const prevIdentity = tb.dataset.identitySig || '';
  const nextIdentity = methodsIdentitySignature(methodRows);
  if (!prevIdentity || prevIdentity === 'empty') return false;
  if (nextIdentity === prevIdentity) return true;
  if (!nextIdentity.startsWith(`${prevIdentity}\n`)) return false;

  const prefs = readDetailFilterPrefs(host);
  const rendered = new Set(String(tb.dataset.renderedKeys || '').split('\n').filter(Boolean));
  const scrollEl = getMethodsTableScrollEl(host, tb.closest('table'));
  const scrollTop = scrollEl?.scrollTop ?? 0;

  for (const row of methodRows) {
    const key = methodIdentityKey(row);
    if (rendered.has(key)) continue;
    const tr = appendMethodRow(tb, row, orgId);
    tr.hidden = !rowMatchesDetailFilter(row, prefs.failOnly, prefs.q);
    rendered.add(key);
  }
  tb.dataset.renderedKeys = [...rendered].join('\n');
  tb.dataset.identitySig = nextIdentity;
  restoreElementScroll(scrollEl, scrollTop);
  return true;
}

function methodsRowsSignature(rows) {
  if (!Array.isArray(rows) || !rows.length) return 'empty';
  return rows
    .map((row) => {
      const cls = row?.ApexClass?.Name != null ? String(row.ApexClass.Name) : '';
      const m = row?.MethodName != null ? String(row.MethodName) : '';
      const o = row?.Outcome != null ? String(row.Outcome) : '';
      const msg = row?.Message != null ? String(row.Message) : '';
      const st = row?.StackTrace != null ? String(row.StackTrace) : '';
      return `${cls}::${m}::${o}::${msg}::${st}`;
    })
    .join('\n');
}

async function refreshExpandedMethodsInPlace() {
  if (!expandedRunKey) return;
  const parsed = parseRunExpandKey(expandedRunKey);
  if (!parsed) return;
  const host = document.querySelector(
    `.apex-tests-runs-detail-inner[data-expand-key="${CSS.escape(expandedRunKey)}"]`
  );
  if (!host) return;
  const mainRow = document.querySelector(
    `tr[data-org-id="${CSS.escape(parsed.orgId)}"][data-job-id="${CSS.escape(parsed.jobId)}"]`
  );
  if (!mainRow) return;
  const canonicalJobId = mainRow.dataset.canonicalJobId || parsed.jobId;
  const st = String(mainRow.dataset.jobStatus || '')
    .trim()
    .toLowerCase();
  const terminal = ['completed', 'failed', 'aborted', 'error'].includes(st);
  const data = await loadRunMethods(parsed.orgId, canonicalJobId, {
    useCache: terminal
  });
  if (!host.isConnected || data.error) return;
  let methodRows = data.rows;
  if (Array.isArray(methodRows) && methodRows.length) {
    methodRows = await enrichMethodsWithStackTraces(parsed.orgId, canonicalJobId, methodRows, {
      terminal
    });
  }
  if (!Array.isArray(methodRows) || !methodRows.length) {
    host.querySelector('.apex-tests-runs-failures-table')?.remove();
    if (!host.querySelector('.apex-tests-runs-detail-empty')) {
      removeDetailLoading(host);
      const p = document.createElement('p');
      p.className = 'apex-tests-runs-detail-empty';
      p.textContent = t('apexTests.runsNoMethods');
      host.appendChild(p);
    }
    return;
  }
  host.querySelector('.apex-tests-runs-detail-empty')?.remove();
  removeDetailLoading(host);
  ensureDetailFilterToolbar(host, parsed.orgId);
  let tbl = host.querySelector('.apex-tests-runs-failures-table');
  if (!tbl) {
    tbl = document.createElement('table');
    tbl.className = 'apex-tests-runs-failures-table';
    const thead = document.createElement('thead');
    thead.appendChild(buildMethodsDetailTableHeadRow());
    tbl.appendChild(thead);
    tbl.appendChild(document.createElement('tbody'));
    host.appendChild(tbl);
  }
  const tb = tbl.querySelector('tbody');
  if (!tb) return;
  tb.dataset.allRowsJson = JSON.stringify(methodRows);
  const nextSig = methodsRowsSignature(methodRows);
  const prevSig = tb.dataset.rowsSig || '';
  const nextIdentity = methodsIdentitySignature(methodRows);
  const prevIdentity = tb.dataset.identitySig || '';

  if (nextSig === prevSig && nextIdentity === prevIdentity) return;

  if (tryAppendNewMethodRows(host, tb, methodRows, parsed.orgId)) {
    tb.dataset.rowsSig = nextSig;
    return;
  }

  tb.dataset.rowsSig = nextSig;
  fillMethodsTbody(tb, methodRows, parsed.orgId, host);
  host.dataset.detailFilterActive = isDetailFilterPrefsActive(readDetailFilterPrefs(host))
    ? '1'
    : '';
}

async function refreshExpandedJobStatusInPlace() {
  if (!expandedRunKey) return;
  const parsed = parseRunExpandKey(expandedRunKey);
  if (!parsed) return;
  const mainRow = document.querySelector(
    `tr[data-org-id="${CSS.escape(parsed.orgId)}"][data-job-id="${CSS.escape(parsed.jobId)}"]`
  );
  if (!mainRow) return;
  const poll = await bg({
    type: 'apexTests:pollRuns',
    orgId: parsed.orgId,
    jobIds: [parsed.jobId]
  });
  const run = pickRunForStoredJob(poll, parsed.jobId);
  if (run.missing || run.pollFailure || !run.job) return;
  const nextStatus = String(run.job.Status || '');
  const prevStatus = String(mainRow.dataset.jobStatus || '');
  if (nextStatus === prevStatus) return;

  mainRow.dataset.jobStatus = nextStatus;
  mainRow.dataset.canonicalJobId = String(run.job.Id || run.canonicalJobId || parsed.jobId);
  const prevLc = prevStatus.trim().toLowerCase();
  const nowTerminal = ['completed', 'failed', 'aborted', 'error'].includes(nextStatus);
  if (nowTerminal && !['completed', 'failed', 'aborted', 'error'].includes(prevLc)) {
    clearRunDetailCaches(parsed.orgId, mainRow.dataset.canonicalJobId || parsed.jobId);
    void refreshExpandedMethodsInPlace();
  }
  // Evita volver a pintar estados obsoletos al cerrar el expandido.
  lastPollResult = null;
  const tdStatus = mainRow.querySelector('.apex-tests-runs-td-status');
  if (tdStatus) renderRunStatusCell(tdStatus, run, null);
  const tdTests = mainRow.querySelector('.apex-tests-runs-td-summary');
  if (tdTests) {
    tdTests.textContent = run.missing || run.pollFailure ? '—' : formatOutcomeSummary(run.outcomeCounts);
  }

  const isTerminal = ['Completed', 'Failed', 'Aborted', 'Error'].includes(nextStatus);
  const stLc = nextStatus.trim().toLowerCase();
  const canAbort = ['queued', 'processing', 'preparing', 'holding'].includes(stLc);
  const btnMore = mainRow.querySelector('.apex-tests-runs-more-btn');
  const btnCoverage = mainRow.querySelector('button[data-i18n="apexTests.runsCoverage"]');
  const btnLog = mainRow.querySelector('button[data-i18n="apexTests.runsLog"]');
  const btnAbort = mainRow.querySelector('button[data-i18n="apexTests.runsAbort"]');
  if (btnMore) btnMore.disabled = !isTerminal;
  if (btnCoverage) btnCoverage.disabled = !isTerminal;
  if (btnLog) btnLog.disabled = !isTerminal;
  if (btnAbort) btnAbort.disabled = !canAbort;
}

/** Estados AsyncApexJob no terminales (encolado / en curso). Comparación sin distinguir mayúsculas. */
const APEX_ASYNC_JOB_IN_FLIGHT_LC = new Set([
  'queued',
  'processing',
  'preparing',
  'holding',
  'abortingjob'
]);

function isApexAsyncJobInFlightStatus(status) {
  const s = String(status || '')
    .trim()
    .toLowerCase();
  return APEX_ASYNC_JOB_IN_FLIGHT_LC.has(s);
}

function buildRunJobIdMap(poll) {
  const m = new Map();
  if (!poll?.ok || !Array.isArray(poll.runs)) return m;
  for (const r of poll.runs) {
    if (r?.jobId != null) {
      m.set(String(r.jobId), r);
      m.set(sfApexIdKey(r.jobId), r);
    }
    if (r?.canonicalJobId != null) m.set(sfApexIdKey(r.canonicalJobId), r);
    if (r?.job?.Id) m.set(sfApexIdKey(r.job.Id), r);
  }
  return m;
}

/** orgId:jobId → último Status del poll (notificación al completar con la pestaña sin foco). */
const apexTestJobStatusSnapshot = new Map();

function pruneApexTestJobStatusSnapshot(activeKeys) {
  for (const k of apexTestJobStatusSnapshot.keys()) {
    if (!activeKeys.has(k)) apexTestJobStatusSnapshot.delete(k);
  }
}

/**
 * @param {Array<{ orgId: unknown, jobId: unknown, displayEnv?: string }>} enriched
 * @param {Record<string, unknown>} pollsByOrgId
 */
function maybeNotifyTestRunCompletions(enriched, pollsByOrgId) {
  try {
    if (typeof document === 'undefined' || document.hasFocus()) return;
  } catch {
    return;
  }
  const activeKeys = new Set();
  for (const j of enriched) {
    const oid = String(j.orgId);
    const jid = String(j.jobId);
    const key = `${oid}:${jid}`;
    activeKeys.add(key);
    const poll = pollsByOrgId[oid];
    const run = pickRunForStoredJob(poll, jid);
    const status =
      run.missing || run.pollFailure ? null : run.job?.Status != null ? String(run.job.Status) : null;
    const prev = apexTestJobStatusSnapshot.get(key);
    apexTestJobStatusSnapshot.set(key, status);

    if (prev === undefined) continue;
    if (status == null || run.missing || run.pollFailure) continue;
    if (!isApexAsyncJobInFlightStatus(prev)) continue;
    if (isApexAsyncJobInFlightStatus(status)) continue;
    if (!['Completed', 'Failed', 'Aborted', 'Error'].includes(status)) continue;

    const envLabel =
      j.displayEnv != null && String(j.displayEnv).trim()
        ? String(j.displayEnv).trim()
        : shortId(oid);
    const classesSummary = formatApexTestNotificationClassSummary(j, run, jid);
    let notifyMsg = t('apexTests.notifyRunDoneBody', {
      env: envLabel,
      status: formatEffectiveApexJobStatus(status, run.outcomeCounts, run.job),
      classes: classesSummary
    });
    if (notifyMsg.length > 256) notifyMsg = `${notifyMsg.slice(0, 253)}…`;
    void bg({
      type: 'notifications:showApexTestComplete',
      title: t('apexTests.notifyRunDoneTitle'),
      message: notifyMsg
    });
  }
  pruneApexTestJobStatusSnapshot(activeKeys);
}

function canonicalRunBodyJson(body) {
  if (!body || typeof body !== 'object') return '';
  try {
    const o = JSON.parse(JSON.stringify(body));
    if (Array.isArray(o.tests)) {
      o.tests = o.tests.map((entry) => {
        const e = { ...entry };
        delete e.className;
        if (Array.isArray(e.testMethods)) {
          e.testMethods = [...e.testMethods].sort((a, b) => String(a).localeCompare(String(b)));
        }
        return e;
      });
      o.tests.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    return JSON.stringify(o);
  } catch {
    return '';
  }
}

function hasOtherInFlightSameRunBody(orgId, thisJobId, thisRunBody, enrichedList, runMap) {
  if (!thisRunBody || typeof thisRunBody !== 'object') return false;
  const thisKey = canonicalRunBodyJson(thisRunBody);
  if (!thisKey) return false;
  for (const other of enrichedList) {
    if (String(other.orgId) !== String(orgId)) continue;
    if (sfApexIdKey(other.jobId) === sfApexIdKey(thisJobId)) continue;
    if (!other.runBody || typeof other.runBody !== 'object') continue;
    if (canonicalRunBodyJson(other.runBody) !== thisKey) continue;
    const orun = runMap.get(String(other.jobId)) || runMap.get(sfApexIdKey(other.jobId));
    if (!orun || orun.missing || orun.pollFailure) continue;
    const st = orun.job?.Status;
    if (st && isApexAsyncJobInFlightStatus(st)) return true;
  }
  return false;
}

function pickRunForStoredJob(poll, jobId) {
  if (!poll || !poll.ok) {
    return {
      jobId,
      missing: true,
      queueRows: [],
      pollFailure: poll
        ? { reason: poll.reason, error: poll.error }
        : { reason: 'UNKNOWN', error: t('apexTests.runsPollError') }
    };
  }
  const found = (poll.runs || []).find((r) => apexRunMatchesStoredJobId(r, jobId));
  if (found) return found;
  return { jobId, missing: true, queueRows: [] };
}

function closeExpandedDetailRows() {
  for (const row of document.querySelectorAll(
    '.apex-tests-runs-detail-row, .apex-tests-other-runs-detail-row'
  )) {
    row.remove();
  }
}

function syncAllExpandButtonStates() {
  for (const btn of document.querySelectorAll('.apex-tests-run-expand-btn')) {
    const key = btn.dataset.apexExpand || '';
    const open = !!expandedRunKey && key === expandedRunKey;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.textContent = open ? '▾' : '▸';
  }
}

function buildDetailLoadingParagraph() {
  const p = document.createElement('p');
  p.className = 'apex-tests-runs-detail-loading';
  p.textContent = t('apexTests.runsLoadingMethods');
  return p;
}

/**
 * @param {HTMLElement} inner
 * @param {string} orgId
 * @param {string} jobId
 * @param {{ terminal?: boolean, refresh?: boolean, failuresFirst?: boolean }} [opts]
 */
async function populateRunDetailInner(inner, orgId, jobId, opts = {}) {
  const terminal = !!opts.terminal;
  const refresh = !!opts.refresh;
  const canonicalJobId = jobId;

  if (opts.failuresFirst && !methodsCache.has(runExpandKey(orgId, canonicalJobId))) {
    const fails = await loadFailures(orgId, canonicalJobId, { useCache: !refresh });
    if (inner.isConnected && fails.rows?.length) {
      inner.replaceChildren(buildDetailLoadingParagraph());
      const tbl = document.createElement('table');
      tbl.className = 'apex-tests-runs-failures-table';
      const theadF = document.createElement('thead');
      theadF.appendChild(buildMethodsDetailTableHeadRow());
      tbl.appendChild(theadF);
      const tb = document.createElement('tbody');
      fillMethodsTbody(tb, fails.rows, orgId);
      tbl.appendChild(tb);
      inner.replaceChildren(tbl);
    }
  }

  const data = await loadRunMethods(orgId, canonicalJobId, { useCache: !refresh });
  if (!inner.isConnected) return;
  inner.replaceChildren();
  if (data.error) {
    const p = document.createElement('p');
    p.className = 'apex-tests-runs-detail-error';
    p.textContent = data.error;
    inner.appendChild(p);
    return;
  }
  let methodRows = data.rows;
  if (Array.isArray(methodRows) && methodRows.length) {
    methodRows = await enrichMethodsWithStackTraces(orgId, canonicalJobId, methodRows, { terminal });
  }
  if (!inner.isConnected) return;
  if (!Array.isArray(methodRows) || !methodRows.length) {
    const p = document.createElement('p');
    p.className = 'apex-tests-runs-detail-empty';
    p.textContent = terminal ? t('apexTests.runsNoMethods') : t('apexTests.runsNoMethodsYet');
    inner.appendChild(p);
    return;
  }
  const toolbar = buildDetailFilterToolbar(inner);
  const tbl = document.createElement('table');
  tbl.className = 'apex-tests-runs-failures-table';
  const thead = document.createElement('thead');
  thead.appendChild(buildMethodsDetailTableHeadRow());
  tbl.appendChild(thead);
  const tb = document.createElement('tbody');
  tb.dataset.allRowsJson = JSON.stringify(methodRows);
  fillMethodsTbody(tb, methodRows, orgId, inner);
  tb.dataset.rowsSig = methodsRowsSignature(methodRows);
  tb.dataset.identitySig = methodsIdentitySignature(methodRows);
  tbl.appendChild(tb);
  if (toolbar) inner.appendChild(toolbar);
  inner.appendChild(tbl);
  wireDetailFilterToolbar(inner, orgId);
}

function buildDetailFilterToolbar(innerHost) {
  const bar = document.createElement('div');
  bar.className = 'apex-tests-detail-filter-bar';
  const failOnly = document.createElement('label');
  failOnly.className = 'apex-tests-detail-filter-fail';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'apex-tests-detail-filter-fail-cb';
  failOnly.appendChild(cb);
  failOnly.appendChild(document.createTextNode(` ${t('apexTests.detailFilterFailuresOnly')}`));
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'apex-tests-detail-filter-search sfoc-query-input';
  search.placeholder = t('apexTests.detailFilterSearchPh');
  bar.appendChild(failOnly);
  bar.appendChild(search);
  return bar;
}

function wireDetailFilterToolbar(innerHost, orgId) {
  const bar = innerHost.querySelector('.apex-tests-detail-filter-bar');
  const tb = innerHost.querySelector('.apex-tests-runs-failures-table tbody');
  if (!bar || !tb) return;
  const scrollEl = getRunDetailInnerScrollEl(innerHost);
  if (scrollEl && bar.dataset.scrollTrackWired !== '1') {
    bar.dataset.scrollTrackWired = '1';
    scrollEl.addEventListener(
      'scroll',
      () => {
        if (innerHost.dataset.detailFilterActive !== '1') {
          innerHost.dataset.unfilteredScrollTop = String(scrollEl.scrollTop);
        }
      },
      { passive: true }
    );
  }
  const apply = () => applyDetailFilterToTbody(innerHost, orgId);
  bar.querySelector('.apex-tests-detail-filter-fail-cb')?.addEventListener('change', apply);
  bar.querySelector('.apex-tests-detail-filter-search')?.addEventListener('input', apply);
}

function insertRunDetailRowAfter(anchorTr, exKey, colSpan) {
  const trSub = document.createElement('tr');
  trSub.className = anchorTr.closest('.apex-tests-other-runs-mini-table')
    ? 'apex-tests-other-runs-detail-row'
    : 'apex-tests-runs-detail-row';
  const tdSub = document.createElement('td');
  tdSub.colSpan = colSpan;
  tdSub.className = 'apex-tests-runs-detail-cell';
  const inner = document.createElement('div');
  inner.className = 'apex-tests-runs-detail-inner';
  inner.dataset.expandKey = exKey;
  inner.appendChild(buildDetailLoadingParagraph());
  tdSub.appendChild(inner);
  trSub.appendChild(tdSub);
  anchorTr.insertAdjacentElement('afterend', trSub);
  return inner;
}

/**
 * @param {string} exKey
 * @param {{ orgId: string, jobId: string, terminal?: boolean, anchorTr: HTMLTableRowElement, colSpan: number }} ctx
 */
async function openHubRunDetail(exKey, ctx) {
  closeExpandedDetailRows();
  expandedRunKey = exKey;
  syncAllExpandButtonStates();
  const inner = insertRunDetailRowAfter(ctx.anchorTr, exKey, ctx.colSpan);
  const st = String(ctx.anchorTr.dataset.jobStatus || '').trim().toLowerCase();
  const terminal =
    ctx.terminal ??
    ['completed', 'failed', 'aborted', 'error'].includes(st);
  await populateRunDetailInner(inner, ctx.orgId, ctx.jobId, {
    terminal,
    refresh: false,
    failuresFirst: !terminal
  });
  if (terminal) {
    void populateRunDetailInner(inner, ctx.orgId, ctx.jobId, { terminal: true, refresh: true });
  }
}

/**
 * Reabre el detalle solo si se perdió al refrescar la tabla (fallback).
 */
async function reopenHubRunDetailAfterRefresh(exKey, ctx, savedFilter = null) {
  expandedRunKey = exKey;
  syncAllExpandButtonStates();
  const inner = insertRunDetailRowAfter(ctx.anchorTr, exKey, ctx.colSpan);
  if (savedFilter) ensureDetailFilterToolbar(inner, ctx.orgId, savedFilter);
  await refreshExpandedMethodsInPlace();
}

/**
 * @param {string} exKey
 * @param {{ orgId: string, jobId: string, terminal?: boolean, anchorTr: HTMLTableRowElement, colSpan: number }} ctx
 */
async function toggleHubRunExpand(exKey, ctx) {
  if (expandedRunKey === exKey) {
    expandedRunKey = null;
    closeExpandedDetailRows();
    syncAllExpandButtonStates();
    return;
  }
  await openHubRunDetail(exKey, ctx);
}

export async function rememberWatchedApexTestJob(orgId, jobId, envLabel, meta = {}) {
  if (!orgId || !jobId) return;
  const oid = String(orgId);
  const jid = String(jobId);
  const label =
    envLabel != null && String(envLabel).trim() ? String(envLabel).trim().slice(0, 240) : '';
  const startedAt =
    meta.startedAt != null && Number.isFinite(Number(meta.startedAt))
      ? Number(meta.startedAt)
      : Date.now();
  const list = pruneExpiredStoredJobs(await loadAllStoredJobs());
  const want = sfApexIdKey(jid);
  const filtered = list.filter(
    (j) => !(String(j.orgId) === oid && sfApexIdKey(j.jobId) === want)
  );
  const row = {
    orgId: oid,
    jobId: jid,
    startedAt,
    envLabel: label,
    runBody: null,
    source: 'watched',
    launchedBy: meta.launchedBy != null ? String(meta.launchedBy).slice(0, 120) : ''
  };
  const next = [row, ...filtered].slice(0, getApexTestsMaxTrackedJobs());
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
  } catch {
    /* ignore */
  }
  lastPollResult = null;
  consecutiveAllMissingPolls = 0;
  showToast(t('apexTests.otherRunsWatchOk'), 'success');
  updateApexTestsHubPollingState();
}

export async function unwatchApexTestJob(orgId, jobId) {
  if (!orgId || !jobId) return;
  const oid = String(orgId);
  const want = sfApexIdKey(jobId);
  const list = pruneExpiredStoredJobs(await loadAllStoredJobs());
  const next = list.filter(
    (j) => !(String(j.orgId) === oid && sfApexIdKey(j.jobId) === want)
  );
  if (next.length === list.length) return;
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
  } catch {
    /* ignore */
  }
  const exKey = runExpandKey(oid, jobId);
  failuresCache.delete(exKey);
  methodsCache.delete(exKey);
  if (expandedRunKey === exKey) {
    expandedRunKey = null;
    closeExpandedDetailRows();
    syncAllExpandButtonStates();
  }
  lastPollResult = null;
  showToast(t('apexTests.otherRunsUnwatchOk'), 'info');
  void tickApexTestsHubRuns();
}

function isWatchedStoredJob(row) {
  return row?.source === 'watched';
}

function applyOtherRunsWatchButton(btn, orgId, parentId, jobMeta, storedJobs) {
  const watched = storedJobs.some(
    (j) =>
      String(j.orgId) === String(orgId) &&
      sfApexIdKey(j.jobId) === sfApexIdKey(parentId) &&
      isWatchedStoredJob(j)
  );
  btn.classList.toggle('apex-tests-other-unwatch-btn', watched);
  btn.classList.toggle('apex-tests-other-watch-btn', !watched);
  if (watched) {
    btn.textContent = t('apexTests.otherRunsUnwatch');
    btn.title = t('apexTests.otherRunsUnwatchHint');
  } else {
    btn.textContent = t('apexTests.otherRunsWatch');
    btn.title = t('apexTests.otherRunsWatchHint');
  }
  btn.onclick = (e) => {
    e.stopPropagation();
    if (watched) {
      void unwatchApexTestJob(orgId, parentId);
      return;
    }
    const tbody = btn.closest('tbody');
    const section = tbody?.closest('section[data-other-org-id]');
    const label =
      section?.querySelector('.apex-tests-other-runs-org-title')?.textContent?.trim() ||
      shortId(orgId);
    let startedAt = Date.now();
    const rawDate = jobMeta?.date;
    const n = Number(rawDate);
    if (Number.isFinite(n) && /^\d+$/.test(String(rawDate ?? '').trim())) {
      startedAt = n >= 1e12 ? n : n >= 1e9 ? n * 1000 : n;
    } else {
      const parsed = Date.parse(String(rawDate ?? ''));
      if (!Number.isNaN(parsed)) startedAt = parsed;
    }
    void rememberWatchedApexTestJob(orgId, parentId, label, {
      launchedBy: jobMeta?.launchedBy,
      startedAt
    });
  };
}

function buildRunExpandButton(exKey, canExpand) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'apex-tests-run-expand-btn';
  btn.dataset.apexExpand = exKey;
  btn.setAttribute('aria-label', t('apexTests.runsExpandAria'));
  btn.setAttribute('aria-expanded', expandedRunKey === exKey ? 'true' : 'false');
  btn.textContent = expandedRunKey === exKey ? '▾' : '▸';
  if (!canExpand) btn.disabled = true;
  return btn;
}

function getOtherRunsScrollEl() {
  let el = document.getElementById('apexTestsOtherRunsScroll');
  if (el) return el;
  const host = document.getElementById('apexTestsOtherRunsBody');
  if (!host) return null;
  el = document.createElement('div');
  el.id = 'apexTestsOtherRunsScroll';
  el.className = 'apex-tests-other-runs-scroll';
  host.appendChild(el);
  return el;
}

/**
 * Fecha de `ApexTestQueueServlet` (string numérica ms/s, ISO u otro parseable).
 * Misma presentación local que `formatTestRunStartedAt`.
 * @param {unknown} raw
 */
function formatOtherRunsJobDate(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  let d = null;
  const n = Number(s);
  if (Number.isFinite(n) && /^\d+$/.test(s)) {
    if (n >= 1e12) d = new Date(n);
    else if (n >= 1e9) d = new Date(n * 1000);
  }
  if (!d || Number.isNaN(d.getTime())) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) d = new Date(t);
  }
  if (!d || Number.isNaN(d.getTime())) return s;
  const locale = getCurrentLang() === 'en' ? 'en-GB' : 'es-ES';
  try {
    return d.toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return s;
  }
}

function otherRunsJobClassNameList(j) {
  const qrows = Array.isArray(j?.queueRows) ? j.queueRows : [];
  const names = [...new Set(qrows.map((r) => String(r.classname || '').trim()).filter(Boolean))];
  if (names.length) return names;
  const single = j?.classname != null ? String(j.classname).trim() : '';
  return single ? [single] : [];
}

function formatOtherRunsJobDetail(j) {
  const dateFmt = formatOtherRunsJobDate(j.date);
  const classNames = otherRunsJobClassNameList(j).join(', ');
  return [j.extstatus, dateFmt, classNames].filter(Boolean).join(' · ') || '—';
}

function renderRunStatusCell(tdStatus, run, runBody) {
  tdStatus.textContent = '';
  tdStatus.classList.remove('apex-tests-runs-missing');
  if (run.pollFailure) {
    tdStatus.classList.add('apex-tests-runs-missing');
    tdStatus.textContent =
      run.pollFailure.reason === 'NO_SID'
        ? t('toast.noSession')
        : run.pollFailure.error || t('apexTests.runsPollError');
    return;
  }
  if (run.missing) {
    tdStatus.classList.add('apex-tests-runs-missing');
    tdStatus.textContent = t('apexTests.runsNotFound');
    return;
  }
  const main = run.job?.Status || '—';
  const qrows = Array.isArray(run.queueRows) ? run.queueRows : [];
  const names = [...new Set(qrows.map((r) => friendlyQueueTestClassLabel(r.classname, runBody)).filter(Boolean))];
  if (names.length) {
    const s1 = document.createElement('span');
    s1.className = 'apex-tests-runs-status-main';
    s1.appendChild(buildApexJobStatusNode(main, run.outcomeCounts, run.job));
    tdStatus.appendChild(s1);
    const sub = document.createElement('div');
    sub.className = 'apex-tests-runs-class-sub';
    sub.textContent = names.join(', ');
    tdStatus.appendChild(sub);
  } else {
    tdStatus.replaceChildren(buildApexJobStatusNode(main, run.outcomeCounts, run.job));
  }
}

/**
 * Actualiza filas por `data-job-key` (sfApexIdKey de parentid) sin vaciar el tbody.
 * @param {HTMLTableSectionElement} tbody
 * @param {unknown[]} jobs
 */
function syncOtherRunsTbody(tbody, jobs, orgId, storedJobs = []) {
  const keyFor = (j) => sfApexIdKey(j.parentid);
  /** @type {Map<string, HTMLTableRowElement>} */
  const byKey = new Map();
  for (const tr of tbody.querySelectorAll('tr[data-job-key]')) {
    const k = tr.dataset.jobKey;
    if (k) byKey.set(k, tr);
  }
  const keep = new Set();
  for (const j of jobs) {
    const k = keyFor(j);
    if (!k) continue;
    keep.add(k);
    const parentId = j.parentid != null ? String(j.parentid) : '';
    const exKey = runExpandKey(orgId, parentId);
    let tr = byKey.get(k);
    if (!tr) {
      tr = document.createElement('tr');
      tr.dataset.jobKey = k;
      tr.dataset.orgId = orgId;
      tr.dataset.jobId = parentId;
      const cExpand = document.createElement('td');
      cExpand.className = 'apex-tests-runs-td-expand';
      const btnExpand = buildRunExpandButton(exKey, !!parentId);
      btnExpand.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btnExpand.disabled) return;
        void toggleHubRunExpand(exKey, {
          orgId,
          jobId: parentId,
          anchorTr: tr,
          colSpan: 5
        });
      });
      cExpand.appendChild(btnExpand);
      const c0 = document.createElement('td');
      const c1 = document.createElement('td');
      const c2 = document.createElement('td');
      c2.className = 'apex-tests-other-runs-detail-cell';
      const cWatch = document.createElement('td');
      cWatch.className = 'apex-tests-other-runs-watch-cell';
      const btnWatch = document.createElement('button');
      btnWatch.type = 'button';
      btnWatch.className = 'apex-tests-runs-action-btn apex-tests-other-watch-btn';
      applyOtherRunsWatchButton(btnWatch, orgId, parentId, j, storedJobs);
      cWatch.appendChild(btnWatch);
      tr.appendChild(cExpand);
      tr.appendChild(c0);
      tr.appendChild(c1);
      tr.appendChild(c2);
      tr.appendChild(cWatch);
      byKey.set(k, tr);
    }
    tr.cells[1].textContent = String(j.launchedBy || '').trim() || '—';
    tr.cells[1].title = String(j.launchedBy || '').trim() || '';
    tr.cells[2].textContent = '';
    const jobMeta = {
      NumberOfErrors: j.numberOfErrors,
      ExtendedStatus: j.extstatus
    };
    const classNames = otherRunsJobClassNameList(j);
    if (classNames.length) {
      const s1 = document.createElement('span');
      s1.className = 'apex-tests-runs-status-main';
      s1.appendChild(buildApexJobStatusNode(j.status, j.outcomeCounts, jobMeta));
      tr.cells[2].appendChild(s1);
      const sub = document.createElement('div');
      sub.className = 'apex-tests-runs-class-sub';
      sub.textContent = classNames.join(', ');
      tr.cells[2].appendChild(sub);
    } else {
      tr.cells[2].replaceChildren(buildApexJobStatusNode(j.status, j.outcomeCounts, jobMeta));
    }
    tr.cells[3].textContent = formatOtherRunsJobDetail(j);
    const watchBtn = tr.querySelector('.apex-tests-other-watch-btn, .apex-tests-other-unwatch-btn');
    if (watchBtn) applyOtherRunsWatchButton(watchBtn, orgId, parentId, j, storedJobs);
  }
  for (const k of [...byKey.keys()]) {
    if (!keep.has(k)) {
      const tr = byKey.get(k);
      if (tr) {
        const next = tr.nextElementSibling;
        if (next?.classList.contains('apex-tests-other-runs-detail-row')) next.remove();
        tr.remove();
      }
      byKey.delete(k);
    }
  }
  /** Filas detalle huérfanas (el padre se movió sin ellas en un refresh anterior). */
  for (const detailTr of [...tbody.querySelectorAll('.apex-tests-other-runs-detail-row')]) {
    const prev = detailTr.previousElementSibling;
    if (!prev?.dataset?.jobKey) detailTr.remove();
  }
  const frag = document.createDocumentFragment();
  for (const j of jobs) {
    const k = keyFor(j);
    if (!k) continue;
    const tr = byKey.get(k);
    if (!tr) continue;
    let detailTr = tr.nextElementSibling;
    if (!detailTr?.classList.contains('apex-tests-other-runs-detail-row')) {
      detailTr = null;
    }
    frag.appendChild(tr);
    if (detailTr) frag.appendChild(detailTr);
  }
  tbody.appendChild(frag);
}

/**
 * Crea o devuelve la sección de una org con error/empty/table reutilizables.
 * @param {HTMLElement} scrollEl
 * @param {string} oid
 */
function ensureOtherOrgSection(scrollEl, oid) {
  let section = scrollEl.querySelector(`section[data-other-org-id="${CSS.escape(oid)}"]`);
  if (section) return section;
  section = document.createElement('section');
  section.className = 'apex-tests-other-runs-org';
  section.dataset.otherOrgId = oid;

  const title = document.createElement('h4');
  title.className = 'apex-tests-other-runs-org-title';
  section.appendChild(title);

  const errP = document.createElement('p');
  errP.className = 'apex-tests-other-runs-error';
  errP.hidden = true;
  section.appendChild(errP);

  const emptyP = document.createElement('p');
  emptyP.className = 'apex-tests-other-runs-empty';
  emptyP.hidden = true;
  emptyP.textContent = t('apexTests.otherRunsEmpty');
  section.appendChild(emptyP);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'apex-tests-other-runs-table-wrap';
  tableWrap.hidden = true;
  const tbl = document.createElement('table');
  tbl.className = 'apex-tests-other-runs-mini-table';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const label of [
    '',
    t('apexTests.otherRunsColLauncher'),
    t('apexTests.runsColStatus'),
    t('apexTests.otherRunsColDetail'),
    t('apexTests.otherRunsColWatch')
  ]) {
    const th = document.createElement('th');
    th.textContent = label;
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  tbl.appendChild(thead);
  const tbody = document.createElement('tbody');
  tbl.appendChild(tbody);
  tableWrap.appendChild(tbl);
  section.appendChild(tableWrap);

  scrollEl.appendChild(section);
  return section;
}

/**
 * Aplica estado a una sección (error, vacío o tabla) sin recrear el nodo.
 * @param {HTMLElement} section
 * @param {string} label
 * @param {{ ok: boolean, reason?: string, error?: string, jobs?: unknown[] }} res
 */
function applyOtherOrgSectionState(section, label, res, orgId, storedJobs = []) {
  const title = section.querySelector('.apex-tests-other-runs-org-title');
  const errP = section.querySelector('.apex-tests-other-runs-error');
  const emptyP = section.querySelector('.apex-tests-other-runs-empty');
  const tableWrap = section.querySelector('.apex-tests-other-runs-table-wrap');
  const tbody = section.querySelector('tbody');
  if (title) title.textContent = label;

  if (!res.ok) {
    if (errP) {
      errP.hidden = false;
      errP.textContent =
        res.reason === 'NO_SID'
          ? t('toast.noSession')
          : res.error || t('apexTests.otherRunsLoadError');
    }
    if (emptyP) emptyP.hidden = true;
    if (tableWrap) tableWrap.hidden = true;
    return;
  }

  if (errP) errP.hidden = true;
  const jobs = filterOtherRunsJobsByRetention(res.jobs || []);
  if (!jobs.length) {
    if (emptyP) emptyP.hidden = false;
    if (tableWrap) tableWrap.hidden = true;
    return;
  }

  if (emptyP) emptyP.hidden = true;
  if (tableWrap) tableWrap.hidden = false;
  if (tbody) syncOtherRunsTbody(tbody, jobs, orgId, storedJobs);
}

function reorderOtherOrgSections(scrollEl, orgIds) {
  const frag = document.createDocumentFragment();
  for (const oid of orgIds) {
    const sec = scrollEl.querySelector(`section[data-other-org-id="${CSS.escape(oid)}"]`);
    if (sec) frag.appendChild(sec);
  }
  scrollEl.appendChild(frag);
}

/**
 * Cola Apex (servlet) distinta de los jobs ya listados en la tabla; se refresca con el mismo polling.
 * Actualiza filas en sitio (sin vaciar el panel) y mantiene scroll interno en `.apex-tests-other-runs-scroll`.
 */
function resolveOrgDisplayLabelSync(orgId, aliases, groups) {
  const oid = String(orgId || '').trim();
  if (!oid) return '';
  const org = state.orgsList.find((o) => String(o.id) === oid);
  return org
    ? buildOrgPicklistLabel(org, { aliases, groups })
    : shortId(oid);
}

async function refreshOtherOrgQueuePanel(list, enriched) {
  const details = document.getElementById('apexTestsOtherRunsDetails');
  const scrollEl = getOtherRunsScrollEl();
  if (!details || !scrollEl) return;
  const activeOrgId = state.leftOrgId != null ? String(state.leftOrgId).trim() : '';
  if (!list.length && !activeOrgId) {
    details.classList.add('hidden');
    scrollEl.innerHTML = '';
    return;
  }
  details.classList.remove('hidden');

  const extras = await chrome.storage.sync.get(['orgAliases', 'orgGroups']);
  const aliases = extras.orgAliases || {};
  const groups = extras.orgGroups || {};

  /** Siempre incluir el entorno activo aunque no haya jobs propios en la tabla. */
  const orgIdsSet = new Set(list.map((j) => String(j.orgId)));
  if (activeOrgId) orgIdsSet.add(activeOrgId);
  const orgIds = [...orgIdsSet];

  const trackedByOrg = new Map();
  for (const j of list) {
    const oid = String(j.orgId);
    if (!trackedByOrg.has(oid)) trackedByOrg.set(oid, []);
    trackedByOrg.get(oid).push(j.jobId);
  }
  const labelByOrg = new Map();
  for (const j of enriched || []) {
    labelByOrg.set(String(j.orgId), j.displayEnv || shortId(j.orgId));
  }
  for (const oid of orgIds) {
    if (!labelByOrg.has(oid)) {
      labelByOrg.set(oid, resolveOrgDisplayLabelSync(oid, aliases, groups));
    }
  }

  const firstLoad = scrollEl.children.length === 0;
  if (firstLoad) {
    const p = document.createElement('p');
    p.className = 'apex-tests-other-runs-loading apex-tests-other-runs-first-loading';
    p.textContent = t('apexTests.otherRunsLoading');
    scrollEl.appendChild(p);
  }

  const results = await Promise.all(
    orgIds.map(async (oid) => {
      const res = await bg({
        type: 'apexTests:getOtherQueueJobs',
        orgId: oid,
        trackedJobIds: trackedByOrg.get(oid) || []
      });
      return [oid, res];
    })
  );

  scrollEl.querySelector('.apex-tests-other-runs-first-loading')?.remove();

  const wantOrgs = new Set(orgIds);
  for (const sec of [...scrollEl.querySelectorAll('section[data-other-org-id]')]) {
    const id = sec.dataset.otherOrgId;
    if (id && !wantOrgs.has(id)) sec.remove();
  }

  for (const [oid, res] of results) {
    const label = labelByOrg.get(oid) || shortId(oid);
    const section = ensureOtherOrgSection(scrollEl, oid);
    applyOtherOrgSectionState(section, label, res, oid, list);
  }

  reorderOtherOrgSections(scrollEl, orgIds);
}

/**
 * @param {{ reusePoll?: boolean }} [opts]
 */
async function renderHubRunsTable(opts = {}) {
  const tbody = document.getElementById('apexTestsRunsTbody');
  const wrap = document.getElementById('apexTestsRunsTableWrap');
  const empty = document.getElementById('apexTestsRunsEmpty');
  const errEl = document.getElementById('apexTestsRunsPollError');
  if (!tbody || !wrap || !empty) return;

  ensureApexRunsMoreMenuDismiss();
  closeAllApexRunsMoreMenus();

  initApexTestsClearRunsButton();
  const rawJobs = await loadAllStoredJobs();
  let list = pruneExpiredStoredJobs(rawJobs);
  await persistPrunedJobsIfNeeded(rawJobs, list);
  syncClearRunsButtonState(list.length);
  const pollKey = list.map((j) => `${j.orgId}:${j.jobId}`).join('|');

  if (errEl) {
    errEl.textContent = '';
    errEl.classList.add('hidden');
  }

  if (!list.length) {
    tbody.innerHTML = '';
    wrap.classList.remove('hidden');
    empty.classList.remove('hidden');
    lastPollResult = null;
    await refreshOtherOrgQueuePanel([], []);
    return;
  }

  wrap.classList.remove('hidden');
  empty.classList.add('hidden');

  const enriched = await enrichStoredJobsWithEnvLabels(list);

  /** @type {Record<string, { ok: boolean, runs?: unknown[], reason?: string, error?: string }>} */
  let pollsByOrgId = lastPollResult?.pollsByOrgId;
  if (!opts.reusePoll || !lastPollResult || lastPollResult.key !== pollKey) {
    const orgToJobIds = new Map();
    for (const j of list) {
      const oid = String(j.orgId);
      if (!orgToJobIds.has(oid)) orgToJobIds.set(oid, new Set());
      orgToJobIds.get(oid).add(j.jobId);
    }
    const pairs = await Promise.all(
      [...orgToJobIds.entries()].map(async ([oid, idSet]) => {
        const resPoll = await bg({
          type: 'apexTests:pollRuns',
          orgId: oid,
          jobIds: [...idSet]
        });
        return [oid, resPoll];
      })
    );
    pollsByOrgId = Object.fromEntries(pairs);
    lastPollResult = { key: pollKey, pollsByOrgId };
  }

  const pollValues = Object.values(pollsByOrgId || {});
  const allFailed = pollValues.length > 0 && pollValues.every((p) => !p.ok);
  const allNoSid =
    pollValues.length > 0 && pollValues.every((p) => !p.ok && p.reason === 'NO_SID');

  if (allNoSid) {
    showToast(t('toast.noSession'), 'warn');
    stopApexTestsHubPolling();
  }

  if (allFailed && errEl) {
    const first = pollValues.find((p) => !p.ok);
    errEl.textContent =
      first?.reason === 'NO_SID'
        ? t('toast.noSession')
        : first?.error || t('apexTests.runsPollError');
    errEl.classList.remove('hidden');
  } else if (pollValues.some((p) => !p.ok) && errEl) {
    errEl.textContent = t('apexTests.runsPartialPollError');
    errEl.classList.remove('hidden');
  }

  const runMapsByOrg = new Map();
  if (pollsByOrgId) {
    for (const oid of Object.keys(pollsByOrgId)) {
      runMapsByOrg.set(oid, buildRunJobIdMap(pollsByOrgId[oid]));
    }
  }

  maybeNotifyTestRunCompletions(enriched, pollsByOrgId);

  const runsForStop = [];
  const reopenKey = expandedRunKey;
  let savedExpandFilter = null;
  let detachedDetailRow = null;
  let savedDetailScroll = 0;
  const tableWrap = document.getElementById('apexTestsRunsTableWrap');
  const savedWrapScroll = tableWrap?.scrollTop ?? 0;
  if (reopenKey) {
    detachedDetailRow = findExpandedDetailRow(reopenKey);
    savedExpandFilter = readDetailFilterState(detachedDetailRow?.querySelector('.apex-tests-runs-detail-inner'));
    savedDetailScroll =
      detachedDetailRow?.querySelector('.apex-tests-runs-detail-inner')?.scrollTop ?? 0;
    detachedDetailRow?.remove();
  }
  tbody.innerHTML = '';

  for (let idx = 0; idx < enriched.length; idx++) {
    try {
      const j = enriched[idx];
      const rowOrgId = String(j.orgId);
      const jobId = j.jobId;
      const exKey = runExpandKey(rowOrgId, jobId);
      const poll = pollsByOrgId[rowOrgId];
      const run = pickRunForStoredJob(poll, jobId);
      runsForStop.push(run);

      const tr = document.createElement('tr');
      tr.dataset.rowKey = exKey;
      tr.dataset.jobId = jobId;
      tr.dataset.orgId = rowOrgId;
      const terminal =
        run.job && ['Completed', 'Failed', 'Aborted', 'Error'].includes(run.job.Status);
      tr.dataset.jobStatus = String(run.job?.Status || '');
      tr.dataset.canonicalJobId = String(run.job?.Id || run.canonicalJobId || jobId);
      const expandable = !!(poll?.ok && !run.missing && !run.pollFailure && run.job);

    const tdExpand = document.createElement('td');
    tdExpand.className = 'apex-tests-runs-td-expand';
    const btnExpand = buildRunExpandButton(exKey, expandable);
    tdExpand.appendChild(btnExpand);
    const tdEnv = document.createElement('td');
    tdEnv.className = 'apex-tests-runs-td-env';
    tdEnv.title = `${j.displayEnv || rowOrgId}`;
    tdEnv.textContent = j.displayEnv || shortId(rowOrgId);

    const tdStarted = document.createElement('td');
    tdStarted.className = 'apex-tests-runs-td-started';
    const startedMs = j.startedAt != null ? Number(j.startedAt) : NaN;
    tdStarted.textContent = formatTestRunStartedAt(startedMs);
    if (Number.isFinite(startedMs) && startedMs > 0) {
      try {
        tdStarted.title = new Date(startedMs).toISOString();
      } catch {
        tdStarted.title = '';
      }
    }

    const tdStatus = document.createElement('td');
    tdStatus.className = 'apex-tests-runs-td-status';
    renderRunStatusCell(tdStatus, run, j.runBody);

    const tdTests = document.createElement('td');
    tdTests.className = 'apex-tests-runs-td-summary';
    tdTests.textContent =
      run.missing || run.pollFailure
        ? '—'
        : formatOutcomeSummary(run.outcomeCounts);

    const tdActions = document.createElement('td');
    tdActions.className = 'apex-tests-runs-td-actions';

    const viewTestOpts = testClassOptionsFromRunBody(j.runBody);
    const pollHealthy = !!(poll?.ok && !run.pollFailure && !run.missing && run.job);
    const hasRunSnapshot = !!(j.runBody && typeof j.runBody === 'object');
    const runMap = runMapsByOrg.get(rowOrgId) || new Map();
    let selfInFlight = false;
    let duplicateInFlight = false;
    if (pollHealthy) {
      selfInFlight = !!(run.job && isApexAsyncJobInFlightStatus(run.job.Status));
      duplicateInFlight = hasOtherInFlightSameRunBody(
        rowOrgId,
        jobId,
        j.runBody,
        enriched,
        runMap
      );
    }
    const rerunBlockedInFlight = selfInFlight || duplicateInFlight;
    const failCount =
      run.outcomeCounts && (Number(run.outcomeCounts.Fail || 0) + Number(run.outcomeCounts.CompileFail || 0));
    const stLc = String(run.job?.Status || '')
      .trim()
      .toLowerCase();
    const canAbortJob =
      pollHealthy && !!run.job && ['queued', 'processing', 'preparing', 'holding'].includes(stLc);
    const inspectDisabled = !!(run.missing || run.pollFailure || !run.job || !terminal || !poll?.ok);
    const skipCoverageForRun = !!(j.runBody && typeof j.runBody === 'object' && j.runBody.skipCodeCoverage === true);

    const btnCoverage = skipCoverageForRun
      ? null
      : createApexRunActionButton({
          icon: 'coverage',
          label: t('apexTests.runsCoverage'),
          disabled: inspectDisabled
        });
    const btnLog = createApexRunActionButton({
      icon: 'log',
      label: t('apexTests.runsLog'),
      disabled: inspectDisabled
    });
    const btnViewTest = createApexRunActionButton({
      icon: 'view',
      label: t('apexTests.runsViewTest'),
      disabled: viewTestOpts.length === 0,
      title: viewTestOpts.length === 0 ? t('apexTests.viewTestNoClassesHint') : t('apexTests.runsViewTest')
    });

    let rerunTitle = t('apexTests.runsRerun');
    if (!hasRunSnapshot) rerunTitle = t('apexTests.rerunNoSnapshotHint');
    else if (rerunBlockedInFlight) {
      rerunTitle = selfInFlight ? t('apexTests.rerunBlockedSelf') : t('apexTests.rerunBlockedDuplicate');
    }
    const btnRerun = createApexRunActionButton({
      icon: 'rerun',
      label: t('apexTests.runsRerun'),
      variant: 'primary',
      disabled: !!(!hasRunSnapshot || rerunBlockedInFlight),
      title: rerunTitle
    });
    const btnRerunFailures = createApexRunActionButton({
      icon: 'rerun-fail',
      label: t('apexTests.runsRerunFailures'),
      variant: 'primary',
      disabled: !(
        terminal &&
        hasRunSnapshot &&
        pollHealthy &&
        failCount > 0 &&
        !rerunBlockedInFlight
      ),
      title: t('apexTests.runsRerunFailures')
    });
    const btnAbort = createApexRunActionButton({
      icon: 'abort',
      label: t('apexTests.runsAbort'),
      variant: 'danger',
      disabled: !canAbortJob,
      title: canAbortJob ? t('apexTests.runsAbortHint') : t('apexTests.runsAbort')
    });

    const actionsInner = document.createElement('div');
    actionsInner.className = 'apex-tests-runs-actions-inner';
    const exportDisabled = !terminal || !!(run.missing || run.pollFailure || !run.job);
    const exportMeta = {
      envLabel: j.displayEnv || rowOrgId,
      status: String(run.job?.Status || ''),
      startedAt: Number.isFinite(startedMs) ? new Date(startedMs).toISOString() : null,
      summary: run.missing || run.pollFailure ? '' : formatOutcomeSummary(run.outcomeCounts)
    };
    const canonicalForExport = run.job?.Id || run.canonicalJobId || jobId;

    const moreExtra = [];
    if (isWatchedStoredJob(j)) {
      moreExtra.push({
        label: t('apexTests.runsUnwatch'),
        onClick: () => void unwatchApexTestJob(rowOrgId, jobId)
      });
    }

    const moreMenu = createApexRunsMoreOptionsMenu({
      disabled: exportDisabled && !moreExtra.length,
      extraItems: moreExtra,
      onExportCsv: () => void exportApexTestRun(rowOrgId, canonicalForExport, 'csv', exportMeta),
      onExportJson: () => void exportApexTestRun(rowOrgId, canonicalForExport, 'json', exportMeta)
    });

    const groupInspect = createApexRunsActionGroup(
      skipCoverageForRun ? [btnLog, btnViewTest] : [btnCoverage, btnLog, btnViewTest]
    );
    const groupRun = createApexRunsActionGroup([
      btnRerun,
      failCount > 0 ? btnRerunFailures : null
    ]);
    const groupTail = createApexRunsActionGroup([canAbortJob ? btnAbort : null, moreMenu]);
    actionsInner.appendChild(groupInspect);
    actionsInner.appendChild(groupRun);
    actionsInner.appendChild(groupTail);
    tdActions.appendChild(actionsInner);
    tr.appendChild(tdExpand);
    tr.appendChild(tdEnv);
    tr.appendChild(tdStarted);
    tr.appendChild(tdStatus);
    tr.appendChild(tdTests);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);

    btnExpand.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btnExpand.disabled) return;
      const canonicalJobId = run.job?.Id || run.canonicalJobId || jobId;
      void toggleHubRunExpand(exKey, {
        orgId: rowOrgId,
        jobId: canonicalJobId,
        anchorTr: tr,
        colSpan: 6,
        terminal
      });
    });

    const canonicalJobId = run.job?.Id || run.canonicalJobId || jobId;
    btnCoverage?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btnCoverage.disabled) return;
      void openRunCoverageModal(rowOrgId, canonicalJobId);
    });
    btnLog.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btnLog.disabled) return;
      openTestRunLogFromHubRow(rowOrgId, run.job, jobId);
    });
    btnViewTest.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btnViewTest.disabled) return;
      openViewTestPicker(rowOrgId, j.runBody);
    });

    btnAbort.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (btnAbort.disabled) return;
      if (!window.confirm(t('apexTests.runsAbortConfirm'))) return;
      btnAbort.disabled = true;
      const abortRes = await bg({
        type: 'apexTests:abortRun',
        orgId: rowOrgId,
        jobId: run.job?.Id || run.canonicalJobId || jobId
      });
      if (abortRes?.ok) {
        showToast(t('apexTests.runsAbortOk'), 'info');
        void renderHubRunsTable({ reusePoll: false });
      } else {
        const msg =
          abortRes?.reason === 'NO_SID'
            ? t('toast.noSession')
            : abortRes?.reason === 'NO_QUEUE_ITEMS'
              ? t('apexTests.runsAbortNoQueueItems')
              : abortRes?.reason === 'NO_ABORTABLE_QUEUE_ITEMS'
                ? t('apexTests.runsAbortNoAbortableItems')
                : abortRes?.error || t('apexTests.runsAbortError');
        showToast(msg, 'error');
        btnAbort.disabled = !canAbortJob;
      }
    });
    btnRerun.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btnRerun.disabled) return;
      void rerunStoredApexJob(rowOrgId, j);
    });
    btnRerunFailures.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btnRerunFailures.disabled) return;
      void rerunFailedMethodsFromJob(rowOrgId, canonicalJobId, j);
    });
    } catch (e) {
      void handleToolError(e, { artifact_type: 'ApexTests', phase: 'hub_render_row' });
      console.error('[apexTestsHubRuns] render row failed', e);
      if (errEl) {
        errEl.textContent = `Error renderizando fila de ejecución: ${String(e?.message || e)}`;
        errEl.classList.remove('hidden');
      }
      continue;
    }
  }

  if (reopenKey) {
    const anchor = tbody.querySelector(`tr[data-row-key="${CSS.escape(reopenKey)}"]`);
    const parsed = parseRunExpandKey(reopenKey);
    if (anchor && parsed) {
      if (detachedDetailRow) {
        anchor.insertAdjacentElement('afterend', detachedDetailRow);
        const detailInner = detachedDetailRow.querySelector('.apex-tests-runs-detail-inner');
        restoreElementScroll(detailInner, savedDetailScroll);
        syncAllExpandButtonStates();
      } else {
        const poll = pollsByOrgId[parsed.orgId];
        const run = pickRunForStoredJob(poll, parsed.jobId);
        const term =
          run.job && ['Completed', 'Failed', 'Aborted', 'Error'].includes(run.job.Status);
        void reopenHubRunDetailAfterRefresh(
          reopenKey,
          {
            orgId: parsed.orgId,
            jobId: run.job?.Id || run.canonicalJobId || parsed.jobId,
            anchorTr: anchor,
            colSpan: 6,
            terminal: term
          },
          savedExpandFilter
        );
      }
    }
  }

  await refreshOtherOrgQueuePanel(list, enriched);

  restoreElementScroll(tableWrap, savedWrapScroll);

  if (pollValues.length && !allFailed) {
    if (shouldStopPollingAfterRuns(runsForStop, list)) {
      stopApexTestsHubPolling();
    }
  }
}

const TERMINAL_JOB = new Set(['Completed', 'Failed', 'Aborted', 'Error']);

function shouldStopPollingAfterRuns(runs, storedJobs = []) {
  if (!runs.length) return false;
  const hasWatchedInFlight = storedJobs.some((j, idx) => {
    if (j?.source !== 'watched') return false;
    const run = runs[idx];
    if (!run || run.pollFailure) return true;
    if (run.missing) return true;
    return !!(run.job && isApexAsyncJobInFlightStatus(run.job.Status));
  });
  if (hasWatchedInFlight) return false;

  const relevant = runs.filter((r) => !r.pollFailure);
  if (!relevant.length) {
    consecutiveAllMissingPolls += 1;
    return consecutiveAllMissingPolls >= MAX_POLLS_ALL_MISSING;
  }
  const allMissing = relevant.every((r) => r.missing);
  if (allMissing) {
    consecutiveAllMissingPolls += 1;
    return consecutiveAllMissingPolls >= MAX_POLLS_ALL_MISSING;
  }
  consecutiveAllMissingPolls = 0;
  return relevant.every((r) => {
    if (r.missing) return false;
    const st = r.job?.Status;
    return st && TERMINAL_JOB.has(st);
  });
}
