function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function mergeApexCoverageJsonField(raw, coveredSet, uncoveredSet) {
  let c = raw;
  if (c == null) return;
  if (typeof c === 'string') {
    try {
      c = JSON.parse(c);
    } catch {
      return;
    }
  }
  if (typeof c !== 'object' || c === null) return;
  const cov = c.coveredLines ?? c.CoveredLines;
  const unc = c.uncoveredLines ?? c.UncoveredLines;
  if (Array.isArray(cov)) {
    for (const n of cov) {
      const x = Number(n);
      if (Number.isFinite(x) && x >= 1) coveredSet.add(x);
    }
  }
  if (Array.isArray(unc)) {
    for (const n of unc) {
      const x = Number(n);
      if (Number.isFinite(x) && x >= 1) uncoveredSet.add(x);
    }
  }
}

export function formatDeployCoveragePercent(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

/**
 * @param {Record<string, unknown> | null | undefined} soap
 * @param {Record<string, unknown> | null | undefined} [row]
 */
export function deployHasRunnableTests(soap, row) {
  const testsTotal = toNum(soap?.numberTestsTotal ?? row?.testsTotal);
  const testsRun = toNum(soap?.runTestResult?.numTestsRun);
  const runTests = !!row?.runTestsEnabled || testsTotal > 0;
  return runTests && (testsRun > 0 || testsTotal > 0);
}

/**
 * @param {Record<string, unknown> | null | undefined} soap
 */
export function deployHasCodeCoverage(soap) {
  const cc = soap?.runTestResult?.codeCoverage;
  return Array.isArray(cc) && cc.length > 0;
}

/**
 * @param {Record<string, unknown> | null | undefined} soap
 * @param {Record<string, unknown> | null | undefined} [row]
 */
export function canShowDeployCoverage(soap, row) {
  if (!soap) return false;
  if (deployHasCodeCoverage(soap)) return true;
  if (!deployHasRunnableTests(soap, row)) return false;
  const done = soap.done || ['Succeeded', 'Failed', 'Canceled'].includes(String(row?.status || soap.status || ''));
  return !!done;
}

/**
 * @param {Array<Record<string, unknown>> | null | undefined} codeCoverage
 * @param {number} [minPercent]
 */
export function buildDeployCoverageRows(codeCoverage, minPercent = 0) {
  const thresh = Math.min(1, Math.max(0, Number(minPercent) / 100));
  const rows = [];
  for (const cc of codeCoverage || []) {
    const total = toNum(cc.numLocations);
    if (total <= 0) continue;
    const notCovered = toNum(cc.numLocationsNotCovered);
    const covered = Math.max(0, total - notCovered);
    const percent = covered / total;
    if (percent + 1e-9 < thresh) continue;
    rows.push({
      id: String(cc.id || ''),
      name: String(cc.name || cc.id || ''),
      type: String(cc.type || 'Class'),
      percent,
      covered,
      total,
      uncoveredLines: Array.isArray(cc.uncoveredLines) ? cc.uncoveredLines : []
    });
  }
  rows.sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
  return rows;
}

/**
 * Infiere líneas cubiertas a partir del código fuente y las no cubiertas del SOAP.
 * Usado cuando Tooling no devuelve coveredLines pero sí tenemos uncoveredLines del deploy.
 * @param {string} body
 * @param {unknown[]} uncoveredLines
 */
export function inferCoveredLinesFromSource(body, uncoveredLines) {
  const uncovered = new Set(normalizeDeployLineNumbers(uncoveredLines));
  const covered = [];
  const lines = String(body || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1;
    if (uncovered.has(ln)) continue;
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    if (/^\s*(\/\/|\/\*|\*)/.test(lines[i])) continue;
    if (/^\s*\*\//.test(trimmed)) continue;
    covered.push(ln);
  }
  return covered;
}

function normalizeDeployLineNumbers(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 1);
}

/**
 * @param {Record<string, unknown> | null | undefined} runTestResult
 */
export function collectDeployTestClassIds(runTestResult) {
  if (!runTestResult) return [];
  const ids = new Set();
  const add = (row) => {
    const id = String(row?.id || '').trim();
    if (id) ids.add(id);
  };
  for (const s of runTestResult.successes || []) add(s);
  for (const f of runTestResult.failures || []) add(f);
  return [...ids];
}
