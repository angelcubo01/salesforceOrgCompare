export const PERMISSION_ACCESS_TARGET_TYPES = Object.freeze(['PermissionSet', 'Profile']);
export const OBJECT_PERMISSION_KEYS = Object.freeze([
  'read',
  'create',
  'edit',
  'delete',
  'viewAllRecords',
  'modifyAllRecords',
  'viewAllFields'
]);
export const FIELD_PERMISSION_KEYS = Object.freeze(['read', 'edit']);
export const PERMISSION_ACCESS_STATES = Object.freeze(['keep', 'grant', 'revoke']);

const MAX_OPERATIONS = 2000;

function asBoolean(value) {
  return value === true;
}

function normalizeState(value) {
  if (value === true || value === 'grant') return 'grant';
  if (value === false || value === 'revoke') return 'revoke';
  return 'keep';
}

export function permissionKeysForResource(resource) {
  return resource?.type === 'field' ? FIELD_PERMISSION_KEYS : OBJECT_PERMISSION_KEYS;
}

export function applyPermissionDependencies(resource, permissions = {}) {
  const keys = permissionKeysForResource(resource);
  const result = Object.fromEntries(keys.map((key) => [key, asBoolean(permissions[key])]));

  if (resource?.type === 'field') {
    if (result.edit) result.read = true;
    if (!result.read) result.edit = false;
    return result;
  }

  if (result.modifyAllRecords) {
    result.read = true;
    result.create = true;
    result.edit = true;
    result.delete = true;
    result.viewAllRecords = true;
  }
  if (
    result.create || result.edit || result.delete || result.viewAllRecords ||
    result.modifyAllRecords || result.viewAllFields
  ) {
    result.read = true;
  }
  if (!result.read) {
    for (const key of keys) result[key] = false;
  }
  return result;
}

export function resolveDesiredPermissions(resource, current = {}, desired = {}) {
  const keys = permissionKeysForResource(resource);
  const next = Object.fromEntries(keys.map((key) => [key, asBoolean(current[key])]));
  for (const key of keys) {
    const state = normalizeState(desired[key]);
    if (state === 'grant') next[key] = true;
    if (state === 'revoke') next[key] = false;
  }
  // Una retirada explícita de Read prevalece sobre cualquier permiso que lo
  // requiera; es la única forma inequívoca de expresar el cascade en la UI.
  if (normalizeState(desired.read) === 'revoke') {
    for (const key of keys) next[key] = false;
  }
  return applyPermissionDependencies(resource, next);
}

export function resourceKey(resource) {
  const objectApiName = String(resource?.objectApiName || '').trim();
  return resource?.type === 'field'
    ? `field:${objectApiName}.${String(resource?.fieldApiName || '').trim()}`
    : `object:${objectApiName}`;
}

export function targetKey(target) {
  return `${String(target?.type || '')}:${String(target?.id || target?.name || '')}`;
}

export function permissionOperationKey(operation) {
  return `${targetKey(operation?.target)}|${resourceKey(operation?.resource)}`;
}

function normalizeTarget(target) {
  const type = String(target?.type || '');
  const id = String(target?.id || '').trim();
  const name = String(target?.name || '').trim();
  if (!PERMISSION_ACCESS_TARGET_TYPES.includes(type)) throw new Error('INVALID_TARGET_TYPE');
  if (!id && !name) throw new Error('MISSING_TARGET');
  return { type, id, name, label: String(target?.label || name || id) };
}

function normalizeResource(resource) {
  const type = resource?.type === 'field' ? 'field' : 'object';
  const objectApiName = String(resource?.objectApiName || '').trim();
  const fieldApiName = type === 'field' ? String(resource?.fieldApiName || '').trim() : '';
  if (!objectApiName) throw new Error('MISSING_OBJECT');
  if (type === 'field' && !fieldApiName) throw new Error('MISSING_FIELD');
  return { type, objectApiName, ...(fieldApiName ? { fieldApiName } : {}) };
}

export function normalizePermissionOperation(operation, index = 0) {
  const target = normalizeTarget(operation?.target);
  const resource = normalizeResource(operation?.resource);
  const keys = permissionKeysForResource(resource);
  const desired = {};
  for (const key of keys) desired[key] = normalizeState(operation?.desired?.[key]);
  const operationId = String(operation?.operationId || '').trim() || `permission-access-${index + 1}`;
  return { operationId, target, resource, desired };
}

export function normalizePermissionOperations(operations) {
  if (!Array.isArray(operations)) throw new Error('INVALID_OPERATIONS');
  if (operations.length > MAX_OPERATIONS) throw new Error('TOO_MANY_OPERATIONS');
  const seenIds = new Set();
  const seenResources = new Set();
  return operations.map((operation, index) => {
    const normalized = normalizePermissionOperation(operation, index);
    if (seenIds.has(normalized.operationId)) throw new Error('DUPLICATE_OPERATION_ID');
    seenIds.add(normalized.operationId);
    const key = permissionOperationKey(normalized);
    if (seenResources.has(key)) throw new Error('DUPLICATE_OPERATION_RESOURCE');
    seenResources.add(key);
    return normalized;
  });
}

export function diffPermissionState(resource, current, final) {
  const changes = {};
  for (const key of permissionKeysForResource(resource)) {
    if (asBoolean(current?.[key]) !== asBoolean(final?.[key])) {
      changes[key] = { current: asBoolean(current?.[key]), final: asBoolean(final?.[key]) };
    }
  }
  return changes;
}

export function buildPermissionPreview(operation, current = {}) {
  const normalizedCurrent = applyPermissionDependencies(operation.resource, current);
  const final = resolveDesiredPermissions(operation.resource, normalizedCurrent, operation.desired);
  const changes = diffPermissionState(operation.resource, normalizedCurrent, final);
  return {
    ...operation,
    current: normalizedCurrent,
    final,
    changes,
    status: Object.keys(changes).length ? 'pending' : 'unchanged'
  };
}

export function summarizePermissionResults(results = []) {
  const summary = { total: results.length, applied: 0, unchanged: 0, failed: 0 };
  for (const result of results) {
    if (result?.status === 'success' || result?.status === 'applied') summary.applied += 1;
    else if (result?.status === 'unchanged' || result?.status === 'skipped') summary.unchanged += 1;
    else if (result?.status === 'failed') summary.failed += 1;
  }
  return summary;
}

export function orderPermissionOperations(operations = []) {
  const rank = (operation) => {
    const isObject = operation?.resource?.type === 'object';
    const finalRead = operation?.final?.read;
    if (isObject && finalRead) return 0;
    if (!isObject) return 1;
    return 2;
  };
  return [...operations].sort((left, right) => rank(left) - rank(right));
}
