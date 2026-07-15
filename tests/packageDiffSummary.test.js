import { describe, it, expect } from 'vitest';
import { diffLines } from '../vendor/jsdiff/diffLines.mjs';
import {
  buildPackageDiffSummary,
  splitSummaryByFile,
  summaryFileHeaderRegexFromTemplate
} from '../shared/packageDiffSummary.js';

const opts = { diffLines, contextLines: 1, header: (p) => `## ${p} ##`, gapMarker: '...' };

describe('buildPackageDiffSummary', () => {
  it('omite ficheros idénticos y solo incluye los que cambian', () => {
    const left = {
      'classes/Same.cls': 'line1\nline2\nline3\n',
      'classes/Changed.cls': 'a\nb\nc\n'
    };
    const right = {
      'classes/Same.cls': 'line1\nline2\nline3\n',
      'classes/Changed.cls': 'a\nB\nc\n'
    };
    const paths = ['classes/Changed.cls', 'classes/Same.cls'];
    const res = buildPackageDiffSummary(left, right, paths, opts);

    expect(res.changedFileCount).toBe(1);
    expect(res.summaryLeft).toContain('## classes/Changed.cls ##');
    expect(res.summaryLeft).not.toContain('Same.cls');
    // La línea eliminada aparece a la izquierda y la añadida a la derecha
    expect(res.summaryLeft).toContain('b');
    expect(res.summaryRight).toContain('B');
  });

  it('mantiene solo el contexto configurado alrededor de los cambios', () => {
    const base = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n') + '\n';
    const modified = base.replace('l10', 'l10_changed');
    const res = buildPackageDiffSummary(
      { 'f.txt': base },
      { 'f.txt': modified },
      ['f.txt'],
      opts
    );

    // Con contexto=1 debe incluir l9 y l11 pero no l0 ni l19
    expect(res.summaryRight).toContain('l9');
    expect(res.summaryRight).toContain('l11');
    expect(res.summaryRight).not.toContain('l0\n');
    expect(res.summaryRight).toContain('...'); // marcador de hueco
    expect(res.summaryRight).toContain('l10_changed');
    expect(res.summaryLeft).toContain('l10');
  });

  it('gestiona ficheros presentes solo en una org', () => {
    const res = buildPackageDiffSummary(
      { 'only-left.cls': 'foo\nbar\n' },
      {},
      ['only-left.cls'],
      opts
    );
    expect(res.changedFileCount).toBe(1);
    expect(res.summaryLeft).toContain('foo');
    expect(res.summaryLeft).toContain('bar');
    // El lado derecho solo tiene la cabecera, sin contenido del fichero
    expect(res.summaryRight).toContain('## only-left.cls ##');
    expect(res.summaryRight).not.toContain('foo');
  });

  it('devuelve resumen vacío cuando no hay diferencias', () => {
    const res = buildPackageDiffSummary(
      { 'a.txt': 'x\ny\n' },
      { 'a.txt': 'x\ny\n' },
      ['a.txt'],
      opts
    );
    expect(res.changedFileCount).toBe(0);
    expect(res.summaryLeft).toBe('');
    expect(res.summaryRight).toBe('');
  });

  it('funciona sin diffLines (fallback: fichero completo)', () => {
    const res = buildPackageDiffSummary(
      { 'a.txt': 'old\n' },
      { 'a.txt': 'new\n' },
      ['a.txt'],
      { contextLines: 3, header: (p) => `# ${p}` }
    );
    expect(res.changedFileCount).toBe(1);
    expect(res.summaryLeft).toContain('old');
    expect(res.summaryRight).toContain('new');
  });
});

describe('summaryFileHeaderRegexFromTemplate', () => {
  it('extrae la ruta de la cabecera con la plantilla i18n', () => {
    const re = summaryFileHeaderRegexFromTemplate('══════ {path} ══════');
    const m = re.exec('══════ classes/Foo.cls ══════');
    expect(m).toBeTruthy();
    expect(m[1]).toBe('classes/Foo.cls');
    expect(re.exec('línea normal de código')).toBeNull();
  });
});

describe('splitSummaryByFile', () => {
  const headerTemplate = '## {path} ##';
  const HEADER = (p) => `## ${p} ##`;

  it('divide el resumen en bloques por fichero (izq/der)', () => {
    const left = {
      'a.cls': 'x\nOLD\nz\n',
      'b.cls': 'foo\nbar\n'
    };
    const right = {
      'a.cls': 'x\nNEW\nz\n',
      'b.cls': 'foo\nbar\nbaz\n'
    };
    const paths = ['a.cls', 'b.cls'];
    const res = buildPackageDiffSummary(left, right, paths, {
      diffLines,
      contextLines: 3,
      header: HEADER
    });

    const files = splitSummaryByFile(res.summaryLeft, res.summaryRight, headerTemplate);
    expect(files.map((f) => f.path)).toEqual(['a.cls', 'b.cls']);
    expect(files[0].leftText).toContain('OLD');
    expect(files[0].rightText).toContain('NEW');
    // No arrastra la cabecera del siguiente fichero en el bloque anterior
    expect(files[0].leftText).not.toContain('b.cls');
    expect(files[1].rightText).toContain('baz');
  });

  it('devuelve lista vacía si no hay cabeceras', () => {
    const files = splitSummaryByFile('sin cabeceras\naqui', 'otro\ntexto', headerTemplate);
    expect(files).toEqual([]);
  });
});
