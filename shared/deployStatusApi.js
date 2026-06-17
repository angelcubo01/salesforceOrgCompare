import { toolingSoqlQueryPage } from './salesforceApi.js';
import { checkDeployStatus, cancelDeploy } from './metadataRetrieve.js';

const DEPLOY_FIELDS = `
  Id, Status, CheckOnly, Type, TestLevel, RunTestsEnabled, RollbackOnError,
  NumberComponentsDeployed, NumberComponentsTotal, NumberComponentErrors,
  NumberTestsCompleted, NumberTestsTotal, NumberTestErrors,
  NumberFiles, ZipSize, StartDate, CompletedDate,
  CreatedById, CreatedBy.Name, ErrorMessage, ErrorStatusCode
`.replace(/\s+/g, ' ').trim();

const ACTIVE_STATUSES = ['Pending', 'InProgress'];
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

function statusInList(statuses) {
  return statuses.map((s) => `'${s}'`).join(', ');
}

async function queryDeployPage(instanceUrl, sid, apiVersion, whereClause, limit, offset) {
  const soql =
    `SELECT ${DEPLOY_FIELDS} FROM DeployRequest` +
    ` WHERE ${whereClause}` +
    ` ORDER BY StartDate DESC` +
    ` LIMIT ${limit} OFFSET ${offset}`;
  return toolingSoqlQueryPage(instanceUrl, sid, apiVersion, soql);
}

async function countDeploys(instanceUrl, sid, apiVersion, whereClause) {
  const soql = `SELECT COUNT() FROM DeployRequest WHERE ${whereClause}`;
  const page = await toolingSoqlQueryPage(instanceUrl, sid, apiVersion, soql);
  return typeof page.totalSize === 'number' ? page.totalSize : (page.records?.length || 0);
}

/**
 * @returns {Promise<import('./deployStatusApi.js').NormalizedDeployRow | null>}
 */
export async function fetchActiveDeploy(instanceUrl, sid, apiVersion) {
  const page = await queryDeployPage(
    instanceUrl,
    sid,
    apiVersion,
    `Status IN (${statusInList(ACTIVE_STATUSES)})`,
    1,
    0
  );
  const rec = page.records?.[0];
  return rec ? normalizeDeployRow(rec) : null;
}

/**
 * @param {{ bucket: 'pending'|'failed'|'succeeded', page?: number, pageSize?: number }} opts
 */
export async function fetchDeployHistory(instanceUrl, sid, apiVersion, opts = {}) {
  const page = Math.max(0, Number(opts.page) || 0);
  const pageSize = Math.min(50, Math.max(1, Number(opts.pageSize) || 10));
  const offset = page * pageSize;

  let whereClause;
  if (opts.bucket === 'pending') {
    whereClause = `Status IN (${statusInList(ACTIVE_STATUSES)})`;
  } else if (opts.bucket === 'failed') {
    whereClause = `Status IN (${statusInList(FAILED_STATUSES)})`;
  } else {
    whereClause = `Status IN (${statusInList(SUCCEEDED_STATUSES)})`;
  }

  const [listPage, totalCount] = await Promise.all([
    queryDeployPage(instanceUrl, sid, apiVersion, whereClause, pageSize, offset),
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

  const [active, pendingHistory, failedHistory, succeededHistory] = await Promise.all([
    fetchActiveDeploy(instanceUrl, sid, apiVersion),
    fetchDeployHistory(instanceUrl, sid, apiVersion, { bucket: 'pending', page: 0, pageSize: 10 }),
    fetchDeployHistory(instanceUrl, sid, apiVersion, { bucket: 'failed', page: failedPage, pageSize }),
    fetchDeployHistory(instanceUrl, sid, apiVersion, { bucket: 'succeeded', page: succeededPage, pageSize })
  ]);

  const detail = fetchDetail
    ? await fetchDeployDetail(instanceUrl, sid, apiVersion, selectedAsyncId)
    : null;

  let activeSoap = null;
  const activeId = active?.asyncId ? String(active.asyncId) : '';
  if (activeId) {
    if (detail?.row?.asyncId === activeId && detail?.soap) {
      activeSoap = detail.soap;
    } else {
      activeSoap = await checkDeployStatus(instanceUrl, sid, apiVersion, activeId).catch(() => null);
    }
  }

  return {
    active,
    activeSoap,
    pendingHistory,
    failedHistory,
    succeededHistory,
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

export function buildSetupDeployDetailsUrl(instanceUrl, asyncId) {
  const base = String(instanceUrl || '').replace(/\/$/, '');
  const address = encodeURIComponent(
    `/changemgmt/monitorDeploymentsDetails.apexp?asyncId=${encodeURIComponent(asyncId)}`
  );
  return `${base}/lightning/setup/DeployStatus/page?address=${address}`;
}
