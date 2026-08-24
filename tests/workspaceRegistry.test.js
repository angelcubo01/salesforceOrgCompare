import { describe, expect, it } from 'vitest';
import {
  LEGACY_TOOL_ROUTES,
  WORKBENCH_CATEGORIES,
  WORKBENCH_WORKSPACES,
  getCanonicalToolIds,
  getWorkspaceById,
  getLegacyHref,
  getTabById,
  getWorkspaceRouteForTool
} from '../code/workbench/workspaceRegistry.js';
import { TOOL_ICONS, USED_ICON_NAMES } from '../code/workbench/iconRegistry.js';

describe('workspaceRegistry', () => {
  it('declara Inicio y las cinco categorías superiores en orden estable', () => {
    expect(WORKBENCH_CATEGORIES.map(({ id }) => id)).toEqual([
      'home', 'comparator', 'development', 'analysis', 'monitoring', 'manifests'
    ]);
    expect(WORKBENCH_CATEGORIES[0]).toMatchObject({ id: 'home', direct: true, workspaceIds: [] });
    expect(WORKBENCH_CATEGORIES[1]).toMatchObject({
      id: 'comparator', directWorkspaceId: 'comparator', workspaceIds: ['comparator']
    });
  });

  it('asigna cada workspace a una sola categoría y conserva solo las fusiones aprobadas', () => {
    const configured = WORKBENCH_CATEGORIES.flatMap(({ workspaceIds }) => workspaceIds);
    expect(configured).toHaveLength(WORKBENCH_WORKSPACES.length);
    expect(new Set(configured).size).toBe(configured.length);
    expect(new Set(configured)).toEqual(new Set(WORKBENCH_WORKSPACES.map(({ id }) => id)));
    expect(WORKBENCH_WORKSPACES.filter(({ tabs }) => tabs.length > 1).map(({ id }) => id)).toEqual([
      'apex-quality', 'code-studio', 'diagnostics', 'dependencies', 'data-compare'
    ]);
    expect(WORKBENCH_WORKSPACES.some(({ toolAliases }) => toolAliases?.length)).toBe(false);
    expect(WORKBENCH_CATEGORIES.find(({ id }) => id === 'development')?.workspaceIds).toEqual([
      'apex-quality', 'code-studio', 'anonymous-apex', 'query-explorer', 'rest-explorer'
    ]);
    expect(WORKBENCH_CATEGORIES.find(({ id }) => id === 'monitoring')?.workspaceIds).toEqual([
      'diagnostics', 'event-monitor', 'org-environments', 'org-limits', 'deploy-status',
      'bulk-job-monitor', 'setup-audit', 'field-history'
    ]);
    expect(getWorkspaceById('diagnostics')?.categoryId).toBe('monitoring');
    expect(getWorkspaceById('event-monitor')?.categoryId).toBe('monitoring');
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
