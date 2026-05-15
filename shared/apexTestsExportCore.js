/**
 * Exportación de resultados Apex Tests (CSV / JSON).
 */

/** @param {unknown} row */
export function apexTestResultRowFromSf(row) {
  const ac = row && row.ApexClass;
  const className = ac && typeof ac === 'object' && ac.Name != null ? String(ac.Name) : '';
  const methodName = row?.MethodName != null ? String(row.MethodName).trim() : '';
  const outcome = row?.Outcome != null ? String(row.Outcome).trim() : '';
  const message = row?.Message != null ? String(row.Message).trim() : '';
  const stackTrace = row?.StackTrace != null ? String(row.StackTrace).trim() : '';
  return { className, methodName, outcome, message, stackTrace };
}

/**
 * @param {string} className
 * @param {string} methodName
 */
export function apexTestResultKey(className, methodName) {
  return `${className}::${methodName}`;
}

/**
 * @param {unknown[]} methods
 * @param {unknown[]} failures
 */
export function mergeApexTestRowsWithFailures(methods, failures) {
  const stackByKey = new Map();
  for (const f of failures || []) {
    const r = apexTestResultRowFromSf(f);
    if (!r.stackTrace) continue;
    stackByKey.set(apexTestResultKey(r.className, r.methodName), r.stackTrace);
  }
  return (methods || []).map((m) => {
    const r = apexTestResultRowFromSf(m);
    if (!r.stackTrace) {
      const st = stackByKey.get(apexTestResultKey(r.className, r.methodName));
      if (st) r.stackTrace = st;
    }
    return r;
  });
}

/**
 * @param {{
 *   orgId: string,
 *   jobId: string,
 *   envLabel?: string,
 *   status?: string,
 *   startedAt?: string | number | null,
 *   summary?: string
 * }} meta
 * @param {ReturnType<typeof apexTestResultRowFromSf>[]} tests
 */
export function buildApexTestsExportDocument(meta, tests) {
  return {
    exportedAt: new Date().toISOString(),
    orgId: meta.orgId,
    jobId: meta.jobId,
    envLabel: meta.envLabel ?? '',
    status: meta.status ?? '',
    startedAt: meta.startedAt ?? null,
    summary: meta.summary ?? '',
    tests
  };
}

/** @param {string} value */
function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const CSV_HEADERS = ['className', 'methodName', 'outcome', 'message', 'stackTrace'];

/**
 * @param {ReturnType<typeof buildApexTestsExportDocument>} doc
 */
export function apexTestsExportToCsv(doc) {
  const lines = [CSV_HEADERS.join(',')];
  for (const row of doc.tests || []) {
    lines.push(
      CSV_HEADERS.map((h) => csvEscape(row[h] ?? '')).join(',')
    );
  }
  return `${lines.join('\n')}\n`;
}

/**
 * @param {ReturnType<typeof buildApexTestsExportDocument>} doc
 */
export function apexTestsExportToJson(doc) {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** @param {string} base */
export function sanitizeApexTestsExportBaseName(base) {
  return String(base || 'apex-tests')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}
