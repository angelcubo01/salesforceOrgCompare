import { describe, it, expect, vi } from 'vitest';
import { resolveDebugLogRowsWithIds } from '../sfInject/content/injectors/debugLogRowResolver.js';

describe('resolveDebugLogRowsWithIds', () => {
  it('maps rows without DOM ids using API catalog order', async () => {
    const doc = {
      querySelector: () => null,
      querySelectorAll: () => []
    };
    const rowA = { ownerDocument: doc, textContent: 'User A 2026-03-21 Success', querySelector: () => null, querySelectorAll: () => [], closest: () => null, getAttribute: () => null };
    const rowB = { ownerDocument: doc, textContent: 'User B 2026-03-21 Success', querySelector: () => null, querySelectorAll: () => null, closest: () => null, getAttribute: () => null };

    vi.spyOn(await import('../sfInject/content/injectors/debugLogOpenViewerDom.js'), 'findDebugLogActionRows').mockReturnValue([rowA, rowB]);
    vi.spyOn(await import('../sfInject/content/injectors/debugLogOpenViewerDom.js'), 'extractLogIdFromRow').mockReturnValue(null);

    const fetchCatalog = vi.fn(async () => ({
      ok: true,
      logs: [{ id: '07L000000000001' }, { id: '07L000000000002' }]
    }));

    const rows = await resolveDebugLogRowsWithIds(doc, 'org1', fetchCatalog);
    expect(rows).toHaveLength(2);
    expect(rows[0].logId).toBe('07L000000000001');
    expect(rows[1].logId).toBe('07L000000000002');
  });
});

describe('findDebugLogActionRows', () => {
  it('exports action row finder', async () => {
    const { findDebugLogActionRows } = await import('../sfInject/content/injectors/debugLogOpenViewerDom.js');
    expect(typeof findDebugLogActionRows).toBe('function');
  });
});
