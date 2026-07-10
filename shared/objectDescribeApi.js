/**
 * Utilidades para Object Describe (Workbench-style).
 */

/**
 * @param {Array<Record<string, unknown>>} sobjects
 * @param {string} query
 * @param {string} [namespacePrefix] e.g. myns_
 */
export function filterSobjects(sobjects, query, namespacePrefix = '') {
  const q = String(query || '').trim().toLowerCase();
  const ns = String(namespacePrefix || '').trim();
  return (sobjects || []).filter((s) => {
    const name = String(s.name || '');
    const label = String(s.label || '');
    if (ns && !name.startsWith(ns)) return false;
    if (!q) return true;
    return name.toLowerCase().includes(q) || label.toLowerCase().includes(q);
  });
}

/**
 * @param {Record<string, unknown>} row
 * @param {string} query
 */
export function rowMatchesTableQuery(row, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return Object.values(row).some((v) => {
    if (typeof v === 'boolean') {
      const text = v ? 'true yes si sí' : 'false no';
      return text.includes(q);
    }
    if (v == null || v === '') return false;
    return String(v).toLowerCase().includes(q);
  });
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {string} query
 */
export function filterTableRows(rows, query) {
  const q = String(query || '').trim();
  if (!q) return rows || [];
  return (rows || []).filter((row) => rowMatchesTableQuery(row, q));
}

/**
 * @param {Array<Record<string, unknown>>} sobjects
 * @param {string} recordId
 */
export function resolveObjectApiNameFromId(sobjects, recordId) {
  const id = String(recordId || '').trim();
  if (id.length < 3) return null;
  const prefix = id.substring(0, 3);
  const match = (sobjects || []).find((s) => String(s.keyPrefix || '') === prefix);
  return match ? String(match.name || '') : null;
}

/**
 * @param {Record<string, unknown>} describe
 */
export function buildFieldRows(describe) {
  const fields = Array.isArray(describe?.fields) ? describe.fields : [];
  return fields.map((f) => ({
    apiName: String(f.name || ''),
    label: String(f.label || f.name || ''),
    type: String(f.type || ''),
    custom: !!f.custom,
    required: !f.nillable && !f.defaultedOnCreate,
    length: f.length != null ? Number(f.length) : null,
    precision: f.precision != null ? Number(f.precision) : null,
    scale: f.scale != null ? Number(f.scale) : null,
    relationshipName: f.relationshipName ? String(f.relationshipName) : '',
    referenceTo: Array.isArray(f.referenceTo) ? f.referenceTo.map(String).join(', ') : '',
    externalId: !!f.externalId,
    unique: !!f.unique,
    calculated: !!f.calculated
  }));
}

/**
 * @param {Record<string, unknown>} describe
 */
export function buildChildRelationshipRows(describe) {
  const rels = Array.isArray(describe?.childRelationships) ? describe.childRelationships : [];
  return rels
    .filter((r) => r.relationshipName)
    .map((r) => ({
      relationshipName: String(r.relationshipName || ''),
      childSObject: String(r.childSObject || ''),
      field: String(r.field || ''),
      cascadeDelete: !!r.cascadeDelete
    }));
}

/**
 * @param {Record<string, unknown>} describe
 */
export function buildRecordTypeRows(describe) {
  const rts = Array.isArray(describe?.recordTypeInfos) ? describe.recordTypeInfos : [];
  return rts.map((r) => ({
    name: String(r.name || ''),
    recordTypeId: String(r.recordTypeId || ''),
    active: !!r.active,
    defaultRecordTypeMapping: !!r.defaultRecordTypeMapping,
    master: !!r.master
  }));
}

/**
 * @param {Record<string, unknown>} describe
 */
export function summarizeDescribe(describe) {
  return {
    name: String(describe?.name || ''),
    label: String(describe?.label || ''),
    labelPlural: String(describe?.labelPlural || ''),
    keyPrefix: String(describe?.keyPrefix || ''),
    custom: !!describe?.custom,
    queryable: !!describe?.queryable,
    createable: !!describe?.createable,
    updateable: !!describe?.updateable,
    deletable: !!describe?.deletable,
    searchable: !!describe?.searchable,
    fieldCount: Array.isArray(describe?.fields) ? describe.fields.length : 0,
    childRelationshipCount: Array.isArray(describe?.childRelationships)
      ? describe.childRelationships.filter((r) => r.relationshipName).length
      : 0,
    recordTypeCount: Array.isArray(describe?.recordTypeInfos) ? describe.recordTypeInfos.length : 0
  };
}
