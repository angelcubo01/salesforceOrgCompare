import {
  restDescribeGlobal,
  restDescribeSobject,
  restQuery,
  restQueryAll
} from './salesforceApi.js';
import { resolveObjectApiName } from './permissionsDiffApi.js';

import { getFieldHistoryQueryDefaultLimit } from './extensionSettings.js';

function escapeSoqlLiteral(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * @param {string} isoOrDate
 * @returns {string | null}
 */
export function toSoqlDateTimeLiteral(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * API name del objeto history (Account → AccountHistory, Foo__c → Foo__History).
 * @param {string} objectApiName
 */
export function historySobjectApiName(objectApiName) {
  const name = String(objectApiName || '').trim();
  if (!name) return '';
  if (name.endsWith('__c')) {
    return name.slice(0, -3) + '__History';
  }
  return `${name}History`;
}

/**
 * Campo lookup del registro padre en el objeto history.
 * @param {string} objectApiName
 */
export function historyParentFieldName(objectApiName) {
  const name = String(objectApiName || '').trim();
  if (!name) return '';
  if (name.endsWith('__c')) return 'ParentId';
  return `${name}Id`;
}

/**
 * @param {Record<string, unknown>} describe
 * @returns {Array<{ apiName: string, label: string, type: string, trackHistory: boolean }>}
 */
export function extractTrackedFieldsFromDescribe(describe) {
  const fields = Array.isArray(describe?.fields) ? describe.fields : [];
  const out = [];
  for (const f of fields) {
    if (!f || f.trackHistory !== true) continue;
    const apiName = String(f.name || '').trim();
    if (!apiName) continue;
    out.push({
      apiName,
      label: String(f.label || apiName).trim() || apiName,
      type: String(f.type || '').trim(),
      trackHistory: true
    });
  }
  out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  return out;
}

/**
 * Une listas de campos trackeados sin duplicar por apiName.
 * @param {Array<Array<{ apiName: string, label: string, type: string, trackHistory?: boolean }>>} lists
 */
export function mergeTrackedFieldLists(...lists) {
  const byApi = new Map();
  for (const list of lists) {
    for (const f of list || []) {
      const apiName = String(f?.apiName || '').trim();
      if (!apiName || byApi.has(apiName)) continue;
      byApi.set(apiName, {
        apiName,
        label: String(f.label || apiName).trim() || apiName,
        type: String(f.type || '').trim(),
        trackHistory: true
      });
    }
  }
  return [...byApi.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
  );
}

/**
 * FieldDefinition expone IsFieldHistoryTracked (fiable en estándar; describe a menudo no).
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {string} objectApiName
 */
export async function fetchTrackedFieldsFromFieldDefinition(
  instanceUrl,
  sid,
  apiVersion,
  objectApiName
) {
  const objEsc = escapeSoqlLiteral(String(objectApiName || '').trim());
  if (!objEsc) return [];
  try {
    const rows = await restQueryAll(
      instanceUrl,
      sid,
      apiVersion,
      `SELECT QualifiedApiName, Label, DataType FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objEsc}' AND IsFieldHistoryTracked = true ORDER BY Label`
    );
    return (rows || [])
      .map((r) => ({
        apiName: String(r.QualifiedApiName || '').trim(),
        label: String(r.Label || r.QualifiedApiName || '').trim(),
        type: String(r.DataType || '').trim(),
        trackHistory: true
      }))
      .filter((f) => f.apiName);
  } catch {
    return [];
  }
}

/**
 * @param {Record<string, unknown>} describe
 * @param {string} historyObject
 */
export function historyQueryableFromDescribeChildRels(describe, historyObject) {
  const target = String(historyObject || '').trim();
  if (!target) return false;
  const rels = Array.isArray(describe?.childRelationships) ? describe.childRelationships : [];
  return rels.some((r) => String(r?.childSObject || '').trim() === target);
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {string} historyObject
 */
export async function probeHistoryObjectQueryable(instanceUrl, sid, apiVersion, historyObject) {
  const name = String(historyObject || '').trim();
  if (!name || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) return false;
  try {
    await restQuery(instanceUrl, sid, apiVersion, `SELECT Id FROM ${name} LIMIT 1`);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} recordId
 */
export function isValidSalesforceRecordId(recordId) {
  const id = String(recordId || '').trim();
  return /^[a-zA-Z0-9]{15}$|^[a-zA-Z0-9]{18}$/.test(id);
}

/**
 * @param {{
 *   historyObject: string,
 *   parentField: string,
 *   recordId: string,
 *   sinceIso: string,
 *   untilIso: string,
 *   fieldNames?: string[],
 *   limit?: number
 * }} opts
 */
export function buildFieldHistorySoql(opts) {
  const historyObject = String(opts.historyObject || '').trim();
  const parentField = String(opts.parentField || '').trim();
  const recordId = String(opts.recordId || '').trim();
  if (!historyObject || !parentField || !recordId) {
    throw new Error('Missing history query parameters');
  }
  const sinceDt = toSoqlDateTimeLiteral(opts.sinceIso);
  const untilDt = toSoqlDateTimeLiteral(opts.untilIso);
  if (!sinceDt || !untilDt) {
    throw new Error('Invalid date range');
  }
  const parsedLimit = Math.max(
    1,
    Math.min(50000, Number(opts.limit) || getFieldHistoryQueryDefaultLimit())
  );
  const rid = escapeSoqlLiteral(recordId);
  let where = `${parentField} = '${rid}' AND CreatedDate >= ${sinceDt} AND CreatedDate <= ${untilDt}`;
  const fieldNames = (opts.fieldNames || [])
    .map((n) => String(n || '').trim())
    .filter(Boolean);
  if (fieldNames.length) {
    const inList = fieldNames.map((n) => `'${escapeSoqlLiteral(n)}'`).join(', ');
    where += ` AND Field IN (${inList})`;
  }
  return `SELECT Id, CreatedDate, CreatedById, CreatedBy.Name, CreatedBy.Username, Field, OldValue, NewValue, DataType FROM ${historyObject} WHERE ${where} ORDER BY CreatedDate DESC LIMIT ${parsedLimit}`;
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {string} objectInput
 */
export async function resolveHistoryContext(instanceUrl, sid, apiVersion, objectInput) {
  const objectApiName = await resolveObjectApiName(instanceUrl, sid, apiVersion, objectInput);
  const historyObject = historySobjectApiName(objectApiName);
  const parentField = historyParentFieldName(objectApiName);
  const describe = await restDescribeSobject(instanceUrl, sid, apiVersion, objectApiName);
  const fromFieldDefinition = await fetchTrackedFieldsFromFieldDefinition(
    instanceUrl,
    sid,
    apiVersion,
    objectApiName
  );
  const trackedFields = mergeTrackedFieldLists(
    extractTrackedFieldsFromDescribe(describe),
    fromFieldDefinition
  );
  let historyQueryable = historyQueryableFromDescribeChildRels(describe, historyObject);
  if (!historyQueryable) {
    try {
      const globals = await restDescribeGlobal(instanceUrl, sid, apiVersion);
      historyQueryable = globals.some(
        (s) => String(s?.name || '') === historyObject && s.queryable !== false
      );
    } catch {
      historyQueryable = false;
    }
  }
  if (!historyQueryable) {
    historyQueryable = await probeHistoryObjectQueryable(
      instanceUrl,
      sid,
      apiVersion,
      historyObject
    );
  }
  /** Objeto con history activo en Setup; la lista de campos puede venir vacía si describe no expone trackHistory. */
  const historyEnabled = historyQueryable;
  return {
    objectApiName,
    historyObject,
    parentField,
    trackedFields,
    historyQueryable,
    historyEnabled,
    trackedFieldsSource: fromFieldDefinition.length
      ? 'fieldDefinition'
      : trackedFields.length
        ? 'describe'
        : 'none'
  };
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {{
 *   objectApiName: string,
 *   historyObject: string,
 *   parentField: string,
 *   recordId: string,
 *   sinceIso: string,
 *   untilIso: string,
 *   fieldNames?: string[],
 *   limit?: number
 * }} params
 */
export async function queryFieldHistoryRows(instanceUrl, sid, apiVersion, params) {
  const soql = buildFieldHistorySoql({
    historyObject: params.historyObject,
    parentField: params.parentField,
    recordId: params.recordId,
    sinceIso: params.sinceIso,
    untilIso: params.untilIso,
    fieldNames: params.fieldNames,
    limit: params.limit
  });
  const rows = await restQueryAll(instanceUrl, sid, apiVersion, soql);
  return Array.isArray(rows) ? rows : [];
}
