import { describe, it, expect } from 'vitest';
import {
  parseCompareDeepLink,
  buildCompareSearchParamsFromState,
  operationSelectValueForItemType,
  resolveItemFromDeepLink
} from '../code/lib/compareDeepLink.js';

describe('parseCompareDeepLink', () => {
  it('lee left, right, type, key y descriptor', () => {
    const d = { bundleId: 'abc', bundleDeveloperName: 'cmp' };
    const q = new URLSearchParams({
      left: 'org-left',
      right: 'org-right',
      nav: 'compare',
      op: 'LWC',
      type: 'LWC',
      key: 'myCmp',
      fileName: 'myCmp.js',
      descriptor: JSON.stringify(d)
    });
    const p = parseCompareDeepLink(q);
    expect(p.leftOrgId).toBe('org-left');
    expect(p.rightOrgId).toBe('org-right');
    expect(p.navMode).toBe('compare');
    expect(p.op).toBe('LWC');
    expect(p.itemType).toBe('LWC');
    expect(p.itemKey).toBe('myCmp');
    expect(p.fileName).toBe('myCmp.js');
    expect(p.descriptor).toEqual(d);
  });

  it('orgId legado mapea a izquierda', () => {
    const p = parseCompareDeepLink('orgId=legacy-left&type=ApexClass&key=Foo');
    expect(p.leftOrgId).toBe('legacy-left');
    expect(p.rightOrgId).toBeNull();
  });
});

describe('buildCompareSearchParamsFromState', () => {
  it('serializa orgs e ítem', () => {
    const appState = {
      leftOrgId: 'L1',
      rightOrgId: 'R1',
      appNavMode: 'compare',
      selectedArtifactType: 'Apex',
      selectedItem: {
        type: 'ApexClass',
        key: 'MyClass',
        descriptor: { name: 'MyClass' }
      }
    };
    const p = buildCompareSearchParamsFromState(appState);
    expect(p.get('left')).toBe('L1');
    expect(p.get('right')).toBe('R1');
    expect(p.get('type')).toBe('ApexClass');
    expect(p.get('key')).toBe('MyClass');
    expect(p.get('nav')).toBe('compare');
  });
});

describe('operationSelectValueForItemType', () => {
  it('mapea ApexClass a Apex', () => {
    expect(operationSelectValueForItemType('ApexClass')).toBe('Apex');
  });
});

describe('resolveItemFromDeepLink', () => {
  it('añade ítem si no existe en la lista', () => {
    const saved = [];
    const appState = { selectedItem: null };
    const { item, added } = resolveItemFromDeepLink(
      { itemType: 'ApexClass', itemKey: 'NewCls' },
      appState,
      saved
    );
    expect(added).toBe(true);
    expect(saved).toHaveLength(1);
    expect(item.key).toBe('NewCls');
    expect(appState.selectedItem).toBe(item);
  });

  it('no selecciona el ítem si select es false', () => {
    const saved = [];
    const appState = { selectedItem: null };
    const { added } = resolveItemFromDeepLink(
      { itemType: 'ApexClass', itemKey: 'NewCls' },
      appState,
      saved,
      { select: false }
    );
    expect(added).toBe(true);
    expect(appState.selectedItem).toBeNull();
  });
});
