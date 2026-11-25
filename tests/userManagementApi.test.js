import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../shared/salesforceApi.js', () => ({
  restQuery: vi.fn(), restQueryAll: vi.fn(), restDescribeSobject: vi.fn(), restDeleteSobject: vi.fn(),
  restRequestWithSid: vi.fn(), restSoqlQueryPage: vi.fn()
}));
import * as sf from '../shared/salesforceApi.js';
import { getSetupPalettePermissionSets, getSetupPalettePermissionSetGroups, searchSetupPalettePermissions, mutateSetupPalettePermissions } from '../shared/setupPaletteUsersApi.js';
import { explainPublicGroupPaths, getSetupUserPublicGroups } from '../shared/setupUserPublicGroups.js';
import { createUserManagementCache } from '../sfInject/content/userManagementCache.js';
import { userTraceState } from '../sfInject/content/userLogsPanel.js';
const uid = '005000000000001', ps = '0PS000000000001', group = '0PG000000000001', assignment = '0Pa000000000001';
let instance;
beforeEach(() => {
  vi.resetAllMocks(); instance = 'https://test-' + Math.random() + '.my.salesforce.com';
  sf.restDescribeSobject.mockResolvedValue({ fields: ['Id', 'Name', 'Label', 'MasterLabel', 'DeveloperName', 'NamespacePrefix', 'Status', 'LastModifiedDate', 'IsOwnedByProfile', 'ProfileId', 'Type', 'LicenseId'].map((name) => ({ name })) });
  sf.restQuery.mockImplementation(async (_i, _s, _v, query) => query.includes('FROM User') ? [{ Id: uid, Name: 'Test', IsActive: true }] : []);
  sf.restQueryAll.mockResolvedValue([]);
});
const args = () => [instance, 'fake-test-credential', '63.0'];
describe('permission assignment API', () => {
  it('uses PSA for groups and keeps the actual assignment ID', async () => {
    sf.restQueryAll.mockImplementation(async (_i, _s, _v, query) => query.includes('FROM PermissionSetAssignment') ? [{ Id: assignment, AssigneeId: uid, PermissionSetGroupId: group }] : [{ Id: group, MasterLabel: 'Group', Status: 'Updated' }]);
    const result = await getSetupPalettePermissionSetGroups(...args(), uid);
    expect(result.assigned[0].assignmentIds).toEqual([assignment]);
    expect(sf.restQueryAll.mock.calls[0][3]).toContain('FROM PermissionSetAssignment');
  });
  it('retains direct and inherited sources for the same permission set', async () => {
    sf.restQueryAll.mockImplementation(async (_i, _s, _v, q) => {
      if (q.includes('FROM PermissionSetAssignment')) return [{ Id: assignment, PermissionSetId: ps }, { Id: '0Pa000000000002', PermissionSetGroupId: group }];
      if (q.includes('FROM PermissionSetGroupComponent')) return [{ PermissionSetId: ps, PermissionSetGroupId: group }];
      if (q.includes('FROM PermissionSetGroup')) return [{ Id: group, MasterLabel: 'Contact Center' }];
      return [{ Id: ps, Label: 'Agent', Name: 'Agent', Type: 'Regular' }];
    });
    const result = await getSetupPalettePermissionSets(...args(), uid);
    expect(result.assigned).toHaveLength(1);
    expect(result.assigned[0].direct).toBe(true);
    expect(result.assigned[0].sources.map((s) => s.type)).toEqual(['direct', 'group']);
    expect(result.assigned[0].sources[1].label).toBe('Contact Center');
  });
  it('paginates 50 records using a label/id cursor without OFFSET truncation', async () => {
    sf.restQuery.mockResolvedValue(Array.from({ length: 51 }, (_, n) => ({ Id: '0PS' + String(n).padStart(12, '0'), Label: 'Permission ' + n, Name: 'P' + n })));
    const result = await searchSetupPalettePermissions(...args(), uid, { query: "O'Hara" });
    expect(result.items).toHaveLength(50); expect(result.nextCursor.id).toBe('0PS000000000049');
    const q = sf.restQuery.mock.calls[0][3];
    expect(q).toContain("O\\'Hara"); expect(q).toContain('LIMIT 51'); expect(q).toContain("Type NOT IN ('Group', 'Muting')");
    await searchSetupPalettePermissions(...args(), uid, { cursor: result.nextCursor });
    expect(sf.restQuery.mock.calls.at(-1)[3]).toContain("Id > '0PS000000000049'");
  });
  it('assigns PSG through PSA, skips duplicates and reports license failures per item', async () => {
    const group2 = '0PG000000000002';
    sf.restQueryAll.mockImplementation(async (_i, _s, _v, q) => q.includes('FROM PermissionSetAssignment') ? [] : [{ Id: group, Status: 'Updated' }, { Id: group2, Status: 'Updated' }]);
    sf.restRequestWithSid.mockResolvedValueOnce({ ok: true, json: { id: assignment } }).mockResolvedValueOnce({ ok: false, status: 400, json: [{ errorCode: 'LICENSE_LIMIT_EXCEEDED', message: 'license incompatible' }] });
    const result = await mutateSetupPalettePermissions(...args(), uid, [group, group2], { group: true });
    expect(sf.restRequestWithSid.mock.calls[0][3]).toBe('/services/data/v63.0/sobjects/PermissionSetAssignment');
    expect(JSON.parse(sf.restRequestWithSid.mock.calls[0][4].body)).toEqual({ AssigneeId: uid, PermissionSetGroupId: group });
    expect(result.partial).toBe(true); expect(result.results[1].reason).toBe('LICENSE');
  });
  it('does not delete an assignment belonging to another user or permission kind', async () => {
    sf.restQueryAll.mockResolvedValue([]);
    const result = await mutateSetupPalettePermissions(...args(), uid, [assignment], { remove: true });
    expect(result.results[0]).toEqual({ id: assignment, ok: false, reason: 'NOT_OWNER' });
    expect(sf.restDeleteSobject).not.toHaveBeenCalled();
  });
  it('prevents profile removal and refuses recalculating groups', async () => {
    sf.restQueryAll.mockResolvedValueOnce([{ Id: assignment, PermissionSetId: ps }]);
    sf.restQuery.mockImplementation(async (_i, _s, _v, q) => q.includes('FROM User') ? [{ Id: uid, IsActive: true }] : [{ IsOwnedByProfile: true }]);
    const removal = await mutateSetupPalettePermissions(...args(), uid, [assignment], { remove: true });
    expect(removal.results[0].reason).toBe('INHERITED');
    sf.restQueryAll.mockResolvedValueOnce([]).mockResolvedValueOnce([{ Id: group, Status: 'Updating' }]);
    const addition = await mutateSetupPalettePermissions(...args(), uid, [group], { group: true });
    expect(addition.results[0].reason).toBe('GROUP_NOT_READY');
    expect(sf.restRequestWithSid).not.toHaveBeenCalled();
  });
  it('does not issue DML for duplicates', async () => {
    sf.restQueryAll.mockResolvedValueOnce([{ Id: assignment, PermissionSetGroupId: group }]).mockResolvedValueOnce([{ Id: group, Status: 'Updated' }]);
    const result = await mutateSetupPalettePermissions(...args(), uid, [group], { group: true });
    expect(result.results[0].alreadyAssigned).toBe(true); expect(sf.restRequestWithSid).not.toHaveBeenCalled();
  });
});
describe('public group paths', () => {
  it('retains direct, nested and role causes and terminates cycles', () => {
    const a = '00G000000000001', b = '00G000000000002', role = '00G000000000003';
    const groups = [{ Id: a, Name: 'Office', Type: 'Regular' }, { Id: b, Name: 'Support', Type: 'Regular' }, { Id: role, Name: 'Contact Center', Type: 'Role' }];
    const edges = [{ UserOrGroupId: uid, GroupId: a }, { UserOrGroupId: uid, GroupId: b }, { UserOrGroupId: a, GroupId: b }, { UserOrGroupId: b, GroupId: a }, { UserOrGroupId: role, GroupId: b }];
    const result = explainPublicGroupPaths(uid, [groups[2]], edges, groups);
    expect(result.groups).toHaveLength(2);
    expect(result.groups.find((g) => g.id === b).reasons.map((r) => r.kind).sort()).toEqual(['direct', 'nested', 'role']);
    expect(result.partial).toBe(false);
  });
  it('paginates membership reads and returns a partial indicator on subsequent failure', async () => {
    const g = { Id: '00G000000000001', Name: 'Office', Type: 'Regular' };
    sf.restSoqlQueryPage.mockResolvedValueOnce({ records: [{ GroupId: g.Id, UserOrGroupId: uid, Group: g }], nextPath: '/services/data/v63.0/query/next' })
      .mockResolvedValueOnce({ records: [], nextPath: null }).mockRejectedValueOnce(new Error('INSUFFICIENT_ACCESS'));
    const result = await getSetupUserPublicGroups(...args(), uid);
    expect(result.groups[0].label).toBe('Office'); expect(result.partial).toBe(true);
    expect(sf.restSoqlQueryPage.mock.calls[1][3]).toBe('/services/data/v63.0/query/next');
  });
});
describe('session cache and trace presentation', () => {
  it('deduplicates concurrent reads, retries errors and isolates invalidated reads', async () => {
    const cache = createUserManagementCache(); let done;
    const loader = vi.fn(() => new Promise((resolve) => { done = resolve; }));
    const first = cache.get('user:sets', loader); const same = cache.get('user:sets', loader);
    await Promise.resolve(); expect(loader).toHaveBeenCalledTimes(1); expect(first).toBe(same);
    cache.invalidate('user:sets'); const fresh = cache.get('user:sets', () => 'fresh'); done('stale');
    expect(await first).toBe('stale'); expect(await fresh).toBe('fresh'); expect(await cache.get('user:sets', loader)).toBe('fresh');
    await expect(cache.get('bad', () => Promise.reject(new Error('retry')))).rejects.toThrow('retry');
    expect(await cache.get('bad', () => 'ok')).toBe('ok');
  });
  it('distinguishes absent, active, expiring, expired and scheduled traces', () => {
    const now = Date.now(); const trace = (start, end) => ({ startIso: new Date(now + start).toISOString(), expirationIso: new Date(now + end).toISOString() });
    expect(userTraceState(null, now)).toBe('none'); expect(userTraceState(trace(-60000, 600000), now)).toBe('active');
    expect(userTraceState(trace(-60000, 120000), now)).toBe('soon'); expect(userTraceState(trace(-60000, -1), now)).toBe('expired');
    expect(userTraceState(trace(60000, 600000), now)).toBe('scheduled');
  });
});
