import { describe, expect, it, vi } from 'vitest';
import { getWorkspaceAdapter } from '../code/workbench/workspaceAdapters.js';

function installDom() {
  const nodes = new Map([
    ['dataWorkbenchTabRecordEditor', { classList: { toggle: vi.fn() } }],
    ['dataWorkbenchTabImport', { classList: { toggle: vi.fn() } }]
  ]);
  globalThis.document = {
    querySelectorAll: vi.fn(() => [
      { getAttribute: () => 'recordEditor', classList: { toggle: vi.fn() }, setAttribute: vi.fn() },
      { getAttribute: () => 'import', classList: { toggle: vi.fn() }, setAttribute: vi.fn() }
    ]),
    getElementById: vi.fn((id) => nodes.get(id) || null)
  };
  return nodes;
}

describe('vistas de Data Workbench', () => {
  it('activa la vista de importaciÃ³n desde la pestaÃ±a superior', async () => {
    const nodes = installDom();
    await getWorkspaceAdapter('data-workbench').activate({ tabId: 'bulk-import' });
    expect(nodes.get('dataWorkbenchTabRecordEditor').classList.toggle).toHaveBeenCalledWith('hidden', true);
    expect(nodes.get('dataWorkbenchTabImport').classList.toggle).toHaveBeenCalledWith('hidden', false);
  });

  it('vuelve al editor de registros para la vista por defecto', async () => {
    const nodes = installDom();
    await getWorkspaceAdapter('data-workbench').activate({ tabId: 'record-editor' });
    expect(nodes.get('dataWorkbenchTabRecordEditor').classList.toggle).toHaveBeenCalledWith('hidden', false);
    expect(nodes.get('dataWorkbenchTabImport').classList.toggle).toHaveBeenCalledWith('hidden', true);
  });
});
