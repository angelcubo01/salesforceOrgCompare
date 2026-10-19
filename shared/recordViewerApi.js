import {
  restDescribeSobject,
  restGetSobject,
  restQuery,
  restRequestWithSid,
  fetchSessionUserId
} from './salesforceApi.js';
import { resolveObjectFromRecordId } from './recordCompareApi.js';

function escapeSoql(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const OBJECT_PERMISSION_FIELDS = Object.freeze({
  read: 'PermissionsRead',
  create: 'PermissionsCreate',
  edit: 'PermissionsEdit',
  delete: 'PermissionsDelete',
  viewall: 'PermissionsViewAllRecords',
  modall: 'PermissionsModifyAllRecords'
});

const FIELD_PERMISSION_FIELDS = Object.freeze({
  read: 'PermissionsRead',
  edit: 'PermissionsEdit'
});

function uniquePermissionSources(sources) {
  return [...new Map(sources.map((source) => [`${source.type}:${source.name}`, source])).values()];
}

async function fetchRecordViewerPermissionParents(instanceUrl, sid, apiVersion) {
  const userId = await fetchSessionUserId(instanceUrl, sid);
  const users = await restQuery(
    instanceUrl, sid, apiVersion,
    `SELECT ProfileId, Profile.Name FROM User WHERE Id = '${escapeSoql(userId)}' LIMIT 1`
  );
  const user = users?.[0];
  if (!user?.ProfileId) return new Map();

  const parentSources = new Map();
  const addSource = (parentId, source) => {
    if (!parentId || !source?.name) return;
    const key = String(parentId);
    const current = parentSources.get(key) || [];
    if (!current.some((item) => item.type === source.type && item.name === source.name)) current.push(source);
    parentSources.set(key, current);
  };
  const profileSets = await restQuery(
    instanceUrl, sid, apiVersion,
    `SELECT Id FROM PermissionSet WHERE IsOwnedByProfile = true AND ProfileId = '${escapeSoql(user.ProfileId)}' LIMIT 1`
  );
  for (const permissionSet of profileSets || []) {
    addSource(permissionSet.Id, { type: 'Profile', name: user.Profile?.Name || String(user.ProfileId) });
  }

  const assignments = await restQuery(
    instanceUrl, sid, apiVersion,
    `SELECT PermissionSetId, PermissionSet.Name, PermissionSet.Label, PermissionSet.IsOwnedByProfile, PermissionSet.Type,
      PermissionSetGroupId, PermissionSetGroup.DeveloperName, PermissionSetGroup.MasterLabel
     FROM PermissionSetAssignment WHERE AssigneeId = '${escapeSoql(userId)}'`
  );
  const groups = new Map();
  for (const assignment of assignments || []) {
    if (assignment.PermissionSetGroupId) {
      const source = {
        type: 'PermissionSetGroup',
        name: assignment.PermissionSetGroup?.MasterLabel || assignment.PermissionSetGroup?.DeveloperName || String(assignment.PermissionSetGroupId)
      };
      if (assignment.PermissionSetId && assignment.PermissionSet?.Type === 'Group') addSource(assignment.PermissionSetId, source);
      else groups.set(String(assignment.PermissionSetGroupId), source);
      continue;
    }
    if (assignment.PermissionSetId && !assignment.PermissionSet?.IsOwnedByProfile) {
      addSource(assignment.PermissionSetId, {
        type: 'PermissionSet',
        name: assignment.PermissionSet?.Label || assignment.PermissionSet?.Name || String(assignment.PermissionSetId)
      });
    }
  }
  if (groups.size) {
    const groupIds = [...groups.keys()].map((id) => `'${escapeSoql(id)}'`).join(',');
    const components = await restQuery(
      instanceUrl, sid, apiVersion,
      `SELECT PermissionSetGroupId, PermissionSetId FROM PermissionSetGroupComponent WHERE PermissionSetGroupId IN (${groupIds})`
    );
    for (const component of components || []) addSource(component.PermissionSetId, groups.get(String(component.PermissionSetGroupId)));
  }
  return parentSources;
}

/** Devuelve los perfiles y Permission Sets efectivos que conceden un permiso puntual. */
export async function fetchRecordViewerPermissionSources(instanceUrl, sid, apiVersion, objectApiName, resourceType, fieldName, permission) {
  const type = resourceType === 'field' ? 'field' : 'object';
  const permissionField = type === 'field' ? FIELD_PERMISSION_FIELDS[permission] : OBJECT_PERMISSION_FIELDS[permission];
  if (!permissionField) return [];
  const parentSources = await fetchRecordViewerPermissionParents(instanceUrl, sid, apiVersion);
  const parentIds = [...parentSources.keys()];
  if (!parentIds.length) return [];
  const parentList = parentIds.map((id) => `'${escapeSoql(id)}'`).join(',');
  const objectFilter = `SobjectType = '${escapeSoql(objectApiName)}' AND ParentId IN (${parentList})`;
  const rows = type === 'field'
    ? await restQuery(
      instanceUrl, sid, apiVersion,
      `SELECT ParentId, PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE ${objectFilter} AND Field = '${escapeSoql(`${objectApiName}.${fieldName}`)}'`
    )
    : await restQuery(
      instanceUrl, sid, apiVersion,
      `SELECT ParentId, PermissionsCreate, PermissionsRead, PermissionsEdit, PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords FROM ObjectPermissions WHERE ${objectFilter}`
    );
  const grantedParentIds = new Set((rows || []).filter((row) => row[permissionField] === true).map((row) => String(row.ParentId)));
  // En Salesforce, muchos campos (sobre todo est\u00e1ndar) no tienen una fila de
  // FieldPermissions expl\u00edcita. Su acceso efectivo procede del permiso sobre el
  // objeto, por lo que incluimos tambi\u00e9n esas fuentes en el detalle del campo.
  if (type === 'field') {
    const objectRows = await restQuery(
      instanceUrl, sid, apiVersion,
      `SELECT ParentId, PermissionsRead, PermissionsEdit FROM ObjectPermissions WHERE ${objectFilter}`
    );
    for (const row of objectRows || []) {
      if (row[permissionField] === true) grantedParentIds.add(String(row.ParentId));
    }
  }
  if (type === 'object' && (permission === 'viewall' || permission === 'modall')) {
    const globalField = permission === 'viewall' ? 'PermissionsViewAllData' : 'PermissionsModifyAllData';
    const permissionSets = await restQuery(
      instanceUrl, sid, apiVersion,
      `SELECT Id, ${globalField} FROM PermissionSet WHERE Id IN (${parentList})`
    );
    for (const permissionSet of permissionSets || []) {
      if (permissionSet[globalField] === true) grantedParentIds.add(String(permissionSet.Id));
    }
  }
  return uniquePermissionSources([...grantedParentIds].flatMap((parentId) => parentSources.get(parentId) || []));
}

function normalizeRecordAccess(access) {
  if (!access || typeof access !== 'object') return null;
  return {
    HasReadAccess: access.HasReadAccess === true,
    HasEditAccess: access.HasEditAccess === true,
    HasDeleteAccess: access.HasDeleteAccess === true,
    HasTransferAccess: access.HasTransferAccess === true,
    MaxAccessLevel: String(access.MaxAccessLevel || '')
  };
}

/**
 * UserRecordAccess es la fuente de verdad para el sharing del registro. La
 * relación contextual sirve de fallback para sesiones que no permiten la
 * consulta directa del objeto UserRecordAccess.
 */
async function fetchEffectiveRecordAccess(instanceUrl, sid, apiVersion, objectApiName, recordId) {
  try {
    const userId = await fetchSessionUserId(instanceUrl, sid);
    const rows = await restQuery(
      instanceUrl,
      sid,
      apiVersion,
      `SELECT RecordId, HasReadAccess, HasEditAccess, HasDeleteAccess, HasTransferAccess, MaxAccessLevel FROM UserRecordAccess WHERE UserId = '${escapeSoql(userId)}' AND RecordId = '${escapeSoql(recordId)}' LIMIT 1`
    );
    if (rows?.[0]) return normalizeRecordAccess(rows[0]);
  } catch {
    // Probamos la relación del registro para el usuario de la sesión.
  }

  try {
    const rows = await restQuery(
      instanceUrl,
      sid,
      apiVersion,
      `SELECT Id, UserRecordAccess.HasReadAccess, UserRecordAccess.HasEditAccess, UserRecordAccess.HasDeleteAccess, UserRecordAccess.HasTransferAccess, UserRecordAccess.MaxAccessLevel FROM ${objectApiName} WHERE Id = '${escapeSoql(recordId)}' LIMIT 1`
    );
    return normalizeRecordAccess(rows?.[0]?.UserRecordAccess);
  } catch {
    return null;
  }
}

export async function fetchRecordViewerPayload(instanceUrl, sid, apiVersion, recordId, requestedObjectApiName = '') {
  const objectApiName = requestedObjectApiName || await resolveObjectFromRecordId(instanceUrl, sid, apiVersion, recordId);
  const [describe, record, recordAccess] = await Promise.all([
    restDescribeSobject(instanceUrl, sid, apiVersion, objectApiName),
    restGetSobject(instanceUrl, sid, apiVersion, objectApiName, recordId),
    fetchEffectiveRecordAccess(instanceUrl, sid, apiVersion, objectApiName, recordId)
  ]);
  const objectPermissions = {
    readable: describe?.queryable === true || describe?.retrieveable === true || !!record,
    createable: describe?.createable === true,
    updateable: describe?.updateable === true,
    deletable: describe?.deletable === true
  };

  // DescribeSObjectResult solo incluye campos visibles según el FLS efectivo
  // del usuario. `accessible` no forma parte del Field describe de REST.
  const fields = (Array.isArray(describe?.fields) ? describe.fields : []).map((field) => ({
    ...field,
    accessible: true,
    valuePresent: Object.prototype.hasOwnProperty.call(record || {}, field.name)
  }));

  return {
    objectApiName,
    objectLabel: String(describe?.label || objectApiName),
    describe: { ...describe, fields },
    record: record || {},
    objectPermissions,
    recordAccess
  };
}

/**
 * Resuelve de forma segura una cadena de lookups partiendo del registro que
 * está abierto. Cada salto se valida contra el describe efectivo y usa el Id
 * presente en el registro; el cliente no puede inyectar un registro arbitrario.
 */
export async function resolveRecordViewerTarget(instanceUrl, sid, apiVersion, rootRecordId, rawPath = []) {
  const path = Array.isArray(rawPath) ? rawPath.map((part) => String(part || '').trim()).filter(Boolean) : [];
  if (path.length > 5) {
    const error = new Error('Relationship path is too deep');
    error.code = 'RELATION_PATH_TOO_DEEP';
    throw error;
  }
  let target = await fetchRecordViewerPayload(instanceUrl, sid, apiVersion, rootRecordId);
  for (const fieldName of path) {
    const field = (target.describe?.fields || []).find((candidate) => candidate.name === fieldName);
    if (!field || field.type !== 'reference' || field.accessible === false) {
      const error = new Error(`Invalid relationship field: ${fieldName}`);
      error.code = 'INVALID_RELATION_FIELD';
      throw error;
    }
    const relatedId = target.record?.[fieldName];
    if (!relatedId) {
      const error = new Error(`Empty relationship field: ${fieldName}`);
      error.code = 'EMPTY_RELATION';
      throw error;
    }
    const referenceTo = Array.isArray(field.referenceTo) ? field.referenceTo.filter(Boolean) : [];
    const relatedObject = referenceTo.length === 1
      ? String(referenceTo[0])
      : await resolveObjectFromRecordId(instanceUrl, sid, apiVersion, relatedId);
    target = await fetchRecordViewerPayload(instanceUrl, sid, apiVersion, relatedId, relatedObject);
  }
  return target;
}

/** View All / Modify All se informa cuando la sesión puede consultar Setup. */
export async function fetchViewAllPermissions(instanceUrl, sid, apiVersion, objectApiName) {
  try {
    const userId = await fetchSessionUserId(instanceUrl, sid);
    const [assignments, users] = await Promise.all([
      restQuery(instanceUrl, sid, apiVersion, `SELECT PermissionSetId FROM PermissionSetAssignment WHERE AssigneeId = '${escapeSoql(userId)}'`),
      restQuery(instanceUrl, sid, apiVersion, `SELECT ProfileId FROM User WHERE Id = '${escapeSoql(userId)}' LIMIT 1`)
    ]);
    const assignedIds = (assignments || []).map((row) => String(row.PermissionSetId || '')).filter(Boolean);
    const profileId = String(users?.[0]?.ProfileId || '');
    const conditions = [];
    if (assignedIds.length) conditions.push(`Id IN (${assignedIds.map((id) => `'${escapeSoql(id)}'`).join(',')})`);
    if (profileId) conditions.push(`ProfileId = '${escapeSoql(profileId)}'`);
    if (!conditions.length) return { viewAll: null, modifyAll: null };

    const permissionSets = await restQuery(
      instanceUrl,
      sid,
      apiVersion,
      `SELECT Id, PermissionsViewAllData, PermissionsModifyAllData FROM PermissionSet WHERE ${conditions.join(' OR ')}`
    );
    const ids = (permissionSets || []).map((row) => String(row.Id || '')).filter(Boolean);
    const rows = ids.length ? await restQuery(
      instanceUrl,
      sid,
      apiVersion,
      `SELECT PermissionsViewAllRecords, PermissionsModifyAllRecords FROM ObjectPermissions WHERE SobjectType = '${escapeSoql(objectApiName)}' AND ParentId IN (${ids.map((id) => `'${escapeSoql(id)}'`).join(',')})`
    ) : [];
    return {
      viewAll: permissionSets.some((row) => row.PermissionsViewAllData === true) || rows.some((row) => row.PermissionsViewAllRecords === true),
      modifyAll: permissionSets.some((row) => row.PermissionsModifyAllData === true) || rows.some((row) => row.PermissionsModifyAllRecords === true)
    };
  } catch {
    return { viewAll: null, modifyAll: null };
  }
}

export async function patchRecordViewerRecord(instanceUrl, sid, apiVersion, objectApiName, recordId, fields, ifUnmodifiedSince) {
  const parsedDate = ifUnmodifiedSince ? new Date(ifUnmodifiedSince) : null;
  const headers = parsedDate && Number.isFinite(parsedDate.getTime())
    ? { 'If-Unmodified-Since': parsedDate.toUTCString() }
    : {};
  return restRequestWithSid(
    instanceUrl,
    sid,
    'PATCH',
    `/services/data/v${apiVersion}/sobjects/${encodeURIComponent(objectApiName)}/${encodeURIComponent(recordId)}`,
    { headers, body: JSON.stringify(fields) }
  );
}

/** Ejecuta varios PATCH como una única transacción Composite allOrNone. */
export async function patchRecordViewerRecords(instanceUrl, sid, apiVersion, updates) {
  const safeUpdates = Array.isArray(updates) ? updates.slice(0, 25) : [];
  if (safeUpdates.length === 1) {
    const update = safeUpdates[0];
    const result = await patchRecordViewerRecord(
      instanceUrl,
      sid,
      apiVersion,
      update.objectApiName,
      update.recordId,
      update.fields,
      update.lastModifiedDate
    );
    return { ok: result.ok, status: result.status, errors: result.ok ? [] : (result.json || []) };
  }
  const compositeRequest = safeUpdates.map((update, index) => ({
    method: 'PATCH',
    url: `/services/data/v${apiVersion}/sobjects/${encodeURIComponent(update.objectApiName)}/${encodeURIComponent(update.recordId)}`,
    referenceId: `recordViewerUpdate${index + 1}`,
    body: update.fields
  }));
  const result = await restRequestWithSid(
    instanceUrl,
    sid,
    'POST',
    `/services/data/v${apiVersion}/composite`,
    { body: JSON.stringify({ allOrNone: true, compositeRequest }) }
  );
  if (!result.ok) return { ok: false, status: result.status, errors: result.json || [] };
  const responses = Array.isArray(result.json?.compositeResponse) ? result.json.compositeResponse : [];
  const failed = responses.filter((response) => Number(response?.httpStatusCode || 0) >= 400);
  return {
    ok: failed.length === 0 && responses.length === compositeRequest.length,
    status: failed[0]?.httpStatusCode || result.status,
    errors: failed.flatMap((response) => Array.isArray(response.body) ? response.body : [response.body]).filter(Boolean)
  };
}
