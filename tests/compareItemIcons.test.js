/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import {
  compareItemIconKind,
  createCompareItemIcon,
  treeIconKindFromExtension,
  treeIconKindFromItemType
} from '../code/lib/compareItemIcons.js';

describe('compareItemIcons', () => {
  it('mapea extensiones LWC/Aura al icono del árbol', () => {
    expect(treeIconKindFromExtension('js')).toBe('js');
    expect(treeIconKindFromExtension('auradoc')).toBe('auradoc');
    expect(treeIconKindFromExtension('unknown')).toBe('file');
  });

  it('mapea tipos de metadata al icono del árbol', () => {
    expect(treeIconKindFromItemType('ApexClass')).toBe('cls');
    expect(treeIconKindFromItemType('PermissionSet')).toBe('permset');
    expect(treeIconKindFromItemType('PackageXml')).toBe('xml');
  });

  it('resuelve icono por item LWC según fichero', () => {
    expect(
      compareItemIconKind({
        type: 'LWC',
        fileName: 'myCmp/myCmp.js'
      })
    ).toBe('js');
    expect(
      compareItemIconKind({
        type: 'LWC',
        fileName: 'myCmp/myCmp.js-meta.xml'
      })
    ).toBe('js');
  });

  it('crea span con clase list-tree-icon', () => {
    const el = createCompareItemIcon('cls');
    expect(el.tagName).toBe('SPAN');
    expect(el.className).toContain('list-tree-icon--cls');
  });
});
