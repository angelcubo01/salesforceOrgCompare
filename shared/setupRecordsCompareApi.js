import { restDescribeSobject, restQueryAll, toolingQueryAll } from './salesforceApi.js';
import {
  buildCompareFieldList,
  detectRowAlignment
} from './setupRecordsCompareCore.js';

function escapeSoqlLiteral(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function isCustomMetadataType(apiName) {
  return String(apiName || '').trim().toLowerCase().endsWith('__mdt');
}

/**
 * Los tipos Custom Metadata admiten SOQL, pero no exponen el recurso REST
 * `/sobjects/{type}/describe`. EntityParticle es la fuente de Tooling API
 * para conocer los campos de una entidad, incluidos los de `__mdt`.
 */
async function describeCustomMetadataType(instanceUrl, sid, apiVersion, apiName) {
  const soql =
    'SELECT QualifiedApiName, DataType, IsCalculated ' +
    `FROM EntityParticle WHERE EntityDefinition.QualifiedApiName = '${escapeSoqlLiteral(apiName)}' ` +
    'ORDER BY QualifiedApiName';
  const particles = await toolingQueryAll(instanceUrl, sid, apiVersion, soql);

  return {
    fields: (particles || [])
      .map((particle) => ({
        name: String(particle?.QualifiedApiName || '').trim(),
        type: String(particle?.DataType || '').trim().toLowerCase(),
        calculated: particle?.IsCalculated === true
      }))
      .filter((field) => field.name)
  };
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 */
export async function listCustomSettingTypes(instanceUrl, sid, apiVersion) {
  const soql =
    'SELECT QualifiedApiName, Label FROM EntityDefinition WHERE IsCustomSetting = true ORDER BY QualifiedApiName';
  const rows = await restQueryAll(instanceUrl, sid, apiVersion, soql);
  return (rows || []).map((r) => ({
    apiName: String(r.QualifiedApiName || '').trim(),
    label: String(r.Label || r.QualifiedApiName || '').trim()
  })).filter((t) => t.apiName);
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 */
export async function listCustomMetadataTypes(instanceUrl, sid, apiVersion) {
  // SOQL no admite ESCAPE en LIKE; filtramos __mdt en cliente (patrón acotado con LIKE '%mdt').
  const soql =
    "SELECT QualifiedApiName, Label FROM EntityDefinition WHERE QualifiedApiName LIKE '%mdt' ORDER BY QualifiedApiName";
  const rows = await restQueryAll(instanceUrl, sid, apiVersion, soql);
  return (rows || [])
    .filter((r) => String(r.QualifiedApiName || '').trim().endsWith('__mdt'))
    .map((r) => ({
      apiName: String(r.QualifiedApiName || '').trim(),
      label: String(r.Label || r.QualifiedApiName || '').trim()
    }))
    .filter((t) => t.apiName);
}

/**
 * @param {string} instanceUrl
 * @param {string} sid
 * @param {string} apiVersion
 * @param {string} typeApiName
 */
export async function fetchSetupRecordsForType(instanceUrl, sid, apiVersion, typeApiName) {
  const apiName = String(typeApiName || '').trim();
  if (!apiName) {
    throw new Error('Missing type API name');
  }

  const describe = isCustomMetadataType(apiName)
    ? await describeCustomMetadataType(instanceUrl, sid, apiVersion, apiName)
    : await restDescribeSobject(instanceUrl, sid, apiVersion, apiName);
  const describeFields = Array.isArray(describe?.fields) ? describe.fields : [];
  const fieldNames = buildCompareFieldList(describeFields);
  const alignment = detectRowAlignment(describeFields);

  if (!fieldNames.length) {
    return {
      records: [],
      fieldNames: [],
      alignment,
      truncated: false,
      totalSize: 0
    };
  }

  const selectList = fieldNames.join(', ');
  const soql = `SELECT ${selectList} FROM ${apiName}`;
  const records = await restQueryAll(instanceUrl, sid, apiVersion, soql);

  return {
    records: records || [],
    fieldNames,
    alignment,
    truncated: (records || []).length >= 2000,
    totalSize: (records || []).length
  };
}

export { escapeSoqlLiteral };
