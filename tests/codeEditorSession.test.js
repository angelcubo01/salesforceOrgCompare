import { describe, expect, it, vi } from 'vitest';
import {
  codeEditorSessionOrgMismatch,
  commitTabContentAsSaved,
  ensureUniqueEditorTabIds,
  hasBundleTabLocalSave,
  hasTabLocalSave,
  isBundleTabContentEmpty,
  isTabContentDirty,
  loadCodeEditorSession,
  resolveStoredTabSourceOrgId,
  revertContentToBaseline,
  saveCodeEditorSession
} from '../code/lib/codeEditorSession.js';
import * as extensionSettings from '../shared/extensionSettings.js';

describe('codeEditorSession', () => {
  it('isTabContentDirty detecta cambios respecto al baseline', () => {
    expect(isTabContentDirty('a', 'a')).toBe(false);
    expect(isTabContentDirty('b', 'a')).toBe(true);
  });

  it('resolveStoredTabSourceOrgId migra tabs legacy', () => {
    expect(resolveStoredTabSourceOrgId('org-tab', 'org-session')).toBe('org-tab');
    expect(resolveStoredTabSourceOrgId(null, 'org-session')).toBe('org-session');
    expect(resolveStoredTabSourceOrgId('', null)).toBeNull();
    expect(resolveStoredTabSourceOrgId(null, null)).toBeNull();
  });

  it('commitTabContentAsSaved alinea baseline con contenido', () => {
    const saved = commitTabContentAsSaved('public class Foo {}');
    expect(saved.content).toBe('public class Foo {}');
    expect(saved.originalContent).toBe('public class Foo {}');
    expect(isTabContentDirty(saved.content, saved.originalContent)).toBe(false);
  });

  it('revertContentToBaseline restaura contenido guardado', () => {
    const baseline = 'original from org';
    const reverted = revertContentToBaseline(baseline);
    expect(reverted.content).toBe(baseline);
    expect(reverted.originalContent).toBe(baseline);
  });

  it('codeEditorSessionOrgMismatch detecta org distinta', () => {
    expect(codeEditorSessionOrgMismatch('org-a', 'org-b')).toBe(true);
    expect(codeEditorSessionOrgMismatch('org-a', 'org-a')).toBe(false);
    expect(codeEditorSessionOrgMismatch(null, 'org-a')).toBe(false);
  });

  it('guardar local y revertir vuelve al baseline guardado', () => {
    const fromOrg = revertContentToBaseline('from org');
    const edited = { content: 'edited locally', originalContent: fromOrg.originalContent };
    expect(isTabContentDirty(edited.content, edited.originalContent)).toBe(true);

    const saved = commitTabContentAsSaved(edited.content);
    expect(isTabContentDirty(saved.content, saved.originalContent)).toBe(false);

    const reverted = revertContentToBaseline(saved.originalContent);
    expect(reverted.content).toBe('edited locally');
    expect(reverted.content).not.toBe('from org');
  });

  it('ensureUniqueEditorTabIds regenera ids duplicados al restaurar sesión', () => {
    const tabs = [
      { id: 'dup', name: 'Foo', sourceOrgId: 'org-a' },
      { id: 'dup', name: 'Foo', sourceOrgId: 'org-b' }
    ];
    const { tabs: unique, activeTabId } = ensureUniqueEditorTabIds(tabs, 'apex', 'dup');
    expect(unique).toHaveLength(2);
    expect(unique[0].id).toBe('dup');
    expect(unique[1].id).not.toBe('dup');
    expect(unique[0].id).not.toBe(unique[1].id);
    expect(activeTabId).toBe('dup');
  });

  it('hasTabLocalSave y hasBundleTabLocalSave detectan guardado local', () => {
    expect(hasTabLocalSave({ localSavedAt: '2026-01-01T00:00:00.000Z' })).toBe(true);
    expect(hasTabLocalSave({})).toBe(false);
    expect(
      hasBundleTabLocalSave({
        files: [{ fileName: 'a.js', localSavedAt: '2026-01-01T00:00:00.000Z' }]
      })
    ).toBe(true);
    expect(hasBundleTabLocalSave({ files: [{ fileName: 'a.js' }] })).toBe(false);
    expect(isBundleTabContentEmpty({ files: [] })).toBe(true);
    expect(isBundleTabContentEmpty({ files: [{ fileName: 'a.js', content: 'x' }] })).toBe(false);
  });

  it('hasTabLocalSave y hasBundleTabLocalSave respetan preferencia de persistencia', () => {
    const spy = vi.spyOn(extensionSettings, 'getCodeEditorPersistenceEnabled').mockReturnValue(false);
    expect(hasTabLocalSave({ localSavedAt: '2026-01-01T00:00:00.000Z' })).toBe(false);
    expect(
      hasBundleTabLocalSave({
        files: [{ fileName: 'a.js', localSavedAt: '2026-01-01T00:00:00.000Z' }]
      })
    ).toBe(false);
    spy.mockRestore();
  });

  it('Quick Edit no carga ni guarda sesión cuando persistencia está desactivada', async () => {
    const spy = vi.spyOn(extensionSettings, 'getCodeEditorPersistenceEnabled').mockReturnValue(false);
    const session = { tabs: [{ id: 't1', name: 'Foo' }] };
    await chrome.storage.local.set({ sfocQuickEditSession: session });

    await expect(loadCodeEditorSession('QuickEdit')).resolves.toBeNull();
    await saveCodeEditorSession('QuickEdit', session);
    await expect(chrome.storage.local.get('sfocQuickEditSession')).resolves.toEqual({
      sfocQuickEditSession: session
    });

    spy.mockRestore();
  });
});
