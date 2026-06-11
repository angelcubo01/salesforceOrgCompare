/**
 * Dependency Explorer: búsqueda lazy, análisis MetadataComponentDependency, agrupación y compare.
 */

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_LIMIT = 50;
export const IN_CHUNK_SIZE = 100;
export const MAX_BFS_ITERATIONS = 50;
export const MAX_NODES = 5000;
export const MAX_REFERENCED_BY_FETCH_NODES = 400;
export const MAX_REFERENCED_BY_PER_ITEM = 20;

const DEP_SELECT =
  'MetadataComponentId, MetadataComponentName, MetadataComponentType, RefMetadataComponentName, RefMetadataComponentType, RefMetadataComponentId, RefMetadataComponentNamespace';

/** @typedef {{ id: string, labelKey: string, toolingEntity: string, nameField: string, componentType: string, listMetadataType?: string, postFilter?: (row: Record<string, unknown>) => boolean }} DepSeedType */

/** @type {DepSeedType[]} */
export const DEP_EXPLORER_SEED_TYPES = [
  {
    id: 'apexClass',
    labelKey: 'depExplorer.type.apexClass',
    toolingEntity: 'ApexClass',
    nameField: 'Name',
    componentType: 'ApexClass'
  },
  {
    id: 'apexTrigger',
    labelKey: 'depExplorer.type.apexTrigger',
    toolingEntity: 'ApexTrigger',
    nameField: 'Name',
    componentType: 'ApexTrigger',
    listMetadataType: 'ApexTrigger'
  },
  {
    id: 'apexPage',
    labelKey: 'depExplorer.type.apexPage',
    toolingEntity: 'ApexPage',
    nameField: 'Name',
    componentType: 'ApexPage',
    listMetadataType: 'ApexPage'
  },
  {
    id: 'apexComponent',
    labelKey: 'depExplorer.type.apexComponent',
    toolingEntity: 'ApexComponent',
    nameField: 'Name',
    componentType: 'ApexComponent',
    listMetadataType: 'ApexComponent'
  },
  {
    id: 'aura',
    labelKey: 'depExplorer.type.aura',
    toolingEntity: 'AuraDefinitionBundle',
    nameField: 'DeveloperName',
    componentType: 'AuraDefinitionBundle',
    listMetadataType: 'AuraDefinitionBundle'
  },
  {
    id: 'lwc',
    labelKey: 'depExplorer.type.lwc',
    toolingEntity: 'LightningComponentBundle',
    nameField: 'DeveloperName',
    componentType: 'LightningComponentBundle',
    listMetadataType: 'LightningComponentBundle'
  },
  {
    id: 'layout',
    labelKey: 'depExplorer.type.layout',
    toolingEntity: 'Layout',
    nameField: 'Name',
    componentType: 'Layout',
    listMetadataType: 'Layout'
  },
  {
    id: 'flexiPage',
    labelKey: 'depExplorer.type.flexiPage',
    toolingEntity: 'FlexiPage',
    nameField: 'DeveloperName',
    componentType: 'FlexiPage',
    listMetadataType: 'FlexiPage'
  },
  {
    id: 'customObject',
    labelKey: 'depExplorer.type.customObject',
    toolingEntity: 'CustomObject',
    nameField: 'DeveloperName',
    componentType: 'CustomObject',
    listMetadataType: 'CustomObject',
    postFilter: (row) => !String(row.DeveloperName || row.fullName || '').endsWith('__mdt')
  },
  {
    id: 'customMetadata',
    labelKey: 'depExplorer.type.customMetadata',
    toolingEntity: 'CustomObject',
    nameField: 'DeveloperName',
    componentType: 'CustomObject',
    listMetadataType: 'CustomObject',
    postFilter: (row) => String(row.DeveloperName || row.fullName || '').endsWith('__mdt')
  },
  {
    id: 'customField',
    labelKey: 'depExplorer.type.customField',
    toolingEntity: 'CustomField',
    nameField: 'DeveloperName',
    componentType: 'CustomField',
    listMetadataType: 'CustomField'
  },
  {
    id: 'globalValueSet',
    labelKey: 'depExplorer.type.globalValueSet',
    toolingEntity: 'GlobalValueSet',
    nameField: 'DeveloperName',
    componentType: 'GlobalValueSet',
    listMetadataType: 'GlobalValueSet'
  },
  {
    id: 'validationRule',
    labelKey: 'depExplorer.type.validationRule',
    toolingEntity: 'ValidationRule',
    nameField: 'ValidationName',
    componentType: 'ValidationRule',
    listMetadataType: 'ValidationRule'
  },
  {
    id: 'flow',
    labelKey: 'depExplorer.type.flow',
    toolingEntity: 'FlowDefinition',
    nameField: 'DeveloperName',
    componentType: 'FlowDefinition',
    listMetadataType: 'Flow'
  },
  {
    id: 'workflowAlert',
    labelKey: 'depExplorer.type.workflowAlert',
    toolingEntity: 'WorkflowAlert',
    nameField: 'DeveloperName',
    componentType: 'WorkflowAlert',
    listMetadataType: 'WorkflowAlert'
  },
  {
    id: 'staticResource',
    labelKey: 'depExplorer.type.staticResource',
    toolingEntity: 'StaticResource',
    nameField: 'Name',
    componentType: 'StaticResource',
    listMetadataType: 'StaticResource'
  },
  {
    id: 'emailTemplate',
    labelKey: 'depExplorer.type.emailTemplate',
    toolingEntity: 'EmailTemplate',
    nameField: 'Name',
    componentType: 'EmailTemplate',
    listMetadataType: 'EmailTemplate'
  },
  {
    id: 'webLink',
    labelKey: 'depExplorer.type.webLink',
    toolingEntity: 'WebLink',
    nameField: 'Name',
    componentType: 'WebLink',
    listMetadataType: 'WebLink'
  }
];

/** Mapeo RefMetadataComponentType → package.xml type name */
export const DEP_TO_PACKAGE_XML = {
  ApexClass: 'ApexClass',
  ApexTrigger: 'ApexTrigger',
  ApexPage: 'ApexPage',
  ApexComponent: 'ApexComponent',
  AuraDefinitionBundle: 'AuraDefinitionBundle',
  LightningComponentBundle: 'LightningComponentBundle',
  Layout: 'Layout',
  FlexiPage: 'FlexiPage',
  CustomObject: 'CustomObject',
  CustomField: 'CustomField',
  GlobalValueSet: 'GlobalValueSet',
  ValidationRule: 'ValidationRule',
  Flow: 'Flow',
  FlowDefinition: 'Flow',
  StaticResource: 'StaticResource',
  EmailTemplate: 'EmailTemplate',
  WebLink: 'WebLink',
  CustomLabel: 'CustomLabel',
  GlobalPicklist: 'GlobalValueSet'
};

export function escapeSoqlLiteral(value) {
  const s = String(value == null ? '' : value);
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function getSeedTypeById(id) {
  return DEP_EXPLORER_SEED_TYPES.find((t) => t.id === id) || null;
}

/** ApexClass sigue con búsqueda Tooling SOQL; el resto usa listMetadata + describe. */
export function usesToolingSearch(typeDef) {
  return typeDef?.id === 'apexClass';
}

/**
 * @param {DepSeedType} typeDef
 */
export function getListMetadataType(typeDef) {
  if (!typeDef || usesToolingSearch(typeDef)) return null;
  return (
    typeDef.listMetadataType ||
    DEP_TO_PACKAGE_XML[typeDef.componentType] ||
    typeDef.componentType ||
    null
  );
}

/**
 * @param {string} fullName
 */
export function parseDottedMetadataFullName(fullName) {
  const fn = String(fullName || '').trim();
  const dot = fn.lastIndexOf('.');
  if (dot < 0) return { parent: '', member: fn };
  return { parent: fn.slice(0, dot), member: fn.slice(dot + 1) };
}

/**
 * @param {Array<{ fullName?: string }>} records
 * @param {DepSeedType} typeDef
 * @param {string} query
 */
export function filterListMetadataForSearch(records, typeDef, query) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < SEARCH_MIN_CHARS) return [];
  let list = (records || []).filter((r) => {
    const fullName = String(r.fullName || '').trim();
    if (!fullName) return false;
    if (!fullName.toLowerCase().includes(q)) return false;
    if (typeDef.postFilter) {
      return typeDef.postFilter({ fullName, DeveloperName: fullName });
    }
    return true;
  });
  list.sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
  return list.slice(0, SEARCH_LIMIT);
}

/**
 * @param {Array<{ fullName?: string, id?: string }>} records
 * @param {DepSeedType} typeDef
 */
export function mapListMetadataRows(records, typeDef) {
  return (records || []).map((r) => {
    const fullName = String(r.fullName || '').trim();
    const id = String(r.id || '').trim();
    let name = fullName;
    let displayName = fullName;
    let tableEnumOrId = null;
    let namespace = null;

    if (typeDef.id === 'customField' || typeDef.id === 'validationRule' || typeDef.id === 'webLink') {
      const { parent, member } = parseDottedMetadataFullName(fullName);
      name = member || fullName;
      tableEnumOrId = parent || null;
      if (parent) displayName = `${parent}.${name}`;
    } else {
      const nsMatch = /^([A-Za-z0-9_]+)__(.+)$/.exec(fullName);
      if (nsMatch && fullName.includes('__') && !fullName.endsWith('__c') && !fullName.endsWith('__mdt')) {
        namespace = nsMatch[1];
        name = fullName;
      }
    }

    return {
      id,
      name,
      fullName,
      displayName,
      namespace,
      type: typeDef.componentType,
      tableEnumOrId
    };
  });
}

/**
 * @param {DepSeedType} typeDef
 * @param {Array<{ id?: string, name?: string, fullName?: string, displayName?: string, tableEnumOrId?: string|null }>} items
 */
export function buildResolveSearchIdsSoql(typeDef, items) {
  const list = (items || []).filter((it) => !it.id);
  if (!list.length) return null;

  if (typeDef.id === 'customField') {
    const conds = list.map((it) => {
      const fullName = it.fullName || it.displayName || '';
      const { parent, member } = parseDottedMetadataFullName(fullName);
      const field = member || it.name || '';
      const obj = parent || it.tableEnumOrId || '';
      return `(DeveloperName = '${escapeSoqlLiteral(field)}' AND TableEnumOrId = '${escapeSoqlLiteral(obj)}')`;
    });
    return `SELECT Id, DeveloperName, TableEnumOrId, NamespacePrefix FROM CustomField WHERE ${conds.join(' OR ')} LIMIT ${SEARCH_LIMIT}`;
  }

  if (typeDef.id === 'validationRule' || typeDef.id === 'workflowAlert') {
    const conds = list.map((it) => {
      const fullName = it.fullName || it.displayName || it.name || '';
      const { parent, member } = parseDottedMetadataFullName(fullName);
      const memberName = member || it.name || '';
      const parentName = parent || it.tableEnumOrId || '';
      const memberCol = typeDef.nameField;
      return `( ${memberCol} = '${escapeSoqlLiteral(memberName)}' AND EntityDefinition.DeveloperName = '${escapeSoqlLiteral(parentName)}' )`;
    });
    return `SELECT Id, ${typeDef.nameField}, EntityDefinition.DeveloperName, NamespacePrefix FROM ${typeDef.toolingEntity} WHERE ${conds.join(' OR ')} LIMIT ${SEARCH_LIMIT}`;
  }

  if (typeDef.id === 'webLink') {
    const conds = list.map((it) => {
      const fullName = it.fullName || it.displayName || it.name || '';
      const { parent, member } = parseDottedMetadataFullName(fullName);
      const memberName = member || it.name || '';
      const parentName = parent || it.tableEnumOrId || '';
      return `( Name = '${escapeSoqlLiteral(memberName)}' AND TableEnumOrId = '${escapeSoqlLiteral(parentName)}' )`;
    });
    return `SELECT Id, Name, TableEnumOrId, NamespacePrefix FROM WebLink WHERE ${conds.join(' OR ')} LIMIT ${SEARCH_LIMIT}`;
  }

  const field = typeDef.nameField;
  const entity = typeDef.toolingEntity;
  const values = [
    ...new Set(
      list.map((it) => {
        if (typeDef.id === 'flow') {
          return String(it.fullName || it.name || '').split('-')[0];
        }
        return String(it.fullName || it.name || '').trim();
      })
    )
  ].filter(Boolean);
  if (!values.length) return null;
  const inList = values.map((v) => `'${escapeSoqlLiteral(v)}'`).join(',');
  return `SELECT Id, ${field}, NamespacePrefix FROM ${entity} WHERE ${field} IN (${inList}) LIMIT ${SEARCH_LIMIT * 2}`;
}

/**
 * @param {Array<{ id?: string, name?: string, fullName?: string, displayName?: string, tableEnumOrId?: string|null, namespace?: string|null, type?: string }>} items
 * @param {unknown[]} rows
 * @param {DepSeedType} typeDef
 */
export function mergeResolvedSearchIds(items, rows, typeDef) {
  const rowList = Array.isArray(rows) ? rows : [];
  /** @type {Map<string, Record<string, unknown>>} */
  const byKey = new Map();

  for (const row of rowList) {
    const id = depIdKey(row.Id);
    if (!id) continue;
    if (typeDef.id === 'customField') {
      const obj = String(row.TableEnumOrId || '');
      const field = String(row.DeveloperName || '');
      byKey.set(`${obj}.${field}`, row);
      continue;
    }
    if (typeDef.id === 'validationRule' || typeDef.id === 'workflowAlert') {
      const obj = String(row.EntityDefinition?.DeveloperName || row.TableEnumOrId || '');
      const member = String(row[typeDef.nameField] || '');
      byKey.set(`${obj}.${member}`, row);
      continue;
    }
    if (typeDef.id === 'webLink') {
      const obj = String(row.TableEnumOrId || '');
      const member = String(row.Name || '');
      byKey.set(`${obj}.${member}`, row);
      continue;
    }
    const val = String(row[typeDef.nameField] || '');
    if (val) byKey.set(val, row);
  }

  return (items || [])
    .map((it) => {
      if (it.id) return it;
      let key = String(it.fullName || it.name || '');
      if (typeDef.id === 'flow') key = key.split('-')[0];
      const row = byKey.get(key);
      if (!row) return { ...it, id: '' };
      return {
        ...it,
        id: depIdKey(row.Id),
        namespace: row.NamespacePrefix ? String(row.NamespacePrefix) : it.namespace || null,
        tableEnumOrId: row.TableEnumOrId ? String(row.TableEnumOrId) : it.tableEnumOrId || null
      };
    })
    .filter((it) => it.id);
}

/**
 * @param {DepSeedType} typeDef
 * @param {Array<{ id?: string, name?: string, fullName?: string, displayName?: string, tableEnumOrId?: string|null, namespace?: string|null, type?: string }>} items
 * @param {(soql: string) => Promise<unknown[]>} queryFn
 */
export async function resolveSearchItemIds(typeDef, items, queryFn) {
  const withId = (items || []).filter((it) => it.id);
  const needsId = (items || []).filter((it) => !it.id);
  if (!needsId.length) return withId;

  const soql = buildResolveSearchIdsSoql(typeDef, needsId);
  if (!soql) return withId;
  const rows = (await queryFn(soql)) || [];
  return [...withId, ...mergeResolvedSearchIds(needsId, rows, typeDef)];
}

/**
 * @param {string} seedTypeId
 * @param {string} query
 * @returns {string|null}
 */
export function buildSearchSoql(seedTypeId, query) {
  const q = String(query || '').trim();
  if (q.length < SEARCH_MIN_CHARS) return null;
  const typeDef = getSeedTypeById(seedTypeId);
  if (!typeDef) return null;
  const esc = escapeSoqlLiteral(q);
  const nameCol = typeDef.nameField;
  const limit = typeDef.postFilter ? SEARCH_LIMIT * 2 : SEARCH_LIMIT;
  if (typeDef.id === 'customField') {
    return `SELECT Id, ${nameCol}, TableEnumOrId, NamespacePrefix FROM ${typeDef.toolingEntity} WHERE ${nameCol} LIKE '%${esc}%' ORDER BY ${nameCol} LIMIT ${limit}`;
  }
  return `SELECT Id, ${nameCol}, NamespacePrefix FROM ${typeDef.toolingEntity} WHERE ${nameCol} LIKE '%${esc}%' ORDER BY ${nameCol} LIMIT ${limit}`;
}

/**
 * @param {unknown[]} rows
 * @param {DepSeedType} typeDef
 */
export function mapSearchRows(rows, typeDef) {
  let list = Array.isArray(rows) ? rows : [];
  if (typeDef.postFilter) {
    list = list.filter((r) => typeDef.postFilter(r));
    list = list.slice(0, SEARCH_LIMIT);
  }
  return list.map((r) => {
    const name = r[typeDef.nameField] ?? r.Name ?? r.DeveloperName ?? '';
    const ns = r.NamespacePrefix || null;
    const id = String(r.Id || '').trim();
    let displayName = String(name);
    if (typeDef.id === 'customField' && r.TableEnumOrId) {
      const tbl = String(r.TableEnumOrId);
      const objLabel = tbl.length === 18 && tbl.startsWith('01I') ? tbl : tbl;
      displayName = `${objLabel}.${name}`;
    }
    if (ns) displayName = `${ns}__${displayName}`;
    return {
      id,
      name: String(name),
      displayName,
      namespace: ns,
      type: typeDef.componentType,
      tableEnumOrId: r.TableEnumOrId || null
    };
  });
}

export function chunkArray(arr, size) {
  const list = Array.isArray(arr) ? arr : [];
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function depIdKey(id) {
  return String(id || '').trim();
}

/**
 * @param {string[]} ids
 * @param {'out'|'in'} direction
 */
export function buildDependencySoql(ids, direction) {
  const unique = [...new Set((ids || []).map(depIdKey).filter(Boolean))];
  if (!unique.length) return null;
  const inList = unique.map((x) => `'${escapeSoqlLiteral(x)}'`).join(',');
  const col = direction === 'in' ? 'RefMetadataComponentId' : 'MetadataComponentId';
  return `SELECT ${DEP_SELECT} FROM MetadataComponentDependency WHERE ${col} IN (${inList}) AND MetadataComponentType != 'FlexiPage' ORDER BY MetadataComponentName, RefMetadataComponentType`;
}

/**
 * @param {Record<string, unknown>} row
 * @returns {{ id: string, name: string, type: string, namespace: string|null, key: string }}
 */
export function nodeFromRefRow(row) {
  const id = depIdKey(row.RefMetadataComponentId);
  const name = String(row.RefMetadataComponentName || id || '');
  const type = String(row.RefMetadataComponentType || 'Unknown');
  const namespace = row.RefMetadataComponentNamespace ? String(row.RefMetadataComponentNamespace) : null;
  const key = `${type}:${namespace ? namespace + '__' : ''}${name}`;
  return { id, name, type, namespace, key };
}

/**
 * @param {Record<string, unknown>} row
 */
export function nodeFromMetadataRow(row) {
  const id = depIdKey(row.MetadataComponentId);
  const name = String(row.MetadataComponentName || id || '');
  const type = String(row.MetadataComponentType || 'Unknown');
  const key = `${type}::${name}`;
  return { id, name, type, namespace: null, key };
}

/**
 * @param {Map<string, object>} nodes
 * @param {Record<string, unknown>} row
 */
function addRefNode(nodes, row) {
  const n = nodeFromRefRow(row);
  if (!n.id && !n.name) return null;
  const storeKey = n.id || n.key;
  if (!nodes.has(storeKey)) {
    nodes.set(storeKey, { ...n, storeKey });
  }
  return n.id || storeKey;
}

/**
 * @param {Map<string, object>} nodes
 * @param {Record<string, unknown>} row
 */
function addMetadataNode(nodes, row) {
  const n = nodeFromMetadataRow(row);
  if (!n.id && !n.name) return null;
  const storeKey = n.id || n.key;
  if (!nodes.has(storeKey)) {
    nodes.set(storeKey, { ...n, storeKey });
  }
  return n.id || storeKey;
}

/**
 * @param {object} options
 * @param {string} options.seedId
 * @param {boolean} [options.transitive]
 * @param {boolean} [options.includeReferencedBy]
 * @param {(soql: string) => Promise<unknown[]>} options.queryFn
 * @param {() => boolean} [options.isCancelled]
 */
export async function analyzeDependencies(options) {
  const seedId = depIdKey(options.seedId);
  if (!seedId) {
    return { nodes: [], edges: [], truncated: false, queryCount: 0 };
  }
  const transitive = !!options.transitive;
  const includeReferencedBy = !!options.includeReferencedBy;
  const queryFn = options.queryFn;
  const isCancelled = options.isCancelled || (() => false);

  /** @type {Map<string, object>} */
  const nodes = new Map();
  /** @type {Array<{ from: string, to: string }>} */
  const edges = [];
  const seenEdge = new Set();
  let queryCount = 0;
  let truncated = false;

  async function runSoql(soql) {
    if (!soql || isCancelled()) return [];
    queryCount += 1;
    const rows = (await queryFn(soql)) || [];
    return rows;
  }

  async function fetchDepsForIds(ids) {
    const chunks = chunkArray(ids, IN_CHUNK_SIZE);
    const all = [];
    for (const chunk of chunks) {
      if (isCancelled()) break;
      const soql = buildDependencySoql(chunk, 'out');
      if (!soql) continue;
      const rows = await runSoql(soql);
      all.push(...rows);
    }
    return all;
  }

  async function fetchReferencedByIds(ids) {
    const chunks = chunkArray(ids, IN_CHUNK_SIZE);
    const all = [];
    for (const chunk of chunks) {
      if (isCancelled()) break;
      const soql = buildDependencySoql(chunk, 'in');
      if (!soql) continue;
      const rows = await runSoql(soql);
      all.push(...rows);
    }
    return all;
  }

  function processOutRows(rows, fromSeed) {
    const nextIds = [];
    for (const row of rows) {
      if (isCancelled()) break;
      const refId = addRefNode(nodes, row);
      const fromId = fromSeed ? seedId : depIdKey(row.MetadataComponentId);
      if (refId && fromId) {
        const ek = `${fromId}->${refId}`;
        if (!seenEdge.has(ek)) {
          seenEdge.add(ek);
          edges.push({ from: fromId, to: refId });
        }
      }
      if (transitive && refId && !visitedFrontier.has(refId)) {
        nextIds.push(refId);
      }
      if (nodes.size >= MAX_NODES) {
        truncated = true;
        break;
      }
    }
    return nextIds;
  }

  function processInRows(rows) {
    for (const row of rows) {
      if (isCancelled()) break;
      const metaId = addMetadataNode(nodes, row);
      const refId = depIdKey(row.RefMetadataComponentId);
      if (metaId && refId) {
        const ek = `${metaId}->${refId}`;
        if (!seenEdge.has(ek)) {
          seenEdge.add(ek);
          edges.push({ from: metaId, to: refId });
        }
      }
      if (nodes.size >= MAX_NODES) {
        truncated = true;
        break;
      }
    }
  }

  const visitedFrontier = new Set();

  // Direct depends-on
  let frontier = [seedId];
  visitedFrontier.add(seedId);
  const directRows = await fetchDepsForIds(frontier);
  processOutRows(directRows, true);

  if (includeReferencedBy && !isCancelled()) {
    const inRows = await fetchReferencedByIds([seedId]);
    processInRows(inRows);
  }

  if (transitive && !truncated && !isCancelled()) {
    let iteration = 0;
    let pending = [];
    for (const row of directRows) {
      const id = depIdKey(row.RefMetadataComponentId);
      if (id && !visitedFrontier.has(id)) pending.push(id);
    }

    while (pending.length && iteration < MAX_BFS_ITERATIONS && !truncated && !isCancelled()) {
      iteration += 1;
      const batch = [];
      for (const id of pending) {
        if (!visitedFrontier.has(id)) {
          visitedFrontier.add(id);
          batch.push(id);
        }
      }
      pending = [];
      if (!batch.length) break;

      const rows = await fetchDepsForIds(batch);
      const next = processOutRows(rows, false);
      for (const id of next) {
        if (!visitedFrontier.has(id)) pending.push(id);
      }
      if (nodes.size >= MAX_NODES) truncated = true;
    }
    if (iteration >= MAX_BFS_ITERATIONS && pending.length) truncated = true;
  }

  return {
    nodes: [...nodes.values()],
    edges,
    truncated,
    queryCount
  };
}

function isCustomObjectId(value) {
  const s = String(value || '');
  return s.length >= 15 && s.startsWith('01I');
}

/**
 * @param {Array<{ id: string, name: string, type: string, namespace?: string|null }>} nodes
 * @param {Record<string, string>} [fieldObjectById]
 * @param {Record<string, string>} [objectNameById]
 */
export function groupNodesIntoCategories(nodes, fieldObjectById = {}, objectNameById = {}) {
  /** @type {Map<string, { categoryKey: string, label: string, type: string, items: Array<{ name: string, id: string, namespace: string|null }> }>} */
  const cats = new Map();

  for (const node of nodes || []) {
    const type = String(node.type || 'Unknown');
    const name = String(node.name || '');
    const id = String(node.id || '');
    let categoryKey = type;
    let label = type;

    if (type === 'CustomField') {
      let objectName = fieldObjectById[id] || '';
      if (isCustomObjectId(objectName)) {
        objectName = objectNameById[objectName] || objectName;
      }
      categoryKey = `CustomField:${objectName || 'Unknown'}`;
      label = objectName ? `Custom Fields on ${objectName}` : 'CustomField';
    }

    if (!cats.has(categoryKey)) {
      cats.set(categoryKey, { categoryKey, label, type, items: [] });
    }
    const cat = cats.get(categoryKey);
    const itemKey = `${name}:${id}`;
    if (!cat.items.some((it) => `${it.name}:${it.id}` === itemKey)) {
      let displayName = name;
      if (type === 'CustomField' && categoryKey.startsWith('CustomField:')) {
        const objName = categoryKey.slice('CustomField:'.length);
        if (objName && objName !== 'Unknown') displayName = `${objName}.${name}`;
      }
      if (node.namespace) displayName = `${node.namespace}__${displayName}`;
      cat.items.push({
        name,
        id,
        type,
        namespace: node.namespace || null,
        displayName
      });
    }
  }

  return [...cats.values()]
    .map((c) => ({
      ...c,
      count: c.items.length,
      items: c.items.sort((a, b) => a.name.localeCompare(b.name))
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * @param {Array<{ id: string, name: string, type: string }>} nodes
 * @returns {string[]}
 */
export function collectCustomFieldIds(nodes) {
  return (nodes || [])
    .filter((n) => n.type === 'CustomField' && n.id)
    .map((n) => n.id);
}

/**
 * @param {Array<{ id: string, type: string }>} nodes
 */
export function collectCustomObjectIdsFromFieldMap(fieldObjectById, objectNameById = {}) {
  const ids = new Set();
  for (const val of Object.values(fieldObjectById || {})) {
    if (isCustomObjectId(val) && !objectNameById[val]) ids.add(val);
  }
  return [...ids];
}

export function buildFieldObjectSoql(fieldIds) {
  const unique = [...new Set((fieldIds || []).map(depIdKey).filter(Boolean))];
  if (!unique.length) return [];
  return chunkArray(unique, IN_CHUNK_SIZE).map(
    (chunk) =>
      `SELECT Id, TableEnumOrId FROM CustomField WHERE Id IN (${chunk.map((x) => `'${escapeSoqlLiteral(x)}'`).join(',')})`
  );
}

export function buildCustomObjectNameSoql(objectIds) {
  const unique = [...new Set((objectIds || []).map(depIdKey).filter(Boolean))];
  if (!unique.length) return [];
  return chunkArray(unique, IN_CHUNK_SIZE).map(
    (chunk) =>
      `SELECT Id, DeveloperName FROM CustomObject WHERE Id IN (${chunk.map((x) => `'${escapeSoqlLiteral(x)}'`).join(',')})`
  );
}

/**
 * @param {unknown[]} rows
 * @returns {Record<string, string>}
 */
export function mapFieldObjectRows(rows) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const r of rows || []) {
    const id = depIdKey(r.Id);
    if (!id) continue;
    out[id] = String(r.TableEnumOrId || '');
  }
  return out;
}

/**
 * @param {unknown[]} rows
 */
export function mapObjectNameRows(rows) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const r of rows || []) {
    const id = depIdKey(r.Id);
    if (!id) continue;
    out[id] = String(r.DeveloperName || id);
  }
  return out;
}

/**
 * @param {ReturnType<typeof groupNodesIntoCategories>} categories
 */
export function categoriesToSummaryText(categories) {
  const lines = [];
  for (const cat of categories || []) {
    lines.push(`${cat.label} (${cat.count})`);
    for (const it of cat.items) {
      lines.push(`  - ${it.namespace ? it.namespace + '__' : ''}${it.name}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

/**
 * @param {ReturnType<typeof groupNodesIntoCategories>} categories
 */
export function categoriesToCsv(categories) {
  const lines = ['Category,Type,Name,Id,Namespace'];
  for (const cat of categories || []) {
    for (const it of cat.items) {
      const name = `"${String(it.name).replace(/"/g, '""')}"`;
      const catLabel = `"${String(cat.label).replace(/"/g, '""')}"`;
      lines.push(`${catLabel},${cat.type},${name},${it.id || ''},${it.namespace || ''}`);
    }
  }
  return lines.join('\n');
}

/**
 * @param {Array<{ name: string, type: string, namespace?: string|null }>} nodes
 * @returns {Map<string, Set<string>>}
 */
export function nodesToPackageSelections(nodes) {
  /** @type {Map<string, Set<string>>} */
  const byType = new Map();
  for (const n of nodes || []) {
    const xmlType = DEP_TO_PACKAGE_XML[n.type] || n.type;
    if (!xmlType) continue;
    if (!byType.has(xmlType)) byType.set(xmlType, new Set());
    const member = n.namespace ? `${n.namespace}__${n.name}` : n.name;
    if (member) byType.get(xmlType).add(member);
  }
  return byType;
}

/**
 * @param {ReturnType<typeof groupNodesIntoCategories>} leftCats
 * @param {ReturnType<typeof groupNodesIntoCategories>} rightCats
 */
export function compareCategories(leftCats, rightCats) {
  const leftMap = new Map((leftCats || []).map((c) => [c.categoryKey, c]));
  const rightMap = new Map((rightCats || []).map((c) => [c.categoryKey, c]));
  const allKeys = [...new Set([...leftMap.keys(), ...rightMap.keys()])].sort();

  return allKeys.map((key) => {
    const l = leftMap.get(key);
    const r = rightMap.get(key);
    const lItems = new Map((l?.items || []).map((it) => [it.name, it]));
    const rItems = new Map((r?.items || []).map((it) => [it.name, it]));
    const names = [...new Set([...lItems.keys(), ...rItems.keys()])].sort();
    const rows = names.map((name) => {
      const inL = lItems.has(name);
      const inR = rItems.has(name);
      let status = 'both';
      if (inL && !inR) status = 'leftOnly';
      else if (!inL && inR) status = 'rightOnly';
      return { name, status, left: lItems.get(name) || null, right: rItems.get(name) || null };
    });
    return {
      categoryKey: key,
      label: l?.label || r?.label || key,
      type: l?.type || r?.type || '',
      leftCount: l?.count || 0,
      rightCount: r?.count || 0,
      hasDiff: (l?.count || 0) !== (r?.count || 0) || rows.some((row) => row.status !== 'both'),
      rows
    };
  });
}

/**
 * @param {string[]} nodeIds
 * @param {(soql: string) => Promise<unknown[]>} queryFn
 * @param {() => boolean} [isCancelled]
 * @returns {Promise<Map<string, Array<{ id: string, name: string, type: string, namespace: string|null }>>>}
 */
export async function fetchReferencedByMap(nodeIds, queryFn, isCancelled) {
  const unique = [...new Set((nodeIds || []).map(depIdKey).filter(Boolean))].slice(
    0,
    MAX_REFERENCED_BY_FETCH_NODES
  );
  /** @type {Map<string, Array<{ id: string, name: string, type: string, namespace: string|null }>>} */
  const map = new Map();
  for (const chunk of chunkArray(unique, IN_CHUNK_SIZE)) {
    if (isCancelled?.()) break;
    const soql = buildDependencySoql(chunk, 'in');
    if (!soql) continue;
    const rows = (await queryFn(soql)) || [];
    for (const row of rows) {
      const refId = depIdKey(row.RefMetadataComponentId);
      if (!refId) continue;
      const referrer = nodeFromMetadataRow(row);
      if (!referrer.id && !referrer.name) continue;
      if (!map.has(refId)) map.set(refId, []);
      const list = map.get(refId);
      const dupKey = `${referrer.type}::${referrer.id || referrer.name}`;
      if (!list.some((r) => `${r.type}::${r.id || r.name}` === dupKey)) {
        list.push({
          id: referrer.id,
          name: referrer.name,
          type: referrer.type,
          namespace: referrer.namespace
        });
      }
    }
  }
  return map;
}

/**
 * @param {ReturnType<typeof groupNodesIntoCategories>} categories
 * @param {Map<string, Array<{ id: string, name: string, type: string, namespace: string|null }>>} referencedByMap
 */
export function enrichCategoriesWithReferencedBy(categories, referencedByMap) {
  return (categories || []).map((cat) => {
    const objectApiName = cat.categoryKey.startsWith('CustomField:')
      ? cat.categoryKey.slice('CustomField:'.length)
      : null;
    return {
      ...cat,
      items: (cat.items || []).map((it) => {
        const all = referencedByMap?.get(it.id) || [];
        const sorted = [...all].sort(
          (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)
        );
        return {
          ...it,
          type: it.type || cat.type,
          objectApiName: objectApiName && objectApiName !== 'Unknown' ? objectApiName : null,
          referencedBy: sorted.slice(0, MAX_REFERENCED_BY_PER_ITEM),
          referencedByTotal: sorted.length
        };
      })
    };
  });
}

/**
 * @param {string} instanceUrl
 */
export function normalizeLightningSetupBase(instanceUrl) {
  const raw = String(instanceUrl || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (u.hostname.endsWith('.lightning.force.com')) return u.origin;
    if (u.hostname.endsWith('.sandbox.my.salesforce.com')) {
      return `https://${u.hostname.replace('.sandbox.my.salesforce.com', '.sandbox.lightning.force.com')}`;
    }
    if (u.hostname.endsWith('.my.salesforce.com')) {
      return `https://${u.hostname.replace('.my.salesforce.com', '.lightning.force.com')}`;
    }
    if (u.hostname.endsWith('.develop.my.salesforce.com')) {
      return `https://${u.hostname.replace('.develop.my.salesforce.com', '.develop.lightning.force.com')}`;
    }
    return u.origin;
  } catch {
    return raw.replace(/\/$/, '');
  }
}

/**
 * @param {string} instanceUrl
 * @param {{ id?: string, type?: string, name?: string, objectApiName?: string|null }} item
 * @param {{ fieldObjectById?: Record<string, string>, objectNameById?: Record<string, string> }} [ctx]
 * @returns {string|null}
 */
export function buildSalesforceMetadataUrl(instanceUrl, item, ctx = {}) {
  const id = depIdKey(item?.id);
  const type = String(item?.type || '');
  if (!id) return null;
  const lightning = normalizeLightningSetupBase(instanceUrl);
  const classic = String(instanceUrl || '').replace(/\/$/, '');

  if (type === 'CustomField') {
    let objectName = item.objectApiName || '';
    if (!objectName && ctx.fieldObjectById?.[id]) {
      const tbl = ctx.fieldObjectById[id];
      objectName = isCustomObjectId(tbl) ? ctx.objectNameById?.[tbl] || '' : tbl;
    }
    if (objectName && lightning) {
      return `${lightning}/lightning/setup/ObjectManager/${encodeURIComponent(objectName)}/FieldsAndRelationships/${encodeURIComponent(id)}/view`;
    }
  }

  if (lightning) {
    if (type === 'ApexClass') {
      return `${lightning}/lightning/setup/ApexClasses/page?address=${encodeURIComponent(`/${id}`)}`;
    }
    if (type === 'ApexTrigger') {
      return `${lightning}/lightning/setup/ApexTriggers/page?address=${encodeURIComponent(`/${id}`)}`;
    }
    if (type === 'Flow' || type === 'FlowDefinition') {
      return `${lightning}/lightning/setup/Flows/page?address=${encodeURIComponent(`/${id}`)}`;
    }
    if (type === 'AuraDefinitionBundle') {
      return `${lightning}/lightning/setup/AuraComponents/page?address=${encodeURIComponent(`/${id}`)}`;
    }
    if (type === 'LightningComponentBundle') {
      return `${lightning}/lightning/setup/LightningComponentBundles/page?address=${encodeURIComponent(`/${id}`)}`;
    }
    if (type === 'ValidationRule' && item.name && item.objectApiName) {
      return `${lightning}/lightning/setup/ObjectManager/${encodeURIComponent(item.objectApiName)}/ValidationRules/${encodeURIComponent(id)}/view`;
    }
  }

  return classic ? `${classic}/${id}` : null;
}

/** @param {{ type?: string }} ref */
export function canOpenMetadataSource(ref) {
  const type = String(ref?.type || '');
  return type === 'ApexClass' || type === 'ApexTrigger';
}
