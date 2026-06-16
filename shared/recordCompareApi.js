import { restDescribeSobject, restGetSobject, restQuery } from './salesforceApi.js';
import { isValidSalesforceRecordId } from './fieldHistoryApi.js';
import {
  buildRecordCompareFieldList,
  enrichReferenceDisplayPaths
} from './recordCompareCore.js';

function escapeSoqlLiteral(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * SOQL genérico: todos los campos accesibles sin enumerarlos (máx. 200 campos por consulta).
 * @param {string} objectApiName
 * @param {string} recordId
 * @param {'ALL' | 'STANDARD' | 'CUSTOM'} fieldsMode
 */
export function buildFieldsSoql(objectApiName, recordId, fieldsMode = 'ALL') {
  const obj = String(objectApiName || '').trim();
  const idEsc = escapeSoqlLiteral(recordId);
  const mode = fieldsMode === 'STANDARD' || fieldsMode === 'CUSTOM' ? fieldsMode : 'ALL';
  return `SELECT FIELDS(${mode}) FROM ${obj} WHERE Id = '${idEsc}' LIMIT 1`;
}

/**
 * @param {string} recordId
 * @returns {string}
 */
export function recordIdKeyPrefix(recordId) {
  const id = String(recordId || '').trim();
  if (id.length !== 15 && id.length !== 18) return '';
  return id.substring(0, 3);
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {string} recordId
 * @returns {Promise<string>}
 */
export async function resolveObjectFromRecordId(instanceUrl, sid, apiVersion, recordId) {
  const id = String(recordId || '').trim();
  if (!isValidSalesforceRecordId(id)) {
    const err = new Error('Invalid record Id');
    err.code = 'INVALID_ID';
    throw err;
  }
  const prefix = recordIdKeyPrefix(id);
  if (!prefix) {
    const err = new Error('Invalid record Id');
    err.code = 'INVALID_ID';
    throw err;
  }
  const prefixEsc = escapeSoqlLiteral(prefix);
  const rows =
    (await restQuery(
      instanceUrl,
      sid,
      apiVersion,
      `SELECT QualifiedApiName FROM EntityDefinition WHERE KeyPrefix = '${prefixEsc}' LIMIT 1`
    )) || [];
  const apiName = String(rows[0]?.QualifiedApiName || '').trim();
  if (!apiName) {
    const err = new Error(`No object found for Id prefix ${prefix}`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  return apiName;
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {import('./recordCompareCore.js').RecordCompareFieldMeta[]} fieldMeta
 */
async function loadReferencedObjectDescribes(instanceUrl, sid, apiVersion, fieldMeta) {
  /** @type {Map<string, Record<string, unknown>>} */
  const describeByObject = new Map();
  const types = new Set();
  for (const f of fieldMeta || []) {
    if (f.isReference && f.referenceTo?.length === 1) {
      types.add(f.referenceTo[0]);
    }
  }
  await Promise.all(
    [...types].map(async (apiName) => {
      try {
        const d = await restDescribeSobject(instanceUrl, sid, apiVersion, apiName);
        describeByObject.set(apiName, d);
      } catch {
        /* objeto no accesible: sin displayPath en el lookup */
      }
    })
  );
  return describeByObject;
}

/**
 * @param {Record<string, unknown> | null | undefined} row
 */
function stripSoqlRow(row) {
  if (!row || typeof row !== 'object') return null;
  const { attributes: _a, ...rest } = /** @type {Record<string, unknown>} */ (row);
  return rest;
}

/**
 * @param {unknown} e
 */
function isFieldsAllFailure(e) {
  const code = String(e?.salesforceErrorCode || '').toUpperCase();
  const msg = String(e?.message || '').toLowerCase();
  return (
    code === 'INVALID_FIELD' ||
    code === 'MALFORMED_QUERY' ||
    code === 'EXCEEDED_ID_LIMIT' ||
    msg.includes('fields(all)') ||
    msg.includes('fields(standard)') ||
    msg.includes('fields(custom)') ||
    msg.includes('too many fields')
  );
}

/**
 * Carga el registro con FIELDS(ALL); si el objeto tiene >200 campos, combina STANDARD+CUSTOM;
 * si falla, REST GET (todos los campos legibles sin SOQL).
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {string} objectApiName
 * @param {string} recordId
 */
async function fetchRecordData(instanceUrl, sid, apiVersion, objectApiName, recordId) {
  const obj = String(objectApiName || '').trim();
  const id = String(recordId || '').trim();

  try {
    const rows =
      (await restQuery(instanceUrl, sid, apiVersion, buildFieldsSoql(obj, id, 'ALL'))) || [];
    const row = stripSoqlRow(rows[0]);
    if (row && Object.keys(row).length) return row;
  } catch (e) {
    if (!isFieldsAllFailure(e)) throw e;
  }

  try {
    const [stdRows, customRows] = await Promise.all([
      restQuery(instanceUrl, sid, apiVersion, buildFieldsSoql(obj, id, 'STANDARD')),
      restQuery(instanceUrl, sid, apiVersion, buildFieldsSoql(obj, id, 'CUSTOM')).catch(() => [])
    ]);
    const merged = {
      ...stripSoqlRow(stdRows?.[0]),
      ...stripSoqlRow(customRows?.[0])
    };
    if (Object.keys(merged).length) return merged;
  } catch (e) {
    if (!isFieldsAllFailure(e)) throw e;
  }

  return restGetSobject(instanceUrl, sid, apiVersion, obj, id);
}

/**
 * @param {string} displayPath p. ej. Account.Name o MasterRecord.CaseNumber
 * @returns {string | null}
 */
function nameFieldFromDisplayPath(displayPath) {
  const parts = String(displayPath || '')
    .split('.')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 1] : null;
}

/**
 * Resuelve el nombre visible de un lookup con SOQL puntual (sin relaciones anidadas).
 */
async function fetchLookupDisplayValue(
  instanceUrl,
  sid,
  apiVersion,
  refType,
  lookupId,
  nameField
) {
  const fieldEsc = String(nameField || '').trim();
  if (!fieldEsc || !/^[A-Za-z][A-Za-z0-9_]*(__c|__r)?$/.test(fieldEsc)) return null;
  const idEsc = escapeSoqlLiteral(lookupId);
  const soql = `SELECT ${fieldEsc} FROM ${refType} WHERE Id = '${idEsc}' LIMIT 1`;
  try {
    const rows = (await restQuery(instanceUrl, sid, apiVersion, soql)) || [];
    const row = rows[0];
    return row?.[fieldEsc] ?? null;
  } catch {
    try {
      const refRecord = await restGetSobject(instanceUrl, sid, apiVersion, refType, lookupId);
      return refRecord?.[fieldEsc] ?? null;
    } catch {
      return null;
    }
  }
}

/**
 * Inyecta objetos anidados en lookups (p. ej. Account.Name) para la tabla de comparación.
 */
async function enrichRecordWithLookupDisplays(instanceUrl, sid, apiVersion, record, fieldMeta) {
  if (!record || typeof record !== 'object') return record;
  const enriched = { ...record };
  /** @type {Map<string, Promise<Record<string, unknown>>>} */
  const lookupCache = new Map();

  function loadLookupNested(refType, lookupId, nameField) {
    const cacheKey = `${refType}:${lookupId}:${nameField}`;
    if (!lookupCache.has(cacheKey)) {
      lookupCache.set(
        cacheKey,
        fetchLookupDisplayValue(instanceUrl, sid, apiVersion, refType, lookupId, nameField).then(
          (value) => ({ [nameField]: value })
        )
      );
    }
    return lookupCache.get(cacheKey);
  }

  await Promise.all(
    (fieldMeta || []).map(async (f) => {
      if (!f.isReference || !f.displayPath || !f.relationshipName || !f.idField) return;
      const refType = f.referenceTo?.[0];
      if (!refType) return;
      const lookupId = record[f.idField];
      if (lookupId == null || lookupId === '') return;
      const nameField = nameFieldFromDisplayPath(f.displayPath);
      if (!nameField) return;
      enriched[f.relationshipName] = await loadLookupNested(
        refType,
        String(lookupId),
        nameField
      );
    })
  );

  return enriched;
}

/**
 * @param {unknown} e
 */
function rethrowFetchError(e) {
  const err = new Error(String(e?.message || e));
  if (e && typeof e === 'object' && e.code) err.code = String(e.code);
  if (e && typeof e === 'object' && e.salesforceErrorCode) {
    err.salesforceErrorCode = String(e.salesforceErrorCode);
  }
  if (!err.code && err.salesforceErrorCode === 'INVALID_FIELD') {
    err.code = 'QUERY_ERROR';
  }
  if (!err.code && e && typeof e === 'object' && e.status === 404) {
    err.code = 'NOT_FOUND';
  }
  throw err;
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {string} objectApiName
 * @param {string} recordId
 */
export async function fetchRecordForCompare(instanceUrl, sid, apiVersion, objectApiName, recordId) {
  const obj = String(objectApiName || '').trim();
  const id = String(recordId || '').trim();
  if (!obj || !isValidSalesforceRecordId(id)) {
    const err = new Error('Missing object or record Id');
    err.code = 'INVALID_ID';
    throw err;
  }

  const describe = await restDescribeSobject(instanceUrl, sid, apiVersion, obj);
  const describeFields = Array.isArray(describe?.fields) ? describe.fields : [];
  const baseMeta = buildRecordCompareFieldList(describeFields);
  const describeByObject = await loadReferencedObjectDescribes(
    instanceUrl,
    sid,
    apiVersion,
    baseMeta
  );
  const fieldMeta = enrichReferenceDisplayPaths(baseMeta, describeByObject);

  let record;
  try {
    record = await fetchRecordData(instanceUrl, sid, apiVersion, obj, id);
  } catch (e) {
    rethrowFetchError(e);
  }

  if (!record) {
    const err = new Error(`Record not found: ${id}`);
    err.code = 'NOT_FOUND';
    throw err;
  }

  const enriched = await enrichRecordWithLookupDisplays(
    instanceUrl,
    sid,
    apiVersion,
    record,
    fieldMeta
  );

  return {
    record: enriched,
    fieldMeta,
    objectLabel: String(describe?.label || obj).trim() || obj
  };
}
