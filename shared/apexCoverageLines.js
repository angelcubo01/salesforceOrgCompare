import { toolingQueryAll } from './salesforceApi.js';
import {
  collectDeployTestClassIds,
  mergeApexCoverageJsonField,
  inferCoveredLinesFromSource
} from './deployCoverage.js';

function escapeSoqlLiteral(value) {
  return String(value || '').replace(/'/g, "\\'");
}

function normalizeLineNumbers(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 1);
}

function mergeCoverageSets(coveredLines, uncoveredLines) {
  const covered = new Set(normalizeLineNumbers(coveredLines));
  const uncovered = new Set(normalizeLineNumbers(uncoveredLines));
  for (const ln of covered) uncovered.delete(ln);
  return {
    coveredLines: [...covered].sort((a, b) => a - b),
    uncoveredLines: [...uncovered].sort((a, b) => a - b)
  };
}

function applyCoveragePayload(coveredSet, uncoveredSet, raw) {
  mergeApexCoverageJsonField(raw, coveredSet, uncoveredSet);
}

/**
 * Cobertura por líneas vía Tooling API (misma fuente que Run Apex Tests).
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string|number} apiVersion
 * @param {string} classOrTriggerId
 * @param {string[]} testClassIds
 */
export async function fetchToolingCoverageLines(
  instanceUrl,
  sid,
  apiVersion,
  classOrTriggerId,
  testClassIds
) {
  const tid = escapeSoqlLiteral(String(classOrTriggerId || ''));
  const ids = [...new Set((testClassIds || []).map(String).filter(Boolean))];
  const covered = new Set();
  const uncovered = new Set();

  if (!tid || !ids.length) {
    return { coveredLines: [], uncoveredLines: [] };
  }

  const chunkSize = 20;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const inList = chunk.map((id) => `'${escapeSoqlLiteral(id)}'`).join(',');
    const covSoql = `SELECT ApexTestClassId, TestMethodName, Coverage FROM ApexCodeCoverage WHERE ApexClassOrTriggerId = '${tid}' AND ApexTestClassId IN (${inList})`;
    try {
      const part = await toolingQueryAll(instanceUrl, sid, apiVersion, covSoql);
      for (const row of part || []) {
        applyCoveragePayload(covered, uncovered, row.Coverage);
      }
    } catch {
      /* chunk omitido */
    }
  }

  for (const ln of covered) uncovered.delete(ln);
  return mergeCoverageSets(covered, uncovered);
}

/**
 * Cobertura agregada de la clase en Tooling (sin filtrar por test class).
 */
export async function fetchAllToolingCoverageLines(instanceUrl, sid, apiVersion, classOrTriggerId) {
  const tid = escapeSoqlLiteral(String(classOrTriggerId || ''));
  if (!tid) return { coveredLines: [], uncoveredLines: [] };

  const covered = new Set();
  const uncovered = new Set();
  const covSoql = `SELECT Coverage FROM ApexCodeCoverage WHERE ApexClassOrTriggerId = '${tid}'`;
  try {
    const rows = await toolingQueryAll(instanceUrl, sid, apiVersion, covSoql);
    for (const row of rows || []) {
      applyCoveragePayload(covered, uncovered, row.Coverage);
    }
  } catch {
    return { coveredLines: [], uncoveredLines: [] };
  }

  return mergeCoverageSets(covered, uncovered);
}

/**
 * IDs de clases de test del deploy: SOAP id o resolución por Name vía Tooling.
 * @param {Record<string, unknown> | null | undefined} runTestResult
 */
export async function resolveDeployTestClassIds(instanceUrl, sid, apiVersion, runTestResult) {
  const fromSoap = collectDeployTestClassIds(runTestResult);
  if (fromSoap.length) return fromSoap;

  const names = new Set();
  const addName = (row) => {
    const raw = String(row?.className || '').trim();
    if (!raw) return;
    const simple = raw.includes('.') ? raw.split('.').pop() : raw;
    if (simple) names.add(simple);
  };
  for (const s of runTestResult?.successes || []) addName(s);
  for (const f of runTestResult?.failures || []) addName(f);
  if (!names.size) return [];

  const ids = new Set();
  const nameList = [...names];
  for (let i = 0; i < nameList.length; i += 100) {
    const chunk = nameList.slice(i, i + 100);
    const inList = chunk.map((n) => `'${escapeSoqlLiteral(n)}'`).join(',');
    try {
      const rows = await toolingQueryAll(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Id FROM ApexClass WHERE Name IN (${inList})`
      );
      for (const r of rows || []) {
        if (r.Id) ids.add(String(r.Id));
      }
    } catch {
      /* chunk omitido */
    }
  }
  return [...ids];
}

/**
 * Resuelve líneas cubiertas/no cubiertas para el visor de cobertura de un deploy.
 */
export async function resolveDeployCoverageLineSets(opts) {
  const classOrTriggerId = String(opts.classOrTriggerId || '');
  let coveredLines = [];
  let uncoveredLines = normalizeLineNumbers(opts.uncoveredLinesHint);

  const testClassIds = await resolveDeployTestClassIds(
    opts.instanceUrl,
    opts.sid,
    opts.apiVersion,
    opts.runTestResult
  );

  if (testClassIds.length) {
    const scoped = await fetchToolingCoverageLines(
      opts.instanceUrl,
      opts.sid,
      opts.apiVersion,
      classOrTriggerId,
      testClassIds
    );
    if (scoped.coveredLines.length || scoped.uncoveredLines.length) {
      coveredLines = scoped.coveredLines;
      uncoveredLines = scoped.uncoveredLines;
    }
  }

  const soapHit = (opts.runTestResult?.codeCoverage || []).find(
    (c) => String(c?.id || '') === classOrTriggerId
  );
  if (!uncoveredLines.length && soapHit?.uncoveredLines?.length) {
    uncoveredLines = normalizeLineNumbers(soapHit.uncoveredLines);
  }

  if (!coveredLines.length) {
    const all = await fetchAllToolingCoverageLines(
      opts.instanceUrl,
      opts.sid,
      opts.apiVersion,
      classOrTriggerId
    );
    if (all.coveredLines.length) {
      coveredLines = all.coveredLines;
      if (!uncoveredLines.length && all.uncoveredLines.length) {
        uncoveredLines = all.uncoveredLines;
      }
    }
  }

  if (!coveredLines.length && opts.body) {
    coveredLines = inferCoveredLinesFromSource(opts.body, uncoveredLines);
  }

  return mergeCoverageSets(coveredLines, uncoveredLines);
}
