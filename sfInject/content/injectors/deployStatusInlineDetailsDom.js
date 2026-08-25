/** Utilidades puras/DOM de Deployment Status. No usa etiquetas traducibles. */

export const INTEGRATION_ID = 'deployStatusInlineDetails';
export const FAILED_TABLE_SELECTOR = 'table[id$=":FailedDeploymentsList"]';
export const SUCCEEDED_TABLE_SELECTOR = 'table[id$=":SucceededDeploymentsList"]';
export const FAILED_TBODY_SELECTOR = 'tbody[id$=":FailedDeploymentsList:tb"]';
const ASYNC_ID_RE = /\b(0Af[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?)\b/;

/** @param {unknown} value */
export function normalizeDeployAsyncId(value) {
  const match = String(value || '').match(ASYNC_ID_RE);
  return match ? match[1] : null;
}

/** @param {Element} row */
export function extractDeployAsyncIdFromRow(row) {
  if (!row) return null;
  const cell = row.querySelector('td[id$=":name"]');
  const fromCell = normalizeDeployAsyncId(cell?.textContent || '');
  if (fromCell) return fromCell;
  for (const link of row.querySelectorAll('a[href]')) {
    const fromHref = normalizeDeployAsyncId(link.getAttribute('href') || '');
    if (fromHref) return fromHref;
  }
  return null;
}

/** @param {Document} doc */
export function findFailedDeploymentsTable(doc) {
  return doc?.querySelector(FAILED_TABLE_SELECTOR) || null;
}

/** @param {Document} doc */
export function findFailedDeploymentRows(doc) {
  const table = findFailedDeploymentsTable(doc);
  if (!table) return [];
  const tbody = table.querySelector(FAILED_TBODY_SELECTOR) || table.tBodies?.[0];
  if (!tbody) return [];
  return [...tbody.querySelectorAll(':scope > tr.dataRow')];
}

/** @param {Document} doc */
export function isDeployStatusTableDocument(doc) {
  return !!findFailedDeploymentsTable(doc);
}

/** @param {Element} row */
export function findDeployActionCell(row) {
  return row?.querySelector('td.actionColumn') || null;
}

/** @param {Element} row */
export function deployRowColspan(row) {
  return Math.max(1, row?.querySelectorAll(':scope > td, :scope > th').length || 1);
}

/** @param {unknown} value */
export function normalizeComponentType(value) {
  return String(value || '').replace(/[\s_\-]/g, '').toLowerCase();
}

/** @param {unknown} value */
export function isApexClassComponent(value) {
  return normalizeComponentType(value) === 'apexclass';
}

/** @param {unknown} stackTrace */
export function extractApexClassAndLineFromStackTrace(stackTrace) {
  const text = String(stackTrace || '');
  // Formatos habituales: Class.Namespace.Class.method: line 42, column 7
  const match = /Class\.([A-Za-z_][A-Za-z0-9_]*)\.[A-Za-z_][A-Za-z0-9_]*:\s*line\s+(\d+)/i.exec(text);
  if (!match) return { className: '', initialLine: undefined };
  const initialLine = Number(match[2]);
  return { className: match[1], initialLine: Number.isSafeInteger(initialLine) && initialLine > 0 ? initialLine : undefined };
}

/** @param {unknown} value */
function asRows(value) {
  return Array.isArray(value) ? value : [];
}

/** Construye un modelo seguro para el renderer a partir de checkDeployStatus. */
export function buildDeployDetailModel(detail) {
  const soap = detail?.soap || detail || {};
  const componentFailures = asRows(soap.componentFailures).map((item) => ({
    fullName: String(item?.fullName || ''),
    componentType: String(item?.componentType || ''),
    lineNumber: Number.isFinite(Number(item?.lineNumber)) ? Number(item.lineNumber) : null,
    columnNumber: Number.isFinite(Number(item?.columnNumber)) ? Number(item.columnNumber) : null,
    problem: String(item?.problem || ''),
    problemType: String(item?.problemType || ''),
    fileName: String(item?.fileName || '')
  }));
  const testFailures = asRows(soap.runTestResult?.failures).map((item) => ({
    className: String(item?.className || ''),
    methodName: String(item?.methodName || ''),
    message: String(item?.message || ''),
    stackTrace: String(item?.stackTrace || ''),
    time: String(item?.time || '')
  }));
  return {
    componentFailures,
    testFailures,
    errorMessage: String(soap.errorMessage || detail?.row?.errorMessage || ''),
    coverageWarnings: asRows(soap.runTestResult?.codeCoverageWarnings).map((item) => String(item?.message || item || '')).filter(Boolean)
  };
}
