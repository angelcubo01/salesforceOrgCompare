import { toolingSoqlQueryPage } from './salesforceApi.js';
import { checkDeployStatus, cancelDeploy } from './metadataRetrieve.js';

const DEPLOY_FIELDS = `
  Id, Status, CheckOnly, Type, TestLevel, RunTestsEnabled, RollbackOnError,
  NumberComponentsDeployed, NumberComponentsTotal, NumberComponentErrors,
  NumberTestsCompleted, NumberTestsTotal, NumberTestErrors,
  NumberFiles, ZipSize, StartDate, CompletedDate, CreatedDate,
  CreatedById, CreatedBy.Name, ErrorMessage, ErrorStatusCode
`.replace(/\s+/g, ' ').trim();

const IN_PROGRESS_STATUS = 'InProgress';
const PENDING_STATUS = 'Pending';
const ACTIVE_STATUSES = [PENDING_STATUS, IN_PROGRESS_STATUS];
const FAILED_STATUSES = ['Failed'];
const SUCCEEDED_STATUSES = ['Succeeded'];

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {Record<string, unknown>} rec
 */
export function normalizeDeployRow(rec) {
  const createdBy = /** @type {{ Name?: string } | undefined} */ (rec.CreatedBy);
  return {
    asyncId: String(rec.Id || ''),
    status: String(rec.Status || ''),
    checkOnly: !!rec.CheckOnly,
    type: String(rec.Type || 'API'),
    testLevel: rec.TestLevel != null ? String(rec.TestLevel) : '',
    runTestsEnabled: !!rec.RunTestsEnabled,
    rollbackOnError: rec.RollbackOnError !== false,
    componentsDeployed: toNum(rec.NumberComponentsDeployed),
    componentsTotal: toNum(rec.NumberComponentsTotal),
    componentErrors: toNum(rec.NumberComponentErrors),
    testsCompleted: toNum(rec.NumberTestsCompleted),
    testsTotal: toNum(rec.NumberTestsTotal),
    testErrors: toNum(rec.NumberTestErrors),
    numberFiles: toNum(rec.NumberFiles),
    zipSize: toNum(rec.ZipSize),
    startDate: rec.StartDate || null,
    completedDate: rec.CompletedDate || null,
    createdDate: rec.CreatedDate || null,
    createdById: rec.CreatedById || null,
    createdByName: createdBy?.Name ? String(createdBy.Name) : '',
    errorMessage: rec.ErrorMessage ? String(rec.ErrorMessage) : '',
    errorStatusCode: rec.ErrorStatusCode ? String(rec.ErrorStatusCode) : ''
  };
}

export function isDeployInProgress(status) {
  const s = String(status || '');
  return ACTIVE_STATUSES.includes(s);
}

/**
 * Setup usa checkDeployStatus para saber si un deploy ya arrancó (aunque DeployRequest siga en Pending).
 * @param {Record<string, unknown> | null | undefined} soap
 */
export function isSoapActivelyRunning(soap) {
  if (!soap || soap.done) return false;
  const status = String(soap.status || '')
    .trim()
    .toLowerCase();
  if (status === 'inprogress' || status === 'in progress') return true;
  if (toNum(soap.numberComponentsTotal) > 0) return true;
  if (toNum(soap.numberComponentsDeployed) > 0) return true;
  if (toNum(soap.numberTestsTotal) > 0) return true;
  if (toNum(soap.numberTestsCompleted) > 0) return true;
  if (Array.isArray(soap.componentSuccesses) && soap.componentSuccesses.length > 0) return true;
  if (Array.isArray(soap.componentFailures) && soap.componentFailures.length > 0) return true;
  return false;
}

/**
 * Deploy realmente en ejecución (no solo encolado en Pending sin arrancar).
 * @param {ReturnType<typeof normalizeDeployRow> | null | undefined} row
 * @param {Record<string, unknown> | null | undefined} soap
 */
export function isDeployActivelyRunning(row, soap) {
  if (isSoapActivelyRunning(soap)) return true;
  return String(row?.status || '') === IN_PROGRESS_STATUS;
}

function deployProgressScore(entry) {
  const soap = entry?.soap;
  if (!soap) return 0;
  return (
    toNum(soap.numberComponentsDeployed) * 1000 +
    toNum(soap.numberTestsCompleted) * 10 +
    toNum(soap.numberComponentsTotal)
  );
}

/**
 * Separa el deploy en ejecución de la cola, como Setup → Deployment Status.
 * @param {Array<{ row: ReturnType<typeof normalizeDeployRow>, soap: Record<string, unknown> | null }>} entries
 */
export function resolveActiveAndPendingDeploys(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const incomplete = list.filter(({ soap, row }) => {
    if (soap) return !soap.done;
    return isDeployInProgress(row?.status);
  });

  const running = incomplete.filter(({ soap }) => isSoapActivelyRunning(soap));
  let active = null;

  if (running.length === 1) {
    active = running[0];
  } else if (running.length > 1) {
    active = [...running].sort((a, b) => deployProgressScore(b) - deployProgressScore(a))[0];
  } else {
    const inProgressRow = incomplete.find(({ row }) => row?.status === IN_PROGRESS_STATUS);
    if (inProgressRow) {
      active = inProgressRow;
    }
  }

  const activeId = String(active?.row?.asyncId || '');
  const pending = list.filter(({ row, soap }) => {
    const id = String(row?.asyncId || '');
    if (!id || id === activeId) return false;
    if (soap?.done) return false;
    if (soap) return !isSoapActivelyRunning(soap);
    return row?.status === PENDING_STATUS;
  });

  return { active, pending };
}

/**
 * Enriquece la fila Tooling con progreso/fechas del SOAP (más fiable que DeployRequest en cola).
 * @param {ReturnType<typeof normalizeDeployRow>} row
 * @param {Record<string, unknown> | null | undefined} soap
 */
export function enrichActiveRowFromSoap(row, soap) {
  if (!row) return row;
  const next = { ...row };
  if (soap) {
    if (!next.startDate && soap.startDate) next.startDate = soap.startDate;
    if (!next.startDate && soap.createdDate) next.startDate = soap.createdDate;
    if (toNum(soap.numberComponentsTotal) > 0) next.componentsTotal = toNum(soap.numberComponentsTotal);
    if (toNum(soap.numberComponentsDeployed) > 0 || toNum(soap.numberComponentsTotal) > 0) {
      next.componentsDeployed = toNum(soap.numberComponentsDeployed);
    }
    if (toNum(soap.numberTestsTotal) > 0) next.testsTotal = toNum(soap.numberTestsTotal);
    if (toNum(soap.numberTestsCompleted) > 0 || toNum(soap.numberTestsTotal) > 0) {
      next.testsCompleted = toNum(soap.numberTestsCompleted);
    }
    if (soap.status && isSoapActivelyRunning(soap)) next.status = IN_PROGRESS_STATUS;
  }
  if (!next.startDate && next.createdDate) next.startDate = next.createdDate;
  return next;
}

function statusInList(statuses) {
  return statuses.map((s) => `'${s}'`).join(', ');
}

async function queryDeployPage(instanceUrl, sid, apiVersion, whereClause, limit, offset, orderBy = 'StartDate DESC') {
  const soql =
    `SELECT ${DEPLOY_FIELDS} FROM DeployRequest` +
    ` WHERE ${whereClause}` +
    ` ORDER BY ${orderBy}` +
    ` LIMIT ${limit} OFFSET ${offset}`;
  return toolingSoqlQueryPage(instanceUrl, sid, apiVersion, soql);
}

async function countDeploys(instanceUrl, sid, apiVersion, whereClause) {
  const soql = `SELECT COUNT() FROM DeployRequest WHERE ${whereClause}`;
  const page = await toolingSoqlQueryPage(instanceUrl, sid, apiVersion, soql);
  return typeof page.totalSize === 'number' ? page.totalSize : (page.records?.length || 0);
}

/**
 * Consulta cola + SOAP para distinguir ejecución real vs encolado (como Setup).
 */
export async function fetchActiveDeployQueueState(instanceUrl, sid, apiVersion, opts = {}) {
  const limit = Math.min(50, Math.max(1, Number(opts.limit) || 20));
  const page = await queryDeployPage(
    instanceUrl,
    sid,
    apiVersion,
    `Status IN (${statusInList(ACTIVE_STATUSES)})`,
    limit,
    0,
    'CreatedDate ASC'
  );
  const rows = (page.records || []).map(normalizeDeployRow);
  const soaps = await Promise.all(
    rows.map((row) => checkDeployStatus(instanceUrl, sid, apiVersion, row.asyncId).catch(() => null))
  );
  const entries = rows.map((row, index) => ({ row, soap: soaps[index] }));
  const { active: activeEntry, pending } = resolveActiveAndPendingDeploys(entries);

  const activeRow = activeEntry?.row
    ? enrichActiveRowFromSoap(activeEntry.row, activeEntry.soap)
    : null;
  const pendingRecords = pending.map(({ row }) => row);
  const totalSize = typeof page.totalSize === 'number' ? page.totalSize : rows.length;
  const pendingTotal = Math.max(pendingRecords.length, totalSize - (activeRow ? 1 : 0));

  return {
    active: activeRow,
    activeSoap: activeEntry?.soap || null,
    pendingQueue: {
      records: pendingRecords,
      totalCount: pendingTotal
    }
  };
}

/**
 * Deploy que Salesforce está ejecutando ahora (Status = InProgress en Tooling).
 * @returns {Promise<import('./deployStatusApi.js').NormalizedDeployRow | null>}
 */
export async function fetchInProgressDeploy(instanceUrl, sid, apiVersion) {
  const state = await fetchActiveDeployQueueState(instanceUrl, sid, apiVersion, { limit: 20 });
  return state.active;
}

/** @deprecated Usa fetchInProgressDeploy; mantiene compatibilidad con llamadas antiguas. */
export async function fetchActiveDeploy(instanceUrl, sid, apiVersion) {
  return fetchInProgressDeploy(instanceUrl, sid, apiVersion);
}

/**
 * Cola de deploys pendientes (Status = Pending en Tooling, sin progreso SOAP).
 */
export async function fetchPendingDeployQueue(instanceUrl, sid, apiVersion, opts = {}) {
  const state = await fetchActiveDeployQueueState(instanceUrl, sid, apiVersion, opts);
  return state.pendingQueue;
}

/**
 * @param {{ bucket: 'pending'|'failed'|'succeeded', page?: number, pageSize?: number }} opts
 */
export async function fetchDeployHistory(instanceUrl, sid, apiVersion, opts = {}) {
  const page = Math.max(0, Number(opts.page) || 0);
  const pageSize = Math.min(50, Math.max(1, Number(opts.pageSize) || 10));
  const offset = page * pageSize;

  let whereClause;
  let orderBy = 'StartDate DESC';
  if (opts.bucket === 'pending') {
    whereClause = `Status = '${PENDING_STATUS}'`;
    orderBy = 'CreatedDate ASC';
  } else if (opts.bucket === 'failed') {
    whereClause = `Status IN (${statusInList(FAILED_STATUSES)})`;
  } else {
    whereClause = `Status IN (${statusInList(SUCCEEDED_STATUSES)})`;
  }

  const [listPage, totalCount] = await Promise.all([
    queryDeployPage(instanceUrl, sid, apiVersion, whereClause, pageSize, offset, orderBy),
    countDeploys(instanceUrl, sid, apiVersion, whereClause)
  ]);

  return {
    records: (listPage.records || []).map(normalizeDeployRow),
    totalCount,
    page,
    pageSize
  };
}

async function fetchDeployRowById(instanceUrl, sid, apiVersion, asyncId) {
  const safeId = String(asyncId || '').replace(/'/g, "\\'");
  const soql = `SELECT ${DEPLOY_FIELDS} FROM DeployRequest WHERE Id = '${safeId}' LIMIT 1`;
  const page = await toolingSoqlQueryPage(instanceUrl, sid, apiVersion, soql);
  const rec = page.records?.[0];
  return rec ? normalizeDeployRow(rec) : null;
}

/**
 * @returns {Promise<{ row: ReturnType<typeof normalizeDeployRow>, soap: Awaited<ReturnType<typeof checkDeployStatus>> } | null>}
 */
export async function fetchDeployDetail(instanceUrl, sid, apiVersion, asyncId) {
  const id = String(asyncId || '').trim();
  if (!id) return null;

  const [row, soap] = await Promise.all([
    fetchDeployRowById(instanceUrl, sid, apiVersion, id),
    checkDeployStatus(instanceUrl, sid, apiVersion, id).catch(() => null)
  ]);

  if (!row && !soap) return null;

  return {
    row: row || {
      asyncId: id,
      status: soap?.status || 'Unknown',
      checkOnly: false,
      type: 'API',
      testLevel: '',
      runTestsEnabled: false,
      rollbackOnError: true,
      componentsDeployed: soap?.numberComponentsDeployed || 0,
      componentsTotal: soap?.numberComponentsTotal || 0,
      componentErrors: soap?.numberComponentErrors || 0,
      testsCompleted: soap?.numberTestsCompleted || 0,
      testsTotal: soap?.numberTestsTotal || 0,
      testErrors: soap?.numberTestErrors || 0,
      numberFiles: 0,
      zipSize: 0,
      startDate: null,
      completedDate: null,
      createdDate: null,
      createdById: null,
      createdByName: '',
      errorMessage: soap?.errorMessage || '',
      errorStatusCode: ''
    },
    soap: soap || {
      done: true,
      success: row?.status === 'Succeeded',
      status: row?.status || 'Unknown',
      errorMessage: row?.errorMessage || '',
      numberComponentsDeployed: row?.componentsDeployed || 0,
      numberComponentsTotal: row?.componentsTotal || 0,
      numberComponentErrors: row?.componentErrors || 0,
      numberTestsCompleted: row?.testsCompleted || 0,
      numberTestsTotal: row?.testsTotal || 0,
      numberTestErrors: row?.testErrors || 0,
      componentFailures: [],
      componentSuccesses: [],
      runTestResult: null
    }
  };
}

/**
 * Poll completo para el panel: activo, historial paginado y detalle opcional.
 */
export async function pollDeployStatus(instanceUrl, sid, apiVersion, opts = {}) {
  const failedPage = Math.max(0, Number(opts.failedPage) || 0);
  const succeededPage = Math.max(0, Number(opts.succeededPage) || 0);
  const pageSize = Math.min(50, Math.max(1, Number(opts.pageSize) || 10));
  const selectedAsyncId = opts.selectedAsyncId ? String(opts.selectedAsyncId) : '';
  const fetchDetail = !!opts.fetchDetail && !!selectedAsyncId;
  const skipCoverageHintIds = new Set(
    (Array.isArray(opts.knownCoverageHintIds) ? opts.knownCoverageHintIds : []).map(String)
  );

  const [queueState, failedHistory, succeededHistory] = await Promise.all([
    fetchActiveDeployQueueState(instanceUrl, sid, apiVersion, { limit: 20 }),
    fetchDeployHistory(instanceUrl, sid, apiVersion, { bucket: 'failed', page: failedPage, pageSize }),
    fetchDeployHistory(instanceUrl, sid, apiVersion, { bucket: 'succeeded', page: succeededPage, pageSize })
  ]);

  let active = queueState.active;
  let activeSoap = queueState.activeSoap;
  const pendingQueue = queueState.pendingQueue;

  const detail = fetchDetail
    ? await fetchDeployDetail(instanceUrl, sid, apiVersion, selectedAsyncId)
    : null;

  const activeId = active?.asyncId ? String(active.asyncId) : '';
  if (activeId) {
    if (detail?.row?.asyncId === activeId && detail?.soap) {
      activeSoap = detail.soap;
    } else if (!activeSoap) {
      activeSoap = await checkDeployStatus(instanceUrl, sid, apiVersion, activeId).catch(() => null);
    }
    active = enrichActiveRowFromSoap(active, activeSoap);
  }

  const failedCoverageHints = await resolveFailedHistoryCoverageHints(
    instanceUrl,
    sid,
    apiVersion,
    failedHistory?.records,
    skipCoverageHintIds
  );

  return {
    active,
    activeSoap,
    pendingQueue,
    /** @deprecated Usa pendingQueue */
    pendingHistory: pendingQueue,
    failedHistory,
    succeededHistory,
    failedCoverageHints,
    detail,
    selectedAsyncId: fetchDetail ? selectedAsyncId : ''
  };
}

export async function cancelDeployRequest(instanceUrl, sid, apiVersion, asyncId) {
  return cancelDeploy(instanceUrl, sid, apiVersion, asyncId);
}

/** Umbral alineado con Setup → Deployment Status (tests ≥ 10 s). */
export const DEPLOY_SLOW_TEST_THRESHOLD_MS = 10000;

/**
 * Test en ejecución durante el deploy (DeployResult.stateDetail del SOAP).
 * @param {Record<string, unknown> | null | undefined} soap
 */
export function resolveDeployRunningTest(soap) {
  if (!soap || soap.done) return '';
  const detail = String(soap.stateDetail || '').trim();
  if (!detail) return '';
  const m = detail.match(/^Running Test:\s*(.+)$/i);
  return m ? m[1].trim() : detail;
}

/**
 * @param {{ failures?: Array<{ className?: string, methodName?: string, time?: string }>, successes?: Array<{ className?: string, methodName?: string, time?: string }> } | null | undefined} runTestResult
 */
export function collectSlowTests(runTestResult) {
  if (!runTestResult) return [];
  const items = [];
  const seen = new Set();
  const add = (row) => {
    const className = String(row?.className || '').trim();
    const methodName = String(row?.methodName || '').trim();
    const ms = Number(row?.time);
    if (!Number.isFinite(ms) || ms < DEPLOY_SLOW_TEST_THRESHOLD_MS) return;
    const key = `${className}::${methodName}::${ms}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ className, methodName, timeMs: ms });
  };
  for (const f of runTestResult.failures || []) add(f);
  for (const s of runTestResult.successes || []) add(s);
  items.sort((a, b) => b.timeMs - a.timeMs);
  return items;
}

function messageIndicatesCoverageFailure(message, statusCode = '') {
  const msg = String(message || '').toLowerCase();
  const code = String(statusCode || '').toLowerCase();
  return (
    msg.includes('coverage') ||
    msg.includes('cobertura') ||
    code.includes('coverage') ||
    code.includes('cobertura')
  );
}

/**
 * @param {Record<string, unknown> | null | undefined} row
 */
export function hasCoverageFailureInRow(row) {
  if (String(row?.status || '') !== 'Failed') return false;
  return messageIndicatesCoverageFailure(row?.errorMessage, row?.errorStatusCode);
}

/**
 * @param {Record<string, unknown> | null | undefined} soap
 */
export function hasCoverageFailureInSoap(soap) {
  if (!soap) return false;
  const warnings = soap.runTestResult?.codeCoverageWarnings;
  if (Array.isArray(warnings) && warnings.length > 0) return true;
  return messageIndicatesCoverageFailure(soap.errorMessage, soap.errorStatusCode);
}

/**
 * Detecta fallos de cobertura en el historial fallido (página actual) vía checkDeployStatus.
 * @param {Array<Record<string, unknown>>} records
 * @param {Set<string>} [skipAsyncIds] IDs ya resueltos en cliente
 * @returns {Promise<Record<string, { coverageWarningCount: number }>>}
 */
export async function resolveFailedHistoryCoverageHints(
  instanceUrl,
  sid,
  apiVersion,
  records,
  skipAsyncIds = new Set()
) {
  /** @type {Record<string, { coverageWarningCount: number }>} */
  const hints = {};

  /** @type {Array<Record<string, unknown>>} */
  const needsSoap = [];

  for (const row of records || []) {
    const id = String(row?.asyncId || '').trim();
    if (!id || String(row?.status || '') !== 'Failed') continue;
    if (skipAsyncIds.has(id)) continue;

    if (hasCoverageFailureInRow(row)) {
      hints[id] = { coverageWarningCount: 1 };
      continue;
    }

    if (toNum(row?.componentErrors) > 0 || toNum(row?.testErrors) > 0) continue;
    needsSoap.push(row);
  }

  await Promise.all(
    needsSoap.map(async (row) => {
      const id = String(row.asyncId);
      try {
        const soap = await checkDeployStatus(instanceUrl, sid, apiVersion, id);
        if (!hasCoverageFailureInSoap(soap)) return;
        const count = soap?.runTestResult?.codeCoverageWarnings?.length || 0;
        hints[id] = { coverageWarningCount: count || 1 };
      } catch {
        /* fila individual: no bloquear el resto */
      }
    })
  );

  return hints;
}

export function buildSetupDeployDetailsUrl(instanceUrl, asyncId) {
  const base = String(instanceUrl || '').replace(/\/$/, '');
  const address = encodeURIComponent(
    `/changemgmt/monitorDeploymentsDetails.apexp?asyncId=${encodeURIComponent(asyncId)}`
  );
  return `${base}/lightning/setup/DeployStatus/page?address=${address}`;
}
