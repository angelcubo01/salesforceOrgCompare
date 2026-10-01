import { mergeApexCoverageJsonField } from './deployCoverage.js';
import { normalizeSalesforceIdKey } from './salesforceIds.js';
import { toolingQueryAll } from './salesforceApi.js';

// Salesforce CLI usa 500 ids por consulta: mantiene el SOQL muy por debajo del
// limite real de URI de Tooling API y evita docenas de round-trips pequenos.
export const APEX_COVERAGE_QUERY_ID_LIMIT = 500;

function escapeSoqlLiteral(value) {
  return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function chunks(values, size = APEX_COVERAGE_QUERY_ID_LIMIT) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

function methodKey(classId, methodName) {
  const id = normalizeSalesforceIdKey(classId);
  const method = String(methodName || '').trim().toLowerCase();
  return id && method ? `${id}:${method}` : '';
}

export function indexApexTestRunMethods(testResultRows) {
  const classIdsByKey = new Map();
  const methodKeys = new Set();
  for (const row of testResultRows || []) {
    const classId = String(row?.ApexClassId || '').trim();
    if (!classId) continue;
    const idKey = normalizeSalesforceIdKey(classId);
    if (!classIdsByKey.has(idKey)) classIdsByKey.set(idKey, classId);
    const key = methodKey(classId, row?.MethodName);
    if (key) methodKeys.add(key);
  }
  return { classIds: [...classIdsByKey.values()], methodKeys };
}

export function collectTouchedApexIds(coverageRows, methodKeys) {
  const byKey = new Map();
  for (const row of coverageRows || []) {
    const key = methodKey(row?.ApexTestClassId, row?.TestMethodName);
    if (!key || !methodKeys.has(key)) continue;
    const targetId = String(
      row?.ApexClassOrTriggerId || row?.ApexClassOrTrigger?.Id || ''
    ).trim();
    if (!targetId) continue;
    const targetKey = normalizeSalesforceIdKey(targetId);
    if (!byKey.has(targetKey)) byKey.set(targetKey, targetId);
  }
  return [...byKey.values()];
}

export function aggregateCoverageRows(rows, minCoveragePercent = 0) {
  const minFraction = Math.min(1, Math.max(0, Number(minCoveragePercent) / 100));
  const result = [];
  for (const row of rows || []) {
    const id = String(
      row?.ApexClassOrTriggerId || row?.ApexClassOrTrigger?.Id || ''
    ).trim();
    if (!id) continue;
    const covered = Number(row?.NumLinesCovered);
    const uncovered = Number(row?.NumLinesUncovered);
    if (!Number.isFinite(covered) || !Number.isFinite(uncovered)) continue;
    const total = covered + uncovered;
    if (total <= 0) continue;
    const percent = covered / total;
    if (percent + 1e-12 < minFraction) continue;
    result.push({
      id,
      name: String(row?.ApexClassOrTrigger?.Name || '').trim(),
      percent,
      covered,
      total
    });
  }
  result.sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
  return result;
}

async function queryAggregateRows(queryAll, instanceUrl, sid, apiVersion, where = '') {
  const suffix = where ? ` ${where}` : '';
  try {
    return await queryAll(
      instanceUrl,
      sid,
      apiVersion,
      `SELECT ApexClassOrTriggerId, ApexClassOrTrigger.Id, ApexClassOrTrigger.Name, NumLinesCovered, NumLinesUncovered FROM ApexCodeCoverageAggregate${suffix}`
    );
  } catch {
    // Algunas orgs/versiones no resuelven de forma consistente la relacion
    // polimorfica. Los contadores y el id directo si son estables.
    return queryAll(
      instanceUrl,
      sid,
      apiVersion,
      `SELECT ApexClassOrTriggerId, NumLinesCovered, NumLinesUncovered FROM ApexCodeCoverageAggregate${suffix}`
    );
  }
}

async function fillMissingNames(queryAll, instanceUrl, sid, apiVersion, classes) {
  const missing = classes.filter((row) => !row.name).map((row) => row.id);
  if (!missing.length) return classes;
  const nameById = new Map();
  await Promise.all(
    chunks(missing).flatMap((part) => {
      const inList = part.map((id) => `'${escapeSoqlLiteral(id)}'`).join(',');
      return ['ApexClass', 'ApexTrigger'].map(async (objectName) => {
        try {
          const rows = await queryAll(
            instanceUrl,
            sid,
            apiVersion,
            `SELECT Id, Name FROM ${objectName} WHERE Id IN (${inList})`
          );
          for (const row of rows || []) {
            const key = normalizeSalesforceIdKey(row?.Id);
            if (key && row?.Name != null) nameById.set(key, String(row.Name));
          }
        } catch {
          // El id sigue siendo una etiqueta valida si la org no deja resolver el nombre.
        }
      });
    })
  );
  return classes.map((row) => ({
    ...row,
    name: row.name || nameById.get(normalizeSalesforceIdKey(row.id)) || row.id
  }));
}

async function queryRunTestResults(queryAll, instanceUrl, sid, apiVersion, jobId) {
  return queryAll(
    instanceUrl,
    sid,
    apiVersion,
    `SELECT ApexClassId, MethodName FROM ApexTestResult WHERE AsyncApexJobId = '${escapeSoqlLiteral(jobId)}'`
  );
}

async function queryDetailedCoverageRows(
  queryAll,
  instanceUrl,
  sid,
  apiVersion,
  testClassIds,
  { targetId = '', includeLines = false } = {}
) {
  const targetFilter = targetId
    ? ` AND ApexClassOrTriggerId = '${escapeSoqlLiteral(targetId)}'`
    : '';
  const fields = includeLines
    ? 'ApexTestClassId, TestMethodName, ApexClassOrTriggerId, Coverage'
    : 'ApexTestClassId, TestMethodName, ApexClassOrTriggerId';
  const pages = await Promise.all(
    chunks(testClassIds).map((part) => {
      const inList = part.map((id) => `'${escapeSoqlLiteral(id)}'`).join(',');
      return queryAll(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT ${fields} FROM ApexCodeCoverage WHERE ApexTestClassId IN (${inList})${targetFilter}`
      );
    })
  );
  return pages.flat();
}

/**
 * Resumen equivalente al CLI oficial:
 * 1) ApexCodeCoverage identifica las clases tocadas por los metodos del job.
 * 2) ApexCodeCoverageAggregate aporta los contadores oficiales por clase/trigger.
 * No se descarga el pesado JSON Coverage hasta abrir una clase concreta.
 */
export async function fetchApexTestRunCoverageSummary({
  instanceUrl,
  sid,
  apiVersion,
  jobId,
  minCoveragePercent = 0,
  queryAll = toolingQueryAll
}) {
  const testResultRows = await queryRunTestResults(
    queryAll,
    instanceUrl,
    sid,
    apiVersion,
    jobId
  );
  const run = indexApexTestRunMethods(testResultRows);
  if (!run.classIds.length) return { classes: [], note: 'NO_TEST_RESULTS' };

  const detailedRows = await queryDetailedCoverageRows(
    queryAll,
    instanceUrl,
    sid,
    apiVersion,
    run.classIds
  );
  const targetIds = collectTouchedApexIds(detailedRows, run.methodKeys);
  let aggregateRows = [];
  let scope = 'run';
  if (targetIds.length) {
    const resultPages = await Promise.all(
      chunks(targetIds).map((part) => {
        const inList = part.map((id) => `'${escapeSoqlLiteral(id)}'`).join(',');
        return queryAggregateRows(
          queryAll,
          instanceUrl,
          sid,
          apiVersion,
          `WHERE ApexClassOrTriggerId IN (${inList})`
        );
      })
    );
    aggregateRows = resultPages.flat();
  } else {
    // Con "Store Only Aggregate Code Coverage" Salesforce no guarda filas
    // ApexCodeCoverage. El CLI oficial cae tambien a todo el agregado de la org.
    scope = 'org';
    aggregateRows = await queryAggregateRows(queryAll, instanceUrl, sid, apiVersion);
  }

  let classes = aggregateCoverageRows(aggregateRows, minCoveragePercent);
  classes = await fillMissingNames(queryAll, instanceUrl, sid, apiVersion, classes);
  return { classes, scope };
}

export async function fetchApexTestCoverageLines({
  instanceUrl,
  sid,
  apiVersion,
  jobId,
  classOrTriggerId,
  queryAll = toolingQueryAll
}) {
  const targetId = String(classOrTriggerId || '').trim();
  const covered = new Set();
  const uncovered = new Set();
  const aggregateSoql =
    `SELECT Coverage FROM ApexCodeCoverageAggregate ` +
    `WHERE ApexClassOrTriggerId = '${escapeSoqlLiteral(targetId)}' LIMIT 1`;
  const aggregateRows = await queryAll(instanceUrl, sid, apiVersion, aggregateSoql);
  if (aggregateRows?.length) {
    mergeApexCoverageJsonField(aggregateRows[0].Coverage, covered, uncovered);
  } else {
    // Fallback para orgs que no devuelvan Coverage en el agregado.
    const testResultRows = await queryRunTestResults(
      queryAll,
      instanceUrl,
      sid,
      apiVersion,
      jobId
    );
    const run = indexApexTestRunMethods(testResultRows);
    if (!run.classIds.length) return { coveredLines: [], uncoveredLines: [], note: 'NO_TEST_RESULTS' };
    const detailedRows = await queryDetailedCoverageRows(
      queryAll,
      instanceUrl,
      sid,
      apiVersion,
      run.classIds,
      { targetId, includeLines: true }
    );
    for (const row of detailedRows) {
      const key = methodKey(row?.ApexTestClassId, row?.TestMethodName);
      if (key && run.methodKeys.has(key)) {
        mergeApexCoverageJsonField(row.Coverage, covered, uncovered);
      }
    }
  }
  for (const line of covered) uncovered.delete(line);
  return {
    coveredLines: [...covered].sort((a, b) => a - b),
    uncoveredLines: [...uncovered].sort((a, b) => a - b)
  };
}
