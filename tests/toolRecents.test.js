import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('toolRecents', () => {
  beforeEach(() => {
    vi.resetModules();
    global.chrome = {
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => {})
        }
      }
    };
  });

  it('records recent tools without duplicates', async () => {
    const mod = await import('../code/core/toolRecents.js');
    await mod.recordToolVisit('QueryExplorer');
    await mod.recordToolVisit('RestExplorer');
    await mod.recordToolVisit('QueryExplorer');
    const snap = mod.getToolRecentsSnapshot();
    expect(snap.recents[0]).toBe('QueryExplorer');
    expect(snap.recents[1]).toBe('RestExplorer');
    expect(snap.recents.length).toBe(2);
  });

  it('pins and unpins tools', async () => {
    const mod = await import('../code/core/toolRecents.js');
    await mod.toggleToolPin('QuickEdit');
    expect(mod.isToolPinned('QuickEdit')).toBe(true);
    await mod.toggleToolPin('QuickEdit');
    expect(mod.isToolPinned('QuickEdit')).toBe(false);
  });
});
