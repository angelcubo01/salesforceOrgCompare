import { describe, it, expect } from 'vitest';
import {
  createTabId,
  isTabContentDirty,
  trimTabsToLimit,
  codeEditorSessionOrgMismatch,
  hasStoredCodeEditorTabs,
  MAX_CODE_EDITOR_TABS
} from '../code/lib/codeEditorSession.js';
import {
  fillBreadcrumbWithMeta,
  mapApiIndexToEntries
} from '../code/lib/metadataSearch.js';
import { formatMetadataDate } from '../code/ui/documentMeta.js';

describe('codeEditorSession', () => {
  it('createTabId genera ids únicos con prefijo', () => {
    const a = createTabId('apex');
    const b = createTabId('apex');
    expect(a).toMatch(/^apex_/);
    expect(b).toMatch(/^apex_/);
    expect(a).not.toBe(b);
  });

  it('isTabContentDirty detecta cambios', () => {
    expect(isTabContentDirty('a', 'a')).toBe(false);
    expect(isTabContentDirty('b', 'a')).toBe(true);
  });

  it('trimTabsToLimit respeta el máximo', () => {
    const tabs = Array.from({ length: MAX_CODE_EDITOR_TABS + 5 }, (_, i) => ({ id: String(i) }));
    expect(trimTabsToLimit(tabs)).toHaveLength(MAX_CODE_EDITOR_TABS);
  });

  it('codeEditorSessionOrgMismatch detecta org distinta', () => {
    expect(codeEditorSessionOrgMismatch('a', 'a')).toBe(false);
    expect(codeEditorSessionOrgMismatch('a', 'b')).toBe(true);
    expect(codeEditorSessionOrgMismatch(null, 'b')).toBe(false);
  });

  it('hasStoredCodeEditorTabs valida sesión con pestañas', () => {
    expect(hasStoredCodeEditorTabs(null)).toBe(false);
    expect(hasStoredCodeEditorTabs({ tabs: [] })).toBe(false);
    expect(hasStoredCodeEditorTabs({ tabs: [{ id: '1' }] })).toBe(true);
  });
});

describe('metadataSearch mapApiIndexToEntries', () => {
  it('propaga lastModifiedDate en ApexClass y bundles', () => {
    const entries = mapApiIndexToEntries([
      { type: 'ApexClass', name: 'MyClass', lastModifiedDate: '2024-01-15T10:00:00.000Z' },
      {
        type: 'LWC',
        developerName: 'myLwc',
        id: '0Xxx',
        lastModifiedDate: '2024-02-01T08:30:00.000Z'
      }
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0].lastModifiedDate).toBe('2024-01-15T10:00:00.000Z');
    expect(entries[1].lastModifiedDate).toBe('2024-02-01T08:30:00.000Z');
  });
});

describe('fillBreadcrumbWithMeta', () => {
  it('exporta función para breadcrumb con fecha', () => {
    expect(typeof fillBreadcrumbWithMeta).toBe('function');
  });
});

describe('formatMetadataDate', () => {
  it('formatea ISO a dd/mm/yyyy hh:mm', () => {
    const formatted = formatMetadataDate('2024-06-15T14:05:00.000Z');
    expect(formatted).toMatch(/\d{2}\/\d{2}\/2024/);
  });

  it('devuelve vacío sin fecha', () => {
    expect(formatMetadataDate('')).toBe('');
  });
});