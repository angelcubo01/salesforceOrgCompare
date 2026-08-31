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

const dataWorkbenchAdapter = Object.freeze({
  async activate({ tabId } = {}) {
    const activeView = tabId === 'bulk-import' ? 'import' : 'recordEditor';
    document.querySelectorAll('[data-dw-tab]').forEach((button) => {
      const isActive = button.getAttribute('data-dw-tab') === activeView;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    document.getElementById('dataWorkbenchTabRecordEditor')?.classList.toggle('hidden', activeView !== 'recordEditor');
    document.getElementById('dataWorkbenchTabImport')?.classList.toggle('hidden', activeView !== 'import');
  },
  async deactivate() {},
  getHeaderActions({ workspaceId, tabId } = {}) {
    return getTabById(workspaceId, tabId)?.actions || [];
  },
  refreshContext() {}
});

adapters.set('data-workbench', dataWorkbenchAdapter);

export function getWorkspaceAdapter(workspaceId) {
  return adapters.get(workspaceId) || genericAdapter;
}

export async function activateWorkspaceAdapter(workspaceId, tabId) {
  const next = getWorkspaceAdapter(workspaceId);
  if (activeAdapter && activeAdapter !== next) await activeAdapter.deactivate({ preserve: true });
  activeAdapter = next;
  await next.activate({ tabId, restore: true });
}
