import { describe, expect, it, vi } from 'vitest';
import { ExplorerPageNav } from '../code/ui/queryExplorerPanel.js';

describe('Query Explorer incremental paging', () => {
  it('entrega cada página al render y precarga la siguiente sin esperar al pintado', async () => {
    const nav = new ExplorerPageNav();
    nav.resetFromResponse({
      records: [{ Id: '001' }],
      totalSize: 3,
      nextPath: '/page/2'
    });

    let releaseFirstRender;
    const firstRenderDone = new Promise((resolve) => { releaseFirstRender = resolve; });
    const fetched = [];
    const rendered = [];
    const fetchPage = vi.fn(async (path) => {
      fetched.push(path);
      if (path === '/page/2') {
        return { ok: true, records: [{ Id: '002' }], totalSize: 3, nextPath: '/page/3' };
      }
      return { ok: true, records: [{ Id: '003' }], totalSize: 3, nextPath: null };
    });

    const loading = nav.loadAll(fetchPage, async (batch, startIndex) => {
      rendered.push({ ids: batch.map((row) => row.Id), startIndex, accumulated: nav.getRows().length });
      if (startIndex === 1) await firstRenderDone;
    });

    await vi.waitFor(() => expect(fetched).toEqual(['/page/2', '/page/3']));
    expect(rendered).toEqual([{ ids: ['002'], startIndex: 1, accumulated: 2 }]);
    releaseFirstRender();
    await loading;

    expect(rendered).toEqual([
      { ids: ['002'], startIndex: 1, accumulated: 2 },
      { ids: ['003'], startIndex: 2, accumulated: 3 }
    ]);
    expect(nav.getRows().map((row) => row.Id)).toEqual(['001', '002', '003']);
    expect(nav.batchCount).toBe(3);
    expect(nav.loadingAll).toBe(false);
  });
});
