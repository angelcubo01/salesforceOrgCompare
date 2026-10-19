export const RECORD_VIEWER_QUICK_ACTIONS_KEY = 'sfoc_record_viewer_quick_actions_v1';

const MAX_ACTIONS = 100;
const MAX_OPERATIONS = 25;
const API_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

function safeId(value, fallback) {
  const id = String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96);
  return id || fallback;
}

function safeValue(value) {
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  return String(value).slice(0, 4000);
}

function environmentIdsFor(src) {
  const source = Array.isArray(src.environmentIds)
    ? src.environmentIds
    : src.orgId ? [src.orgId] : [];
  return [...new Set(source
    .map((id) => String(id || '').trim().slice(0, 128))
    .filter(Boolean))]
    .slice(0, 100);
}

export function normalizeRecordViewerQuickActionOperation(raw, index = 0) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const path = (Array.isArray(src.path) ? src.path : [])
    .map((part) => String(part || '').trim())
    .filter((part) => API_NAME_RE.test(part))
    .slice(0, 5);
  const field = String(src.field || '').trim();
  return {
    id: safeId(src.id, `operation-${index + 1}`),
    path,
    field: API_NAME_RE.test(field) ? field : '',
    value: safeValue(src.value)
  };
}

export function normalizeRecordViewerQuickAction(raw, index = 0) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const objectApiName = String(src.objectApiName || '*').trim();
  const operations = (Array.isArray(src.operations) ? src.operations : [])
    .slice(0, MAX_OPERATIONS)
    .map(normalizeRecordViewerQuickActionOperation)
    .filter((operation) => operation.field);
  return {
    id: safeId(src.id, `quick-action-${index + 1}`),
    name: String(src.name || '').trim().slice(0, 100),
    environmentIds: environmentIdsFor(src),
    objectApiName: objectApiName === '*' || API_NAME_RE.test(objectApiName) ? objectApiName : '*',
    operations
  };
}

export function normalizeRecordViewerQuickActions(raw) {
  const source = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const actions = [];
  for (const [index, candidate] of source.entries()) {
    const action = normalizeRecordViewerQuickAction(candidate, index);
    if (!action.name || !action.environmentIds.length || !action.operations.length || seen.has(action.id)) continue;
    seen.add(action.id);
    actions.push(action);
    if (actions.length >= MAX_ACTIONS) break;
  }
  return actions;
}

export function mergeRecordViewerQuickActions(current, incoming) {
  const merged = new Map(normalizeRecordViewerQuickActions(current).map((action) => [action.id, action]));
  for (const action of normalizeRecordViewerQuickActions(incoming)) merged.set(action.id, action);
  return normalizeRecordViewerQuickActions([...merged.values()]);
}

export function recordViewerQuickActionsFor(actions, orgId, objectApiName) {
  return normalizeRecordViewerQuickActions(actions).filter((action) => (
    action.environmentIds.includes(String(orgId || ''))
    && (action.objectApiName === '*' || action.objectApiName === String(objectApiName || ''))
  ));
}

export function recordViewerTargetPathKey(path) {
  return (Array.isArray(path) ? path : []).map((part) => String(part || '').trim()).filter(Boolean).join('.');
}

export function groupRecordViewerQuickActionUpdates(changes) {
  const grouped = new Map();
  for (const change of Array.isArray(changes) ? changes : []) {
    if (!change?.field) continue;
    const path = Array.isArray(change.path) ? change.path.map(String) : [];
    const key = recordViewerTargetPathKey(path);
    if (!grouped.has(key)) grouped.set(key, { path, fields: {} });
    grouped.get(key).fields[change.field] = change.value;
  }
  return [...grouped.values()].filter((update) => Object.keys(update.fields).length);
}

/** Construye updates ejecutables conservando la instantánea usada para detectar desfases por campo. */
export function buildRecordViewerQuickActionUpdates(resolvedOperations) {
  const grouped = new Map();
  for (const item of Array.isArray(resolvedOperations) ? resolvedOperations : []) {
    const operation = item?.operation;
    const context = item?.context;
    if (!operation?.field || !context?.record) continue;
    const path = Array.isArray(operation.path) ? operation.path.map(String) : [];
    const key = recordViewerTargetPathKey(path);
    if (!grouped.has(key)) grouped.set(key, {
      path,
      recordId: context.record.Id,
      fields: {},
      baseValues: {},
      lastModifiedDate: context.record.LastModifiedDate
    });
    const update = grouped.get(key);
    update.fields[operation.field] = operation.value;
    update.baseValues[operation.field] = Object.prototype.hasOwnProperty.call(context.record, operation.field)
      ? context.record[operation.field]
      : null;
  }
  return [...grouped.values()].filter((update) => Object.keys(update.fields).length);
}
