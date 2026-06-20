import { describe, expect, it } from 'vitest';
import {
  pickNewestSourceMetadata,
  findCodeEditorTabByArtifact,
  formatCodeEditorTabLabel,
  formatCodeEditorToolbarMeta
} from '../code/ui/codeEditorToolbar.js';

describe('codeEditorToolbar', () => {
  it('pickNewestSourceMetadata elige el archivo más reciente', () => {
    const meta = pickNewestSourceMetadata([
      { lastModifiedDate: '2024-01-01T10:00:00.000Z', lastModifiedByName: 'Old' },
      { lastModifiedDate: '2024-06-15T12:30:00.000Z', lastModifiedByName: 'New' }
    ]);
    expect(meta.lastModifiedByName).toBe('New');
    expect(meta.lastModifiedDate).toBe('2024-06-15T12:30:00.000Z');
  });

  it('findCodeEditorTabByArtifact distingue por org', () => {
    const tabs = [
      { id: '1', artType: 'ApexClass', name: 'Foo', sourceOrgId: 'org-a' },
      { id: '2', artType: 'ApexClass', name: 'Foo', sourceOrgId: 'org-b' }
    ];
    expect(
      findCodeEditorTabByArtifact(tabs, { artType: 'ApexClass', artifactName: 'Foo', orgId: 'org-b' })?.id
    ).toBe('2');
    expect(
      findCodeEditorTabByArtifact(tabs, { artType: 'ApexClass', artifactName: 'Foo', orgId: 'org-c' })
    ).toBeNull();
  });

  it('findCodeEditorTabByArtifact no empareja pestañas huérfanas sin sourceOrgId', () => {
    const tabs = [{ id: '1', artType: 'ApexClass', name: 'Foo', sourceOrgId: null }];
    expect(
      findCodeEditorTabByArtifact(tabs, { artType: 'ApexClass', artifactName: 'Foo', orgId: 'org-a' })
    ).toBeNull();
  });

  it('formatCodeEditorTabLabel añade org cuando hay sourceOrgId', () => {
    expect(formatCodeEditorTabLabel('Foo', 'org-a')).toContain('Foo');
    expect(formatCodeEditorTabLabel('Bar', null)).toBe('Bar');
  });

  it('formatCodeEditorToolbarMeta añade guardado local junto al last modified del org', () => {
    const meta = {
      lastModifiedByName: 'Ada Lovelace',
      lastModifiedDate: '2024-06-15T12:30:00.000Z'
    };
    const text = formatCodeEditorToolbarMeta(meta, '2024-06-16T08:15:00.000Z');
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('|');
    expect(text).toMatch(/Salesforce Org Compare/i);
    expect(text).toMatch(/16\/06\/2024/);
  });
});
