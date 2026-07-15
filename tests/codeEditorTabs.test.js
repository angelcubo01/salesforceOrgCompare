import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCodeEditorTabByArtifact } from '../code/ui/codeEditorToolbar.js';
import {
  commitTabContentAsSaved,
  isTabContentDirty,
  resolveStoredTabSourceOrgId
} from '../code/lib/codeEditorSession.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('codeEditorTabs', () => {
  it('findTabByEntry distingue org tras migración sourceOrgId', () => {
    const tabs = [
      {
        id: 'legacy',
        artType: 'ApexClass',
        name: 'Foo',
        sourceOrgId: resolveStoredTabSourceOrgId(null, 'org-a')
      },
      {
        id: 'new',
        artType: 'ApexClass',
        name: 'Foo',
        sourceOrgId: 'org-b'
      }
    ];
    expect(
      findCodeEditorTabByArtifact(tabs, { artType: 'ApexClass', artifactName: 'Foo', orgId: 'org-a' })?.id
    ).toBe('legacy');
    expect(
      findCodeEditorTabByArtifact(tabs, { artType: 'ApexClass', artifactName: 'Foo', orgId: 'org-b' })?.id
    ).toBe('new');
  });

  it('findCodeEditorTabByArtifact ignora pestañas sin sourceOrgId al buscar por org', () => {
    const tabs = [
      { id: 'orphan', artType: 'ApexClass', name: 'Foo', sourceOrgId: null },
      { id: 'org-b', artType: 'ApexClass', name: 'Foo', sourceOrgId: 'org-b' }
    ];
    expect(
      findCodeEditorTabByArtifact(tabs, { artType: 'ApexClass', artifactName: 'Foo', orgId: 'org-b' })?.id
    ).toBe('org-b');
    expect(
      findCodeEditorTabByArtifact(tabs, { artType: 'ApexClass', artifactName: 'Foo', orgId: 'org-a' })
    ).toBeNull();
  });

  it('loadComponent/loadBundle no muestran confirm engañoso al abrir pestaña nueva', () => {
    const quickEditSrc = readFileSync(join(root, 'code/ui/quickEditPanel.js'), 'utf8');
    const lightningSrc = readFileSync(join(root, 'code/ui/lightningQuickEditPanel.js'), 'utf8');
    expect(quickEditSrc).not.toContain("t('quickEdit.unsavedChanges')");
    expect(lightningSrc).not.toContain("t('quickEdit.unsavedChanges')");
  });

  it('deploy usa el org del selector y avisa si difiere del de la pestaña', () => {
    const quickEditSrc = readFileSync(join(root, 'code/ui/quickEditPanel.js'), 'utf8');
    const lightningSrc = readFileSync(join(root, 'code/ui/lightningQuickEditPanel.js'), 'utf8');
    expect(quickEditSrc).toContain('function getDeployTargetOrgId()');
    expect(quickEditSrc).toContain('return state.leftOrgId || null');
    expect(quickEditSrc).toContain('orgId: deployOrgId');
    expect(quickEditSrc).toContain('confirmDeployOrgMismatch(tab)');
    expect(lightningSrc).toContain('function getDeployTargetOrgId()');
    expect(lightningSrc).toContain('orgId: deployOrgId');
    expect(lightningSrc).toContain('confirmDeployOrgMismatch()');
  });

  it('closeBundleTab dirty usa Monaco como fallback cuando el modelo difiere', () => {
    const tab = {
      id: 'bundle_1',
      files: [{ fileName: 'foo.js', content: 'stale', originalContent: 'baseline' }]
    };
    const monacoValue = 'from monaco editor';
    const docId = `${tab.id}::foo.js`;

    const dirtyFromSession = isTabContentDirty(tab.files[0].content, tab.files[0].originalContent);
    expect(dirtyFromSession).toBe(true);

    const dirtyFromMonaco = isTabContentDirty(monacoValue, tab.files[0].originalContent);
    expect(dirtyFromMonaco).toBe(true);

    const isBundleFileDirty = (file, monacoContent) =>
      isTabContentDirty(monacoContent ?? file.content, file.originalContent);

    expect(isBundleFileDirty(tab.files[0], monacoValue)).toBe(true);
    expect(isBundleFileDirty(tab.files[0], 'baseline')).toBe(false);
    expect(docId).toContain('::');
  });

  it('guardar LWC actualiza originalContent de todos los archivos del bundle', () => {
    const files = [
      { fileName: 'a.js', content: 'edit a', originalContent: 'a' },
      { fileName: 'b.html', content: 'edit b', originalContent: 'b' }
    ];
    const savedFiles = files.map((f) => {
      const saved = commitTabContentAsSaved(f.content);
      return { ...f, content: saved.content, originalContent: saved.originalContent };
    });
    expect(savedFiles.every((f) => !isTabContentDirty(f.content, f.originalContent))).toBe(true);
    expect(savedFiles[0].originalContent).toBe('edit a');
    expect(savedFiles[1].originalContent).toBe('edit b');
  });

  it('openTabFromEntry prioriza guardado local y luego org conectada', () => {
    const quickEditSrc = readFileSync(join(root, 'code/ui/quickEditPanel.js'), 'utf8');
    const lightningSrc = readFileSync(join(root, 'code/ui/lightningQuickEditPanel.js'), 'utf8');
    expect(quickEditSrc).toContain('ensureTabContentReady');
    expect(quickEditSrc).toContain('if (!hasTabLocalSave(existing))');
    expect(quickEditSrc).toContain('isTabContentBlockedByAuth(tab)');
    expect(lightningSrc).toContain('ensureBundleContentReady');
    expect(lightningSrc).toContain('if (!hasBundleTabLocalSave(existing))');
    expect(lightningSrc).toContain('isTabContentBlockedByAuth(tab, \'bundle\')');
  });

  it('closeTab cierra por índice cuando hay ids duplicados (mismo artefacto, distinto org)', () => {
    const tabs = [
      { id: 'dup', name: 'Foo', sourceOrgId: 'org-a', content: 'a', originalContent: 'a' },
      { id: 'dup', name: 'Foo', sourceOrgId: 'org-b', content: 'b', originalContent: 'b' }
    ];
    const closeIndex = 1;
    const tabIndex = closeIndex;
    const tab = tabs[tabIndex];
    expect(tab.sourceOrgId).toBe('org-b');

    tabs.splice(tabIndex, 1);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].sourceOrgId).toBe('org-a');
    expect(tabs[0].content).toBe('a');
  });

  it('closeTab resincroniza pestaña activa tras cerrar una inactiva (multi-org)', () => {
    const quickEditSrc = readFileSync(join(root, 'code/ui/quickEditPanel.js'), 'utf8');
    const lightningSrc = readFileSync(join(root, 'code/ui/lightningQuickEditPanel.js'), 'utf8');
    expect(quickEditSrc).toContain('function syncActiveTabPointers()');
    expect(quickEditSrc).toContain('persistTabContentFromWorkbench(tab)');
    expect(quickEditSrc).toMatch(/closeTab[\s\S]{0,800}forceReload: true/);
    expect(quickEditSrc).toContain('resolveSessionTabIndex(tabId, meta.tabIndex, meta.sourceOrgId)');

    expect(lightningSrc).toContain('function syncActiveTabPointers()');
    expect(lightningSrc).toContain('persistBundleTabFilesFromWorkbench(tab)');
    expect(lightningSrc).toContain(
      'await switchToBundleTab(editorSession.activeTabIndex ?? 0, { forceReload: true });'
    );
    expect(lightningSrc).not.toMatch(
      /closeBundleTab[\s\S]{0,600}else \{\s*persistAllBundleTabsFromWorkbench\(\)/
    );
    expect(lightningSrc).toMatch(/if \(!forceReload\) \{\s*syncActiveTabFromBundleState\(\);/);
  });
});
