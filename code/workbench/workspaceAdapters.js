import { getTabById } from './workspaceRegistry.js';

let activeAdapter = null;

const genericAdapter = Object.freeze({
  async activate() {},
  async deactivate() {},
  getHeaderActions({ workspaceId, tabId } = {}) {
    return getTabById(workspaceId, tabId)?.actions || [];
  },
  refreshContext() {}
});

const adapters = new Map();

export function getWorkspaceAdapter(workspaceId) {
  return adapters.get(workspaceId) || genericAdapter;
}

export async function activateWorkspaceAdapter(workspaceId, tabId) {
  const next = getWorkspaceAdapter(workspaceId);
  if (activeAdapter && activeAdapter !== next) await activeAdapter.deactivate({ preserve: true });
  activeAdapter = next;
  await next.activate({ tabId, restore: true });
}
