import {
  restQuery,
  restQueryAll,
  restDescribeGlobal,
  restDescribeSobject
} from './salesforceApi.js';
import {
  hasAnyBoolPerm,
  OBJECT_PERMISSION_BOOL_FIELDS,
  FIELD_PERMISSION_BOOL_FIELDS,
  normalizeObjectAccessGrant,
  normalizeFieldAccessGrant,
  normalizeCustomPermAssignment,
  parseResourceInput
} from './permissionsDiffCore.js';

function escapeSoqlLiteral(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function soqlLikePattern(userText) {
  return `%${escapeSoqlLiteral(String(userText || '').trim())}%`;
}

/** Excluye custom settings de búsquedas de objetos (modo recurso / resolución). */
function isDataObjectDescribeEntry(entry) {
  if (!entry) return false;
  if (entry.customSetting === true) return false;
  const name = String(entry.name || entry.QualifiedApiName || '').trim();
  return !!name && !name.endsWith('__mdt');
}

function isDataObjectEntityRow(row) {
  if (!row) return false;
  if (row.IsCustomSetting === true) return false;
  const name = String(row.QualifiedApiName || '').trim();
  return !!name && !name.endsWith('__mdt');
}

/**
 * @template T
 * @param {string} query
 * @param {T[]} candidates
 * @param {(row: T) => string} getName
 */
function pickBestMatch(query, candidates, getName) {
  if (!candidates?.length) return null;
  if (candidates.length === 1) return candidates[0];
  const q = String(query || '').trim().toLowerCase();
  const exact = candidates.find((c) => getName(c).toLowerCase() === q);
  if (exact) return exact;
  const prefix = candidates.find((c) => getName(c).toLowerCase().startsWith(q));
  if (prefix) return prefix;
  return candidates[0];
}

const OBJECT_PERMISSIONS_SOQL = `SELECT SobjectType,
  PermissionsCreate, PermissionsRead, PermissionsEdit, PermissionsDelete,
  PermissionsViewAllRecords, PermissionsModifyAllRecords
  FROM ObjectPermissions WHERE ParentId = `;

const FIELD_PERMISSIONS_SOQL = `SELECT SobjectType, Field, PermissionsRead, PermissionsEdit
  FROM FieldPermissions WHERE ParentId = `;

const SETUP_ENTITY_SOQL = `SELECT SetupEntityType, SetupEntityId FROM SetupEntityAccess WHERE ParentId = `;

/**
 * Consulta SOQL por tipo de entidad de setup para resolver Id → nombre legible.
 * @type {Record<string, { object: string, nameField: string, altNameField?: string }>}
 */
const SETUP_ENTITY_NAME_QUERIES = {
  ApexClass: { object: 'ApexClass', nameField: 'Name' },
  ApexPage: { object: 'ApexPage', nameField: 'Name' },
  ApexComponent: { object: 'ApexComponent', nameField: 'Name' },
  ApexTrigger: { object: 'ApexTrigger', nameField: 'Name' },
  CustomTab: { object: 'CustomTab', nameField: 'Name' },
  TabSet: { object: 'TabSet', nameField: 'Name' },
  CustomApplication: { object: 'CustomApplication', nameField: 'DeveloperName' },
  // SetupEntityId de custom settings / CMT = EntityDefinition.DurableId (prefijo 01I), no EntityDefinition.Id
  CustomEntityDefinition: {
    object: 'EntityDefinition',
    nameField: 'QualifiedApiName',
    altNameField: 'Label',
    idField: 'DurableId'
  },
  FlowDefinition: { object: 'FlowDefinition', nameField: 'ApiName', altNameField: 'Label' },
  ServicePresenceStatus: { object: 'ServicePresenceStatus', nameField: 'DeveloperName', altNameField: 'MasterLabel' },
  CustomPermission: { object: 'CustomPermission', nameField: 'DeveloperName', altNameField: 'MasterLabel' },
  ConnectedApplication: { object: 'ConnectedApplication', nameField: 'Name' },
  ExternalCredential: { object: 'ExternalCredential', nameField: 'DeveloperName', altNameField: 'MasterLabel' },
  ExternalCredentialParameter: { object: 'ExternalCredentialParameter', nameField: 'ParameterName' },
  NamedCredential: { object: 'NamedCredential', nameField: 'DeveloperName', altNameField: 'MasterLabel' },
  CustomMetadataType: {
    object: 'EntityDefinition',
    nameField: 'QualifiedApiName',
    altNameField: 'Label',
    idField: 'DurableId'
  },
  ServiceProvider: { object: 'ServiceProvider', nameField: 'DeveloperName' },
  CustomFieldDefinition: { object: 'FieldDefinition', nameField: 'QualifiedApiName' },
  RecordType: { object: 'RecordType', nameField: 'DeveloperName', altNameField: 'Name' }
};

/**
 * @param {Record<string, unknown>[]} rows
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function enrichSetupEntityAccessNames(instanceUrl, sid, apiVersion, rows) {
  if (!rows?.length) return rows || [];

  /** @type {Map<string, string[]>} */
  const idsByType = new Map();
  for (const row of rows) {
    const type = String(row.SetupEntityType || '').trim();
    const id = String(row.SetupEntityId || '').trim();
    if (!type || !id) continue;
    if (!idsByType.has(type)) idsByType.set(type, []);
    idsByType.get(type).push(id);
  }

  /** @type {Map<string, string>} */
  const nameByCompositeKey = new Map();

  for (const [type, ids] of idsByType) {
    const uniqueIds = [...new Set(ids)];
    const cfg = SETUP_ENTITY_NAME_QUERIES[type];
    if (cfg) {
      const resolved = await querySetupEntityNames(instanceUrl, sid, apiVersion, cfg, uniqueIds);
      for (const [id, name] of resolved) {
        nameByCompositeKey.set(`${type}:${id}`, name);
      }
    }
  }

  const unresolved = rows.filter((row) => {
    const type = String(row.SetupEntityType || '').trim();
    const id = String(row.SetupEntityId || '').trim();
    return type && id && !nameByCompositeKey.has(`${type}:${id}`);
  });
  if (unresolved.length) {
    const entityIds = [
      ...new Set(
        unresolved
          .map((r) => String(r.SetupEntityId || '').trim())
          .filter((id) => /^[a-zA-Z0-9]{15,18}$/.test(id))
      )
    ];
    if (entityIds.length) {
      const durableIds = entityIds.filter((id) => id.startsWith('01I'));
      const fromEntity = durableIds.length
        ? await querySetupEntityNames(
            instanceUrl,
            sid,
            apiVersion,
            {
              object: 'EntityDefinition',
              nameField: 'QualifiedApiName',
              altNameField: 'Label',
              idField: 'DurableId'
            },
            durableIds
          )
        : new Map();
      for (const row of unresolved) {
        const type = String(row.SetupEntityType || '').trim();
        const id = String(row.SetupEntityId || '').trim();
        const name = fromEntity.get(id);
        if (name) nameByCompositeKey.set(`${type}:${id}`, name);
      }
    }
  }

  return rows.map((row) => {
    const type = String(row.SetupEntityType || '').trim();
    const id = String(row.SetupEntityId || '').trim();
    const SetupEntityName = nameByCompositeKey.get(`${type}:${id}`) || '';
    return SetupEntityName ? { ...row, SetupEntityName } : row;
  });
}

/**
 * @param {{ object: string, nameField: string, altNameField?: string, idField?: string }} cfg
 * @param {string[]} ids
 * @returns {Promise<Map<string, string>>}
 */
async function querySetupEntityNames(instanceUrl, sid, apiVersion, cfg, ids) {
  /** @type {Map<string, string>} */
  const out = new Map();
  const matchField = cfg.idField || 'Id';
  const selectFields = [...new Set([matchField, cfg.nameField, cfg.altNameField].filter(Boolean))];

  for (const chunk of chunkIds(ids, 80)) {
    const inList = chunk.map((id) => `'${escapeSoqlLiteral(id)}'`).join(',');
    try {
      const rows =
        (await restQuery(
          instanceUrl,
          sid,
          apiVersion,
          `SELECT ${selectFields.join(', ')} FROM ${cfg.object} WHERE ${matchField} IN (${inList})`
        )) || [];
      for (const row of rows) {
        const name = String(row[cfg.nameField] || row[cfg.altNameField] || '').trim();
        const matchId = String(row[matchField] || '');
        if (matchId && name) out.set(matchId, name);
      }
    } catch {
      /* tipo no consultable en esta org/API */
    }
  }
  return out;
}

/**
 * Resuelve el Id contenedor (Profile o Permission Set) para consultar permisos hijos.
 * @param {'Profile'|'PermissionSet'} containerType
 */
export async function resolvePermissionContainer(instanceUrl, sid, apiVersion, containerType, containerName) {
  const raw = String(containerName || '').trim();
  if (!raw) {
    throw new Error('Container name is required');
  }
  const exact = escapeSoqlLiteral(raw);
  const like = soqlLikePattern(raw);

  if (containerType === 'Profile') {
    let rows =
      (await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Id, Name FROM Profile WHERE Name = '${exact}' LIMIT 1`
      )) || [];
    if (!rows.length) {
      rows =
        (await restQuery(
          instanceUrl,
          sid,
          apiVersion,
          `SELECT Id, Name FROM Profile WHERE Name LIKE '${like}' ORDER BY Name LIMIT 25`
        )) || [];
    }
    const best = pickBestMatch(raw, rows, (r) => r.Name);
    if (!best) throw new Error(`Profile not found: ${containerName}`);
    return { parentId: best.Id, containerType: 'Profile', name: best.Name };
  }

  let rows =
    (await restQuery(
      instanceUrl,
      sid,
      apiVersion,
      `SELECT Id, Name, Label, IsOwnedByProfile FROM PermissionSet WHERE IsOwnedByProfile = false AND Name = '${exact}' LIMIT 1`
    )) || [];
  if (!rows.length) {
    rows =
      (await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Id, Name, IsOwnedByProfile FROM PermissionSet WHERE IsOwnedByProfile = false AND Name LIKE '${like}' ORDER BY Name LIMIT 25`
      )) || [];
  }
  if (!rows.length) {
    rows =
      (await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Id, Name, Label, IsOwnedByProfile FROM PermissionSet WHERE Name = '${exact}' LIMIT 1`
      )) || [];
  }
  const best = pickBestMatch(raw, rows, (r) => r.Name);
  if (!best) throw new Error(`Permission set not found: ${containerName}`);
  if (best.IsOwnedByProfile) {
    throw new Error(
      'Use Profile container type for profile-owned permission sets, or enter a custom permission set API name.'
    );
  }
  return {
    parentId: best.Id,
    containerType: 'PermissionSet',
    name: best.Name
  };
}

/**
 * Resuelve nombre de objeto (exacto o LIKE en EntityDefinition / describe global).
 */
export async function resolveObjectApiName(instanceUrl, sid, apiVersion, input) {
  const raw = String(input || '').trim();
  const base = raw.includes('.') ? raw.split('.')[0].trim() : raw;
  if (!base) throw new Error('Object name is required');
  const exact = escapeSoqlLiteral(base);
  const like = soqlLikePattern(base);

  try {
    let rows =
      (await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT QualifiedApiName, IsCustomSetting FROM EntityDefinition WHERE IsCustomSetting = false AND QualifiedApiName = '${exact}' LIMIT 1`
      )) || [];
    if (!rows.length) {
      rows =
        (await restQuery(
          instanceUrl,
          sid,
          apiVersion,
          `SELECT QualifiedApiName, IsCustomSetting FROM EntityDefinition WHERE IsCustomSetting = false AND QualifiedApiName LIKE '${like}' ORDER BY QualifiedApiName LIMIT 25`
        )) || [];
    }
    const best = pickBestMatch(
      base,
      rows.filter(isDataObjectEntityRow),
      (r) => r.QualifiedApiName
    );
    if (best?.QualifiedApiName) return best.QualifiedApiName;
  } catch {
    /* describe global */
  }

  const lower = base.toLowerCase();
  const globals = await restDescribeGlobal(instanceUrl, sid, apiVersion);
  const matches = globals.filter(
    (s) => isDataObjectDescribeEntry(s) && String(s.name || '').toLowerCase().includes(lower)
  );
  const best = pickBestMatch(
    base,
    matches,
    (s) => String(s.name || '')
  );
  if (!best?.name) throw new Error(`Object not found: ${input}`);
  return best.name;
}

/**
 * @returns {{ objectApiName: string, fieldQualified: string, fieldApiName: string }}
 */
export async function resolveFieldQualifiedName(instanceUrl, sid, apiVersion, input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Field name is required');

  if (raw.includes('.')) {
    const objectApiName = await resolveObjectApiName(instanceUrl, sid, apiVersion, raw);
    const parts = raw.split('.');
    const fieldPart = parts.slice(1).join('.').trim();
    const fieldApiName = fieldPart.includes('.') ? fieldPart.split('.').pop() : fieldPart;
    const fieldQualified = fieldPart.includes('.') ? fieldPart : `${objectApiName}.${fieldApiName}`;
    return { objectApiName, fieldQualified, fieldApiName };
  }

  const like = soqlLikePattern(raw);
  try {
    const rows =
      (await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT QualifiedApiName, EntityDefinition.QualifiedApiName FROM FieldDefinition WHERE QualifiedApiName LIKE '${like}' ORDER BY EntityDefinition.QualifiedApiName, QualifiedApiName LIMIT 25`
      )) || [];
    const best = pickBestMatch(raw, rows, (r) => `${r.EntityDefinition?.QualifiedApiName || ''}.${r.QualifiedApiName}`);
    if (best) {
      const objectApiName = best.EntityDefinition?.QualifiedApiName || '';
      const fieldApiName = best.QualifiedApiName || '';
      return {
        objectApiName,
        fieldApiName,
        fieldQualified: `${objectApiName}.${fieldApiName}`
      };
    }
  } catch {
    /* describe por objeto no aplicable sin objeto */
  }

  throw new Error(`Field not found: ${input}`);
}

/**
 * @param {'Profile'|'PermissionSet'} containerType
 */
export async function searchPermissionContainers(instanceUrl, sid, apiVersion, containerType, queryText) {
  const q = String(queryText || '').trim();
  if (!q.length) return [];
  const like = soqlLikePattern(q);
  if (containerType === 'Profile') {
    return (
      (await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Name FROM Profile WHERE Name LIKE '${like}' ORDER BY Name LIMIT 40`
      )) || []
    ).map((r) => ({ kind: 'container', name: r.Name, containerType: 'Profile' }));
  }
  return (
    (await restQuery(
      instanceUrl,
      sid,
      apiVersion,
      `SELECT Name FROM PermissionSet WHERE IsOwnedByProfile = false AND Name LIKE '${like}' ORDER BY Name LIMIT 40`
    )) || []
  ).map((r) => ({
    kind: 'container',
    name: r.Name,
    containerType: 'PermissionSet'
  }));
}

/**
 * Búsqueda interactiva unificada (contenedores, objetos y campos).
 * @param {{ mode?: 'container'|'resource'|'all', containerType?: string, resourceType?: 'object'|'field' }} scope
 */
export async function searchPermissionDiffInteractive(
  instanceUrl,
  sid,
  apiVersion,
  queryText,
  scope = {}
) {
  const q = String(queryText || '').trim();
  if (!q.length) return [];
  const mode = scope.mode || 'all';
  const out = [];

  if (mode === 'container' || mode === 'all') {
    const ct = scope.containerType === 'Profile' ? 'Profile' : scope.containerType === 'PermissionSet' ? 'PermissionSet' : null;
    if (ct === 'Profile' || !ct) {
      out.push(...(await searchPermissionContainers(instanceUrl, sid, apiVersion, 'Profile', q)));
    }
    if (ct === 'PermissionSet' || !ct) {
      out.push(...(await searchPermissionContainers(instanceUrl, sid, apiVersion, 'PermissionSet', q)));
    }
  }

  if (mode === 'resource' || mode === 'all') {
    const rt = scope.resourceType === 'field' ? 'field' : scope.resourceType === 'object' ? 'object' : null;
    if (!rt || rt === 'object') {
      const objects = await searchPermissionResources(instanceUrl, sid, apiVersion, 'object', q);
      out.push(...objects.map((o) => ({ kind: 'object', name: o.name })));
    }
    if (!rt || rt === 'field') {
      const objectApiName = q.includes('.') ? q.split('.')[0] : '';
      const fields = await searchPermissionResources(instanceUrl, sid, apiVersion, 'field', q, objectApiName);
      out.push(...fields.map((f) => ({ kind: 'field', name: f.name })));
    }
  }

  const seen = new Set();
  return out.filter((item) => {
    const key = `${item.kind}:${item.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 50);
}

/**
 * Carga ObjectPermissions, FieldPermissions y SetupEntityAccess vía REST (sin retrieve XML).
 * @param {'Profile'|'PermissionSet'} containerType
 */
export async function fetchPermissionContainerData(
  instanceUrl,
  sid,
  apiVersion,
  containerType,
  containerName
) {
  const container = await resolvePermissionContainer(
    instanceUrl,
    sid,
    apiVersion,
    containerType,
    containerName
  );
  const parentId = escapeSoqlLiteral(container.parentId);
  const [objectPermissions, fieldPermissions, setupRows] = await Promise.all([
    restQueryAll(instanceUrl, sid, apiVersion, `${OBJECT_PERMISSIONS_SOQL}'${parentId}'`),
    restQueryAll(instanceUrl, sid, apiVersion, `${FIELD_PERMISSIONS_SOQL}'${parentId}'`),
    restQueryAll(instanceUrl, sid, apiVersion, `${SETUP_ENTITY_SOQL}'${parentId}'`)
  ]);
  const setupEntityAccess = await enrichSetupEntityAccessNames(
    instanceUrl,
    sid,
    apiVersion,
    setupRows || []
  );
  return {
    container,
    objectPermissions: objectPermissions || [],
    fieldPermissions: fieldPermissions || [],
    setupEntityAccess: setupEntityAccess || []
  };
}

function chunkIds(ids, size = 200) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/**
 * @param {string[]} parentIds
 * @returns {Promise<Map<string, { containerType: string, name: string, label?: string, viaPermissionSet?: string }>>}
 */
export async function resolveParentContainers(instanceUrl, sid, apiVersion, parentIds) {
  const map = new Map();
  const unique = [...new Set(parentIds.filter(Boolean))];
  for (const chunk of chunkIds(unique)) {
    const inList = chunk.map((id) => `'${escapeSoqlLiteral(id)}'`).join(',');
    const profiles =
      (await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Id, Name FROM Profile WHERE Id IN (${inList})`
      )) || [];
    for (const p of profiles) {
      map.set(p.Id, { containerType: 'Profile', name: p.Name });
    }
    const missing = chunk.filter((id) => !map.has(id));
    if (!missing.length) continue;
    const inList2 = missing.map((id) => `'${escapeSoqlLiteral(id)}'`).join(',');
    const psets =
      (await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Id, Name, Label, IsOwnedByProfile, Profile.Name FROM PermissionSet WHERE Id IN (${inList2})`
      )) || [];
    for (const ps of psets) {
      if (ps.IsOwnedByProfile && ps.Profile?.Name) {
        map.set(ps.Id, {
          containerType: 'Profile',
          name: ps.Profile.Name,
          viaPermissionSet: ps.Name
        });
      } else {
        map.set(ps.Id, {
          containerType: 'PermissionSet',
          name: ps.Name,
          label: ps.Label
        });
      }
    }
  }
  return map;
}

/**
 * @param {'object'|'field'} resourceType
 * @param {string} resourceInput
 * @param {{ containerFilter?: 'all'|'Profile'|'PermissionSet' }} [opts]
 */
export async function fetchAccessByResource(
  instanceUrl,
  sid,
  apiVersion,
  resourceType,
  resourceInput,
  opts = {}
) {
  const parsed = parseResourceInput(resourceInput, resourceType);
  const filter = opts.containerFilter || 'all';

  if (resourceType === 'object') {
    const objectApiName = await resolveObjectApiName(instanceUrl, sid, apiVersion, resourceInput);
    const obj = escapeSoqlLiteral(objectApiName);
    const rows =
      (await restQueryAll(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT ParentId, SobjectType, PermissionsCreate, PermissionsRead, PermissionsEdit, PermissionsDelete,
          PermissionsViewAllRecords, PermissionsModifyAllRecords
          FROM ObjectPermissions WHERE SobjectType = '${obj}'`
      )) || [];
    const parentMap = await resolveParentContainers(
      instanceUrl,
      sid,
      apiVersion,
      rows.map((r) => r.ParentId)
    );
    /** @type {ReturnType<typeof normalizeObjectAccessGrant>[]} */
    const grants = [];
    for (const row of rows) {
      const container = parentMap.get(row.ParentId);
      if (!container) continue;
      if (filter !== 'all' && container.containerType !== filter) continue;
      const grant = normalizeObjectAccessGrant(row, container);
      if (!hasAnyBoolPerm(grant, OBJECT_PERMISSION_BOOL_FIELDS)) continue;
      grants.push(grant);
    }
    grants.sort((a, b) => a.key.localeCompare(b.key));
    return {
      resourceType: 'object',
      resourceName: objectApiName,
      grants
    };
  }

  const resolved = await resolveFieldQualifiedName(instanceUrl, sid, apiVersion, resourceInput);
  const fieldEsc = escapeSoqlLiteral(resolved.fieldQualified);
  const objEsc = escapeSoqlLiteral(resolved.objectApiName);
  const fieldOnlyEsc = escapeSoqlLiteral(resolved.fieldApiName);
  const where = `(Field = '${fieldEsc}' OR (SobjectType = '${objEsc}' AND Field = '${fieldOnlyEsc}'))`;
  const rows =
    (await restQueryAll(
      instanceUrl,
      sid,
      apiVersion,
      `SELECT ParentId, SobjectType, Field, PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE ${where}`
    )) || [];
  const parentMap = await resolveParentContainers(
    instanceUrl,
    sid,
    apiVersion,
    rows.map((r) => r.ParentId)
  );
  /** @type {ReturnType<typeof normalizeFieldAccessGrant>[]} */
  const grants = [];
  for (const row of rows) {
    const container = parentMap.get(row.ParentId);
    if (!container) continue;
    if (filter !== 'all' && container.containerType !== filter) continue;
    const grant = normalizeFieldAccessGrant(row, container);
    if (!hasAnyBoolPerm(grant, FIELD_PERMISSION_BOOL_FIELDS)) continue;
    grants.push(grant);
  }
  grants.sort((a, b) => a.key.localeCompare(b.key));
  return {
    resourceType: 'field',
    resourceName: resolved.fieldQualified,
    grants
  };
}

/**
 * @param {'object'|'field'} resourceType
 */
export async function searchPermissionResources(
  instanceUrl,
  sid,
  apiVersion,
  resourceType,
  queryText,
  objectApiName = ''
) {
  const q = String(queryText || '').trim();
  if (!q.length) return [];

  if (resourceType === 'object') {
    const like = soqlLikePattern(q);
    try {
      const rows =
        (await restQuery(
          instanceUrl,
          sid,
          apiVersion,
          `SELECT QualifiedApiName, IsCustomSetting FROM EntityDefinition WHERE IsCustomSetting = false AND QualifiedApiName LIKE '${like}' ORDER BY QualifiedApiName LIMIT 40`
        )) || [];
      const dataObjects = rows.filter(isDataObjectEntityRow);
      if (dataObjects.length) {
        return dataObjects.map((r) => ({ name: r.QualifiedApiName }));
      }
    } catch {
      /* fallback describe global */
    }
    const lower = q.toLowerCase();
    const globals = await restDescribeGlobal(instanceUrl, sid, apiVersion);
    return globals
      .filter((s) => {
        const n = String(s.name || '');
        return isDataObjectDescribeEntry(s) && n.toLowerCase().includes(lower);
      })
      .slice(0, 40)
      .map((s) => ({ name: s.name }));
  }

  const obj = String(objectApiName || '').trim() || (q.includes('.') ? q.split('.')[0] : '');
  if (!obj && q.includes('.')) {
    const [o, ...rest] = q.split('.');
    return searchPermissionResources(instanceUrl, sid, apiVersion, 'field', rest.join('.'), o.trim());
  }

  const fieldTerm = q.includes('.') ? q.split('.').slice(1).join('.') : q;
  const fieldLike = soqlLikePattern(fieldTerm);
  try {
    let rows = [];
    if (obj) {
      const objEsc = escapeSoqlLiteral(obj);
      rows =
        (await restQuery(
          instanceUrl,
          sid,
          apiVersion,
          `SELECT QualifiedApiName, EntityDefinition.QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objEsc}' AND QualifiedApiName LIKE '${fieldLike}' ORDER BY QualifiedApiName LIMIT 40`
        )) || [];
    }
    if (!rows.length) {
      rows =
        (await restQuery(
          instanceUrl,
          sid,
          apiVersion,
          `SELECT QualifiedApiName, EntityDefinition.QualifiedApiName FROM FieldDefinition WHERE QualifiedApiName LIKE '${fieldLike}' ORDER BY EntityDefinition.QualifiedApiName, QualifiedApiName LIMIT 40`
        )) || [];
    }
    if (rows.length) {
      return rows.map((r) => {
        const objName = r.EntityDefinition?.QualifiedApiName || obj || '';
        return {
          name: objName ? `${objName}.${r.QualifiedApiName}` : String(r.QualifiedApiName || '')
        };
      });
    }
  } catch {
    /* fallback describe */
  }
  if (!obj) return [];
  const desc = await restDescribeSobject(instanceUrl, sid, apiVersion, obj);
  const fields = Array.isArray(desc.fields) ? desc.fields : [];
  const lower = q.toLowerCase();
  return fields
    .filter((f) => {
      const n = String(f.name || '');
      return n.toLowerCase().includes(lower) || `${obj}.${n}`.toLowerCase().includes(lower);
    })
    .slice(0, 40)
    .map((f) => ({ name: `${obj}.${f.name}` }));
}

/**
 * @param {string} queryText
 */
export async function searchCustomPermissions(instanceUrl, sid, apiVersion, queryText) {
  const q = String(queryText || '').trim();
  if (!q.length) return [];
  const like = soqlLikePattern(q);
  const rows =
    (await restQuery(
      instanceUrl,
      sid,
      apiVersion,
      `SELECT Id, DeveloperName FROM CustomPermission WHERE DeveloperName LIKE '${like}' ORDER BY DeveloperName LIMIT 40`
    )) || [];
  return rows.map((r) => ({ name: r.DeveloperName, id: r.Id }));
}

/**
 * @returns {{ id: string, developerName: string }}
 */
export async function resolveCustomPermission(instanceUrl, sid, apiVersion, input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Custom permission name is required');
  const exact = escapeSoqlLiteral(raw);
  const like = soqlLikePattern(raw);

  let rows =
    (await restQuery(
      instanceUrl,
      sid,
      apiVersion,
      `SELECT Id, DeveloperName FROM CustomPermission WHERE DeveloperName = '${exact}' LIMIT 1`
    )) || [];
  if (!rows.length) {
    rows =
      (await restQuery(
        instanceUrl,
        sid,
        apiVersion,
        `SELECT Id, DeveloperName FROM CustomPermission WHERE DeveloperName LIKE '${like}' ORDER BY DeveloperName LIMIT 25`
      )) || [];
  }
  const best = pickBestMatch(raw, rows, (r) => r.DeveloperName);
  if (!best?.Id) throw new Error(`Custom permission not found: ${input}`);
  return { id: best.Id, developerName: best.DeveloperName };
}

/**
 * Perfiles y conjuntos que incluyen el permiso personalizado.
 * @param {{ containerFilter?: 'all'|'Profile'|'PermissionSet' }} [opts]
 */
export async function fetchAssignmentsForCustomPermission(
  instanceUrl,
  sid,
  apiVersion,
  customPermissionInput,
  opts = {}
) {
  const cp = await resolveCustomPermission(instanceUrl, sid, apiVersion, customPermissionInput);
  const cpId = escapeSoqlLiteral(cp.id);
  const filter = opts.containerFilter || 'all';

  const rows =
    (await restQueryAll(
      instanceUrl,
      sid,
      apiVersion,
      `SELECT ParentId FROM SetupEntityAccess WHERE SetupEntityType = 'CustomPermission' AND SetupEntityId = '${cpId}'`
    )) || [];

  const parentMap = await resolveParentContainers(
    instanceUrl,
    sid,
    apiVersion,
    rows.map((r) => r.ParentId)
  );

  /** @type {ReturnType<typeof normalizeCustomPermAssignment>[]} */
  const grants = [];
  for (const row of rows) {
    const container = parentMap.get(row.ParentId);
    if (!container) continue;
    if (filter !== 'all' && container.containerType !== filter) continue;
    grants.push(normalizeCustomPermAssignment(container));
  }
  grants.sort((a, b) => a.key.localeCompare(b.key));

  return {
    customPermissionName: cp.developerName,
    grants
  };
}
