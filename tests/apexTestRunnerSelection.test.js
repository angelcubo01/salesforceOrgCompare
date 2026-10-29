import { describe, expect, it } from 'vitest';
import {
  APEX_TEST_RUNNER_SELECTION_TTL_MS,
  isApexTestRunnerSelectionFresh,
  updateApexMethodSelection
} from '../shared/apexTestRunnerSelection.js';

describe('caducidad de la selección del runner Apex', () => {
  it('conserva solamente borradores recientes', () => {
    const now = 1_800_000_000_000;
    expect(isApexTestRunnerSelectionFresh({ updatedAt: now - 60_000 }, now)).toBe(true);
    expect(isApexTestRunnerSelectionFresh({ updatedAt: now - APEX_TEST_RUNNER_SELECTION_TTL_MS - 1 }, now)).toBe(false);
  });

  it('descarta snapshots antiguos sin fecha', () => {
    expect(isApexTestRunnerSelectionFresh({ classValues: ['01p'] })).toBe(false);
  });

  it('al desmarcar un método de una clase completa crea una selección parcial', () => {
    expect(updateApexMethodSelection({
      knownMethods: ['testA', 'testB', 'testC'],
      wholeClass: true,
      methodName: 'testB',
      checked: false
    })).toEqual({ selectedClass: true, selectedMethods: ['testA', 'testC'] });
  });

  it('normaliza todos los métodos marcados como clase completa', () => {
    expect(updateApexMethodSelection({
      knownMethods: ['testA', 'testB'],
      selectedMethods: ['testA'],
      methodName: 'testB',
      checked: true
    })).toEqual({ selectedClass: true, selectedMethods: null });
  });
});
