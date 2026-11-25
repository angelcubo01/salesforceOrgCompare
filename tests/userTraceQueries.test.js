import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryDebugLevels, queryUserDebugTraceFlags, createUserDebugTraceFlag } from '../shared/salesforceApi.js';
afterEach(() => vi.unstubAllGlobals());
describe('strict trace queries for the user modal', () => {
  it('does not convert a denied DebugLevel query into an empty result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ errorCode: 'INSUFFICIENT_ACCESS', message: 'Access denied' }]), { status: 403 })));
    await expect(queryDebugLevels('https://demo.my.salesforce.com', 'test', '63.0', { strict: true })).rejects.toMatchObject({ status: 403 });
  });
  it('retains the user filter in every fallback and propagates expired sessions', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{ errorCode: 'INVALID_SESSION_ID', message: 'Session expired' }]), { status: 401 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(queryUserDebugTraceFlags('https://demo.my.salesforce.com', 'test', '63.0', '005000000000001', { strict: true, debugLevels: [] })).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [url] of fetcher.mock.calls) expect(new URL(url).searchParams.get('q')).toContain("TracedEntityId = '005000000000001'");
  });
  it('reuses supplied levels and requests only the selected user', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ done: true, records: [{ Id: '7tf000000000001', TracedEntityId: '005000000000001', DebugLevelId: '7dl000000000001', StartDate: '2026-10-30T10:00:00Z', ExpirationDate: '2026-10-30T11:00:00Z' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const result = await queryUserDebugTraceFlags('https://demo.my.salesforce.com', 'test', '63.0', '005000000000001', { strict: true, debugLevels: [{ id: '7dl000000000001', label: 'Console' }] });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(result[0].debugLevelLabel).toBe('Console');
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get('q')).toContain('LIMIT 50');
  });
  it('can create a flag without deleting a concurrently created flag', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: '7tf000000000001', success: true }), { status: 201 }));
    vi.stubGlobal('fetch', fetcher);
    await createUserDebugTraceFlag('https://demo.my.salesforce.com', 'test', '63.0', {
      userId: '005000000000001', debugLevelId: '7dl000000000001',
      startIso: '2026-10-30T10:00:00Z', expirationIso: '2026-10-30T10:30:00Z', replaceExisting: false
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].method).toBe('POST');
  });
});
