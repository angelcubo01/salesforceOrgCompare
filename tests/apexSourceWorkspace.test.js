import { describe, expect, it } from 'vitest';
import { ApexSourceWorkspace, nextTabAfterClose } from '../code/lib/apexSourceWorkspace.js';

function createHarness() {
  const models = [];
  const monaco = {
    Uri: { parse: (value) => ({ value }) },
    editor: { createModel(value, language, uri) {
      const model = { value, language, uri, disposed: false, getValue() { return this.value; }, setValue(next) { this.value = next; }, isDisposed() { return this.disposed; }, dispose() { this.disposed = true; } };
      models.push(model); return model;
    } }
  };
  const editor = { model: null, saved: 0, restored: [], getModel() { return this.model; }, setModel(model) { this.model = model; }, saveViewState() { this.saved += 1; return { saved: this.saved }; }, restoreViewState(value) { this.restored.push(value); }, layout() {} };
  const changes = []; const revealed = [];
  return { models, editor, changes, revealed, workspace: new ApexSourceWorkspace({ monaco, editor, onChange: (snapshot) => changes.push(snapshot), onReveal: (tab, nav) => revealed.push({ tab, nav }) }) };
}

describe('ApexSourceWorkspace', () => {
  it('registra la clase inicial como primera pestaña y crea un modelo por clase', () => {
    const { workspace, editor } = createHarness();
    const first = workspace.registerInitial({ orgId: 'o1', className: 'MiServicio', content: 'class MiServicio {}' });
    expect(workspace.order).toEqual([first.tabId]);
    expect(editor.getModel()).toBe(first.model);
    expect(first.modelUri.value).toContain('sfoc-apex://o1/MiServicio.cls');
  });

  it('crea inmediatamente una pestaña loading y aplica la respuesta al modelo correcto', () => {
    const { workspace } = createHarness(); workspace.registerInitial({ orgId: 'o1', className: 'A', content: 'class A {}' });
    const { tab } = workspace.open({ orgId: 'o1', className: 'B' }, { loading: true }); const run = workspace.beginLoad(tab.tabId);
    expect(tab.state).toBe('loading');
    expect(workspace.completeLoad(tab.tabId, run.generation, { ok: true, classId: '01pB', className: 'B', body: 'class B {}' })).toBe(true);
    expect(tab.model.getValue()).toBe('class B {}'); expect(workspace.activeTab).toBe(tab);
  });

  it('permite cambiar de pestaña durante la carga sin activar la respuesta posterior', () => {
    const { workspace } = createHarness(); const a = workspace.registerInitial({ orgId: 'o1', className: 'A', content: 'A' });
    const { tab: b } = workspace.open({ orgId: 'o1', className: 'B' }, { loading: true }); const run = workspace.beginLoad(b.tabId); workspace.activate(a.tabId);
    workspace.completeLoad(b.tabId, run.generation, { ok: true, classId: 'b', className: 'B', body: 'B' });
    expect(workspace.activeId).toBe(a.tabId); expect(b.state).toBe('ready');
  });

  it('ignora respuestas de una pestaña cerrada durante la carga y libera el modelo', () => {
    const { workspace } = createHarness(); workspace.registerInitial({ orgId: 'o1', className: 'A', content: 'A' });
    const { tab } = workspace.open({ orgId: 'o1', className: 'B' }, { loading: true }); const run = workspace.beginLoad(tab.tabId); const model = tab.model;
    workspace.close(tab.tabId);
    expect(workspace.completeLoad(tab.tabId, run.generation, { ok: true, className: 'B', body: 'B' })).toBe(false);
    expect(model.disposed).toBe(true);
  });

  it('deduplica por organización y permite la misma clase en otra org', () => {
    const { workspace } = createHarness(); const one = workspace.open({ orgId: 'o1', className: 'Servicio' }, { loading: true });
    const duplicate = workspace.open({ orgId: 'o1', className: 'Servicio' }, { loading: true }); const other = workspace.open({ orgId: 'o2', className: 'Servicio' }, { loading: true });
    expect(duplicate.created).toBe(false); expect(duplicate.tab).toBe(one.tab); expect(other.created).toBe(true); expect(workspace.order).toHaveLength(2);
  });

  it('conserva solo la navegación pendiente más reciente y la ejecuta al quedar lista', () => {
    const { workspace, revealed } = createHarness(); const { tab } = workspace.open({ orgId: 'o1', className: 'B', pendingNavigation: { lineNumber: 2 } }, { loading: true });
    tab.pendingNavigation = { lineNumber: 9, methodName: 'ultimo' }; const run = workspace.beginLoad(tab.tabId); workspace.completeLoad(tab.tabId, run.generation, { ok: true, className: 'B', body: 'B' });
    expect(revealed).toHaveLength(1); expect(revealed[0].nav.lineNumber).toBe(9);
  });

  it('mantiene el estado de error para reintentar y descarta generaciones antiguas', () => {
    const { workspace } = createHarness(); const { tab } = workspace.open({ orgId: 'o1', className: 'B' }, { loading: true });
    const first = workspace.beginLoad(tab.tabId); const second = workspace.beginLoad(tab.tabId);
    expect(workspace.failLoad(tab.tabId, first.generation, 'NOT_FOUND')).toBe(false);
    expect(workspace.failLoad(tab.tabId, second.generation, 'NO_SID')).toBe(true);
    expect(tab).toMatchObject({ state: 'error', error: 'NO_SID' });
    expect(workspace.beginLoad(tab.tabId).generation).toBeGreaterThan(second.generation);
  });

  it('reconcilia la identidad temporal con classId y conserva historial atrás/adelante', () => {
    const { workspace } = createHarness(); const a = workspace.registerInitial({ orgId: 'o1', className: 'A', content: 'A' }); const { tab: b } = workspace.open({ orgId: 'o1', className: 'B' }, { loading: true });
    const run = workspace.beginLoad(b.tabId); workspace.completeLoad(b.tabId, run.generation, { ok: true, classId: '01pB', className: 'B', body: 'B' });
    expect(workspace.keys.get('o1:01pB')).toBe(b.tabId);
    workspace.history.push({ tabId: a.tabId, lineNumber: 2, column: 1 }); workspace.history.push({ tabId: b.tabId, lineNumber: 5, column: 3 });
    expect(workspace.history.back()).toMatchObject({ tabId: a.tabId, lineNumber: 2 }); expect(workspace.history.forward()).toMatchObject({ tabId: b.tabId, lineNumber: 5 });
  });

  it('guarda y restaura el view state de cada pestaña', () => {
    const { workspace, editor } = createHarness(); const a = workspace.registerInitial({ orgId: 'o1', className: 'A', content: 'A' }); const b = workspace.open({ orgId: 'o1', className: 'B', content: 'B' }).tab;
    workspace.activate(a.tabId); workspace.activate(b.tabId);
    expect(a.viewState?.saved).toBeGreaterThan(0); expect(editor.restored.length).toBeGreaterThan(0);
  });

  it('al cerrar la activa prefiere la usada más recientemente y al cerrar inactiva no cambia la activa', () => {
    const { workspace } = createHarness(); const a = workspace.registerInitial({ orgId: 'o1', className: 'A', content: 'A' }); const b = workspace.open({ orgId: 'o1', className: 'B', content: 'B' }).tab; const c = workspace.open({ orgId: 'o1', className: 'C', content: 'C' }).tab;
    workspace.activate(a.tabId); workspace.activate(c.tabId); workspace.close(c.tabId); expect(workspace.activeId).toBe(a.tabId);
    workspace.close(b.tabId); expect(workspace.activeId).toBe(a.tabId);
    expect(nextTabAfterClose([a.tabId, b.tabId], b.tabId, b.tabId, [a.tabId])).toBe(a.tabId);
  });
});
