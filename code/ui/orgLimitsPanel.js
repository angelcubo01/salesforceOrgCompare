import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t, getCurrentLang } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { applyArtifactTypeUi } from './artifactTypeUi.js';
import { buildOrgPicklistLabel } from '../../shared/orgPrefs.js';
import { renderDonutChart, renderMultiSeriesPieChart } from '../lib/orgLimitsCharts.js';

const LEFT_COLOR = '#22d3ee';
const RIGHT_COLOR = '#22c55e';
const METRIC_TITLE_OVERRIDES = {
  DailyApiRequests: 'Daily API Requests',
  DailyApexCursorLimit: 'Daily Apex Cursor Limit',
  DailyApexCursorRowsLimit: 'Daily Apex Cursor Rows Limit',
  DailyApexPCursorLimit: 'Daily Apex P-Cursor Limit',
  DailyBulkApiBatches: 'Daily Bulk API Batches',
  DailyBulkV2QueryFileStorageMB: 'Daily Bulk V2 Query File Storage (MB)',
  DailyBulkV2QueryJobs: 'Daily Bulk V2 Query Jobs',
  DataStorageMB: 'Data Storage (MB)',
  FileStorageMB: 'File Storage (MB)',
  CdpAiInferenceApiMonthlyLimit: 'CDP AI Inference API Monthly Limit',
  HourlyODataCallout: 'Hourly OData Callout',
  MaxContentDocumentsLimit: 'Max Content Documents Limit'
};

function formatMetricTitle(metricKey) {
  if (METRIC_TITLE_OVERRIDES[metricKey]) return METRIC_TITLE_OVERRIDES[metricKey];
  const tokenized = String(metricKey || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/\bApi\b/g, 'API')
    .replace(/\bMb\b/g, 'MB')
    .replace(/\bCdp\b/g, 'CDP')
    .replace(/\bAi\b/g, 'AI')
    .replace(/\bId\b/g, 'ID')
    .replace(/\bOData\b/g, 'OData')
    .trim();
  return tokenized || metricKey;
}

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

function pct(entry) {
  const max = Number(entry?.Max || 0);
  const remaining = Number(entry?.Remaining || 0);
  if (!Number.isFinite(max) || max <= 0) return 0;
  const used = Math.max(0, max - remaining);
  return Math.max(0, Math.min(1, used / max));
}

function used(entry) {
  const max = Number(entry?.Max || 0);
  const remaining = Number(entry?.Remaining || 0);
  if (!Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, max - remaining);
}

function getMetricsToRender(leftLimits, rightLimits) {
  const all = new Set([
    ...Object.keys(leftLimits || {}),
    ...Object.keys(rightLimits || {})
  ]);
  return [...all]
    .filter((k) => {
      const l = leftLimits?.[k];
      const r = rightLimits?.[k];
      const lUsed = used(l);
      const rUsed = used(r);
      return lUsed > 0 || rUsed > 0;
    })
    .sort((a, b) => formatMetricTitle(a).localeCompare(formatMetricTitle(b)));
}

function left(entry) {
  const remaining = Number(entry?.Remaining || 0);
  if (!Number.isFinite(remaining)) return 0;
  return Math.max(0, remaining);
}

function formatCount(value) {
  const lang = getCurrentLang && getCurrentLang() ? getCurrentLang() : 'es';
  return Number(value || 0).toLocaleString(lang === 'es' ? 'es-ES' : 'en-US');
}

function usageLine(label, entry) {
  const max = Number(entry?.Max || 0);
  const u = used(entry);
  const p = max > 0 ? ((u / max) * 100).toFixed(1) : '0.0';
  return t('orgLimits.consumedLine', {
    label,
    used: formatCount(u),
    max: formatCount(max),
    percent: p
  });
}

function leftLine(entry) {
  return t('orgLimits.leftLine', { left: formatCount(left(entry)) });
}

function renderCards(leftOrgId, leftLimits, rightOrgId, rightLimits) {
  const wrap = document.getElementById('orgLimitsCards');
  if (!wrap) return;
  wrap.innerHTML = '';
  const compare = !!rightOrgId && !!rightLimits;
  const metrics = getMetricsToRender(leftLimits, rightLimits);
  for (const metric of metrics) {
    const left = leftLimits?.[metric] || null;
    const right = compare ? rightLimits?.[metric] || null : null;
    const leftUsed = used(left);
    const rightUsed = used(right);
    if (leftUsed === 0 && (!compare || rightUsed === 0)) continue;
    const leftPct = pct(left);
    const rightPct = pct(right);
    const card = document.createElement('article');
    card.className = 'org-limits-card';
    card.innerHTML = `
      <h3>${formatMetricTitle(metric)}</h3>
      <div class="org-limits-chart-wrap ${compare ? 'is-compare' : 'is-single'}">
        <div class="org-limits-chart-slot" data-slot="chart"></div>
      </div>
      <div class="org-limits-value-line org-limits-value-line-main">${usageLine(getCompactOrgLabel(leftOrgId), left)}</div>
      <div class="org-limits-value-line">${leftLine(left)}</div>
      ${
        compare
          ? `<div class="org-limits-value-line org-limits-value-line-main">${usageLine(getCompactOrgLabel(rightOrgId), right)}</div>
             <div class="org-limits-value-line">${leftLine(right)}</div>`
          : ''
      }
    `;
    const chartSlot = card.querySelector('[data-slot="chart"]');
    if (compare) {
      renderMultiSeriesPieChart(chartSlot, leftPct, rightPct, LEFT_COLOR, RIGHT_COLOR, {
        outerLabel: getCompactOrgLabel(leftOrgId),
        innerLabel: getCompactOrgLabel(rightOrgId)
      });
    } else {
      renderDonutChart(chartSlot, leftPct, LEFT_COLOR);
    }
    wrap.appendChild(card);
  }
  if (!wrap.childElementCount) {
    const empty = document.createElement('p');
    empty.className = 'org-limits-status';
    empty.textContent = t('orgLimits.empty');
    wrap.appendChild(empty);
  }
}

async function runLoad() {
  const status = document.getElementById('orgLimitsStatus');
  if (!state.leftOrgId) {
    if (status) status.textContent = t('orgLimits.selectOrg');
    return;
  }
  const targetOrgIds = state.orgLimitsCompareMode
    ? [state.leftOrgId, state.rightOrgId].filter(Boolean)
    : [state.leftOrgId].filter(Boolean);
  if (state.orgLimitsCompareMode && !state.rightOrgId) {
    if (status) status.textContent = t('orgLimits.selectRightOrg');
    return;
  }
  showToastWithSpinner(t('orgLimits.loading'));
  if (status) status.textContent = t('orgLimits.loading');
  try {
    const rows = await Promise.all(
      targetOrgIds.map(async (orgId) => ({ orgId, res: await bg({ type: 'orgLimits:get', orgId }) }))
    );
    const leftRes = rows.find((x) => x.orgId === state.leftOrgId)?.res;
    const rightRes = rows.find((x) => x.orgId === state.rightOrgId)?.res;
    if (!leftRes?.ok) throw new Error(leftRes?.error || t('orgLimits.fetchError'));
    if (state.orgLimitsCompareMode && !rightRes?.ok) throw new Error(rightRes?.error || t('orgLimits.fetchError'));
    renderCards(state.leftOrgId, leftRes.limits || {}, state.rightOrgId, rightRes?.limits || null);
    if (status) status.textContent = '';
  } catch (e) {
    if (status) status.textContent = t('orgLimits.fetchError');
    showToast(String(e?.message || e), 'error');
  } finally {
    dismissSpinnerToast();
  }
}

export async function refreshOrgLimitsPanel() {
  const status = document.getElementById('orgLimitsStatus');
  const toggle = document.getElementById('orgLimitsCompareToggle');
  if (toggle) toggle.checked = !!state.orgLimitsCompareMode;
  if (!status) return;
  if (!state.leftOrgId) {
    status.textContent = t('orgLimits.selectOrg');
    return;
  }
  status.textContent = '';
}

export function setupOrgLimitsPanel() {
  const refreshBtn = document.getElementById('orgLimitsRefreshBtn');
  const toggle = document.getElementById('orgLimitsCompareToggle');
  if (refreshBtn) refreshBtn.addEventListener('click', () => void runLoad());
  if (toggle) {
    toggle.checked = !!state.orgLimitsCompareMode;
    toggle.addEventListener('change', () => {
      state.orgLimitsCompareMode = !!toggle.checked;
      applyArtifactTypeUi();
      void refreshOrgLimitsPanel();
    });
  }
}
