import { describe, it, expect } from 'vitest';
import { TOOL_NAV_GROUPS, getGroupedToolsForMode } from '../code/core/toolNavGroups.js';
import { MODE_TOOLS } from '../code/ui/appModeNav.js';

describe('toolNavGroups', () => {
  it('cubre todas las tools de development, analysis y monitoring exactamente una vez', () => {
    for (const mode of ['development', 'analysis', 'monitoring']) {
      const visible = [...MODE_TOOLS[mode]];
      const groups = getGroupedToolsForMode(mode, visible);
      expect(groups).not.toBeNull();
      const flat = groups.flatMap((g) => g.tools);
      expect(flat.sort()).toEqual(visible.sort());
      expect(new Set(flat).size).toBe(visible.length);
    }
  });

  it('omite grupos vacíos cuando tools están ocultas', () => {
    const groups = getGroupedToolsForMode('monitoring', ['OrgLimits']);
    expect(groups).toEqual([
      { id: 'orgHealth', i18nKey: 'code.toolGroup.monOrgHealth', tools: ['OrgLimits'] }
    ]);
  });

  it('devuelve null para modos sin subcategorías', () => {
    expect(getGroupedToolsForMode('comparator', ['Comparator'])).toBeNull();
    expect(getGroupedToolsForMode('manifests', ['GeneratePackageXml'])).toBeNull();
    expect(getGroupedToolsForMode('development', [])).toBeNull();
  });

  it('agrupa tools nuevas no listadas en Otros', () => {
    const groups = getGroupedToolsForMode('development', ['ApexTests', 'FutureTool']);
    const other = groups.find((g) => g.id === 'other');
    expect(other?.tools).toEqual(['FutureTool']);
  });

  it('TOOL_NAV_GROUPS define development, analysis y monitoring', () => {
    expect(Object.keys(TOOL_NAV_GROUPS).sort()).toEqual(['analysis', 'development', 'monitoring']);
  });

  it('analysis y monitoring no comparten tools', () => {
    const analysis = new Set(MODE_TOOLS.analysis);
    const monitoring = new Set(MODE_TOOLS.monitoring);
    for (const tool of analysis) {
      expect(monitoring.has(tool)).toBe(false);
    }
  });
});
