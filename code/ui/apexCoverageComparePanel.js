import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t, getCurrentLang } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { buildOrgPicklistLabel } from '../../shared/orgPrefs.js';

/**
 * @type {Array<{
 *   name: string,
 *   leftPct: number | null,
 *   rightPct: number | null,
 *   delta: number | null,
 *   leftId: string | null,
 *   rightId: string | null
 * }>}
 */
let lastMerged = [];

function getOrgLabel(orgId) {
  const org = (state.orgsList || []).find((o) => o.id === orgId);
  if (!org) return String(orgId || '');
  try {
    return buildOrgPicklistLabel(org);
  } catch {
    return org.label || org.displayName || String(org.id || '');
  }
}

function getCompactOrgLabel(orgId) {
  const base = String(getOrgLabel(orgId) || '').trim();
  if (!base) return '';
  const noUser = base.split(' (')[0].trim();
  const noDomain = noUser.split(' - ')[0].trim();
  return noDomain || base;
}

/**
 * @param {unknown[]} rows
 * @returns {Map<string, { pct: number | null, id: string }>}
 */
function rowsToInfoByName(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const name = String(row?.ApexClassOrTrigger?.Name || '').trim();
    const id = String(row?.ApexClassOrTriggerId || '').replace(/[^a-zA-Z0-9]/g, '');
    if (!name || !id) continue;
    const c = Number(row?.NumLinesCovered) || 0;
    const u = Number(row?.NumLinesUncovered) || 0;
    const tot = c + u;
    const pct = tot > 0 ? (c / tot) * 100 : null;
    map.set(name, { pct, id });
  }
  return map;
}

function mergeCoverage(leftRows, rightRows) {
  const L = rowsToInfoByName(leftRows);
  const R = rowsToInfoByName(rightRows);
  const names = [...new Set([...L.keys(), ...R.keys()])].sort((a, b) =>
    a.localeCompare(b, getCurrentLang() === 'en' ? 'en' : 'es', { sensitivity: 'base' })
  );
  return names.map((name) => {
    const li = L.get(name);
    const ri = R.get(name);
    const leftPct = li ? li.pct : null;
    const rightPct = ri ? ri.pct : null;
    let delta = null;
    if (leftPct != null && rightPct != null && Number.isFinite(leftPct) && Number.isFinite(rightPct)) {
      delta = rightPct - leftPct;
    }
    return {
      name,
      leftPct,
      rightPct,
      delta,
      leftId: li?.id ?? null,
      rightId: ri?.id ?? null
    };
  });
}

function formatPct(p) {
  if (p == null || !Number.isFinite(p)) return '—';
  const lang = getCurrentLang() === 'en' ? 'en-US' : 'es-ES';
  return `${p.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function formatDelta(d) {
  if (d == null || !Number.isFinite(d)) return '—';
  const lang = getCurrentLang() === 'en' ? 'en-US' : 'es-ES';
  const formatted = d.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const plus = d > 0 ? '+' : '';
  return `${plus}${formatted} ${t('coverageCompare.deltaUnit')}`;
}

function deltaCellClass(d) {
  if (d == null || !Number.isFinite(d) || Math.abs(d) < 0.05) return '';
  return d > 0 ? 'apex-coverage-compare-delta-pos' : 'apex-coverage-compare-delta-neg';
}

function lineViewErrorMessage(res) {
  if (!res) return t('coverageCompare.lineViewError');
  if (res.reason === 'NO_SID') return t('toast.noSession');
  if (res.error) return String(res.error);
  return t('coverageCompare.lineViewError');
}

async function openSplitLineCoverageViewer(
  leftOrgId,
  rightOrgId,
  leftApexId,
  rightApexId,
  classLabel
) {
  if (!leftOrgId || !rightOrgId || !leftApexId || !rightApexId) return;
  showToastWithSpinner(t('coverageCompare.lineViewLoading'));
  try {
    const [leftRes, rightRes] = await Promise.all([
      bg({
        type: 'apexCoverageCompare:getLineView',
        orgId: leftOrgId,
        apexClassOrTriggerId: leftApexId,
        className: classLabel || ''
      }),
      bg({
        type: 'apexCoverageCompare:getLineView',
        orgId: rightOrgId,
        apexClassOrTriggerId: rightApexId,
        className: classLabel || ''
      })
    ]);
    const leftOk = Boolean(leftRes?.ok);
    const rightOk = Boolean(rightRes?.ok);
    if (!leftOk && !rightOk) {
      showToast(`${lineViewErrorMessage(leftRes)} · ${lineViewErrorMessage(rightRes)}`, 'error');
      return;
    }
    const leftLabel = getCompactOrgLabel(leftOrgId);
    const rightLabel = getCompactOrgLabel(rightOrgId);

    let leftBody = leftOk ? String(leftRes.body ?? '') : '';
    let rightBody = rightOk ? String(rightRes.body ?? '') : '';
    if (!leftOk) {
      showToast(lineViewErrorMessage(leftRes), 'warn');
      leftBody = `// ${lineViewErrorMessage(leftRes)}`;
    }
    if (!rightOk) {
      showToast(lineViewErrorMessage(rightRes), 'warn');
      rightBody = `// ${lineViewErrorMessage(rightRes)}`;
    }
    if (leftOk && !leftBody.trim()) {
      leftBody = `// ${t('coverageCompare.lineViewNoSource')}`;
    }
    if (rightOk && !rightBody.trim()) {
      rightBody = `// ${t('coverageCompare.lineViewNoSource')}`;
    }
    if (leftOk && rightOk && !String(leftRes.body ?? '').trim() && !String(rightRes.body ?? '').trim()) {
      showToast(t('coverageCompare.lineViewNoSource'), 'warn');
    } else {
      if (leftOk && !String(leftRes.body ?? '').trim()) {
        showToast(t('coverageCompare.lineViewNoSource'), 'warn');
      } else if (rightOk && !String(rightRes.body ?? '').trim()) {
        showToast(t('coverageCompare.lineViewNoSource'), 'warn');
      }
    }
    const leftCovered = leftOk && Array.isArray(leftRes.coveredLines) ? leftRes.coveredLines : [];
    const leftUncovered = leftOk && Array.isArray(leftRes.uncoveredLines) ? leftRes.uncoveredLines : [];
    const rightCovered = rightOk && Array.isArray(rightRes.coveredLines) ? rightRes.coveredLines : [];
    const rightUncovered = rightOk && Array.isArray(rightRes.uncoveredLines) ? rightRes.uncoveredLines : [];

    const key = `sfoc_cv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const classBit = classLabel || leftRes?.name || rightRes?.name || '';
    const title = `${classBit} · ${leftLabel} | ${rightLabel} · ${t('coverageCompare.viewSplit')}`;
    try {
      await chrome.storage.local.set({
        [key]: {
          mode: 'split',
          title,
          left: {
            orgLabel: leftLabel,
            body: leftBody,
            coveredLines: leftCovered,
            uncoveredLines: leftUncovered
          },
          right: {
            orgLabel: rightLabel,
            body: rightBody,
            coveredLines: rightCovered,
            uncoveredLines: rightUncovered
          }
        }
      });
    } catch {
      showToast(t('apexTests.coverageLinesStorageError'), 'warn');
      return;
    }
    if (
      leftOk &&
      rightOk &&
      !leftCovered.length &&
      !leftUncovered.length &&
      !rightCovered.length &&
      !rightUncovered.length &&
      leftBody.trim().startsWith('//') === false &&
      rightBody.trim().startsWith('//') === false
    ) {
      showToast(t('coverageCompare.lineViewNoLinesDetail'), 'info');
    }
    window.open(
      chrome.runtime.getURL(`code/apex-coverage-viewer.html?k=${encodeURIComponent(key)}`),
      '_blank'
    );
  } finally {
    dismissSpinnerToast();
  }
}

async function openLineCoverageViewer(orgId, apexClassOrTriggerId, classLabel) {
  if (!orgId || !apexClassOrTriggerId) return;
  showToastWithSpinner(t('coverageCompare.lineViewLoading'));
  try {
    const res = await bg({
      type: 'apexCoverageCompare:getLineView',
      orgId,
      apexClassOrTriggerId,
      className: classLabel || ''
    });
    if (!res?.ok) {
      showToast(
        res?.reason === 'NO_SID' ? t('toast.noSession') : res?.error || t('coverageCompare.lineViewError'),
        'error'
      );
      return;
    }
    const body = res.body != null ? String(res.body) : '';
    if (!body.trim()) {
      showToast(t('coverageCompare.lineViewNoSource'), 'warn');
      return;
    }
    const env = getCompactOrgLabel(orgId);
    const title = `${classLabel || res.name || apexClassOrTriggerId} · ${env} · ${t('docTitle.apexCoverage')}`;
    const key = `sfoc_cv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const coveredLines = Array.isArray(res.coveredLines) ? res.coveredLines : [];
    const uncoveredLines = Array.isArray(res.uncoveredLines) ? res.uncoveredLines : [];
    try {
      await chrome.storage.local.set({
        [key]: { title, body, coveredLines, uncoveredLines }
      });
    } catch {
      showToast(t('apexTests.coverageLinesStorageError'), 'warn');
      return;
    }
    if (!coveredLines.length && !uncoveredLines.length) {
      showToast(t('coverageCompare.lineViewNoLinesDetail'), 'info');
    }
    window.open(
      chrome.runtime.getURL(`code/apex-coverage-viewer.html?k=${encodeURIComponent(key)}`),
      '_blank'
    );
  } finally {
    dismissSpinnerToast();
  }
}

function renderTableBody(tbody, needle, leftOrgId, rightOrgId) {
  if (!tbody) return;
  tbody.innerHTML = '';
  const n = String(needle || '')
    .trim()
    .toLowerCase();
  const rows = n
    ? lastMerged.filter((r) => r.name.toLowerCase().includes(n))
    : lastMerged;
  for (const r of rows) {
    const tr = document.createElement('tr');
    const tdN = document.createElement('td');
    tdN.textContent = r.name;
    const tdL = document.createElement('td');
    tdL.className = 'apex-tests-coverage-pct';
    tdL.textContent = formatPct(r.leftPct);
    const tdR = document.createElement('td');
    tdR.className = 'apex-tests-coverage-pct';
    tdR.textContent = formatPct(r.rightPct);
    const tdD = document.createElement('td');
    tdD.className = `apex-tests-coverage-pct ${deltaCellClass(r.delta)}`.trim();
    tdD.textContent = formatDelta(r.delta);
    const tdV = document.createElement('td');
    tdV.className = 'apex-coverage-compare-viewer-cell';
    const wrap = document.createElement('div');
    wrap.className = 'apex-coverage-compare-viewer-btns';
    const btnL = document.createElement('button');
    btnL.type = 'button';
    btnL.className = 'apex-tests-coverage-view-btn';
    btnL.textContent = t('coverageCompare.viewLeft');
    btnL.title = t('coverageCompare.viewLeftTitle');
    btnL.disabled = !r.leftId || !leftOrgId;
    btnL.addEventListener('click', (e) => {
      e.stopPropagation();
      if (r.leftId && leftOrgId) void openLineCoverageViewer(leftOrgId, r.leftId, r.name);
    });
    const btnR = document.createElement('button');
    btnR.type = 'button';
    btnR.className = 'apex-tests-coverage-view-btn';
    btnR.textContent = t('coverageCompare.viewRight');
    btnR.title = t('coverageCompare.viewRightTitle');
    btnR.disabled = !r.rightId || !rightOrgId;
    btnR.addEventListener('click', (e) => {
      e.stopPropagation();
      if (r.rightId && rightOrgId) void openLineCoverageViewer(rightOrgId, r.rightId, r.name);
    });
    const btnSplit = document.createElement('button');
    btnSplit.type = 'button';
    btnSplit.className = 'apex-tests-coverage-view-btn apex-tests-coverage-split-btn';
    btnSplit.textContent = t('coverageCompare.viewSplit');
    btnSplit.title = t('coverageCompare.viewSplitTitle');
    btnSplit.disabled = !r.leftId || !r.rightId || !leftOrgId || !rightOrgId;
    btnSplit.addEventListener('click', (e) => {
      e.stopPropagation();
      if (r.leftId && r.rightId && leftOrgId && rightOrgId) {
        void openSplitLineCoverageViewer(leftOrgId, rightOrgId, r.leftId, r.rightId, r.name);
      }
    });
    wrap.appendChild(btnL);
    wrap.appendChild(btnR);
    wrap.appendChild(btnSplit);
    tdV.appendChild(wrap);
    tr.appendChild(tdN);
    tr.appendChild(tdL);
    tr.appendChild(tdR);
    tr.appendChild(tdD);
    tr.appendChild(tdV);
    tbody.appendChild(tr);
  }
}

function renderFullTable(leftLabel, rightLabel) {
  const mount = document.getElementById('apexCoverageCompareTableMount');
  if (!mount) return;
  mount.innerHTML = '';
  const filterRow = document.createElement('div');
  filterRow.className = 'apex-tests-coverage-filter-row';
  const filterInput = document.createElement('input');
  filterInput.type = 'search';
  filterInput.className = 'apex-tests-coverage-filter-input';
  filterInput.setAttribute('aria-label', t('coverageCompare.filterAria'));
  filterInput.placeholder = t('coverageCompare.filterPh');
  filterRow.appendChild(filterInput);

  const scroll = document.createElement('div');
  scroll.className = 'apex-tests-coverage-table-scroll';

  const tbl = document.createElement('table');
  tbl.className = 'apex-tests-coverage-table';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>
    <th scope="col">${t('coverageCompare.colClass')}</th>
    <th scope="col">${t('coverageCompare.colLeft', { org: leftLabel })}</th>
    <th scope="col">${t('coverageCompare.colRight', { org: rightLabel })}</th>
    <th scope="col">${t('coverageCompare.colDelta')}</th>
    <th scope="col" class="apex-coverage-compare-th-viewer">${t('coverageCompare.colViewer')}</th>
  </tr>`;
  tbl.appendChild(thead);
  const tbody = document.createElement('tbody');
  tbl.appendChild(tbody);
  scroll.appendChild(tbl);
  mount.appendChild(filterRow);
  mount.appendChild(scroll);

  const leftOrgId = state.leftOrgId;
  const rightOrgId = state.rightOrgId;
  filterInput.addEventListener('input', () =>
    renderTableBody(tbody, filterInput.value, leftOrgId, rightOrgId)
  );
  renderTableBody(tbody, '', leftOrgId, rightOrgId);
}

export function invalidateApexCoverageComparePanel() {
  lastMerged = [];
  const mount = document.getElementById('apexCoverageCompareTableMount');
  const status = document.getElementById('apexCoverageCompareStatus');
  if (mount) mount.innerHTML = '';
  if (status) status.textContent = t('coverageCompare.pressRefresh');
}

async function runLoad() {
  const status = document.getElementById('apexCoverageCompareStatus');
  if (!state.leftOrgId) {
    if (status) status.textContent = t('coverageCompare.selectLeft');
    return;
  }
  if (!state.rightOrgId) {
    if (status) status.textContent = t('coverageCompare.selectRight');
    return;
  }
  showToastWithSpinner(t('coverageCompare.loading'));
  if (status) status.textContent = t('coverageCompare.loading');
  try {
    const res = await bg({
      type: 'apexCoverageCompare:fetch',
      leftOrgId: state.leftOrgId,
      rightOrgId: state.rightOrgId
    });
    if (!res?.ok) {
      const msg =
        res?.reason === 'NO_SID' ? t('toast.noSession') : res?.error || t('coverageCompare.loadError');
      if (status) status.textContent = msg;
      showToast(msg, 'error');
      return;
    }
    lastMerged = mergeCoverage(res.leftRows || [], res.rightRows || []);
    if (!lastMerged.length) {
      if (status) status.textContent = t('coverageCompare.empty');
      const mount = document.getElementById('apexCoverageCompareTableMount');
      if (mount) mount.innerHTML = '';
      return;
    }
    const leftL = getCompactOrgLabel(state.leftOrgId);
    const rightL = getCompactOrgLabel(state.rightOrgId);
    renderFullTable(leftL, rightL);
    if (status) {
      status.textContent = t('coverageCompare.rowsLoaded', { n: String(lastMerged.length) });
    }
  } finally {
    dismissSpinnerToast();
  }
}

export async function refreshApexCoverageComparePanel() {
  const status = document.getElementById('apexCoverageCompareStatus');
  const mount = document.getElementById('apexCoverageCompareTableMount');
  if (getSelectedArtifactType() !== 'ApexCoverageCompare') return;
  if (!state.leftOrgId) {
    lastMerged = [];
    if (mount) mount.innerHTML = '';
    if (status) status.textContent = t('coverageCompare.selectLeft');
    return;
  }
  if (!state.rightOrgId) {
    lastMerged = [];
    if (mount) mount.innerHTML = '';
    if (status) status.textContent = t('coverageCompare.selectRight');
    return;
  }
  invalidateApexCoverageComparePanel();
}

export function setupApexCoverageComparePanel() {
  const btn = document.getElementById('apexCoverageCompareRefreshBtn');
  btn?.addEventListener('click', () => void runLoad());
}
