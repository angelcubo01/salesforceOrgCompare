import { describe, expect, it } from 'vitest';
import {
  LEGACY_TOOL_ROUTES,
  WORKBENCH_CATEGORIES,
  WORKBENCH_WORKSPACES,
  getCanonicalToolIds,
  getLegacyHref,
  getTabById,
  getWorkspaceRouteForTool
} from '../code/workbench/workspaceRegistry.js';
import { TOOL_ICONS, USED_ICON_NAMES } from '../code/workbench/iconRegistry.js';

describe('workspaceRegistry', () => {
  it('declara las diez entradas del rail en orden estable', () => {
    expect(WORKBENCH_CATEGORIES.map(({ id }) => id)).toEqual([
      'home', 'comparator', 'development', 'dataApi', 'diagnostics',
      'analysis', 'operations', 'metadata', 'security', 'advanced'
    ]);
  });

  it('resuelve cada Tool ID legacy exactamente a un workspace y tab válidos', () => {
    const tools = getCanonicalToolIds();
    expect(tools).toHaveLength(26);
    expect(new Set(tools).size).toBe(tools.length);
    for (const toolId of tools) {
      const route = getWorkspaceRouteForTool(toolId);
      expect(route).toEqual(LEGACY_TOOL_ROUTES[toolId]);
      expect(getTabById(route.workspaceId, route.tabId)?.toolId).toBe(toolId);
      expect(getLegacyHref(toolId)).toContain(`op=${toolId}`);
      expect(TOOL_ICONS[toolId]).toBeTruthy();
    }
  });

  it('mantiene el Comparator como ruta de las operaciones de metadata históricas', () => {
    for (const toolId of ['Apex', 'LWC', 'Aura', 'VF', 'PermissionSet', 'Profile', 'FlexiPage', 'PackageXml']) {
      expect(getWorkspaceRouteForTool(toolId)).toEqual({ workspaceId: 'comparator', tabId: 'main' });
    }
  });

  it('tiene defaults y paneles existentes para todos los workspaces', () => {
    for (const workspace of WORKBENCH_WORKSPACES) {
      expect(workspace.tabs.some(({ id }) => id === workspace.defaultTabId)).toBe(true);
      expect(workspace.tabs.every(({ panelId }) => typeof panelId === 'string' && panelId)).toBe(true);
      expect(USED_ICON_NAMES).toContain(workspace.icon);
    }
  });
});
