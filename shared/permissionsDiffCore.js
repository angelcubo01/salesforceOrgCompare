/** Campos booleanos comparables en ObjectPermissions (REST/SOQL). */
export const OBJECT_PERMISSION_BOOL_FIELDS = [
  'PermissionsCreate',
  'PermissionsRead',
  'PermissionsEdit',
  'PermissionsDelete',
  'PermissionsViewAllRecords',
  'PermissionsModifyAllRecords'
];

/** Campos booleanos en FieldPermissions. */
export const FIELD_PERMISSION_BOOL_FIELDS = ['PermissionsRead', 'PermissionsEdit'];

/**
 * @param {Record<string, unknown>} row
 * @returns {Record<string, boolean>}
 */
export function normalizeObjectPermission(row) {
  const key = String(row?.SobjectType || row?.SObjectType || '').trim();
  /** @type {Record<string, boolean>} */
  const out = { SobjectType: key };
  for (const f of OBJECT_PERMISSION_BOOL_FIELDS) {
    out[f] = !!row?.[f];
  }
  return { key, ...out };
}

/**
 * @param {Record<string, unknown>} row
 */
export function normalizeFieldPermission(row) {
  const sobject = String(row?.SobjectType || '').trim();
  const field = String(row?.Field || '').trim();
  const key = field.includes('.') ? field : sobject && field ? `${sobject}.${field}` : field || sobject;
  /** @type {Record<string, boolean>} */
  const flags = {};
  for (const f of FIELD_PERMISSION_BOOL_FIELDS) {
    flags[f] = !!row?.[f];
  }
  return { key, SobjectType: sobject, Field: field, ...flags };
}

/**
 * @param {Record<string, unknown>} row
 */
export function normalizeSetupEntityAccess(row) {
  const type = String(row?.SetupEntityType || '').trim();
  const id = String(row?.SetupEntityId || '').trim();
  const name = String(row?.SetupEntityName || '').trim();
  const key = `${type}:${id}`;
  return { key, SetupEntityType: type, SetupEntityId: id, SetupEntityName: name };
}

/**
 * Etiqueta legible para filas de Setup (tipo + nombre API; sin repetir el Id si hay nombre).
 * @param {{ SetupEntityType?: string, SetupEntityId?: string, SetupEntityName?: string }} rec
 * @param {(type: string) => string} [typeLabel]
 */
export function formatSetupEntityLabel(rec, typeLabel = (t) => t) {
  const type = String(rec?.SetupEntityType || '').trim();
  const id = String(rec?.SetupEntityId || '').trim();
  const name = String(rec?.SetupEntityName || '').trim();
  const typeText = type ? typeLabel(type) : '';
  if (name) {
    return typeText ? `${typeText}: ${name}` : name;
  }
  if (type && id) {
    const short =
      id.length > 12 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
    return typeText ? `${typeText} (${short})` : `${type}:${id}`;
  }
  return type || id || '—';
}

/**
 * @param {Record<string, boolean>} rec
 * @param {string[]} fields
 */
function boolSignature(rec, fields) {
  return fields.map((f) => (rec[f] ? '1' : '0')).join('');
}

/**
 * @param {Record<string, boolean>} a
 * @param {Record<string, boolean>} b
 * @param {string[]} fields
 */
export function boolFieldsEqual(a, b, fields) {
  return boolSignature(a, fields) === boolSignature(b, fields);
}

/**
 * @param {Record<string, unknown>} leftRec
 * @param {Record<string, unknown>} rightRec
 * @param {string[]} fields
 * @returns {{ field: string, left: boolean, right: boolean }[]}
 */
export function diffBoolFields(leftRec, rightRec, fields) {
  /** @type {{ field: string, left: boolean, right: boolean }[]} */
  const changes = [];
  for (const f of fields) {
    const l = !!leftRec?.[f];
    const r = !!rightRec?.[f];
    if (l !== r) changes.push({ field: f, left: l, right: r });
  }
  return changes;
}

/**
 * Diff genérico por clave.
 * @template T extends { key: string }
 * @param {T[]} leftRows
 * @param {T[]} rightRows
 * @param {(a: T, b: T) => boolean} isEqual
 */
export function diffByKey(leftRows, rightRows, isEqual) {
  const leftMap = new Map(leftRows.map((r) => [r.key, r]));
  const rightMap = new Map(rightRows.map((r) => [r.key, r]));
  const keys = [...new Set([...leftMap.keys(), ...rightMap.keys()])].filter(Boolean).sort((a, b) =>
    a.localeCompare(b)
  );

  /** @type {{ key: string, status: 'same'|'leftOnly'|'rightOnly'|'diff', left: T|null, right: T|null }[]} */
  const rows = [];
  let same = 0;
  let leftOnly = 0;
  let rightOnly = 0;
  let diff = 0;

  for (const key of keys) {
    const left = leftMap.get(key) || null;
    const right = rightMap.get(key) || null;
    let status;
    if (left && !right) {
      status = 'leftOnly';
      leftOnly++;
    } else if (!left && right) {
      status = 'rightOnly';
      rightOnly++;
    } else if (left && right && !isEqual(left, right)) {
      status = 'diff';
      diff++;
    } else {
      status = 'same';
      same++;
    }
    rows.push({ key, status, left, right });
  }

  return { rows, summary: { same, leftOnly, rightOnly, diff, total: keys.length } };
}

/**
 * @param {ReturnType<typeof normalizeObjectPermission>[]} left
 * @param {ReturnType<typeof normalizeObjectPermission>[]} right
 */
export function diffObjectPermissions(left, right) {
  return diffByKey(left, right, (a, b) =>
    boolFieldsEqual(a, b, OBJECT_PERMISSION_BOOL_FIELDS)
  );
}

/**
 * @param {ReturnType<typeof normalizeFieldPermission>[]} left
 * @param {ReturnType<typeof normalizeFieldPermission>[]} right
 */
export function diffFieldPermissions(left, right) {
  return diffByKey(left, right, (a, b) => boolFieldsEqual(a, b, FIELD_PERMISSION_BOOL_FIELDS));
}

/**
 * @param {ReturnType<typeof normalizeSetupEntityAccess>[]} left
 * @param {ReturnType<typeof normalizeSetupEntityAccess>[]} right
 */
export function diffSetupEntityAccess(left, right) {
  return diffByKey(left, right, (a, b) => a.SetupEntityType === b.SetupEntityType && a.SetupEntityId === b.SetupEntityId);
}

/**
 * @param {{ objectPermissions?: unknown[], fieldPermissions?: unknown[], setupEntityAccess?: unknown[] }} payload
 */
export function buildPermissionDiffBundle(payload) {
  const objectPermissions = (payload.objectPermissions || []).map(normalizeObjectPermission);
  const fieldPermissions = (payload.fieldPermissions || []).map(normalizeFieldPermission);
  const setupEntityAccess = (payload.setupEntityAccess || []).map(normalizeSetupEntityAccess);
  return { objectPermissions, fieldPermissions, setupEntityAccess };
}

/**
 * @param {ReturnType<typeof buildPermissionDiffBundle>} left
 * @param {ReturnType<typeof buildPermissionDiffBundle>} right
 */
export function comparePermissionBundles(left, right) {
  return {
    objectPermissions: diffObjectPermissions(left.objectPermissions, right.objectPermissions),
    fieldPermissions: diffFieldPermissions(left.fieldPermissions, right.fieldPermissions),
    setupEntityAccess: diffSetupEntityAccess(left.setupEntityAccess, right.setupEntityAccess)
  };
}

/** Etiquetas cortas para columnas de permisos de objeto. */
export const OBJECT_PERMISSION_LABELS = {
  PermissionsCreate: 'C',
  PermissionsRead: 'R',
  PermissionsEdit: 'E',
  PermissionsDelete: 'D',
  PermissionsViewAllRecords: 'ViewAll',
  PermissionsModifyAllRecords: 'ModAll'
};

export const FIELD_PERMISSION_LABELS = {
  PermissionsRead: 'R',
  PermissionsEdit: 'E'
};

/**
 * @param {Record<string, boolean>} rec
 * @param {string[]} fields
 * @param {Record<string, string>} labels
 */
export function formatBoolFlags(rec, fields, labels) {
  return fields
    .filter((f) => rec[f])
    .map((f) => labels[f] || f)
    .join(', ') || '—';
}

/** @param {Record<string, boolean>} rec @param {string[]} fields */
export function hasAnyBoolPerm(rec, fields) {
  return fields.some((f) => !!rec[f]);
}

/**
 * @param {{ containerType: string, name: string, label?: string, viaPermissionSet?: string }} meta
 */
export function containerAccessKey(meta) {
  const prefix = meta.containerType === 'Profile' ? 'Profile' : 'PermissionSet';
  return `${prefix}:${meta.name}`;
}

/**
 * @param {string} raw p. ej. `Account.Name` o `Account`
 * @returns {{ resourceType: 'object'|'field', objectApiName: string, fieldApiName: string|null, fieldQualified: string|null }}
 */
export function parseResourceInput(raw, resourceType) {
  const text = String(raw || '').trim();
  if (resourceType === 'object') {
    const objectApiName = text.includes('.') ? text.split('.')[0].trim() : text;
    return { resourceType: 'object', objectApiName, fieldApiName: null, fieldQualified: null };
  }
  if (text.includes('.')) {
    const [objectApiName, ...rest] = text.split('.');
    const fieldPart = rest.join('.').trim();
    const fieldQualified = fieldPart.includes('.') ? fieldPart : `${objectApiName.trim()}.${fieldPart}`;
    return {
      resourceType: 'field',
      objectApiName: objectApiName.trim(),
      fieldApiName: fieldPart.includes('.') ? fieldPart.split('.').pop() : fieldPart,
      fieldQualified
    };
  }
  return {
    resourceType: 'field',
    objectApiName: '',
    fieldApiName: text,
    fieldQualified: text || null
  };
}

/**
 * @param {Record<string, unknown>} row
 * @param {{ containerType: string, name: string, label?: string, viaPermissionSet?: string }} container
 */
export function normalizeObjectAccessGrant(row, container) {
  const perms = normalizeObjectPermission(row);
  return {
    key: containerAccessKey(container),
    containerType: container.containerType,
    containerName: container.name,
    containerLabel: container.label || '',
    viaPermissionSet: container.viaPermissionSet || '',
    SobjectType: perms.SobjectType,
    ...Object.fromEntries(OBJECT_PERMISSION_BOOL_FIELDS.map((f) => [f, perms[f]]))
  };
}

/**
 * @param {Record<string, unknown>} row
 * @param {{ containerType: string, name: string, label?: string, viaPermissionSet?: string }} container
 */
export function normalizeFieldAccessGrant(row, container) {
  const perms = normalizeFieldPermission(row);
  return {
    key: containerAccessKey(container),
    containerType: container.containerType,
    containerName: container.name,
    containerLabel: container.label || '',
    viaPermissionSet: container.viaPermissionSet || '',
    SobjectType: perms.SobjectType,
    Field: perms.Field,
    ...Object.fromEntries(FIELD_PERMISSION_BOOL_FIELDS.map((f) => [f, perms[f]]))
  };
}

/**
 * @param {{ grants: ReturnType<typeof normalizeObjectAccessGrant>[] }} payload
 */
export function buildAccessByResourceBundle(payload) {
  return { grants: payload.grants || [] };
}

/**
 * @param {ReturnType<typeof buildAccessByResourceBundle>} left
 * @param {ReturnType<typeof buildAccessByResourceBundle>} right
 * @param {'object'|'field'} resourceType
 */
export function compareAccessByResourceBundles(left, right, resourceType) {
  const fields = resourceType === 'field' ? FIELD_PERMISSION_BOOL_FIELDS : OBJECT_PERMISSION_BOOL_FIELDS;
  return diffByKey(left.grants, right.grants, (a, b) => boolFieldsEqual(a, b, fields));
}

/**
 * @param {{ containerType: string, name: string, viaPermissionSet?: string }} container
 */
export function normalizeCustomPermAssignment(container) {
  return {
    key: containerAccessKey(container),
    containerType: container.containerType,
    containerName: container.name,
    viaPermissionSet: container.viaPermissionSet || ''
  };
}

/**
 * @param {{ grants: ReturnType<typeof normalizeCustomPermAssignment>[] }} payload
 */
export function buildCustomPermAssignmentBundle(payload) {
  return { grants: payload.grants || [] };
}

/**
 * @param {ReturnType<typeof buildCustomPermAssignmentBundle>} left
 * @param {ReturnType<typeof buildCustomPermAssignmentBundle>} right
 */
export function compareCustomPermAssignmentBundles(left, right) {
  return diffByKey(left.grants, right.grants, () => true);
}

