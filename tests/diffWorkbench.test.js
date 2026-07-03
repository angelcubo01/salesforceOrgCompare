import { describe, expect, it } from 'vitest';
import { DiffWorkbench } from '../code/editor/diffWorkbench.js';

describe('diffWorkbench', () => {
  it('upsertTab y getItem conservan el item', () => {
    const wb = new DiffWorkbench({ maxTabs: 4 });
    const item = { type: 'ApexClass', key: 'Foo', fileName: 'Foo.cls' };
    wb.upsertTab('ApexClass:Foo:Foo.cls', item);
    expect(wb.hasTab('ApexClass:Foo:Foo.cls')).toBe(true);
    expect(wb.getItem('ApexClass:Foo:Foo.cls')).toEqual(item);
    expect(wb.getTabIds()).toEqual(['ApexClass:Foo:Foo.cls']);
  });

  it('closeTab elimina la pestaña y libera activeTabId', () => {
    const wb = new DiffWorkbench();
    const item = { type: 'ApexClass', key: 'Bar', fileName: 'Bar.cls' };
    wb.upsertTab('tab-1', item);
    wb.activeTabId = 'tab-1';
    wb.closeTab('tab-1');
    expect(wb.hasTab('tab-1')).toBe(false);
    expect(wb.activeTabId).toBeNull();
  });

  it('evict LRU al superar maxTabs', () => {
    const wb = new DiffWorkbench({ maxTabs: 2 });
    wb.upsertTab('t1', { type: 'ApexClass', key: 'A', fileName: 'A.cls' });
    wb.upsertTab('t2', { type: 'ApexClass', key: 'B', fileName: 'B.cls' });
    wb.upsertTab('t3', { type: 'ApexClass', key: 'C', fileName: 'C.cls' });
    expect(wb.getTabIds()).toEqual(['t2', 't3']);
    expect(wb.hasTab('t1')).toBe(false);
  });
});
