import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../background/orgHelpers.js', () => ({ loadSavedOrgs: vi.fn(), resolveSidForOrgInTab: vi.fn() }));
vi.mock('../background/orgWriteGuard.js', () => ({ assertOrgWriteAllowed: vi.fn(), recordLocalAudit: vi.fn() }));
vi.mock('../sfInject/lib/settings.js', () => ({ loadSfInjectSettings: vi.fn(), getSfInjectSettingsSnapshot: vi.fn(), isSfInjectIntegrationEnabled: vi.fn() }));
vi.mock('../shared/salesforceApi.js', () => ({
  restQuery: vi.fn(), queryDebugLevels: vi.fn(), queryUserDebugTraceFlags: vi.fn(),
  createUserDebugTraceFlag: vi.fn(), updateUserDebugTraceFlag: vi.fn(), extendUserDebugTraceFlag: vi.fn(), deleteTraceFlagById: vi.fn(),
  executeAnonymous: vi.fn(), restRequestWithSid: vi.fn()
}));
vi.mock('../shared/setupPaletteUsersApi.js', async (original) => {
  const api = await original();
  return { ...api, getSetupPaletteUser: vi.fn(), mutateSetupPalettePermissions: vi.fn() };
});
import * as orgs from '../background/orgHelpers.js';
import * as guard from '../background/orgWriteGuard.js';
import * as settings from '../sfInject/lib/settings.js';
import * as sf from '../shared/salesforceApi.js';
import * as api from '../shared/setupPaletteUsersApi.js';
import {
  buildSetupUserLoginContinuationUrl,
  buildSetupUserLoginPath,
  buildSetupUserLoginUrl,
  handleUserManagementMessage
} from '../sfInject/background/userManagementHandlers.js';
const userId = '005000000000001', organizationId = '00D000000000001', traceId = '7tf000000000001', levelId = '7dl000000000001';
const instance = 'https://sample.my.salesforce.com';
const tab = { id: 4, index: 2, windowId: 3, incognito: false, url: instance + '/lightning/setup/SetupOneHome/home' };
const sender = { id: 'test-extension-id', frameId: 0, url: tab.url, tab };
const msg = (name, extra = {}) => ({ type: 'sfInject:' + name, orgId: 'internal-org', userId, ...extra });
beforeEach(() => {
  vi.clearAllMocks();
  orgs.loadSavedOrgs.mockResolvedValue({ 'internal-org': { id: 'internal-org', instanceUrl: instance } });
  orgs.resolveSidForOrgInTab.mockResolvedValue('sensitive-test-credential');
  settings.isSfInjectIntegrationEnabled.mockReturnValue(true);
  guard.assertOrgWriteAllowed.mockResolvedValue({ ok: true }); guard.recordLocalAudit.mockResolvedValue();
  chrome.tabs.get = vi.fn().mockResolvedValue(tab); chrome.tabs.update = vi.fn().mockResolvedValue({}); chrome.tabs.create = vi.fn().mockResolvedValue({});
  chrome.runtime = { ...(chrome.runtime || {}), id: 'test-extension-id', getURL: (path) => `chrome-extension://test-extension-id/${path}` };
  chrome.windows = { create: vi.fn().mockResolvedValue({}) };
  chrome.extension = { inIncognitoContext: false, isAllowedIncognitoAccess: vi.fn((callback) => callback(true)) };
  sf.restQuery.mockResolvedValue([{ Id: organizationId }]);
  sf.queryUserDebugTraceFlags.mockResolvedValue([]);
  sf.queryDebugLevels.mockResolvedValue([{ id: levelId, label: 'Dev Console', developerName: 'SFDC_DevConsole' }]);
  sf.executeAnonymous.mockResolvedValue({ compiled: true, success: true });
  sf.restRequestWithSid.mockResolvedValue({ ok: true, status: 204, json: null });
  api.getSetupPaletteUser.mockResolvedValue({ id: userId, isActive: true });
  api.mutateSetupPalettePermissions.mockResolvedValue({ results: [{ id: '0PS000000000001', ok: true }] });
});
describe('Login As', () => {
  it('abre el análisis de permisos en una pestaña de la extensión y precarga el usuario', async () => {
    const result = await handleUserManagementMessage(msg('openUserPermissionAnalysis'), sender);
    expect(result).toMatchObject({ ok: true, opened: true });
    const url = new URL(chrome.tabs.create.mock.calls[0][0].url);
    expect(url.protocol).toBe('chrome-extension:');
    expect(url.searchParams.get('op')).toBe('PermissionDiff');
    expect(url.searchParams.get('left')).toBe('internal-org');
    expect(url.searchParams.get('permissionDiffUserId')).toBe(userId);
    expect(chrome.tabs.create.mock.calls[0][0]).toMatchObject({ openerTabId: 4, windowId: 3, index: 3 });
  });
  it('constructs an HTTPS URL using real org and user IDs and no credential', () => {
    const url = new URL(buildSetupUserLoginUrl(instance, organizationId, userId));
    expect(url.searchParams.get('oid')).toBe(organizationId); expect(url.searchParams.get('suorgadminid')).toBe(userId);
    expect(url.href).not.toMatch(/sid=|frontdoor|sensitive-test-credential/);
    expect(() => buildSetupUserLoginUrl('http://sample.my.salesforce.com', organizationId, userId)).toThrow();
    expect(() => buildSetupUserLoginUrl('https://salesforce.com.evil.example', organizationId, userId)).toThrow();
    expect(() => buildSetupUserLoginUrl(instance, 'internal-org', userId)).toThrow();
  });
  it('builds a relative, credential-free startURL for incognito authentication', () => {
    const path = buildSetupUserLoginPath(organizationId, userId);
    const continuation = new URL(buildSetupUserLoginContinuationUrl(instance, organizationId, userId));
    expect(path).toMatch(/^\/servlet\/servlet\.su\?/);
    expect(continuation.origin).toBe(instance);
    expect(continuation.searchParams.get('startURL')).toBe(path);
    expect(continuation.href).not.toMatch(/sid=|frontdoor|sensitive-test-credential/);
  });
  it('opens the current tab and an adjacent new tab with an independently resolved org ID', async () => {
    expect((await handleUserManagementMessage(msg('openUserLoginAs', { target: 'currentTab' }), sender)).ok).toBe(true);
    expect(chrome.tabs.update.mock.calls[0][0]).toBe(4);
    expect(new URL(chrome.tabs.update.mock.calls[0][1].url).searchParams.get('oid')).toBe(organizationId);
    await handleUserManagementMessage(msg('openUserLoginAs', { target: 'newTab' }), sender);
    expect(chrome.tabs.create.mock.calls[0][0]).toMatchObject({ windowId: 3, index: 3, openerTabId: 4 });
  });
  it('refuses inactive users, invalid targets, and mismatched tabs', async () => {
    api.getSetupPaletteUser.mockResolvedValue({ isActive: false });
    expect((await handleUserManagementMessage(msg('openUserLoginAs', { target: 'newTab' }), sender)).reason).toBe('USER_INACTIVE');
    expect((await handleUserManagementMessage(msg('openUserLoginAs', { target: 'https://evil.example' }), sender)).reason).toBe('INVALID_REQUEST');
    chrome.tabs.get.mockResolvedValue({ ...tab, url: 'https://other.my.salesforce.com' });
    expect((await handleUserManagementMessage(msg('getSetupUserDetails'), sender)).reason).toBe('FORBIDDEN');
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });
  it('checks incognito permission and continues Login As after independent authentication', async () => {
    chrome.extension.isAllowedIncognitoAccess.mockImplementation((callback) => callback(false));
    expect((await handleUserManagementMessage(msg('openUserLoginAs', { target: 'incognito' }), sender)).reason).toBe('INCOGNITO_NOT_ENABLED');
    chrome.extension.isAllowedIncognitoAccess.mockImplementation((callback) => callback(true));
    const result = await handleUserManagementMessage(msg('openUserLoginAs', { target: 'incognito' }), sender);
    expect(result).toMatchObject({ opened: true, authenticationMayBeRequired: true });
    const options = chrome.windows.create.mock.calls[0][0];
    expect(options.incognito).toBe(true);
    const opened = new URL(options.url);
    expect(opened.searchParams.get('startURL')).toMatch(/^\/servlet\/servlet\.su\?/);
    expect(options.url).not.toMatch(/sid=|frontdoor|sensitive-test-credential/);
  });
  it('keeps Login As inside an already incognito window', async () => {
    chrome.tabs.get.mockResolvedValue({ ...tab, incognito: true });
    const result = await handleUserManagementMessage(msg('openUserLoginAs', { target: 'incognito' }), {
      ...sender,
      tab: { ...tab, incognito: true }
    });
    expect(result).toMatchObject({ ok: true, opened: true });
    expect(chrome.windows.create).not.toHaveBeenCalled();
    expect(chrome.tabs.create.mock.calls[0][0]).toMatchObject({
      windowId: 3,
      index: 3,
      openerTabId: 4
    });
  });
});
describe('guarded operations and logs', () => {
  it('cambia la contraseña sin guardarla ni incluirla en la auditoría', async () => {
    const result = await handleUserManagementMessage(msg('setUserPassword', { password: 'S3gura!Pass' }), sender);
    expect(result.ok).toBe(true);
    expect(sf.executeAnonymous).toHaveBeenCalledWith(instance, 'sensitive-test-credential', '63.0', expect.stringContaining("System.setPassword('005000000000001'"), 'internal-org');
    expect(JSON.stringify(guard.recordLocalAudit.mock.calls)).not.toContain('S3gura!Pass');
    expect((await handleUserManagementMessage(msg('setUserPassword', { password: 'short' }), sender)).reason).toBe('INVALID_REQUEST');
  });
  it('actualiza únicamente los campos de usuario permitidos', async () => {
    api.getSetupPaletteUser.mockResolvedValue({ id: userId, email: 'new@example.test', alias: 'new', isActive: true });
    const result = await handleUserManagementMessage(msg('updateSetupUser', { fields: { Email: 'new@example.test', Alias: 'new' } }), sender);
    expect(result).toMatchObject({ ok: true, user: { email: 'new@example.test' } });
    expect(sf.restRequestWithSid).toHaveBeenCalledWith(instance, 'sensitive-test-credential', 'PATCH', `/services/data/v63.0/sobjects/User/${userId}`, { body: JSON.stringify({ Email: 'new@example.test', Alias: 'new' }) });
    expect((await handleUserManagementMessage(msg('updateSetupUser', { fields: { IsActive: false } }), sender)).reason).toBe('INVALID_REQUEST');
  });
  it('guards writes and audits a denied operation without credentials', async () => {
    guard.assertOrgWriteAllowed.mockResolvedValue({ ok: false, reason: 'ORG_READ_ONLY' });
    const result = await handleUserManagementMessage(msg('assignUserPermissionSets', { ids: ['0PS000000000001'] }), sender);
    expect(result.reason).toBe('ORG_READ_ONLY'); expect(api.mutateSetupPalettePermissions).not.toHaveBeenCalled();
    const audit = JSON.parse(guard.recordLocalAudit.mock.calls[0][0].detail);
    expect(audit).toMatchObject({ userId, outcome: 'failed', source: 'setupCommandPalette' });
    expect(JSON.stringify(guard.recordLocalAudit.mock.calls)).not.toContain('sensitive-test-credential');
  });
  it('audits partial results and resolves the session against the sender tab', async () => {
    api.mutateSetupPalettePermissions.mockResolvedValue({ partial: true, results: [{ id: '0PS000000000001', ok: false, reason: 'LICENSE' }] });
    const result = await handleUserManagementMessage(msg('assignUserPermissionSets', { ids: ['0PS000000000001'] }), sender);
    expect(result.partial).toBe(true); expect(orgs.resolveSidForOrgInTab).toHaveBeenCalledWith(expect.any(Object), 4, { strictStore: true, allowCurrentContextFallback: true });
    expect(JSON.parse(guard.recordLocalAudit.mock.calls[0][0].detail).outcome).toBe('partial');
  });
  it('does not mutate a Trace Flag owned by another user', async () => {
    sf.queryUserDebugTraceFlags.mockResolvedValue([{ id: traceId, tracedEntityId: '005000000000002' }]);
    const result = await handleUserManagementMessage(msg('deleteUserTraceFlag', { traceFlagId: traceId }), sender);
    expect(result.reason).toBe('TRACE_NOT_FOUND'); expect(sf.deleteTraceFlagById).not.toHaveBeenCalled();
  });
  it('reuses an expired flag on activation and validates the selected Debug Level', async () => {
    sf.queryUserDebugTraceFlags.mockResolvedValue([{ id: traceId, tracedEntityId: userId, startIso: '2020-01-01T00:00:00Z', expirationIso: '2020-01-01T00:30:00Z' }]);
    sf.updateUserDebugTraceFlag.mockResolvedValue({ traceFlagId: traceId });
    const result = await handleUserManagementMessage(msg('createUserTraceFlag', { debugLevelId: levelId, minutes: 30 }), sender);
    expect(result.ok).toBe(true); expect(sf.createUserDebugTraceFlag).not.toHaveBeenCalled();
    const dates = sf.updateUserDebugTraceFlag.mock.calls[0][3];
    expect(Date.parse(dates.expirationIso) - Date.parse(dates.startIso)).toBe(30 * 60000);
    expect((await handleUserManagementMessage(msg('createUserTraceFlag', { debugLevelId: '7dl000000000099', minutes: 30 }), sender)).reason).toBe('NO_DEBUG_LEVEL');
  });
  it('preserves dates when changing level, renews chosen duration, and handles the 24-hour limit', async () => {
    const flag = { id: traceId, tracedEntityId: userId, startIso: '2026-10-30T10:00:00Z', expirationIso: '2026-10-30T11:00:00Z' };
    sf.queryUserDebugTraceFlags.mockResolvedValue([flag]);
    await handleUserManagementMessage(msg('updateUserTraceFlag', { traceFlagId: traceId, debugLevelId: levelId }), sender);
    expect(sf.updateUserDebugTraceFlag.mock.calls[0][3]).toMatchObject({ startIso: flag.startIso, expirationIso: flag.expirationIso });
    sf.extendUserDebugTraceFlag.mockRejectedValue(new Error('Trace window cannot exceed 24 hours'));
    const result = await handleUserManagementMessage(msg('extendUserTraceFlag', { traceFlagId: traceId, minutes: 60 }), sender);
    expect(result.reason).toBe('MAX_WINDOW'); expect(sf.extendUserDebugTraceFlag.mock.calls[0][3].addMs).toBe(3600000);
  });
  it('propagates trace read errors rather than returning an empty configuration', async () => {
    sf.queryUserDebugTraceFlags.mockRejectedValueOnce(Object.assign(new Error('INVALID_SESSION_ID'), { status: 401 }));
    expect((await handleUserManagementMessage(msg('getUserTraceConfiguration'), sender)).reason).toBe('NO_SID');
  });
});
