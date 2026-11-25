/**
 * API de usuarios para Salesforce Setup Palette. Este módulo no conoce UI y
 * mantiene todas las consultas SOQL y DML del lado de confianza.
 */
import {
  restDeleteSobject,
  restQuery,
  restQueryAll,
  restDescribeSobject,
  restRequestWithSid
} from './salesforceApi.js';

import { setupUserErrorCode } from './setupUserErrors.js';

export const SALESFORCE_ID_RE = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;
const USER_FIELDS = 'Id, Name, Username, Email, Alias, FederationIdentifier, IsActive, ProfileId, Profile.Name, UserRoleId, UserRole.Name, UserType, LanguageLocaleKey, LocaleSidKey, TimeZoneSidKey, LastLoginDate, CreatedDate';
const USER_FIELDS_FALLBACK = 'Id, Name, Username, Email, Alias, FederationIdentifier, IsActive, ProfileId, UserRoleId, UserType, LanguageLocaleKey, LocaleSidKey, TimeZoneSidKey, LastLoginDate, CreatedDate';

/** No permite que un literal de SOQL altere la consulta. */
export function escapeSetupPaletteSoql(value) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function normalizeSetupPaletteUserId(value) {
  const id = String(value || '').trim();
  return SALESFORCE_ID_RE.test(id) ? id : '';
}

export function normalizeSetupPaletteSearch(value) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 100);
}

export function buildSetupPaletteUserSearchSoql(value, fields = USER_FIELDS) {
  const term = normalizeSetupPaletteSearch(value);
  const id = normalizeSetupPaletteUserId(term);
  if (id) return `SELECT ${fields} FROM User WHERE Id = '${id}' LIMIT 20`;
  const escaped = escapeSetupPaletteSoql(term);
  const match = `%${escaped}%`;
  return `SELECT ${fields} FROM User WHERE Name LIKE '${match}' OR Username LIKE '${match}' OR Email LIKE '${match}' OR Alias LIKE '${match}' OR FederationIdentifier LIKE '${match}' LIMIT 20`;
}

function compactUser(row) {
  return {
    id: String(row?.Id || ''), name: String(row?.Name || ''), username: String(row?.Username || ''),
    email: String(row?.Email || ''), alias: String(row?.Alias || ''), federationIdentifier: String(row?.FederationIdentifier || ''),
    isActive: row?.IsActive === true, profileId: String(row?.ProfileId || ''), profileName: String(row?.Profile?.Name || ''),
    roleId: String(row?.UserRoleId || ''), roleName: String(row?.UserRole?.Name || ''), userType: String(row?.UserType || ''),
    language: String(row?.LanguageLocaleKey || ''), locale: String(row?.LocaleSidKey || ''), timeZone: String(row?.TimeZoneSidKey || ''),
    lastLoginDate: String(row?.LastLoginDate || ''), createdDate: String(row?.CreatedDate || '')
  };
}

export function sortSetupPaletteUsers(rows, value) {
  const needle = String(value || '').trim().toLocaleLowerCase();
  const id = normalizeSetupPaletteUserId(value);
  return [...rows].sort((a, b) => {
    const rank = (u) => [
      id && u.id === id ? 0 : 1,
      String(u.username).toLocaleLowerCase() === needle || String(u.email).toLocaleLowerCase() === needle ? 0 : 1,
      u.isActive ? 0 : 1,
      String(u.name).toLocaleLowerCase().startsWith(needle) ? 0 : 1
    ];
    const ar = rank(a); const br = rank(b);
    for (let i = 0; i < 4; i++) if (ar[i] !== br[i]) return ar[i] - br[i];
    return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });
  });
}

async function userQueryWithFieldFallback(instanceUrl, sid, apiVersion, term) {
  try { return await restQuery(instanceUrl, sid, apiVersion, buildSetupPaletteUserSearchSoql(term)); }
  catch { return restQuery(instanceUrl, sid, apiVersion, buildSetupPaletteUserSearchSoql(term, USER_FIELDS_FALLBACK)); }
}

export async function searchSetupPaletteUsers(instanceUrl, sid, apiVersion, value) {
  const term = normalizeSetupPaletteSearch(value);
  if (!normalizeSetupPaletteUserId(term) && term.length < 2) return [];
  const rows = await userQueryWithFieldFallback(instanceUrl, sid, apiVersion, term);
  return sortSetupPaletteUsers(rows.map(compactUser).filter((u) => normalizeSetupPaletteUserId(u.id)), term).slice(0, 20);
}

export async function getSetupPaletteUser(instanceUrl, sid, apiVersion, userId) {
  const id = normalizeSetupPaletteUserId(userId);
  if (!id) throw new Error('INVALID_USER_ID');
  const rows = await userQueryWithFieldFallback(instanceUrl, sid, apiVersion, id);
  const user = rows.map(compactUser).find((item) => sameSetupUserId(item.id, id));
  if (!user) throw new Error('USER_NOT_FOUND');
  return user;
}

const idKey = (id) => String(id || '').slice(0, 15);
export function sameSetupUserId(a, b) { return !!a && !!b && idKey(a) === idKey(b); }
export function requireSetupId(value, prefix = '') {
  const id = normalizeSetupPaletteUserId(value);
  if (!id || (prefix && !id.startsWith(prefix))) throw new Error('INVALID_REQUEST');
  return id;
}
const inIds = (ids) => [...new Set(ids.map((id) => requireSetupId(id)))].map((id) => "'" + id + "'").join(',');
const sortItems = (items) => [...items].sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' }));
const describeCache = new Map();
async function fieldsFor(instance, sid, version, objectName) {
  const key = [instance, version, objectName].join(':');
  let entry = describeCache.get(key);
  if (!entry || entry.sid !== sid) {
    entry = { sid, promise: restDescribeSobject(instance, sid, version, objectName).then((d) => new Set(d.fields.map((f) => f.name))) };
    describeCache.set(key, entry);
    entry.promise.catch(() => { if (describeCache.get(key) === entry) describeCache.delete(key); });
  }
  return entry.promise;
}
async function permissionFields(instance, sid, version, group) {
  const fields = await fieldsFor(instance, sid, version, group ? 'PermissionSetGroup' : 'PermissionSet');
  const requested = group ? ['Id', 'MasterLabel', 'DeveloperName', 'NamespacePrefix', 'Status', 'LastModifiedDate'] : ['Id', 'Label', 'Name', 'NamespacePrefix', 'IsOwnedByProfile', 'ProfileId', 'Type', 'LicenseId'];
  return requested.filter((f) => fields.has(f));
}
function permission(row) {
  return {
    id: row.Id, label: row.Label || row.MasterLabel || row.Name || row.DeveloperName || row.Id,
    developerName: row.Name || row.DeveloperName || '', namespace: row.NamespacePrefix || '',
    status: row.Status || '', type: row.Type || '', licenseId: row.LicenseId || '',
    profile: !!row.IsOwnedByProfile, direct: false, assignmentIds: [], sources: []
  };
}
async function assignmentRows(instance, sid, version, userId) {
  requireSetupId(userId, '005');
  return restQueryAll(instance, sid, version, "SELECT Id, AssigneeId, PermissionSetId, PermissionSetGroupId FROM PermissionSetAssignment WHERE AssigneeId = '" + userId + "'");
}
export async function getSetupPalettePermissionSets(instance, sid, version, userId) {
  requireSetupId(userId, '005');
  const [assignments, fields, users] = await Promise.all([
    assignmentRows(instance, sid, version, userId),
    permissionFields(instance, sid, version, false),
    restQuery(instance, sid, version, "SELECT ProfileId FROM User WHERE Id = '" + userId + "'")
  ]);
  const direct = assignments.filter((a) => a.PermissionSetId && !a.PermissionSetGroupId);
  const groupIds = assignments.filter((a) => a.PermissionSetGroupId).map((a) => a.PermissionSetGroupId);
  const conditions = [];
  if (direct.length) conditions.push('Id IN (' + inIds(direct.map((a) => a.PermissionSetId)) + ')');
  if (users[0]?.ProfileId) conditions.push("ProfileId = '" + requireSetupId(users[0].ProfileId, '00e') + "'");
  const rows = conditions.length ? await restQueryAll(instance, sid, version, 'SELECT ' + fields.join(',') + ' FROM PermissionSet WHERE ' + conditions.join(' OR ')) : [];
  const items = new Map(rows.map((row) => [idKey(row.Id), permission(row)]));
  for (const a of direct) {
    const item = items.get(idKey(a.PermissionSetId)); if (!item) continue;
    item.direct = !item.profile; item.assignmentIds.push(a.Id);
    item.sources.push({ type: item.profile ? 'profile' : 'direct', id: a.Id });
  }
  if (users[0]?.ProfileId) {
    for (const row of rows.filter((r) => r.IsOwnedByProfile)) {
      const item = items.get(idKey(row.Id)) || permission(row); item.profile = true; item.direct = false;
      if (!item.sources.some((s) => s.type === 'profile')) item.sources.push({ type: 'profile', id: users[0].ProfileId });
      items.set(idKey(row.Id), item);
    }
  }
  let partial = false;
  if (groupIds.length) {
    try {
      const [components, groups] = await Promise.all([
        restQueryAll(instance, sid, version, 'SELECT PermissionSetId, PermissionSetGroupId FROM PermissionSetGroupComponent WHERE PermissionSetGroupId IN (' + inIds(groupIds) + ')'),
        restQueryAll(instance, sid, version, 'SELECT Id, MasterLabel FROM PermissionSetGroup WHERE Id IN (' + inIds(groupIds) + ')')
      ]);
      const names = new Map(groups.map((g) => [idKey(g.Id), g.MasterLabel]));
      const inherited = components.length ? await restQueryAll(instance, sid, version, 'SELECT ' + fields.join(',') + ' FROM PermissionSet WHERE Id IN (' + inIds(components.map((c) => c.PermissionSetId)) + ')') : [];
      for (const row of inherited) if (!items.has(idKey(row.Id))) items.set(idKey(row.Id), permission(row));
      for (const component of components) {
        const item = items.get(idKey(component.PermissionSetId));
        if (item && !item.sources.some((s) => s.type === 'group' && sameSetupUserId(s.id, component.PermissionSetGroupId))) item.sources.push({ type: 'group', id: component.PermissionSetGroupId, label: names.get(idKey(component.PermissionSetGroupId)) || component.PermissionSetGroupId });
      }
    } catch { partial = true; }
  }
  return { assigned: sortItems([...items.values()].filter((x) => x.type !== 'Group' && x.type !== 'Muting')), partial };
}
export async function getSetupPalettePermissionSetGroups(instance, sid, version, userId) {
  const [allAssignments, fields] = await Promise.all([assignmentRows(instance, sid, version, userId), permissionFields(instance, sid, version, true)]);
  const assignments = allAssignments.filter((a) => a.PermissionSetGroupId);
  if (!assignments.length) return { assigned: [] };
  const rows = await restQueryAll(instance, sid, version, 'SELECT ' + fields.join(',') + ' FROM PermissionSetGroup WHERE Id IN (' + inIds(assignments.map((a) => a.PermissionSetGroupId)) + ')');
  return { assigned: sortItems(rows.map((row) => ({
    ...permission(row), direct: true, sources: [{ type: 'direct' }],
    assignmentIds: assignments.filter((a) => sameSetupUserId(a.PermissionSetGroupId, row.Id)).map((a) => a.Id)
  }))) };
}
export async function searchSetupPalettePermissions(instance, sid, version, userId, { group = false, query = '', cursor = null } = {}) {
  requireSetupId(userId, '005');
  const fields = await permissionFields(instance, sid, version, group);
  const labelField = group ? 'MasterLabel' : 'Label';
  const nameField = group ? 'DeveloperName' : 'Name';
  const conditions = [];
  if (!group) { conditions.push('IsOwnedByProfile = false'); if (fields.includes('Type')) conditions.push("Type NOT IN ('Group', 'Muting')"); }
  const term = escapeSetupPaletteSoql(normalizeSetupPaletteSearch(query)).replace(/%/g, '\\%').replace(/_/g, '\\_');
  if (term) conditions.push("(" + labelField + " LIKE '%" + term + "%' OR " + nameField + " LIKE '%" + term + "%')");
  if (cursor) {
    requireSetupId(cursor.id, group ? '0PG' : '0PS');
    if (typeof cursor.label !== 'string' || cursor.label.length > 255) throw new Error('INVALID_REQUEST');
    const label = escapeSetupPaletteSoql(cursor.label);
    conditions.push("(" + labelField + " > '" + label + "' OR (" + labelField + " = '" + label + "' AND Id > '" + cursor.id + "'))");
  }
  const rows = await restQuery(instance, sid, version, 'SELECT ' + fields.join(',') + ' FROM ' + (group ? 'PermissionSetGroup' : 'PermissionSet') + (conditions.length ? ' WHERE ' + conditions.join(' AND ') : '') + ' ORDER BY ' + labelField + ', Id LIMIT 51');
  let licenseId = '';
  if (!group && rows.some((row) => String(row.LicenseId || '').startsWith('100'))) {
    const users = await restQuery(instance, sid, version, "SELECT Profile.UserLicenseId FROM User WHERE Id = '" + userId + "'");
    licenseId = users[0]?.Profile?.UserLicenseId || '';
  }
  const page = rows.slice(0, 50);
  return {
    items: page.map((row) => ({ ...permission(row), blockedReason: group && row.Status !== 'Updated' ? 'GROUP_NOT_READY' : (!group && licenseId && String(row.LicenseId || '').startsWith('100') && !sameSetupUserId(licenseId, row.LicenseId) ? 'LICENSE' : '') })),
    nextCursor: rows.length > 50 ? { id: page.at(-1).Id, label: page.at(-1)[labelField] } : null
  };
}
export async function mutateSetupPalettePermissions(instance, sid, version, userId, ids, { group = false, remove = false } = {}) {
  requireSetupId(userId, '005');
  if (!Array.isArray(ids) || !ids.length || ids.length > 100) throw new Error('INVALID_REQUEST');
  ids.forEach((id) => requireSetupId(id, remove ? '0Pa' : group ? '0PG' : '0PS'));
  const current = await assignmentRows(instance, sid, version, userId);
  const results = [];
  const user = await getSetupPaletteUser(instance, sid, version, userId);
  if (!user.isActive) throw new Error('USER_INACTIVE');
  let candidates = [];
  if (!remove) {
    const fields = await permissionFields(instance, sid, version, group);
    candidates = await restQueryAll(instance, sid, version, 'SELECT ' + fields.join(',') + ' FROM ' + (group ? 'PermissionSetGroup' : 'PermissionSet') + ' WHERE Id IN (' + inIds(ids) + ')');
  }
  for (const id of [...new Set(ids)]) {
    try {
      if (remove) {
        const assignment = current.find((a) => sameSetupUserId(a.Id, id));
        if (!assignment || !!assignment.PermissionSetGroupId !== group) throw new Error('NOT_OWNER');
        if (!group) {
          const row = await restQuery(instance, sid, version, "SELECT IsOwnedByProfile FROM PermissionSet WHERE Id = '" + requireSetupId(assignment.PermissionSetId, '0PS') + "'");
          if (!row[0] || row[0].IsOwnedByProfile) throw new Error('INHERITED');
        }
        await restDeleteSobject(instance, sid, version, 'PermissionSetAssignment', assignment.Id);
        results.push({ id, ok: true });
      } else {
        const existing = current.find((a) => group ? sameSetupUserId(a.PermissionSetGroupId, id) : !a.PermissionSetGroupId && sameSetupUserId(a.PermissionSetId, id));
        if (existing) { results.push({ id, ok: true, alreadyAssigned: true }); continue; }
        const candidate = candidates.find((c) => sameSetupUserId(c.Id, id));
        if (!candidate) throw new Error('INVALID_REQUEST');
        if (group && candidate.Status !== 'Updated') throw new Error('GROUP_NOT_READY');
        if (!group && (candidate.IsOwnedByProfile || ['Group', 'Muting'].includes(candidate.Type))) throw new Error('INHERITED');
        const response = await restRequestWithSid(instance, sid, 'POST', '/services/data/v' + version + '/sobjects/PermissionSetAssignment', { body: JSON.stringify({ AssigneeId: userId, [group ? 'PermissionSetGroupId' : 'PermissionSetId']: id }) });
        if (!response.ok || response.json?.success === false) throw Object.assign(new Error(response.json?.[0]?.message || 'API_ERROR'), { salesforceErrorCode: response.json?.[0]?.errorCode, status: response.status });
        results.push({ id, ok: true, assignmentId: response.json?.id });
      }
    } catch (error) { results.push({ id, ok: false, reason: setupUserErrorCode(error) }); }
  }
  return { results, partial: results.some((r) => !r.ok) };
}
