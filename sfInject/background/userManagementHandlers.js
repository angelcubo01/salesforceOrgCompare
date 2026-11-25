import { loadSavedOrgs, resolveSidForOrgInTab } from '../../background/orgHelpers.js';
import { assertOrgWriteAllowed, recordLocalAudit } from '../../background/orgWriteGuard.js';
import { instanceUrlsReferToSameOrg } from '../../shared/orgDiscovery.js';
import { hostnameMatchesSfCloud } from '../../shared/sfDomains.js';
import { isQuickLinksSalesforcePage } from '../content/matchers/quickLinksPages.js';
import { loadSfInjectSettings, getSfInjectSettingsSnapshot, isSfInjectIntegrationEnabled } from '../lib/settings.js';
import { buildSfocQuickLinkUrl } from '../lib/quickLinkNavigation.js';
import { getApexTestsTraceDebugLevel } from '../../shared/extensionSettings.js';
import {
  searchSetupPaletteUsers, getSetupPaletteUser, requireSetupId, sameSetupUserId,
  getSetupPalettePermissionSets, getSetupPalettePermissionSetGroups, searchSetupPalettePermissions,
  mutateSetupPalettePermissions
} from '../../shared/setupPaletteUsersApi.js';
import { getSetupUserPublicGroups } from '../../shared/setupUserPublicGroups.js';
import { setupUserErrorCode } from '../../shared/setupUserErrors.js';
import {
  restQuery, queryDebugLevels, queryUserDebugTraceFlags, createUserDebugTraceFlag,
  updateUserDebugTraceFlag, extendUserDebugTraceFlag, deleteTraceFlagById,
  executeAnonymous, restRequestWithSid
} from '../../shared/salesforceApi.js';

export const USER_MANAGEMENT_MESSAGES = new Set([
  'searchSetupUsers', 'getSetupUserDetails', 'getUserPermissionAssignments', 'getUserPermissionGroupAssignments',
  'searchUserAvailablePermissions', 'getUserPublicGroups', 'assignUserPermissionSets', 'assignUserPermissionSetGroups',
  'removeUserPermissionSets', 'removeUserPermissionSetGroups', 'getUserTraceConfiguration', 'createUserTraceFlag',
  'updateUserTraceFlag', 'extendUserTraceFlag', 'deleteUserTraceFlag', 'getUserLoginAsAvailability', 'openUserLoginAs',
  'setUserPassword', 'updateSetupUser', 'openUserPermissionAnalysis'
].map((name) => 'sfInject:' + name));

function setupUserLoginBase(instance) {
  const base = new URL(instance);
  if (base.protocol !== 'https:' || base.username || base.password || base.port || !hostnameMatchesSfCloud(base.hostname)) throw new Error('LOGIN_AS_NOT_AVAILABLE');
  return base;
}

export function buildSetupUserLoginPath(organizationId, userId) {
  requireSetupId(organizationId, '00D'); requireSetupId(userId, '005');
  const url = new URL('/servlet/servlet.su', 'https://login-path.invalid');
  url.searchParams.set('oid', organizationId); url.searchParams.set('suorgadminid', userId);
  url.searchParams.set('retURL', '/lightning/page/home');
  return `${url.pathname}${url.search}`;
}

export function buildSetupUserLoginUrl(instance, organizationId, userId) {
  const base = setupUserLoginBase(instance);
  return new URL(buildSetupUserLoginPath(organizationId, userId), base.origin).href;
}

export function buildSetupUserLoginContinuationUrl(instance, organizationId, userId) {
  const base = setupUserLoginBase(instance);
  const url = new URL('/', base.origin);
  url.searchParams.set('startURL', buildSetupUserLoginPath(organizationId, userId));
  return url.href;
}

async function resolveContext(message, sender) {
  if (!sender?.tab?.id || (sender.id && sender.id !== chrome.runtime.id) || (sender.frameId != null && sender.frameId !== 0) || !isQuickLinksSalesforcePage(sender.url || '')) throw new Error('FORBIDDEN');
  await loadSfInjectSettings();
  if (!isSfInjectIntegrationEnabled(getSfInjectSettingsSnapshot(), 'setupCommandPalette')) throw new Error('DISABLED');
  if (typeof message.orgId !== 'string' || message.orgId.length > 100) throw new Error('INVALID_REQUEST');
  const saved = await loadSavedOrgs(); const org = saved[message.orgId];
  if (!org) throw new Error('ORG_NOT_SAVED');
  const tab = await chrome.tabs.get(sender.tab.id);
  const base = new URL(org.instanceUrl);
  if (base.protocol !== 'https:' || !hostnameMatchesSfCloud(base.hostname) ||
      !isQuickLinksSalesforcePage(tab.url || '') ||
      !instanceUrlsReferToSameOrg(org.instanceUrl, tab.url) ||
      !instanceUrlsReferToSameOrg(org.instanceUrl, sender.url)) throw new Error('FORBIDDEN');
  const sid = await resolveSidForOrgInTab(org, tab.id, {
    strictStore: true,
    allowCurrentContextFallback: true
  });
  if (!sid) throw new Error('NO_SID');
  return { org, sid, tab, instance: base.origin, version: '63.0' };
}
async function incognitoAllowed() {
  if (!chrome.extension?.isAllowedIncognitoAccess) return false;
  return new Promise((resolve) => chrome.extension.isAllowedIncognitoAccess((allowed) => resolve(!!allowed && !chrome.runtime.lastError)));
}
async function tracesFor(ctx, userId, levels = []) {
  return queryUserDebugTraceFlags(ctx.instance, ctx.sid, ctx.version, userId, { strict: true, debugLevels: levels });
}
function selectedTrace(traces) {
  const now = Date.now();
  return traces.find((t) => Date.parse(t.startIso) <= now && Date.parse(t.expirationIso) > now) || traces[0] || null;
}
const locks = new Map();
async function serialized(key, fn) {
  const previous = locks.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(fn); locks.set(key, next);
  try { return await next; } finally { if (locks.get(key) === next) locks.delete(key); }
}
async function write(ctx, message, userId, operation) {
  return serialized(ctx.instance + ':' + userId.slice(0, 15), async () => {
    let result;
    try {
      const guard = await assertOrgWriteAllowed(ctx.org, ctx.sid, { action: 'dml_execute' });
      if (!guard.ok) throw new Error(guard.reason || 'WRITE_NOT_ALLOWED');
      result = { ok: true, ...await operation() };
      return result;
    } catch (error) { result = { ok: false, reason: setupUserErrorCode(error) }; return result; }
    finally {
      // IDs and stable outcomes only: no Salesforce messages, PII or credentials.
      await recordLocalAudit({
        action: 'dml_execute', orgId: String(ctx.org.id),
        detail: JSON.stringify({
          source: 'setupCommandPalette', action: message.type.replace('sfInject:', ''), userId,
          resource: /Trace/.test(message.type) ? 'TraceFlag' : /Password|SetupUser/.test(message.type) ? 'User' : /Groups/.test(message.type) ? 'PermissionSetGroup' : 'PermissionSet',
          ids: (message.ids || message.assignmentIds || [message.traceFlagId || result?.traceFlagId]).filter((id) => typeof id === 'string' && /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(id)).slice(0, 100),
          outcome: result?.ok ? (result.partial ? 'partial' : 'success') : 'failed',
          results: result?.results?.map((r) => ({ id: r.id, ok: r.ok, reason: r.reason })), reason: result?.reason
        })
      }).catch(() => {}); // An audit storage failure cannot invert a committed DML.
    }
  });
}
async function traceWrite(ctx, message, userId) {
  const type = message.type.replace('sfInject:', '');
  const traces = await tracesFor(ctx, userId);
  if (type === 'deleteUserTraceFlag' || type === 'extendUserTraceFlag' || type === 'updateUserTraceFlag') {
    requireSetupId(message.traceFlagId, '7tf');
    if (!traces.some((t) => sameSetupUserId(t.id, message.traceFlagId) && sameSetupUserId(t.tracedEntityId, userId))) throw new Error('TRACE_NOT_FOUND');
  }
  if (type === 'deleteUserTraceFlag') {
    await deleteTraceFlagById(ctx.instance, ctx.sid, ctx.version, message.traceFlagId);
    return { traceFlagId: message.traceFlagId };
  }
  const minutes = message.minutes ?? 30;
  if (![15, 30, 60].includes(minutes)) throw new Error('INVALID_REQUEST');
  if (type === 'extendUserTraceFlag') return extendUserDebugTraceFlag(ctx.instance, ctx.sid, ctx.version, { traceFlagId: message.traceFlagId, addMs: minutes * 60000, allowReactivate: true });
  const levels = await queryDebugLevels(ctx.instance, ctx.sid, ctx.version, { strict: true });
  requireSetupId(message.debugLevelId, '7dl');
  if (!levels.some((l) => sameSetupUserId(l.id, message.debugLevelId))) throw new Error('NO_DEBUG_LEVEL');
  const now = new Date();
  if (type === 'createUserTraceFlag') {
    const existing = selectedTrace(traces);
    const dates = { startIso: now.toISOString(), expirationIso: new Date(+now + minutes * 60000).toISOString() };
    if (existing) return { ...await updateUserDebugTraceFlag(ctx.instance, ctx.sid, ctx.version, { traceFlagId: existing.id, debugLevelId: message.debugLevelId, ...dates }), traceFlagId: existing.id };
    return createUserDebugTraceFlag(ctx.instance, ctx.sid, ctx.version, { userId, debugLevelId: message.debugLevelId, ...dates, replaceExisting: false });
  }
  const trace = traces.find((t) => sameSetupUserId(t.id, message.traceFlagId));
  // Changing the level preserves dates and cannot change another user's window.
  return updateUserDebugTraceFlag(ctx.instance, ctx.sid, ctx.version, {
    traceFlagId: trace.id, debugLevelId: message.debugLevelId, startIso: trace.startIso, expirationIso: trace.expirationIso
  });
}

function apexString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n');
}

function passwordForUserManagement(value) {
  const password = String(value || '');
  if (password.length < 8 || password.length > 1000 || /[\u0000-\u001f\u007f]/.test(password)) throw new Error('INVALID_REQUEST');
  return password;
}

function userFieldsForUpdate(value) {
  const allowed = new Map([
    ['Email', 80], ['Alias', 8], ['FederationIdentifier', 512],
    ['LanguageLocaleKey', 40], ['LocaleSidKey', 40], ['TimeZoneSidKey', 64]
  ]);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_REQUEST');
  const fields = {};
  for (const [name, maxLength] of allowed) {
    if (!(name in value)) continue;
    const next = String(value[name] ?? '').trim();
    if (next.length > maxLength || /[\u0000-\u001f\u007f]/.test(next)) throw new Error('INVALID_REQUEST');
    if (name !== 'FederationIdentifier' && !next) throw new Error('INVALID_REQUEST');
    if (name === 'Email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) throw new Error('INVALID_REQUEST');
    fields[name] = next;
  }
  if (!Object.keys(fields).length) throw new Error('INVALID_REQUEST');
  return fields;
}

async function setUserPassword(ctx, userId, password) {
  const result = await executeAnonymous(
    ctx.instance,
    ctx.sid,
    ctx.version,
    `System.setPassword('${apexString(userId)}', '${apexString(password)}');`,
    ctx.org.id
  );
  if (!result?.compiled || !result?.success) throw new Error('API_ERROR');
  return {};
}

async function updateSetupUser(ctx, userId, fields) {
  const response = await restRequestWithSid(
    ctx.instance,
    ctx.sid,
    'PATCH',
    `/services/data/v${ctx.version}/sobjects/User/${encodeURIComponent(userId)}`,
    { body: JSON.stringify(fields) }
  );
  if (!response.ok || response.json?.success === false) {
    throw Object.assign(new Error(response.json?.[0]?.message || 'API_ERROR'), {
      salesforceErrorCode: response.json?.[0]?.errorCode,
      status: response.status
    });
  }
  return { user: await getSetupPaletteUser(ctx.instance, ctx.sid, ctx.version, userId) };
}

async function openUserPermissionAnalysis(ctx, userId) {
  const user = await getSetupPaletteUser(ctx.instance, ctx.sid, ctx.version, userId);
  const path = buildSfocQuickLinkUrl('PermissionDiff', ctx.org.id);
  if (!path) throw new Error('INVALID_REQUEST');
  const url = new URL(path);
  url.searchParams.set('permissionDiffUserId', userId);
  url.searchParams.set('permissionDiffUserName', user.name || user.username || userId);
  url.searchParams.set('permissionDiffUsername', user.username || '');
  await chrome.tabs.create({ url: url.href, active: true, openerTabId: ctx.tab.id, windowId: ctx.tab.windowId, index: ctx.tab.index + 1 });
  return { opened: true };
}

export async function handleUserManagementMessage(message, sender) {
  try {
    const ctx = await resolveContext(message, sender);
    const type = message.type.replace('sfInject:', '');
    if (type === 'searchSetupUsers') {
      if (typeof message.query !== 'string' || message.query.length > 100 || /[\u0000-\u001f\u007f]/.test(message.query)) throw new Error('INVALID_REQUEST');
      return { ok: true, users: await searchSetupPaletteUsers(ctx.instance, ctx.sid, ctx.version, message.query) };
    }
    const userId = requireSetupId(message.userId, '005');
    if (type === 'getSetupUserDetails') return { ok: true, user: await getSetupPaletteUser(ctx.instance, ctx.sid, ctx.version, userId) };
    if (type === 'getUserPermissionAssignments') return { ok: true, ...await getSetupPalettePermissionSets(ctx.instance, ctx.sid, ctx.version, userId) };
    if (type === 'getUserPermissionGroupAssignments') return { ok: true, ...await getSetupPalettePermissionSetGroups(ctx.instance, ctx.sid, ctx.version, userId) };
    if (type === 'getUserPublicGroups') return { ok: true, ...await getSetupUserPublicGroups(ctx.instance, ctx.sid, ctx.version, userId) };
    if (type === 'searchUserAvailablePermissions') {
      if (!['sets', 'groups'].includes(message.kind) || typeof message.query !== 'string' || message.query.length > 100) throw new Error('INVALID_REQUEST');
      return { ok: true, ...await searchSetupPalettePermissions(ctx.instance, ctx.sid, ctx.version, userId, { group: message.kind === 'groups', query: message.query, cursor: message.cursor }) };
    }
    if (/^(assign|remove)UserPermission/.test(type)) {
      const remove = type.startsWith('remove'); const ids = remove ? message.assignmentIds : message.ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some((id) => typeof id !== 'string')) throw new Error('INVALID_REQUEST');
      return write(ctx, message, userId, () => mutateSetupPalettePermissions(ctx.instance, ctx.sid, ctx.version, userId, ids, { group: type.endsWith('Groups'), remove }));
    }
    if (type === 'getUserTraceConfiguration') {
      const levels = await queryDebugLevels(ctx.instance, ctx.sid, ctx.version, { strict: true });
      const traces = await tracesFor(ctx, userId, levels);
      return { ok: true, trace: selectedTrace(traces), debugLevels: levels, preferredDebugLevel: getApexTestsTraceDebugLevel() };
    }
    if (['createUserTraceFlag', 'updateUserTraceFlag', 'extendUserTraceFlag', 'deleteUserTraceFlag'].includes(type)) return write(ctx, message, userId, () => traceWrite(ctx, message, userId));
    if (type === 'setUserPassword') return write(ctx, message, userId, () => setUserPassword(ctx, userId, passwordForUserManagement(message.password)));
    if (type === 'updateSetupUser') return write(ctx, message, userId, () => updateSetupUser(ctx, userId, userFieldsForUpdate(message.fields)));
    if (type === 'openUserPermissionAnalysis') return { ok: true, ...await openUserPermissionAnalysis(ctx, userId) };
    if (type === 'getUserLoginAsAvailability') return { ok: true, incognito: await incognitoAllowed() };
    if (type === 'openUserLoginAs') {
      if (!['currentTab', 'newTab', 'incognito'].includes(message.target)) throw new Error('INVALID_REQUEST');
      const user = await getSetupPaletteUser(ctx.instance, ctx.sid, ctx.version, userId);
      if (!user.isActive) throw new Error('USER_INACTIVE');
      const organizations = await restQuery(ctx.instance, ctx.sid, ctx.version, 'SELECT Id FROM Organization LIMIT 1');
      const url = buildSetupUserLoginUrl(ctx.instance, organizations[0]?.Id, userId);
      if (message.target === 'incognito') {
        if (!await incognitoAllowed()) throw new Error('INCOGNITO_NOT_ENABLED');
        if (ctx.tab.incognito) {
          await chrome.tabs.create({ url, active: true, openerTabId: ctx.tab.id, windowId: ctx.tab.windowId, index: ctx.tab.index + 1 });
          return { ok: true, opened: true };
        }
        const continuationUrl = buildSetupUserLoginContinuationUrl(
          ctx.instance,
          organizations[0]?.Id,
          userId
        );
        await chrome.windows.create({ url: continuationUrl, incognito: true, focused: true });
        return { ok: true, opened: true, authenticationMayBeRequired: true };
      }
      if (message.target === 'currentTab') await chrome.tabs.update(ctx.tab.id, { url });
      else await chrome.tabs.create({ url, active: true, openerTabId: ctx.tab.id, windowId: ctx.tab.windowId, index: ctx.tab.index + 1 });
      return { ok: true, opened: true };
    }
    throw new Error('INVALID_REQUEST');
  } catch (error) { return { ok: false, reason: setupUserErrorCode(error) }; }
}
