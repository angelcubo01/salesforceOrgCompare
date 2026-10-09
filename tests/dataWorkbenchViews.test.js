import { describe, expect, it, vi } from 'vitest';
import { getWorkspaceAdapter } from '../code/workbench/workspaceAdapters.js';

function installDom() {
  const nodes = new Map([
    ['dataWorkbenchTabImport', { classList: { remove: vi.fn() } }]
  ]);
  globalThis.document = {
    getElementById: vi.fn((id) => nodes.get(id) || null)
  };
  return nodes;
}

describe('vista de Data import', () => {
  it('mantiene visible la Ãºnica vista de importaciÃ³n', async () => {
    const nodes = installDom();
    await getWorkspaceAdapter('data-workbench').activate({ tabId: 'main' });
    expect(nodes.get('dataWorkbenchTabImport').classList.remove).toHaveBeenCalledWith('hidden');
  });
});
