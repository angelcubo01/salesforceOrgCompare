/** Modelo puro y validaciones de seguridad para View All Data & Editor. */

export const RECORD_VIEWER_SHORTCUT = 'Ctrl+Shift+E';
export const RECORD_ID_RE = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/;

/** Extrae el Id de rutas Lightning, Console y Classic sin depender del DOM. */
export function recordIdFromSalesforceUrl(value) {
  let url;
  try { url = value instanceof URL ? value : new URL(String(value)); } catch { return null; }
  const candidates = [url.pathname, url.hash, url.searchParams.get('id') || '', url.searchParams.get('recordId') || ''];
  for (const source of candidates) {
    const match = String(source).match(/(?:^|[/?#=&])([A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?)(?=$|[/?#&])/);
    if (match && RECORD_ID_RE.test(match[1])) return match[1];
  }
  return null;
}

export function isRecordViewerShortcut(event, shortcut = RECORD_VIEWER_SHORTCUT) {
  if (!event || event.isComposing || !(event.ctrlKey || event.metaKey)) return false;
  const parts = String(shortcut || '').toUpperCase().replace(/\s/g, '').split('+');
  const key = parts.pop();
  const required = new Set(parts);
  return key === String(event.key || '').toUpperCase() && required.has('CTRL') && required.has('SHIFT') === !!event.shiftKey && required.has('ALT') === !!event.altKey;
}

export function isTextEntryTarget(target) {
  const el = typeof Element !== 'undefined' && target instanceof Element ? target : null;
  if (!el) return false;
  if (el.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], .monaco-editor, .CodeMirror, [role="dialog"]')) return true;
  return !!el.closest('[data-keyboard-capture="true"]');
}

export function canEditRecordField({ objectPermissions, recordAccess, field, orgReadOnly, writePolicyAllowed }) {
  if (!objectPermissions?.updateable) return { editable: false, reason: 'OBJECT_NOT_UPDATEABLE' };
  if (recordAccess?.HasEditAccess !== true) return { editable: false, reason: recordAccess?.HasEditAccess === false ? 'RECORD_NOT_EDITABLE' : 'RECORD_ACCESS_UNKNOWN' };
  if (field?.accessible === false) return { editable: false, reason: 'FIELD_NOT_ACCESSIBLE' };
  if (!field?.updateable) return { editable: false, reason: 'FIELD_NOT_UPDATEABLE' };
  if (field?.calculated) return { editable: false, reason: 'FIELD_CALCULATED' };
  if (field?.autoNumber) return { editable: false, reason: 'FIELD_AUTONUMBER' };
  if (field?.name === 'Id' || /^(Created|LastModified)(Date|ById)$/.test(String(field?.name || ''))) return { editable: false, reason: 'FIELD_SYSTEM' };
  if (orgReadOnly) return { editable: false, reason: 'ORG_READ_ONLY' };
  if (!writePolicyAllowed) return { editable: false, reason: 'WRITE_POLICY' };
  return { editable: true, reason: '' };
}

export function permissionState(value) {
  return value === true ? 'granted' : value === false ? 'denied' : 'unknown';
}

export function recordViewerEditorType(fieldType) {
  const type = String(fieldType || '').toLowerCase();
  if (type === 'boolean') return 'booleanList';
  if (['int', 'long', 'double', 'currency', 'percent'].includes(type)) return 'number';
  if (type === 'date') return 'date';
  if (type === 'datetime') return 'datetime';
  if (type === 'time') return 'time';
  if (type === 'textarea') return 'textarea';
  if (type === 'picklist' || type === 'combobox') return 'list';
  return 'input';
}

export function recordViewerPicklistOptions(field, emptyLabel = '') {
  const values = [];
  if (field?.nillable) values.push({ label: String(emptyLabel), value: '' });
  for (const option of Array.isArray(field?.picklistValues) ? field.picklistValues : []) {
    if (option?.active === false) continue;
    values.push({
      label: String(option?.label ?? option?.value ?? ''),
      value: String(option?.value ?? '')
    });
  }
  return values;
}

/** Solo envía campos realmente distintos y previamente autorizados. */
export function buildRecordViewerPatch(rows) {
  const patch = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.editable || !row?.changed || !row?.apiName || row.apiName === 'Id') continue;
    patch[row.apiName] = row.pendingValue;
  }
  return patch;
}

/** Construye el cuerpo de un clonado desde el describe efectivo del registro. */
export function buildRecordViewerCloneFields(record, fields) {
  const source = record && typeof record === 'object' ? record : {};
  const clone = {};
  for (const field of Array.isArray(fields) ? fields : []) {
    const name = String(field?.name || '');
    if (!name || name === 'Id' || field?.createable !== true || field?.accessible === false) continue;
    if (field?.calculated || field?.autoNumber || !Object.prototype.hasOwnProperty.call(source, name)) continue;
    clone[name] = source[name];
  }
  return clone;
}

/**
 * Convierte los errores REST/Composite de Salesforce en un mensaje breve y
 * accionable para el usuario, sin perder el mensaje general de la interfaz.
 */
export function formatRecordViewerSaveErrors(errors, fallbackMessage = '') {
  const messages = [];
  const seen = new Set();
  const add = (value) => {
    const message = String(value || '').replace(/\s+/g, ' ').trim();
    if (!message || seen.has(message)) return;
    seen.add(message);
    messages.push(message);
  };
  const collect = (value, depth = 0) => {
    if (depth > 3 || value == null) return;
    if (typeof value === 'string') {
      add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collect(item, depth + 1));
      return;
    }
    if (typeof value !== 'object') return;
    if (typeof value.message === 'string') add(value.message);
    if (value.errors) collect(value.errors, depth + 1);
    if (value.body) collect(value.body, depth + 1);
  };
  collect(errors);
  const detail = messages.slice(0, 3).join(' · ');
  return detail ? `${fallbackMessage} ${detail}`.trim() : String(fallbackMessage || '');
}

function comparableRecordViewerValue(value) {
  return value === undefined ? null : value;
}

function sameRecordViewerValue(left, right) {
  return JSON.stringify(comparableRecordViewerValue(left)) === JSON.stringify(comparableRecordViewerValue(right));
}

/**
 * Reconcilia un cambio preparado en la extensión con el valor actual de la
 * org. Un cambio ajeno en otro campo no bloquea el guardado, pero un campo que
 * cambió en ambos lados nunca se sobrescribe silenciosamente.
 */
export function reconcileRecordViewerPatch(currentRecord, requestedFields, baseValues) {
  const current = currentRecord && typeof currentRecord === 'object' ? currentRecord : {};
  const requested = requestedFields && typeof requestedFields === 'object' && !Array.isArray(requestedFields)
    ? requestedFields
    : {};
  const base = baseValues && typeof baseValues === 'object' && !Array.isArray(baseValues)
    ? baseValues
    : {};
  const fields = {};
  const conflicts = [];

  for (const [fieldName, nextValue] of Object.entries(requested)) {
    const currentValue = Object.prototype.hasOwnProperty.call(current, fieldName) ? current[fieldName] : null;
    const hasBaseValue = Object.prototype.hasOwnProperty.call(base, fieldName);
    if (hasBaseValue && !sameRecordViewerValue(currentValue, base[fieldName]) && !sameRecordViewerValue(currentValue, nextValue)) {
      conflicts.push(fieldName);
      continue;
    }
    if (!sameRecordViewerValue(currentValue, nextValue)) fields[fieldName] = nextValue;
  }

  return { fields, conflicts };
}
