import { describe, expect, it } from 'vitest';
import { ALL_ONBOARDING_TOOLS } from '../shared/helpToolIds.js';
import { setLang, t } from '../shared/i18n.js';
import { getWorkspaceById } from '../code/workbench/workspaceRegistry.js';
import {
  ONBOARDING_INTERACTION_BLOCKED,
  ONBOARDING_INTERACTION_SAFE,
  TOOL_ONBOARDING_TOURS,
  getToolOnboardingTour,
  validateToolOnboardingTours
} from '../code/ui/toolOnboardingTours.js';

describe('toolOnboardingTours', () => {
  it('declara exactamente un tour para cada Tool ID soportado', () => {
    expect(Object.keys(TOOL_ONBOARDING_TOURS)).toHaveLength(26);
    expect(new Set(Object.keys(TOOL_ONBOARDING_TOURS))).toEqual(new Set(ALL_ONBOARDING_TOOLS));
    expect(validateToolOnboardingTours()).toEqual({ missing: [], extra: [], duplicateCount: 0 });
  });

  it('deriva categoría, workspace, tab y panel desde workspaceRegistry', () => {
    for (const toolId of ALL_ONBOARDING_TOOLS) {
      const definition = getToolOnboardingTour(toolId);
      expect(definition?.route, toolId).toBeTruthy();
      expect(getWorkspaceById(definition.route.workspaceId)?.categoryId, toolId)
        .toBe(definition.route.categoryId);
      expect(definition.route.panelId, toolId).toBeTruthy();
    }
    expect(getToolOnboardingTour('DebugLogBrowser').route.categoryId).toBe('monitoring');
    expect(getToolOnboardingTour('EventMonitor').route.categoryId).toBe('monitoring');
  });

  it('mantiene tours breves, pasos únicos e interacción declarada', () => {
    for (const [toolId, definition] of Object.entries(TOOL_ONBOARDING_TOURS)) {
      expect(definition.steps.length, toolId).toBeGreaterThanOrEqual(3);
      expect(definition.steps.length, toolId).toBeLessThanOrEqual(6);
      expect(new Set(definition.steps.map(({ id }) => id)).size, toolId).toBe(definition.steps.length);
      for (const item of definition.steps) {
        expect(['safe', 'blocked'], `${toolId}.${item.id}`).toContain(item.interaction);
        expect(item.anchor, `${toolId}.${item.id}`).toMatch(/^[#.\[]/);
      }
      const action = definition.steps.find(({ id }) => id === 'action');
      if (action) expect(action.interaction, `${toolId}.action`).toBe(ONBOARDING_INTERACTION_BLOCKED);
    }
  });

  it('solo permite interaccion en filtros y controles no operativos', () => {
    const safeAnchors = Object.values(TOOL_ONBOARDING_TOURS)
      .flatMap(({ steps }) => steps)
      .filter(({ interaction }) => interaction === ONBOARDING_INTERACTION_SAFE)
      .map(({ anchor }) => anchor);
    expect(new Set(safeAnchors)).toEqual(new Set([
      '#debugLogBrowserFilters',
      '#permissionDiffSectionTabs',
      '#dataWorkbenchTabImport'
    ]));
  });

  it('no incluye un paso de pestanas en Apex Quality, Metadata Dependencies ni Log Traces', () => {
    for (const toolId of ['ApexTests', 'DependencyExplorer', 'DebugLogBrowser']) {
      expect(TOOL_ONBOARDING_TOURS[toolId].steps.some(({ id }) => id === 'views'), toolId).toBe(false);
      expect(TOOL_ONBOARDING_TOURS[toolId].steps.some(({ anchor }) => anchor === '#workbenchWorkspaceTabs'), toolId)
        .toBe(false);
    }
    expect(TOOL_ONBOARDING_TOURS.ApexTests.steps.find(({ id }) => id === 'prepare')?.anchor)
      .toBe('[data-action-id="apex-select-run"]');
  });

  it('usa la pantalla única de las herramientas sin fusionar sus estados', () => {
    expect(getToolOnboardingTour('ApexTests').route.tabId).toBe('main');
    expect(getToolOnboardingTour('DebugLogBrowser').route.tabId).toBe('main');
    expect(getToolOnboardingTour('DependencyExplorer').route.tabId).toBe('main');
    expect(TOOL_ONBOARDING_TOURS.ApexCoverageCompare).not.toBe(TOOL_ONBOARDING_TOURS.ApexTests);
    expect(TOOL_ONBOARDING_TOURS.CustomSettingsCompare).not.toBe(TOOL_ONBOARDING_TOURS.CustomMetadataCompare);
    expect(TOOL_ONBOARDING_TOURS.RecordCompare).not.toBe(TOOL_ONBOARDING_TOURS.CustomSettingsCompare);
  });

  for (const lang of ['es', 'en']) {
    it(`tiene todos los textos de Driver.js y de los pasos en ${lang}`, () => {
      setLang(lang);
      for (const key of [
        'onboarding.common.previous', 'onboarding.common.next', 'onboarding.common.finish',
        'onboarding.common.skip', 'onboarding.common.progress', 'onboarding.common.startTour',
        'onboarding.common.repeatTour'
      ]) {
        expect(t(key), key).not.toBe(key);
      }
      for (const [toolId, definition] of Object.entries(TOOL_ONBOARDING_TOURS)) {
        for (const item of definition.steps) {
          expect(t(item.titleKey), `${lang}:${toolId}:${item.titleKey}`).not.toBe(item.titleKey);
          expect(t(item.descriptionKey), `${lang}:${toolId}:${item.descriptionKey}`).not.toBe(item.descriptionKey);
        }
      }
    });
  }
});
