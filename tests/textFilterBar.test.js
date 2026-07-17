import { describe, expect, it } from 'vitest';
import {
  STORAGE_KEY,
  DEFAULT_RELEVANT_CATEGORIES,
  normalizeApexLogTextFilterPrefs,
  readApexLogTextFilterPrefs,
  writeApexLogTextFilterPrefs,
  buildStrippedText
} from '../shared/apexLogTextFilterPrefs.js';

describe('apexLogTextFilterPrefs', () => {
  it('normaliza prefs vacías con stripHiddenLines false', () => {
    expect(normalizeApexLogTextFilterPrefs(null)).toEqual({ stripHiddenLines: false });
    expect(normalizeApexLogTextFilterPrefs(undefined)).toEqual({ stripHiddenLines: false });
    expect(normalizeApexLogTextFilterPrefs({ stripHiddenLines: true })).toEqual({ stripHiddenLines: true });
    expect(normalizeApexLogTextFilterPrefs({ stripHiddenLines: 'yes' })).toEqual({ stripHiddenLines: false });
  });

  it('lee y escribe prefs en chrome.storage.local', async () => {
    const defaults = await readApexLogTextFilterPrefs();
    expect(defaults).toEqual({ stripHiddenLines: false });

    await writeApexLogTextFilterPrefs({ stripHiddenLines: true });
    const updated = await readApexLogTextFilterPrefs();
    expect(updated).toEqual({ stripHiddenLines: true });

    const bag = await chrome.storage.local.get(STORAGE_KEY);
    expect(bag[STORAGE_KEY]).toEqual({ stripHiddenLines: true });
  });

  it('DEFAULT_RELEVANT_CATEGORIES incluye categorías clave sin ruido', () => {
    expect(DEFAULT_RELEVANT_CATEGORIES).toEqual([
      'soql',
      'dml',
      'debug',
      'callout',
      'limit',
      'error',
      'stack',
      'method',
      'unit',
      'validation'
    ]);
    expect(DEFAULT_RELEVANT_CATEGORIES).not.toContain('noise');
    expect(DEFAULT_RELEVANT_CATEGORIES).not.toContain('other');
  });
});

describe('buildStrippedText', () => {
  it('conserva solo líneas de categorías habilitadas', () => {
    const lines = ['SOQL line', 'noise line', 'DML line', 'other line'];
    const categoryByLine = new Map([
      [1, 'soql'],
      [2, 'noise'],
      [3, 'dml'],
      [4, 'other']
    ]);
    const enabled = new Set(['soql', 'dml']);

    const { text, lineMap } = buildStrippedText(lines, enabled, categoryByLine);
    expect(text).toBe('SOQL line\nDML line');
    expect(lineMap).toEqual([1, 3]);
  });

  it('lineMap mapea editorLine-1 a fileLine', () => {
    const lines = ['a', 'b', 'c'];
    const categoryByLine = { 1: 'debug', 2: 'noise', 3: 'debug' };
    const { lineMap } = buildStrippedText(lines, ['debug'], categoryByLine);
    expect(lineMap[0]).toBe(1);
    expect(lineMap[1]).toBe(3);
  });

  it('devuelve texto vacío si ninguna categoría coincide', () => {
    const { text, lineMap } = buildStrippedText(['x'], new Set(['soql']), new Map([[1, 'noise']]));
    expect(text).toBe('');
    expect(lineMap).toEqual([]);
  });
});
