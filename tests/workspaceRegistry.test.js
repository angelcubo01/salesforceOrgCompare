import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  LEGACY_TOOL_ROUTES,
  WORKBENCH_HEADER_ACTIONS,
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
      'home', 'favorites', 'comparator', 'development', 'analysis', 'monitoring', 'manifests'
    ]);
    expect(WORKBENCH_CATEGORIES[0]).toMatchObject({ id: 'home', direct: true, workspaceIds: [] });
    expect(WORKBENCH_CATEGORIES[1]).toMatchObject({ id: 'favorites', favorites: true, workspaceIds: [] });
    expect(WORKBENCH_CATEGORIES[2]).toMatchObject({
      id: 'comparator', directWorkspaceId: 'comparator', workspaceIds: ['comparator']
    });
  });

  it('asigna cada workspace a una sola categoría y conserva solo las fusiones aprobadas', () => {
    const configured = WORKBENCH_CATEGORIES.flatMap(({ workspaceIds }) => workspaceIds);
    expect(configured).toHaveLength(WORKBENCH_WORKSPACES.length);
    expect(new Set(configured).size).toBe(configured.length);
    expect(new Set(configured)).toEqual(new Set(WORKBENCH_WORKSPACES.map(({ id }) => id)));
    expect(WORKBENCH_WORKSPACES.filter(({ tabs }) => tabs.length > 1).map(({ id }) => id)).toEqual([
      'code-studio', 'data-compare', 'data-workbench'
    ]);
    expect(WORKBENCH_WORKSPACES.some(({ toolAliases }) => toolAliases?.length)).toBe(false);
    expect(WORKBENCH_CATEGORIES.find(({ id }) => id === 'development')?.workspaceIds).toEqual([
      'apex-quality', 'apex-coverage', 'code-studio', 'anonymous-apex', 'query-explorer', 'rest-explorer'
    ]);
    expect(WORKBENCH_CATEGORIES.find(({ id }) => id === 'monitoring')?.workspaceIds).toEqual([
      'diagnostics', 'event-monitor', 'org-environments', 'org-limits', 'deploy-status',
      'bulk-job-monitor', 'setup-audit', 'field-history'
    ]);
    expect(getWorkspaceById('diagnostics')?.categoryId).toBe('monitoring');
    expect(getWorkspaceById('event-monitor')?.categoryId).toBe('monitoring');
  });

  it('mantiene Calidad Apex, Logs y trazas y Dependencias sin vistas internas', () => {
    for (const workspaceId of ['apex-quality', 'diagnostics', 'dependencies']) {
      expect(getWorkspaceById(workspaceId)?.tabs.map(({ id }) => id), workspaceId).toEqual(['main']);
    }
    expect(getWorkspaceRouteForTool('ApexCoverageCompare')).toEqual({
      workspaceId: 'apex-coverage', tabId: 'main'
    });
  });

  it('separa el editor de registros y la importaciÃ³n masiva en vistas de Workbench', () => {
    const dataWorkbench = getWorkspaceById('data-workbench');
    expect(dataWorkbench?.defaultTabId).toBe('record-editor');
    expect(dataWorkbench?.tabs.map(({ id }) => id)).toEqual(['record-editor', 'bulk-import']);
    expect(dataWorkbench?.tabs[0].actions.map(({ id }) => id)).toEqual([
      'data-load-record', 'data-create-record'
    ]);
    expect(dataWorkbench?.tabs[1].actions.map(({ id }) => id)).toEqual(['data-import-run']);
    expect(LEGACY_TOOL_ROUTES.DataWorkbench).toEqual({
      workspaceId: 'data-workbench', tabId: 'record-editor'
    });
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

  it('declara las acciones de cabecera sin inferir presentaciÃ³n desde el DOM legacy', async () => {
    const html = await readFile(new URL('../code/code.html', import.meta.url), 'utf8');
    const actions = Object.values(WORKBENCH_HEADER_ACTIONS);
    expect(new Set(actions.map(({ id }) => id)).size).toBe(actions.length);
    for (const action of actions) {
      expect(action).toMatchObject({
        id: expect.any(String),
        labelKey: expect.any(String),
        icon: expect.any(String),
        variant: expect.stringMatching(/^(primary|secondary|destructive)$/),
        risk: expect.stringMatching(/^(read|write|destructive)$/),
        priority: expect.any(Number),
        allowOverflow: expect.any(Boolean),
        state: { sourceId: expect.any(String), disabled: 'source', loading: 'source' },
        handler: { type: 'dispatch-click', targetId: expect.any(String) }
      });
      expect(html).toContain(`id="${action.handler.targetId}"`);
      expect(USED_ICON_NAMES).toContain(action.icon);
    }
    expect(getWorkspaceById('comparator')?.tabs[0].actions).toEqual([]);
    expect(getWorkspaceById('apex-quality')?.tabs[0].actions.map(({ id }) => id)).toEqual([
      'apex-run', 'apex-select-run', 'apex-profiles', 'apex-runner-settings', 'apex-clear-runs'
    ]);
    expect(getWorkspaceById('diagnostics')?.tabs[0].actions.map(({ id }) => id)).toEqual([
      'logs-refresh', 'logs-view-traces', 'logs-analyze-local', 'logs-delete-all'
    ]);
  });
});
