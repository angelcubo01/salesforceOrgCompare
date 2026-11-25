import {
  restDescribeGlobal,
  restDescribeSobject,
  restQueryAll,
  restRequestWithSid
} from './salesforceApi.js';
import {
  createMetadataZipBase64,
  deployAndWait,
  retrievePackageXmlZip
} from './metadataRetrieve.js';
import {
  decodeZipBase64,
  extractZipFileContent,
  getZipEntries
} from '../code/lib/zipBinary.js';
import {
  buildPermissionPreview,
  normalizePermissionOperations,
  orderPermissionOperations,
  permissionOperationKey,
  summarizePermissionResults
} from './permissionAccessCore.js';

const REST_OBJECT_FIELDS = Object.freeze({
  read: 'PermissionsRead',
  create: 'PermissionsCreate',
  edit: 'PermissionsEdit',
  delete: 'PermissionsDelete',
  viewAllRecords: 'PermissionsViewAllRecords',
  modifyAllRecords: 'PermissionsModifyAllRecords',
  viewAllFields: 'PermissionsViewAllFields'
});
const REST_FIELD_FIELDS = Object.freeze({ read: 'PermissionsRead', edit: 'PermissionsEdit' });
const COMPOSITE_LIMIT = 25;
const OBJECT_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const OBJECT_SEARCH_CACHE_LIMIT = 20;
const objectSearchCache = new Map();

function soqlLiteral(value) {
  return `'${String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function safeError(error) {
  if (!error) return 'UNKNOWN_ERROR';
  if (typeof error === 'string') return error.slice(0, 2000);
  const message = error?.message || error?.errorCode || JSON.stringify(error);
  return String(message || 'UNKNOWN_ERROR').slice(0, 2000);
}

function chunks(items, size = COMPOSITE_LIMIT) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function apiVersionString(apiVersion) {
  const value = Number(apiVersion) || 63;
  return value.toFixed(1);
}

export async function searchPermissionAccessTargets(instanceUrl, sid, apiVersion, targetType, queryText = '') {
  const term = String(queryText || '').trim().replace(/[%'_]/g, '');
  const like = term ? ` AND (Name LIKE ${soqlLiteral(`%${term}%`)} OR Label LIKE ${soqlLiteral(`%${term}%`)})` : '';
  if (targetType === 'Profile') {
    const profileLike = term ? ` WHERE (Name LIKE ${soqlLiteral(`%${term}%`)})` : '';
    const records = await restQueryAll(
      instanceUrl,
      sid,
      apiVersion,
      `SELECT Id, Name FROM Profile${profileLike} ORDER BY Name LIMIT 2000`
    );
    return records.map((record) => ({ type: 'Profile', id: record.Id, name: record.Name, label: record.Name }));
  }
  const records = await restQueryAll(
    instanceUrl,
    sid,
    apiVersion,
    `SELECT Id, Name, Label FROM PermissionSet WHERE IsOwnedByProfile = false AND IsCustom = true AND NamespacePrefix = null${like} ORDER BY Label LIMIT 2000`
  );
  return records.map((record) => ({
    type: 'PermissionSet', id: record.Id, name: record.Name, label: record.Label || record.Name
  }));
}

export async function searchPermissionAccessObjects(instanceUrl, sid, apiVersion, queryText = '') {
  const cacheKey = `${String(instanceUrl || '').replace(/\/$/, '')}|${apiVersionString(apiVersion)}`;
  const now = Date.now();
  let entry = objectSearchCache.get(cacheKey);
  if (!entry || entry.expiresAt <= now) {
    if (!entry && objectSearchCache.size >= OBJECT_SEARCH_CACHE_LIMIT) {
      objectSearchCache.delete(objectSearchCache.keys().next().value);
    }
    const promise = restDescribeGlobal(instanceUrl, sid, apiVersion);
    entry = { expiresAt: now + OBJECT_SEARCH_CACHE_TTL_MS, promise };
    objectSearchCache.set(cacheKey, entry);
    promise.catch(() => {
      if (objectSearchCache.get(cacheKey)?.promise === promise) objectSearchCache.delete(cacheKey);
    });
  }
  const sobjects = await entry.promise;
  return filterPermissionAccessObjects(sobjects, queryText);
}

export function filterPermissionAccessObjects(sobjects, queryText = '') {
  const term = String(queryText || '').trim().toLocaleLowerCase();
  return (sobjects || [])
    .filter((item) => item?.queryable && item?.name)
    .filter((item) => !term || String(item.name).toLocaleLowerCase().includes(term) || String(item.label || '').toLocaleLowerCase().includes(term))
    .slice(0, 100)
    .map((item) => ({ name: item.name, label: item.label || item.name, custom: !!item.custom }));
}

export async function describePermissionAccessObject(instanceUrl, sid, apiVersion, objectApiName) {
  const describe = await restDescribeSobject(instanceUrl, sid, apiVersion, objectApiName);
  return {
    name: describe.name,
    label: describe.label || describe.name,
    fields: (describe.fields || []).map((field) => ({
      name: field.name,
      label: field.label || field.name,
      type: field.type,
      permissionable: field.permissionable !== false,
      required: field.nillable === false && field.defaultedOnCreate !== true && field.calculated !== true
    }))
  };
}

async function resolveTargets(instanceUrl, sid, apiVersion, operations) {
  const permissionSetIds = [...new Set(operations.filter((item) => item.target.type === 'PermissionSet').map((item) => item.target.id).filter(Boolean))];
  const profileIds = [...new Set(operations.filter((item) => item.target.type === 'Profile').map((item) => item.target.id).filter(Boolean))];
  const resolved = new Map();

  if (permissionSetIds.length) {
    const records = await restQueryAll(instanceUrl, sid, apiVersion,
      `SELECT Id, Name, Label, IsCustom, IsOwnedByProfile, NamespacePrefix FROM PermissionSet WHERE Id IN (${permissionSetIds.map(soqlLiteral).join(',')})`);
    for (const record of records) {
      if (record.IsCustom !== true || record.IsOwnedByProfile === true || record.NamespacePrefix) continue;
      resolved.set(`PermissionSet:${record.Id}`, {
        type: 'PermissionSet', id: record.Id, name: record.Name, label: record.Label || record.Name, parentId: record.Id
      });
    }
  }

  if (profileIds.length) {
    const records = await restQueryAll(instanceUrl, sid, apiVersion,
      `SELECT Id, Name FROM Profile WHERE Id IN (${profileIds.map(soqlLiteral).join(',')})`);
    const parentRecords = await restQueryAll(instanceUrl, sid, apiVersion,
      `SELECT Id, ProfileId FROM PermissionSet WHERE IsOwnedByProfile = true AND ProfileId IN (${profileIds.map(soqlLiteral).join(',')})`);
    const parentByProfile = new Map(parentRecords.map((record) => [record.ProfileId, record.Id]));
    for (const record of records) {
      const parentId = parentByProfile.get(record.Id);
      if (!parentId) continue;
      resolved.set(`Profile:${record.Id}`, {
        type: 'Profile', id: record.Id, name: record.Name, label: record.Name, parentId
      });
    }
  }

  return resolved;
}

function recordToCurrent(record, resourceType) {
  const map = resourceType === 'field' ? REST_FIELD_FIELDS : REST_OBJECT_FIELDS;
  return Object.fromEntries(Object.entries(map).map(([key, apiName]) => [key, record?.[apiName] === true]));
}

async function fetchCurrentPermissions(instanceUrl, sid, apiVersion, operations, targets) {
  const parentIds = [...new Set([...targets.values()].map((target) => target.parentId))];
  const current = new Map();
  if (!parentIds.length) return current;
  const parentFilter = parentIds.map(soqlLiteral).join(',');
  const objectResources = [...new Set(operations
    .filter((operation) => operation.resource.type === 'object')
    .map((operation) => operation.resource.objectApiName))];
  const fieldResources = [...new Set(operations
    .filter((operation) => operation.resource.type === 'field')
    .map((operation) => `${operation.resource.objectApiName}.${operation.resource.fieldApiName}`))];
  const objectFields = ['Id', 'ParentId', 'SobjectType', ...Object.values(REST_OBJECT_FIELDS)].join(', ');
  const fieldFields = ['Id', 'ParentId', 'SobjectType', 'Field', ...Object.values(REST_FIELD_FIELDS)].join(', ');
  const [objectRecords, fieldRecords] = await Promise.all([
    objectResources.length
      ? restQueryAll(instanceUrl, sid, apiVersion,
        `SELECT ${objectFields} FROM ObjectPermissions WHERE ParentId IN (${parentFilter}) AND SobjectType IN (${objectResources.map(soqlLiteral).join(',')})`)
      : Promise.resolve([]),
    fieldResources.length
      ? restQueryAll(instanceUrl, sid, apiVersion,
        `SELECT ${fieldFields} FROM FieldPermissions WHERE ParentId IN (${parentFilter}) AND Field IN (${fieldResources.map(soqlLiteral).join(',')})`)
      : Promise.resolve([])
  ]);
  const byParent = new Map([...targets.values()].map((target) => [target.parentId, target]));
  for (const record of objectRecords) {
    const target = byParent.get(record.ParentId);
    if (!target) continue;
    current.set(`${target.type}:${target.id}|object:${record.SobjectType}`, {
      id: record.Id, permissions: recordToCurrent(record, 'object')
    });
  }
  for (const record of fieldRecords) {
    const target = byParent.get(record.ParentId);
    if (!target) continue;
    current.set(`${target.type}:${target.id}|field:${record.Field}`, {
      id: record.Id, permissions: recordToCurrent(record, 'field')
    });
  }
  return current;
}

export async function previewPermissionAccess(instanceUrl, sid, apiVersion, rawOperations) {
  const operations = normalizePermissionOperations(rawOperations);
  const targets = await resolveTargets(instanceUrl, sid, apiVersion, operations);
  for (const operation of operations) {
    const target = targets.get(`${operation.target.type}:${operation.target.id}`);
    if (!target) throw new Error('TARGET_NOT_EDITABLE');
    operation.target = { ...operation.target, ...target };
  }
  const current = await fetchCurrentPermissions(instanceUrl, sid, apiVersion, operations, targets);
  const results = operations.map((operation) => {
    const existing = current.get(permissionOperationKey(operation));
    return { ...buildPermissionPreview(operation, existing?.permissions || {}), recordId: existing?.id || null };
  });
  return { summary: summarizePermissionResults(results), results };
}

function permissionBody(operation) {
  const map = operation.resource.type === 'field' ? REST_FIELD_FIELDS : REST_OBJECT_FIELDS;
  return Object.fromEntries(Object.entries(map).map(([key, apiName]) => [apiName, operation.final[key] === true]));
}

function compositeRequestForOperation(operation, index, apiVersion) {
  const sobject = operation.resource.type === 'field' ? 'FieldPermissions' : 'ObjectPermissions';
  const body = permissionBody(operation);
  const remove = !!operation.recordId && !Object.values(operation.final || {}).some(Boolean);
  if (!operation.recordId) {
    body.ParentId = operation.target.parentId;
    body.SobjectType = operation.resource.objectApiName;
    if (operation.resource.type === 'field') {
      body.Field = `${operation.resource.objectApiName}.${operation.resource.fieldApiName}`;
    }
  }
  const request = {
    method: remove ? 'DELETE' : operation.recordId ? 'PATCH' : 'POST',
    url: operation.recordId
      ? `/services/data/v${apiVersion}/sobjects/${sobject}/${operation.recordId}`
      : `/services/data/v${apiVersion}/sobjects/${sobject}`,
    referenceId: `permissionAccess${index}`
  };
  if (!remove) request.body = body;
  return request;
}

function compositeError(response) {
  const body = response?.body;
  if (Array.isArray(body)) return body.map((item) => item?.message || item?.errorCode).filter(Boolean).join('; ');
  return safeError(body || `HTTP_${response?.httpStatusCode || 0}`);
}

export async function applyPermissionSetOperations(instanceUrl, sid, apiVersion, operations, deps = {}) {
  const request = deps.restRequestWithSid || restRequestWithSid;
  const results = [];
  const pending = orderPermissionOperations(operations.filter((operation) => operation.status !== 'unchanged'));
  results.push(...operations.filter((operation) => operation.status === 'unchanged').map((operation) => ({
    ...operation, status: 'unchanged'
  })));
  for (const block of chunks(pending)) {
    const compositeRequest = block.map((operation, index) => compositeRequestForOperation(operation, index, apiVersion));
    try {
      const response = await request(instanceUrl, sid, 'POST', `/services/data/v${apiVersion}/composite`, {
        body: JSON.stringify({ allOrNone: false, compositeRequest })
      });
      const responses = response?.json?.compositeResponse || [];
      block.forEach((operation, index) => {
        const item = responses[index];
        const ok = response?.ok && item && item.httpStatusCode >= 200 && item.httpStatusCode < 300;
        results.push({
          ...operation,
          status: ok ? 'success' : 'failed',
          error: ok ? null : compositeError(item || response),
          salesforceError: ok ? null : (item?.body || response?.json || null)
        });
      });
    } catch (error) {
      results.push(...block.map((operation) => ({ ...operation, status: 'failed', error: safeError(error) })));
    }
  }
  return results;
}

function escapeXml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function boolTag(name, value) {
  return `        <${name}>${value === true}</${name}>`;
}

export function patchProfilePermissionXml(xml, operations) {
  let output = String(xml || '');
  for (const operation of orderPermissionOperations(operations)) {
    const isField = operation.resource.type === 'field';
    const container = isField ? 'fieldPermissions' : 'objectPermissions';
    const identityTag = isField ? 'field' : 'object';
    const identity = isField
      ? `${operation.resource.objectApiName}.${operation.resource.fieldApiName}`
      : operation.resource.objectApiName;
    const identityPattern = escapeRegExp(escapeXml(identity));
    const blockPattern = new RegExp(
      `\\s*<${container}>(?:(?!<\\/${container}>)[\\s\\S])*?<${identityTag}>\\s*${identityPattern}\\s*<\\/${identityTag}>(?:(?!<\\/${container}>)[\\s\\S])*?<\\/${container}>`,
      'i'
    );
    const body = isField
      ? [
          boolTag('editable', operation.final.edit),
          `        <field>${escapeXml(identity)}</field>`,
          boolTag('readable', operation.final.read)
        ]
      : [
          boolTag('allowCreate', operation.final.create),
          boolTag('allowDelete', operation.final.delete),
          boolTag('allowEdit', operation.final.edit),
          boolTag('allowRead', operation.final.read),
          boolTag('modifyAllRecords', operation.final.modifyAllRecords),
          `        <object>${escapeXml(identity)}</object>`,
          boolTag('viewAllFields', operation.final.viewAllFields),
          boolTag('viewAllRecords', operation.final.viewAllRecords)
        ];
    const block = `\n    <${container}>\n${body.join('\n')}\n    </${container}>`;
    if (blockPattern.test(output)) output = output.replace(blockPattern, block);
    else output = output.replace(/\s*<\/Profile>\s*$/i, `${block}\n</Profile>`);
  }
  return output;
}

export function buildProfilePermissionPackageXml(profileName, operations, apiVersion = '63.0') {
  const fields = [...new Set(operations.filter((item) => item.resource.type === 'field')
    .map((item) => `${item.resource.objectApiName}.${item.resource.fieldApiName}`))];
  const objects = [...new Set(operations.map((item) => item.resource.objectApiName))];
  const types = [
    `<types><members>${escapeXml(profileName)}</members><name>Profile</name></types>`,
    ...objects.map((name) => `<types><members>${escapeXml(name)}</members><name>CustomObject</name></types>`),
    ...(fields.length ? [`<types>${fields.map((name) => `<members>${escapeXml(name)}</members>`).join('')}<name>CustomField</name></types>`] : [])
  ];
  return `<?xml version="1.0" encoding="UTF-8"?><Package xmlns="http://soap.sforce.com/2006/04/metadata">${types.join('')}<version>${apiVersionString(apiVersion)}</version></Package>`;
}

async function retrieveAndPatchProfile(instanceUrl, sid, apiVersion, profileName, operations, deps) {
  const retrieve = deps.retrievePackageXmlZip || retrievePackageXmlZip;
  const makeZip = deps.createMetadataZipBase64 || createMetadataZipBase64;
  const manifest = buildProfilePermissionPackageXml(profileName, operations, apiVersion);
  const retrieved = await retrieve(instanceUrl, sid, apiVersion, manifest);
  const bytes = decodeZipBase64(retrieved.zipBase64);
  const entries = getZipEntries(bytes) || [];
  const files = {};
  let profilePath = '';
  for (const entry of entries) {
    if (String(entry.fileName).endsWith('/')) continue;
    const content = await extractZipFileContent(bytes, entry);
    if (content == null) continue;
    const path = String(entry.fileName).replace(/^unpackaged\//, '');
    files[path] = content;
    if (/^profiles\/[^/]+\.profile(?:-meta\.xml)?$/i.test(path)) profilePath = path;
  }
  if (!profilePath) throw new Error('PROFILE_XML_NOT_FOUND');
  files[profilePath] = patchProfilePermissionXml(files[profilePath], operations);
  files['package.xml'] = manifest;
  return makeZip(files);
}

async function deployProfileGroup(instanceUrl, sid, apiVersion, group, deps, results, archives) {
  const deploy = deps.deployAndWait || deployAndWait;
  try {
    const zipBase64 = await retrieveAndPatchProfile(instanceUrl, sid, apiVersion, group[0].target.name, group, deps);
    const deployment = await deploy(instanceUrl, sid, apiVersion, zipBase64, {
      rollbackOnError: true,
      singlePackage: true,
      testLevel: 'NoTestRun'
    });
    if (deployment.success) {
      archives.push({ asyncId: deployment.asyncId || null, zipBase64 });
      results.push(...group.map((operation) => ({
        ...operation, status: 'success', asyncId: deployment.asyncId || null
      })));
      return;
    }
    throw Object.assign(new Error(deployment.errorMessage || deployment.status || 'PROFILE_DEPLOY_FAILED'), {
      asyncId: deployment.asyncId,
      salesforceError: deployment.componentFailures || null
    });
  } catch (error) {
    if (group.length > 1) {
      const middle = Math.ceil(group.length / 2);
      await deployProfileGroup(instanceUrl, sid, apiVersion, group.slice(0, middle), deps, results, archives);
      await deployProfileGroup(instanceUrl, sid, apiVersion, group.slice(middle), deps, results, archives);
      return;
    }
    results.push({
      ...group[0], status: 'failed', error: safeError(error), asyncId: error?.asyncId || null,
      salesforceError: error?.salesforceError || null
    });
  }
}

export async function applyProfileOperations(instanceUrl, sid, apiVersion, operations, deps = {}) {
  const results = operations.filter((item) => item.status === 'unchanged').map((item) => ({ ...item, status: 'unchanged' }));
  const archives = [];
  const groups = new Map();
  for (const operation of operations.filter((item) => item.status !== 'unchanged')) {
    const key = `${operation.target.id}|${operation.resource.objectApiName}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(operation);
  }
  for (const group of groups.values()) {
    await deployProfileGroup(instanceUrl, sid, apiVersion, orderPermissionOperations(group), deps, results, archives);
  }
  return { results, archives };
}

export async function applyPermissionAccessBatch(instanceUrl, sid, apiVersion, rawOperations, deps = {}) {
  const preview = deps.preview
    ? await deps.preview(instanceUrl, sid, apiVersion, rawOperations)
    : await previewPermissionAccess(instanceUrl, sid, apiVersion, rawOperations);
  const permissionSetOperations = preview.results.filter((item) => item.target.type === 'PermissionSet');
  const profileOperations = preview.results.filter((item) => item.target.type === 'Profile');
  const permissionSetResults = await applyPermissionSetOperations(instanceUrl, sid, apiVersion, permissionSetOperations, deps);
  const profileResult = await applyProfileOperations(instanceUrl, sid, apiVersion, profileOperations, deps);
  const byId = new Map([...permissionSetResults, ...profileResult.results].map((item) => [item.operationId, item]));
  const results = preview.results.map((item) => byId.get(item.operationId) || {
    ...item, status: 'failed', error: 'MISSING_RESULT'
  });
  return { summary: summarizePermissionResults(results), results, archives: profileResult.archives };
}
