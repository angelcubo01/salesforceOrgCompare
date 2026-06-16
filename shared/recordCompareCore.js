import { normalizeFieldValue } from './setupRecordsCompareCore.js';

const AUDIT_FIELD_PREFIXES = ['Created', 'LastModified', 'SystemModstamp'];
const SKIP_FIELD_NAMES = new Set([
  'Id',
  'IsDeleted',
  'attributes',
  'Owner',
  'OwnerId',
  'LastViewedDate',
  'LastReferencedDate'
]);

/**
 * @param {string} name
 */
function isAuditField(name) {
  const n = String(name || '');
  return AUDIT_FIELD_PREFIXES.some((p) => n === p || n.startsWith(p));
}

/**
 * @param {Record<string, unknown>} field
 */
function isComparableScalarField(field) {
  const name = String(field?.name || '').trim();
  if (!name || SKIP_FIELD_NAMES.has(name)) return false;
  if (isAuditField(name)) return false;
  if (field?.readable === false) return false;
  const type = String(field?.type || '').toLowerCase();
  if (type === 'reference' || type === 'address' || type === 'location') return false;
  if (field?.calculated === true && !name.endsWith('__c')) return false;
  return true;
}

/**
 * @param {Record<string, unknown>} field
 */
function isPolymorphicReference(field) {
  const refs = Array.isArray(field?.referenceTo) ? field.referenceTo : [];
  return refs.length > 1;
}

/**
 * @typedef {{
 *   apiName: string,
 *   label: string,
 *   type: string,
 *   isReference: boolean,
 *   idField?: string,
 *   relationshipName?: string,
 *   referenceTo?: string[],
 *   displayPath?: string,
 *   expandable?: boolean
 * }} RecordCompareFieldMeta
 */

/**
 * Campos comparables a partir del describe REST (escalares + lookups por nombre).
 * @param {Array<Record<string, unknown>>} describeFields
 * @returns {RecordCompareFieldMeta[]}
 */
export function buildRecordCompareFieldList(describeFields) {
  /** @type {RecordCompareFieldMeta[]} */
  const out = [];
  const seen = new Set();

  const preferOrder = ['Name', 'CaseNumber', 'Subject', 'DeveloperName', 'MasterLabel', 'Label'];

  function push(meta) {
    const key = meta.isReference ? `ref:${meta.idField}` : `scalar:${meta.apiName}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(meta);
  }

  for (const pref of preferOrder) {
    const f = (describeFields || []).find((x) => String(x?.name) === pref);
    if (f && isComparableScalarField(f)) {
      push({
        apiName: pref,
        label: String(f.label || pref).trim() || pref,
        type: String(f.type || 'string'),
        isReference: false
      });
    }
  }

  const customScalars = (describeFields || [])
    .filter((f) => {
      const n = String(f?.name || '');
      return n.endsWith('__c') && isComparableScalarField(f);
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  for (const f of customScalars) {
    const name = String(f.name);
    push({
      apiName: name,
      label: String(f.label || name).trim() || name,
      type: String(f.type || 'string'),
      isReference: false
    });
  }

  for (const f of describeFields || []) {
    const name = String(f?.name || '').trim();
    if (!name) continue;
    const type = String(f?.type || '').toLowerCase();

    if (type === 'reference') {
      if (SKIP_FIELD_NAMES.has(name)) continue;
      if (f?.readable === false) continue;
      const rel = String(f.relationshipName || '').trim();
      if (!rel || seen.has(`ref:${name}`)) continue;
      const referenceTo = Array.isArray(f.referenceTo) ? f.referenceTo.map((x) => String(x)) : [];
      push({
        apiName: name,
        label: String(f.label || name).trim() || name,
        type: 'reference',
        isReference: true,
        idField: name,
        relationshipName: rel,
        referenceTo,
        displayPath: undefined,
        expandable: !isPolymorphicReference(f)
      });
      continue;
    }

    if (!isComparableScalarField(f)) continue;
    if (name.endsWith('__c')) continue;
    if (preferOrder.includes(name)) continue;
    push({
      apiName: name,
      label: String(f.label || name).trim() || name,
      type: String(f.type || 'string'),
      isReference: false
    });
  }

  return out;
}

/**
 * Campo legible del objeto referenciado para SOQL (p. ej. Case → CaseNumber, Account → Name).
 * @param {string} relationshipName
 * @param {Record<string, unknown> | null | undefined} referencedDescribe
 * @returns {string | null}
 */
export function pickReferenceDisplayPath(relationshipName, referencedDescribe) {
  const rel = String(relationshipName || '').trim();
  if (!rel || !referencedDescribe || typeof referencedDescribe !== 'object') return null;

  const describeFields = Array.isArray(referencedDescribe.fields) ? referencedDescribe.fields : [];
  const fieldByName = new Map(describeFields.map((f) => [String(f?.name || ''), f]));
  const nameFields = Array.isArray(referencedDescribe.nameFields)
    ? referencedDescribe.nameFields.map((x) => String(x || '').trim()).filter(Boolean)
    : [];

  for (const nf of nameFields) {
    if (!nf || nf === 'Id') continue;
    const df = fieldByName.get(nf);
    if (!df || df.readable === false) continue;
    const t = String(df.type || '').toLowerCase();
    if (t === 'reference' || t === 'address' || t === 'location') continue;
    return `${rel}.${nf}`;
  }

  const fallbacks = ['Name', 'CaseNumber', 'Subject', 'DeveloperName', 'MasterLabel', 'Title'];
  for (const fb of fallbacks) {
    const df = fieldByName.get(fb);
    if (!df || df.readable === false) continue;
    const t = String(df.type || '').toLowerCase();
    if (t === 'reference' || t === 'address' || t === 'location') continue;
    return `${rel}.${fb}`;
  }

  return null;
}

/**
 * @param {RecordCompareFieldMeta[]} fieldMeta
 * @param {Map<string, Record<string, unknown>>} describeByObject
 * @returns {RecordCompareFieldMeta[]}
 */
export function enrichReferenceDisplayPaths(fieldMeta, describeByObject) {
  return (fieldMeta || []).map((f) => {
    if (!f.isReference) return f;
    if (!f.referenceTo?.length || f.referenceTo.length > 1) {
      return { ...f, displayPath: undefined, expandable: false };
    }
    const targetDescribe = describeByObject.get(f.referenceTo[0]);
    const displayPath = pickReferenceDisplayPath(f.relationshipName || '', targetDescribe);
    if (!displayPath) {
      return { ...f, displayPath: undefined, expandable: f.expandable !== false };
    }
    return { ...f, displayPath };
  });
}

/**
 * @param {RecordCompareFieldMeta[]} fieldMeta
 * @returns {string}
 */
export function buildSoqlSelectList(fieldMeta) {
  const parts = [];
  const seen = new Set();

  for (const f of fieldMeta || []) {
    if (f.isReference && f.idField) {
      if (f.displayPath && !seen.has(f.displayPath)) {
        parts.push(f.displayPath);
        seen.add(f.displayPath);
      }
      if (!seen.has(f.idField)) {
        parts.push(f.idField);
        seen.add(f.idField);
      }
    } else if (!f.isReference && f.apiName && !seen.has(f.apiName)) {
      parts.push(f.apiName);
      seen.add(f.apiName);
    }
  }

  return parts.join(', ');
}

/**
 * @param {Record<string, unknown> | null | undefined} record
 * @param {string} path
 */
function getNestedValue(record, path) {
  if (!record || typeof record !== 'object' || !path) return null;
  const parts = String(path).split('.');
  let cur = /** @type {unknown} */ (record);
  for (const p of parts) {
    if (!cur || typeof cur !== 'object') return null;
    cur = /** @type {Record<string, unknown>} */ (cur)[p];
  }
  return cur;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function formatDisplayValue(value) {
  const n = normalizeFieldValue(value);
  return n === '' ? '—' : n;
}

/**
 * @typedef {{
 *   fieldApiName: string,
 *   fieldLabel: string,
 *   leftDisplay: string,
 *   rightDisplay: string,
 *   isDiff: boolean,
 *   isReference: boolean,
 *   expandable: boolean,
 *   leftLookupId: string | null,
 *   rightLookupId: string | null,
 *   referenceTo: string[]
 * }} RecordCompareRow
 */

/**
 * @param {Record<string, unknown> | null | undefined} leftRecord
 * @param {Record<string, unknown> | null | undefined} rightRecord
 * @param {RecordCompareFieldMeta[]} fieldMeta
 * @returns {RecordCompareRow[]}
 */
export function buildRecordCompareRows(leftRecord, rightRecord, fieldMeta) {
  /** @type {RecordCompareRow[]} */
  const rows = [];

  for (const f of fieldMeta || []) {
    if (f.isReference && f.idField) {
      const leftDisplay = f.displayPath ? getNestedValue(leftRecord, f.displayPath) : null;
      const rightDisplay = f.displayPath ? getNestedValue(rightRecord, f.displayPath) : null;
      const leftLookupId = leftRecord?.[f.idField] ?? null;
      const rightLookupId = rightRecord?.[f.idField] ?? null;
      const lv = normalizeFieldValue(leftDisplay);
      const rv = normalizeFieldValue(rightDisplay);
      const hasLookup = !!(leftLookupId || rightLookupId);
      rows.push({
        fieldApiName: f.relationshipName || f.idField,
        fieldLabel: f.label,
        leftDisplay: formatDisplayValue(leftDisplay),
        rightDisplay: formatDisplayValue(rightDisplay),
        isDiff: lv !== rv,
        isReference: true,
        expandable: f.expandable !== false && hasLookup,
        leftLookupId: leftLookupId != null ? String(leftLookupId) : null,
        rightLookupId: rightLookupId != null ? String(rightLookupId) : null,
        referenceTo: f.referenceTo || []
      });
    } else {
      const leftDisplay = leftRecord?.[f.apiName];
      const rightDisplay = rightRecord?.[f.apiName];
      const lv = normalizeFieldValue(leftDisplay);
      const rv = normalizeFieldValue(rightDisplay);
      rows.push({
        fieldApiName: f.apiName,
        fieldLabel: f.label,
        leftDisplay: formatDisplayValue(leftDisplay),
        rightDisplay: formatDisplayValue(rightDisplay),
        isDiff: lv !== rv,
        isReference: false,
        expandable: false,
        leftLookupId: null,
        rightLookupId: null,
        referenceTo: []
      });
    }
  }

  return rows;
}

/**
 * @param {RecordCompareRow[]} rows
 * @param {boolean} diffOnly
 */
export function filterCompareRows(rows, diffOnly) {
  if (!diffOnly) return rows;
  return (rows || []).filter((r) => r.isDiff);
}

/**
 * Filtra filas por label o API name del campo (búsqueda parcial, sin distinguir mayúsculas).
 * @param {RecordCompareRow[]} rows
 * @param {string} needle
 */
export function filterCompareRowsBySearch(rows, needle) {
  const n = String(needle || '')
    .trim()
    .toLowerCase();
  if (!n) return rows || [];
  return (rows || []).filter(
    (r) =>
      String(r.fieldLabel || '')
        .toLowerCase()
        .includes(n) ||
      String(r.fieldApiName || '')
        .toLowerCase()
        .includes(n)
  );
}
