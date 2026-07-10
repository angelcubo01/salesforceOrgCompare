import { restRequestWithSid } from './salesforceApi.js';
import { formatMetadataApiVersion } from './metadataApiVersion.js';

/** @typedef {'bulk2-ingest' | 'bulk2-query' | 'bulk1'} BulkApiKind */

const BULK1_VERSION_FALLBACKS = ['66.0', '65.0', '64.0', '59.0', '51.0'];

/**
 * Normaliza la versión de API de la org (p. ej. "v67.0", "67" → "67.0").
 * @param {string} apiVersion
 */
export function normalizeBulkApiVersion(apiVersion) {
  return formatMetadataApiVersion(apiVersion, '59.0');
}

/**
 * @param {Record<string, unknown>} job
 */
export function normalizeBulkJob(job) {
  return {
    id: String(job?.id || ''),
    state: String(job?.state || ''),
    operation: String(job?.operation || ''),
    object: String(job?.object || ''),
    jobType: job?.jobType != null ? String(job.jobType) : '',
    createdDate: job?.createdDate || null,
    systemModstamp: job?.systemModstamp || job?.systemModstamp || null,
    numberRecordsProcessed: Number(job?.numberRecordsProcessed) || 0,
    numberRecordsFailed: Number(job?.numberRecordsFailed) || 0,
    totalProcessingTime: Number(job?.totalProcessingTime) || 0,
    apiActiveProcessingTime: Number(job?.apiActiveProcessingTime) || 0,
    apexProcessingTime: Number(job?.apexProcessingTime) || 0
  };
}

/**
 * @param {Record<string, unknown>} batch
 */
export function normalizeBulkBatch(batch) {
  return {
    id: String(batch?.id || ''),
    state: String(batch?.state || ''),
    jobId: String(batch?.jobId || ''),
    resultKind: batch?.resultKind != null ? String(batch.resultKind) : '',
    numberRecordsProcessed: Number(batch?.numberRecordsProcessed) || 0,
    numberRecordsFailed: Number(batch?.numberRecordsFailed) || 0,
    totalProcessingTime: Number(batch?.totalProcessingTime) || 0
  };
}

/**
 * @param {string} apiVersion
 * @param {string} jobId
 * @param {string} [suffix]
 */
export function buildBulkJobPath(apiVersion, jobId, suffix = '') {
  const ver = normalizeBulkApiVersion(apiVersion);
  const id = encodeURIComponent(String(jobId || '').trim());
  const tail = suffix ? `/${suffix.replace(/^\//, '')}` : '';
  // Bulk API 1.0: /services/async/67.0/job/… (sin prefijo "v" en el segmento de versión)
  return `/services/async/${ver}/job/${id}${tail}`;
}

/**
 * @param {'ingest' | 'query'} kind
 * @param {string} apiVersion
 * @param {string} jobId
 * @param {string} [suffix]
 */
export function buildBulk2JobPath(kind, apiVersion, jobId, suffix = '') {
  const ver = normalizeBulkApiVersion(apiVersion);
  const id = encodeURIComponent(String(jobId || '').trim());
  const tail = suffix ? `/${suffix.replace(/^\//, '')}` : '';
  return `/services/data/v${ver}/jobs/${kind}/${id}${tail}`;
}

/**
 * @param {BulkApiKind} bulkApiKind
 */
export function buildBulk2ResultRows(bulkApiKind) {
  if (bulkApiKind === 'bulk2-query') {
    return [
      normalizeBulkBatch({
        id: 'results',
        state: 'result',
        resultKind: 'queryResults'
      })
    ];
  }
  if (bulkApiKind === 'bulk2-ingest') {
    return ['successfulResults', 'failedResults', 'unprocessedrecords'].map((kind) =>
      normalizeBulkBatch({
        id: kind,
        state: 'result',
        resultKind: kind
      })
    );
  }
  return [];
}

/**
 * @param {{ status?: number, text?: string, json?: unknown }} res
 */
export function isBulk1UnknownVersionError(res) {
  const text = String(res?.text || '');
  if (res?.status !== 400) return false;
  return (
    text.includes('unknown version') ||
    text.includes('InvalidUrl') ||
    text.includes('InvalidVersion')
  );
}

/**
 * @param {string} preferredVersion
 */
export function bulk1VersionsToTry(preferredVersion) {
  const primary = normalizeBulkApiVersion(preferredVersion);
  const ordered = [primary, ...BULK1_VERSION_FALLBACKS.filter((v) => v !== primary)];
  return [...new Set(ordered)];
}

/**
 * @param {{ status?: number, text?: string, json?: unknown }} res
 */
function parseBulk1JobPayload(res) {
  if (res.json && typeof res.json === 'object' && !Array.isArray(res.json)) {
    return /** @type {Record<string, unknown>} */ (res.json);
  }
  const text = String(res.text || '');
  const fields = ['id', 'state', 'operation', 'object', 'createdDate', 'systemModstamp'];
  /** @type {Record<string, unknown>} */
  const job = {};
  for (const field of fields) {
    const match = text.match(new RegExp(`<${field}>([^<]*)</${field}>`, 'i'));
    if (match) job[field] = match[1];
  }
  const numFields = ['numberRecordsProcessed', 'numberRecordsFailed', 'totalProcessingTime'];
  for (const field of numFields) {
    const match = text.match(new RegExp(`<${field}>([^<]*)</${field}>`, 'i'));
    if (match) job[field] = Number(match[1]) || 0;
  }
  return job;
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {string} jobId
 * @returns {Promise<{ job: ReturnType<typeof normalizeBulkJob>, bulkApiKind: BulkApiKind, apiVersion: string }>}
 */
export async function fetchBulkJob(instanceUrl, sid, apiVersion, jobId) {
  const ver = normalizeBulkApiVersion(apiVersion);
  const id = String(jobId || '').trim();
  if (!id) throw new Error('Bulk job id required');

  let res = await restRequestWithSid(
    instanceUrl,
    sid,
    'GET',
    buildBulk2JobPath('ingest', ver, id)
  );
  if (res.ok && res.json && typeof res.json === 'object' && !Array.isArray(res.json)) {
    return {
      job: normalizeBulkJob(/** @type {Record<string, unknown>} */ (res.json)),
      bulkApiKind: 'bulk2-ingest',
      apiVersion: ver
    };
  }

  res = await restRequestWithSid(instanceUrl, sid, 'GET', buildBulk2JobPath('query', ver, id));
  if (res.ok && res.json && typeof res.json === 'object' && !Array.isArray(res.json)) {
    return {
      job: normalizeBulkJob(/** @type {Record<string, unknown>} */ (res.json)),
      bulkApiKind: 'bulk2-query',
      apiVersion: ver
    };
  }

  let lastRes = res;
  for (const bulk1Ver of bulk1VersionsToTry(ver)) {
    const path = buildBulkJobPath(bulk1Ver, id);
    const bulk1Res = await restRequestWithSid(instanceUrl, sid, 'GET', path);
    if (bulk1Res.ok) {
      return {
        job: normalizeBulkJob(parseBulk1JobPayload(bulk1Res)),
        bulkApiKind: 'bulk1',
        apiVersion: bulk1Ver
      };
    }
    if (isBulk1UnknownVersionError(bulk1Res)) {
      lastRes = bulk1Res;
      continue;
    }
    throw bulkError('job', bulk1Res);
  }
  throw bulkError('job', lastRes);
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {string} jobId
 * @param {BulkApiKind} bulkApiKind
 */
export async function fetchBulkJobBatches(instanceUrl, sid, apiVersion, jobId, bulkApiKind) {
  if (bulkApiKind === 'bulk2-ingest' || bulkApiKind === 'bulk2-query') {
    return buildBulk2ResultRows(bulkApiKind);
  }

  const ver = normalizeBulkApiVersion(apiVersion);
  const path = buildBulkJobPath(ver, jobId, 'batch');
  const res = await restRequestWithSid(instanceUrl, sid, 'GET', path);
  if (!res.ok) throw bulkError('batches', res);
  const list = Array.isArray(res.json) ? res.json : [];
  return list.map((b) => normalizeBulkBatch(/** @type {Record<string, unknown>} */ (b)));
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {string} jobId
 * @param {string} batchId
 * @param {BulkApiKind} [bulkApiKind]
 */
export async function fetchBulkBatchResult(
  instanceUrl,
  sid,
  apiVersion,
  jobId,
  batchId,
  bulkApiKind = 'bulk1'
) {
  const ver = normalizeBulkApiVersion(apiVersion);
  const id = String(jobId || '').trim();
  const batch = String(batchId || '').trim();
  let path = '';

  if (bulkApiKind === 'bulk2-ingest') {
    path = buildBulk2JobPath('ingest', ver, id, batch);
  } else if (bulkApiKind === 'bulk2-query') {
    path = buildBulk2JobPath('query', ver, id, 'results');
  } else {
    path = buildBulkJobPath(ver, id, `batch/${encodeURIComponent(batch)}/result`);
  }

  const res = await restRequestWithSid(instanceUrl, sid, 'GET', path);
  if (!res.ok) throw bulkError('result', res);
  return { text: res.text || '', contentType: res.headers?.['content-type'] || '' };
}

/**
 * @param {string} kind
 * @param {{ status?: number, text?: string, json?: unknown }} res
 */
function bulkError(kind, res) {
  const xmlMsg = String(res?.text || '').match(/<exceptionMessage>([^<]*)<\/exceptionMessage>/i)?.[1];
  const jsonMsg =
    Array.isArray(res?.json) && res.json[0] && typeof res.json[0] === 'object'
      ? String(/** @type {{ message?: string }} */ (res.json[0]).message || '')
      : res?.json && typeof res.json === 'object' && !Array.isArray(res.json)
        ? String(/** @type {{ message?: string }} */ (res.json).message || '')
        : '';
  const detail = xmlMsg || jsonMsg || String(res?.text || res?.status || '').trim();
  const code =
    String(res?.text || '').match(/<exceptionCode>([^<]*)<\/exceptionCode>/i)?.[1] ||
    (Array.isArray(res?.json) && res.json[0] && typeof res.json[0] === 'object'
      ? String(/** @type {{ errorCode?: string }} */ (res.json[0]).errorCode || '')
      : '');
  const suffix = [code, detail].filter(Boolean).join(' ').trim();
  return new Error(`Bulk ${kind} failed: ${res?.status || ''} ${suffix}`.trim());
}
