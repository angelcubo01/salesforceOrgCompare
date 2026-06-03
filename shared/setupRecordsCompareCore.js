/** @typedef {'developerName' | 'name'} RowAlignmentMode */

const AUDIT_FIELD_PREFIXES = ['Created', 'LastModified', 'SystemModstamp'];
const SKIP_FIELD_NAMES = new Set([
  'Id',
  'IsDeleted',
  'attributes',
  'SetupOwner',
  'SetupOwnerId',
  'Owner',
  'OwnerId',
  'LastViewedDate',
  'LastReferencedDate'
]);

/** Nunca en SOQL ni en diff de valores (Ids de org/usuario cambian entre entornos). */
const NEVER_COMPARE_FIELD_NAMES = new Set(['SetupOwnerId', 'SetupOwner', 'OwnerId', 'Owner', 'Id']);

function isNeverCompareField(name) {
  return NEVER_COMPARE_FIELD_NAMES.has(String(name || '').trim());
}

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
function isComparableDescribeField(field) {
  const name = String(field?.name || '').trim();
  if (!name || SKIP_FIELD_NAMES.has(name)) return false;
  if (isAuditField(name)) return false;
  const type = String(field?.type || '').toLowerCase();
  if (type === 'address' || type === 'location') return false;
  if (field?.calculated === true && !name.endsWith('__c')) return false;
  return true;
}

/**
 * Campos a comparar a partir del describe REST.
 * @param {Array<Record<string, unknown>>} describeFields
 * @returns {string[]}
 */
export function buildCompareFieldList(describeFields) {
  const names = [];
  const seen = new Set();
  const preferOrder = ['DeveloperName', 'MasterLabel', 'Label', 'Name'];

  for (const pref of preferOrder) {
    const f = (describeFields || []).find((x) => String(x?.name) === pref);
    if (f && isComparableDescribeField(f) && !seen.has(pref)) {
      seen.add(pref);
      names.push(pref);
    }
  }

  const custom = (describeFields || [])
    .filter((f) => {
      const n = String(f?.name || '');
      return n.endsWith('__c') && isComparableDescribeField(f);
    })
    .map((f) => String(f.name))
    .sort((a, b) => a.localeCompare(b));

  for (const n of custom) {
    if (!seen.has(n)) {
      seen.add(n);
      names.push(n);
    }
  }

  for (const f of describeFields || []) {
    const n = String(f?.name || '').trim();
    if (!n || seen.has(n) || !isComparableDescribeField(f)) continue;
    if (n.endsWith('__c')) continue;
    if (preferOrder.includes(n)) continue;
    if (String(f?.type || '').toLowerCase() === 'reference') continue;
    seen.add(n);
    names.push(n);
  }

  return names.filter((n) => !isNeverCompareField(n));
}

/**
 * @param {Array<Record<string, unknown>>} describeFields
 * @returns {RowAlignmentMode}
 */
export function detectRowAlignment(describeFields) {
  const names = new Set((describeFields || []).map((f) => String(f?.name || '')));
  if (names.has('DeveloperName')) return 'developerName';
  return 'name';
}

/**
 * @param {Record<string, unknown> | null | undefined} record
 * @param {RowAlignmentMode} alignment
 * @returns {string}
 */
export function recordRowKey(record, alignment) {
  if (!record || typeof record !== 'object') return '';
  if (alignment === 'developerName') {
    return String(record.DeveloperName ?? '').trim();
  }
  return String(record.Name ?? record.MasterLabel ?? '').trim();
}

/**
 * Etiqueta legible para la columna clave de la tabla.
 * @param {Record<string, unknown> | null | undefined} record
 * @param {RowAlignmentMode} alignment
 */
export function recordRowLabel(record, alignment) {
  if (!record || typeof record !== 'object') return '—';
  if (alignment === 'developerName') {
    return String(record.DeveloperName ?? '—');
  }
  return String(record.Name ?? record.MasterLabel ?? '—');
}

/**
 * @param {unknown} value
 */
export function normalizeFieldValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  const s = String(value).trim();
  if (s.includes(';') && !s.includes(' ')) {
    return s
      .split(';')
      .map((x) => x.trim())
      .filter(Boolean)
      .sort()
      .join(';');
  }
  return s;
}

/**
 * @param {Record<string, unknown> | null | undefined} left
 * @param {Record<string, unknown> | null | undefined} right
 * @param {string[]} fieldNames
 * @returns {string[]}
 */
export function diffFields(left, right, fieldNames) {
  const out = [];
  for (const field of fieldNames || []) {
    if (isNeverCompareField(field)) continue;
    const lv = normalizeFieldValue(left?.[field]);
    const rv = normalizeFieldValue(right?.[field]);
    if (lv !== rv) out.push(field);
  }
  return out;
}

/**
 * @param {Record<string, unknown>[]} leftRows
 * @param {Record<string, unknown>[]} rightRows
 * @param {RowAlignmentMode} alignment
 * @param {string[]} fieldNames
 */
export function mergeRecordRows(leftRows, rightRows, alignment, fieldNames) {
  const L = Array.isArray(leftRows) ? leftRows : [];
  const R = Array.isArray(rightRows) ? rightRows : [];
  /** @type {Map<string, Record<string, unknown>>} */
  const lm = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const rm = new Map();

  for (const r of L) {
    if (!r || typeof r !== 'object') continue;
    const k = recordRowKey(r, alignment);
    if (k) lm.set(k, r);
  }
  for (const r of R) {
    if (!r || typeof r !== 'object') continue;
    const k = recordRowKey(r, alignment);
    if (k) rm.set(k, r);
  }

  const keys = [...new Set([...lm.keys(), ...rm.keys()])].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );

  return keys.map((key) => {
    const leftRec = lm.get(key) ?? null;
    const rightRec = rm.get(key) ?? null;
    const diffFieldList = diffFields(leftRec, rightRec, fieldNames);
    const status =
      !leftRec && rightRec ? 'rightOnly' : leftRec && !rightRec ? 'leftOnly' : diffFieldList.length ? 'diff' : 'match';
    return {
      key,
      label: recordRowLabel(leftRec || rightRec, alignment),
      left: leftRec,
      right: rightRec,
      diffFields: diffFieldList,
      status
    };
  });
}

/**
 * @param {ReturnType<typeof mergeRecordRows>} merged
 * @param {boolean} diffOnly
 */
export function filterMergedRows(merged, diffOnly) {
  if (!diffOnly) return merged;
  return merged.filter((r) => r.status !== 'match');
}
