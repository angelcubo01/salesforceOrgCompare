import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { handleToolError } from '../../shared/reportToolError.js';
import { logToolUsage } from './toolUsageLog.js';

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getOrgId() {
  return document.getElementById('leftOrg')?.value || state.leftOrgId || '';
}

function setStatus(msg) {
  const el = document.getElementById('bulkJobStatus');
  if (el) el.textContent = msg || '';
}

function renderJob(job) {
  const pre = document.getElementById('bulkJobJson');
  if (pre) pre.textContent = job ? JSON.stringify(job, null, 2) : '—';
}

/** @type {{ bulkApiKind?: string, apiVersion?: string }} */
let lastBulkContext = {};

function batchLabel(batch) {
  const kind = batch?.resultKind || batch?.id || '';
  const key = `bulkJob.result.${kind}`;
  const translated = t(key);
  return translated !== key ? translated : kind;
}

function renderBatches(batches) {
  const tbody = document.getElementById('bulkJobBatchesTbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!batches?.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="bulk-job-empty">${escapeHtml(t('bulkJob.noBatches'))}</td></tr>`;
    return;
  }
  for (const b of batches) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="bulk-job-mono">${escapeHtml(batchLabel(b))}</td>
      <td>${escapeHtml(b.state)}</td>
      <td>${escapeHtml(String(b.numberRecordsProcessed))}</td>
      <td><button type="button" class="query-explorer-secondary-btn" data-batch-result="${escapeHtml(b.id)}">${escapeHtml(t('bulkJob.downloadResult'))}</button></td>`;
    tbody.appendChild(tr);
  }
}

async function loadJob() {
  const orgId = getOrgId();
  const jobId = document.getElementById('bulkJobIdInput')?.value?.trim() || '';
  if (!orgId) {
    showToast(t('bulkJob.pickOrg'), 'warn');
    return;
  }
  if (!jobId) {
    showToast(t('bulkJob.jobIdRequired'), 'warn');
    return;
  }
  showToastWithSpinner(t('bulkJob.loading'));
  setStatus(t('bulkJob.loading'));
  try {
    const res = await bg({ type: 'bulkJob:getJob', orgId, jobId });
    if (!res?.ok) {
      if (res?.reason === 'NO_SID') throw new Error(t('bulkJob.noSid'));
      throw new Error(res?.error || t('bulkJob.loadFailed'));
    }
    renderJob(res.job);
    renderBatches(res.batches || []);
    lastBulkContext = {
      bulkApiKind: res.bulkApiKind || 'bulk1',
      apiVersion: res.apiVersion || ''
    };
    setStatus(t('bulkJob.loaded', { state: res.job?.state || '' }));
    void logToolUsage('BulkJobMonitor', 'load', { ok: true });
  } catch (e) {
    renderJob(null);
    renderBatches([]);
    void handleToolError(e, { artifact_type: 'BulkJobMonitor', phase: 'load' });
    void logToolUsage('BulkJobMonitor', 'load', { ok: false });
    showToast(String(e?.message || e), 'error');
  } finally {
    dismissSpinnerToast();
  }
}

async function downloadBatchResult(batchId) {
  const orgId = getOrgId();
  const jobId = document.getElementById('bulkJobIdInput')?.value?.trim() || '';
  if (!orgId || !jobId || !batchId) return;
  showToastWithSpinner(t('bulkJob.downloading'));
  try {
    const res = await bg({
      type: 'bulkJob:getBatchResult',
      orgId,
      jobId,
      batchId,
      bulkApiKind: lastBulkContext.bulkApiKind,
      apiVersion: lastBulkContext.apiVersion
    });
    if (!res?.ok) throw new Error(res?.error || t('bulkJob.downloadFailed'));
    const blob = new Blob([res.text || ''], { type: res.contentType || 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk_${jobId}_${batchId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(t('bulkJob.downloaded'), 'success');
  } catch (e) {
    showToast(String(e?.message || e), 'error');
  } finally {
    dismissSpinnerToast();
  }
}

export function setupBulkJobMonitorPanel() {
  document.getElementById('bulkJobLoadBtn')?.addEventListener('click', () => void loadJob());
  document.getElementById('bulkJobPanel')?.addEventListener('click', (ev) => {
    const btn = /** @type {HTMLElement} */ (ev.target).closest('[data-batch-result]');
    if (!btn) return;
    void downloadBatchResult(btn.getAttribute('data-batch-result') || '');
  });
}

export async function refreshBulkJobMonitorPanel() {
  if (getSelectedArtifactType() !== 'BulkJobMonitor') return;
  lastBulkContext = {};
  renderJob(null);
  renderBatches([]);
  setStatus('');
}
