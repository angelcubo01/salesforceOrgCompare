import { t } from '../../shared/i18n.js';
import {
  OBJECT_PERMISSION_BOOL_FIELDS,
  FIELD_PERMISSION_BOOL_FIELDS
} from '../../shared/permissionsDiffCore.js';

/** @type {{ field: string, icon: string, labelKey: string }[]} */
const OBJECT_FLAGS = [
  { field: 'PermissionsRead', icon: 'read', labelKey: 'permDiff.flagRead' },
  { field: 'PermissionsCreate', icon: 'create', labelKey: 'permDiff.flagCreate' },
  { field: 'PermissionsEdit', icon: 'edit', labelKey: 'permDiff.flagEdit' },
  { field: 'PermissionsDelete', icon: 'delete', labelKey: 'permDiff.flagDelete' },
  { field: 'PermissionsViewAllRecords', icon: 'viewall', labelKey: 'permDiff.flagViewAll' },
  { field: 'PermissionsModifyAllRecords', icon: 'modall', labelKey: 'permDiff.flagModAll' }
];

/** @type {{ field: string, icon: string, labelKey: string }[]} */
const FIELD_FLAGS = [
  { field: 'PermissionsRead', icon: 'read', labelKey: 'permDiff.flagRead' },
  { field: 'PermissionsEdit', icon: 'edit', labelKey: 'permDiff.flagEdit' }
];

/**
 * HTML con iconos (chips) para permisos activos.
 * @param {Record<string, unknown>|null|undefined} rec
 * @param {'object'|'field'} kind
 */
export function renderPermissionFlagsHtml(rec, kind = 'object') {
  if (!rec) return '<span class="perm-flags-empty">—</span>';
  const defs = kind === 'field' ? FIELD_FLAGS : OBJECT_FLAGS;
  const active = defs.filter((d) => !!rec[d.field]);
  if (!active.length) return '<span class="perm-flags-empty">—</span>';
  const chips = active
    .map((d) => {
      const label = t(d.labelKey);
      return `<span class="perm-flag perm-flag--${d.icon}" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}"></span>`;
    })
    .join('');
  return `<span class="perm-flags" role="list">${chips}</span>`;
}

function escapeAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** Texto plano para celdas export / tooltip agregado. */
export function permissionFlagsPlainText(rec, kind = 'object') {
  if (!rec) return '—';
  const defs = kind === 'field' ? FIELD_FLAGS : OBJECT_FLAGS;
  const labels = defs.filter((d) => !!rec[d.field]).map((d) => t(d.labelKey));
  return labels.length ? labels.join(', ') : '—';
}

export function objectPermissionKind() {
  return 'object';
}

export function fieldPermissionKind() {
  return 'field';
}

export { OBJECT_PERMISSION_BOOL_FIELDS, FIELD_PERMISSION_BOOL_FIELDS };
