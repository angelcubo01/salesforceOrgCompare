import { describe, expect, it } from 'vitest';
import { getWorkspaceAdapter } from '../code/workbench/workspaceAdapters.js';
import { WORKBENCH_WORKSPACES } from '../code/workbench/workspaceRegistry.js';

describe('workspace adapters', () => {
  it('expone el contrato común para todos los workspaces', () => {
    for (const workspace of WORKBENCH_WORKSPACES) {
      const adapter = getWorkspaceAdapter(workspace.id);
      expect(adapter.activate).toBeTypeOf('function');
      expect(adapter.deactivate).toBeTypeOf('function');
      expect(adapter.getHeaderActions).toBeTypeOf('function');
      expect(adapter.refreshContext).toBeTypeOf('function');
    }
  });
});
