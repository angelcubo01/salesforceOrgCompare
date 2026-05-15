import { bg } from '../core/bridge.js';
import { t } from '../../shared/i18n.js';
import { showToast, showToastWithSpinner, dismissSpinnerToast } from './toast.js';
import {
  buildApexTestsExportDocument,
  apexTestsExportToCsv,
  apexTestsExportToJson,
  mergeApexTestRowsWithFailures,
  sanitizeApexTestsExportBaseName
} from '../../shared/apexTestsExportCore.js';

/**
 * @param {string} content
 * @param {string} mime
 * @param {string} fileName
 */
function downloadTextFile(content, mime, fileName) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * @param {string} orgId
 * @param {string} jobId
 */
async function fetchExportRows(orgId, jobId) {
  const [methodsRes, failuresRes] = await Promise.all([
    bg({ type: 'apexTests:getRunMethods', orgId, jobId }),
    bg({ type: 'apexTests:getRunFailures', orgId, jobId })
  ]);

  if (!methodsRes?.ok) {
    const err =
      methodsRes?.reason === 'NO_SID'
        ? t('toast.noSession')
        : methodsRes?.error || t('apexTests.runsLoadMethodsError');
    return { ok: false, error: err };
  }

  const methods = Array.isArray(methodsRes.methods) ? methodsRes.methods : [];
  const failures =
    failuresRes?.ok && Array.isArray(failuresRes.failures) ? failuresRes.failures : [];
  return { ok: true, rows: mergeApexTestRowsWithFailures(methods, failures) };
}

/**
 * @param {string} orgId
 * @param {string} jobId
 * @param {'csv' | 'json'} format
 * @param {{
 *   envLabel?: string,
 *   status?: string,
 *   startedAt?: string | number | null,
 *   summary?: string
 * }} meta
 */
export async function exportApexTestRun(orgId, jobId, format, meta = {}) {
  if (!orgId || !jobId) return;

  showToastWithSpinner(t('apexTests.exportInProgress'));
  try {
    const data = await fetchExportRows(orgId, jobId);
    if (!data.ok) {
      showToast(data.error, 'error');
      return;
    }

    if (!data.rows.length) {
      showToast(t('apexTests.exportNoResults'), 'warn');
      return;
    }

    const doc = buildApexTestsExportDocument(
      {
        orgId: String(orgId),
        jobId: String(jobId),
        envLabel: meta.envLabel ?? '',
        status: meta.status ?? '',
        startedAt: meta.startedAt ?? null,
        summary: meta.summary ?? ''
      },
      data.rows
    );

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const base = sanitizeApexTestsExportBaseName(meta.envLabel || jobId);

    if (format === 'json') {
      const body = apexTestsExportToJson(doc);
      downloadTextFile(body, 'application/json;charset=utf-8', `apex-tests-${base}-${stamp}.json`);
    } else {
      const body = apexTestsExportToCsv(doc);
      downloadTextFile(body, 'text/csv;charset=utf-8', `apex-tests-${base}-${stamp}.csv`);
    }

    showToast(t('apexTests.exportDone'), 'info');
  } finally {
    dismissSpinnerToast();
  }
}
