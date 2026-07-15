import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseCompareDeepLink,
  buildCompareSearchParamsFromState,
  buildUrlFromState,
  operationSelectValueForItemType,
  resolveItemFromDeepLink,
  normalizeLegacyNavAndOp,
  deriveOpFromDeepLink,
  syncCompareUrlFromState,
  setHistorySyncSuppressed,
  setApplyingHistoryNavigation,
  urlsEqual
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
    expect(p.navMode).toBe('comparator');
    expect(p.op).toBe('Comparator');
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

  it('normaliza nav security y manifests PackageXml a comparator', () => {
    expect(normalizeLegacyNavAndOp('security', 'Profile')).toEqual({
      navMode: 'comparator',
      op: 'Comparator'
    });
    expect(normalizeLegacyNavAndOp('manifests', 'PackageXml')).toEqual({
      navMode: 'comparator',
      op: 'Comparator'
    });
  });
});

describe('buildCompareSearchParamsFromState', () => {
  it('serializa orgs e ítem', () => {
    const appState = {
      leftOrgId: 'L1',
      rightOrgId: 'R1',
      appNavMode: 'comparator',
      selectedArtifactType: 'Comparator',
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
    expect(p.get('nav')).toBe('comparator');
    expect(p.get('op')).toBe('Comparator');
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

describe('deriveOpFromDeepLink', () => {
  it('usa op explícita si está presente', () => {
    expect(deriveOpFromDeepLink({ op: 'ApexTests', itemType: 'ApexClass', itemKey: 'Foo' })).toBe(
      'ApexTests'
    );
  });

  it('deriva op del tipo de ítem si no hay op', () => {
    expect(deriveOpFromDeepLink({ op: null, itemType: 'ApexClass', itemKey: 'Foo' })).toBe('Apex');
  });

  it('devuelve cadena vacía sin op ni ítem', () => {
    expect(deriveOpFromDeepLink({ op: null, itemType: null, itemKey: null })).toBe('');
  });
});

describe('urlsEqual', () => {
  it('compara URLs de forma estable', () => {
    expect(urlsEqual('/code.html?nav=comparator', '/code.html?nav=comparator')).toBe(true);
    expect(urlsEqual('/code.html?nav=comparator', '/code.html?nav=home')).toBe(false);
  });
});

describe('syncCompareUrlFromState', () => {
  /** @type {ReturnType<typeof vi.fn>[]} */
  let pushState;
  /** @type {ReturnType<typeof vi.fn>[]} */
  let replaceState;

  beforeEach(() => {
    pushState = vi.fn();
    replaceState = vi.fn();
    globalThis.window = /** @type {Window} */ ({
      location: { pathname: '/code/code.html', search: '' },
      history: { pushState, replaceState }
    });
    globalThis.document = /** @type {Document} */ ({
      getElementById: () => null
    });
    setHistorySyncSuppressed(false);
    setApplyingHistoryNavigation(false);
  });

  afterEach(() => {
    setHistorySyncSuppressed(false);
    setApplyingHistoryNavigation(false);
  });

  it('usa replaceState por defecto', () => {
    const appState = {
      leftOrgId: 'L1',
      rightOrgId: null,
      appNavMode: 'development',
      selectedArtifactType: 'ApexTests',
      selectedItem: null
    };
    syncCompareUrlFromState(appState);
    expect(replaceState).toHaveBeenCalledOnce();
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState.mock.calls[0][2]).toBe('/code/code.html?left=L1&op=ApexTests&nav=development');
  });

  it('usa pushState cuando method es push', () => {
    const appState = {
      leftOrgId: 'L1',
      rightOrgId: null,
      appNavMode: 'comparator',
      selectedArtifactType: 'Comparator',
      selectedItem: null
    };
    syncCompareUrlFromState(appState, { method: 'push' });
    expect(pushState).toHaveBeenCalledOnce();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('no modifica historial si la URL no cambia', () => {
    globalThis.window.location.search = '?left=L1&op=Comparator&nav=comparator';
    const appState = {
      leftOrgId: 'L1',
      rightOrgId: null,
      appNavMode: 'comparator',
      selectedArtifactType: 'Comparator',
      selectedItem: null
    };
    syncCompareUrlFromState(appState, { method: 'push' });
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('no modifica historial cuando el sync está suprimido', () => {
    setHistorySyncSuppressed(true);
    const appState = {
      leftOrgId: 'L1',
      rightOrgId: null,
      appNavMode: 'comparator',
      selectedArtifactType: 'Comparator',
      selectedItem: null
    };
    syncCompareUrlFromState(appState, { method: 'push' });
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    setHistorySyncSuppressed(false);
  });

  it('no modifica historial durante restauración popstate', () => {
    setApplyingHistoryNavigation(true);
    const appState = {
      leftOrgId: 'L1',
      rightOrgId: null,
      appNavMode: 'comparator',
      selectedArtifactType: 'Comparator',
      selectedItem: null
    };
    syncCompareUrlFromState(appState, { method: 'push' });
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    setApplyingHistoryNavigation(false);
  });
});

describe('buildUrlFromState', () => {
  beforeEach(() => {
    globalThis.window = /** @type {Window} */ ({
      location: { pathname: '/code/code.html', search: '' }
    });
    globalThis.document = /** @type {Document} */ ({
      getElementById: () => null
    });
  });

  it('construye path con query string', () => {
    const url = buildUrlFromState({
      leftOrgId: 'A',
      rightOrgId: 'B',
      appNavMode: 'home',
      selectedArtifactType: '',
      selectedItem: null
    });
    expect(url).toBe('/code/code.html?left=A&right=B');
  });
});
