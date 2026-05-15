import { describe, it, expect } from 'vitest';
import { diffLines } from '../vendor/jsdiff/diffLines.mjs';
import {
  buildAlignedDiff,
  buildAlignedDiffFromParts,
  buildAlignedDiffWithDiffLines,
  getTotalDiffLines
} from '../shared/alignedDiffCore.js';

describe('getTotalDiffLines', () => {
  it('devuelve 0 sin cambios', () => {
    expect(getTotalDiffLines([])).toBe(0);
    expect(getTotalDiffLines(null)).toBe(0);
  });

  it('cuenta líneas del bloque más ancho', () => {
    expect(
      getTotalDiffLines([
        {
          originalStartLineNumber: 1,
          originalEndLineNumber: 2,
          modifiedStartLineNumber: 1,
          modifiedEndLineNumber: 1
        }
      ])
    ).toBe(2);
  });
});

describe('buildAlignedDiffWithDiffLines', () => {
  it('textos idénticos sin cambios registrados', () => {
    const r = buildAlignedDiffWithDiffLines('a\nb', 'a\nb', diffLines);
    expect(r.leftText).toBe('a\nb');
    expect(r.rightText).toBe('a\nb');
    expect(r.changes).toEqual([]);
  });

  it('alinea línea añadida con hueco a la izquierda', () => {
    const r = buildAlignedDiffWithDiffLines('a', 'a\nb', diffLines);
    expect(r.leftText.split('\n')).toEqual(['a', '']);
    expect(r.rightText.split('\n')).toEqual(['a', 'b']);
    expect(r.changes.some((c) => c.kind === 'added')).toBe(true);
  });

  it('alinea línea eliminada con hueco a la derecha', () => {
    const r = buildAlignedDiffWithDiffLines('a\nb', 'a', diffLines);
    expect(r.leftText.split('\n')).toEqual(['a', 'b']);
    expect(r.rightText.split('\n')).toEqual(['a', '']);
    expect(r.changes.some((c) => c.kind === 'removed')).toBe(true);
  });

  it('maneja null/undefined como cadena vacía', () => {
    const r = buildAlignedDiffWithDiffLines(null, undefined, diffLines);
    expect(r.leftText).toBe('');
    expect(r.rightText).toBe('');
  });

  it('sin función diff devuelve textos sin cambios', () => {
    const r = buildAlignedDiffWithDiffLines('x', 'y', null);
    expect(r.leftText).toBe('x');
    expect(r.rightText).toBe('y');
    expect(r.changes).toEqual([]);
  });
});

describe('buildAlignedDiff (global Diff)', () => {
  it('usa Diff global cuando está disponible', () => {
    const r = buildAlignedDiff('foo', 'bar');
    expect(r.changes.length).toBeGreaterThan(0);
  });
});

describe('buildAlignedDiffFromParts', () => {
  it('ignora partes con valor vacío', () => {
    const r = buildAlignedDiffFromParts([{ value: '' }]);
    expect(r.leftText).toBe('');
    expect(r.changes).toEqual([]);
  });
});
