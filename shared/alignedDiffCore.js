/**
 * Diff alineado línea a línea (jsdiff → columnas izq/der con huecos).
 * Usado por el comparador, el Web Worker y los tests unitarios.
 */

export function getTotalDiffLines(changes) {
  if (!Array.isArray(changes) || !changes.length) return 0;
  let total = 0;
  for (const c of changes) {
    const origLen =
      c.originalEndLineNumber > 0
        ? c.originalEndLineNumber - c.originalStartLineNumber + 1
        : 0;
    const modLen =
      c.modifiedEndLineNumber > 0
        ? c.modifiedEndLineNumber - c.modifiedStartLineNumber + 1
        : 0;
    total += Math.max(origLen, modLen, 1);
  }
  return total;
}

/**
 * Índice siguiente/anterior con bucle. Si el índice no es válido, «next» → 0 y «previous» → último.
 * @param {number} currentIndex
 * @param {1 | -1} direction
 * @param {number} total
 * @returns {number}
 */
export function advanceDiffIndex(currentIndex, direction, total) {
  if (!total || total <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= total) {
    return direction === 1 ? 0 : total - 1;
  }
  if (direction === 1) return (currentIndex + 1) % total;
  return (currentIndex - 1 + total) % total;
}

/**
 * Convierte partes de `Diff.diffLines` en texto alineado y metadatos de cambios.
 * @param {Array<{ value?: string, added?: boolean, removed?: boolean }>} parts
 */
export function buildAlignedDiffFromParts(parts) {
  const leftLines = [];
  const rightLines = [];
  const changes = [];
  let leftLine = 1;
  let rightLine = 1;

  for (const part of parts || []) {
    const rawLines = String(part.value || '').split('\n');
    const lineCount = rawLines[rawLines.length - 1] === '' ? rawLines.length - 1 : rawLines.length;
    if (lineCount === 0) continue;

    if (part.added) {
      const startL = leftLine;
      const startR = rightLine;
      for (let i = 0; i < lineCount; i++) {
        leftLines.push('');
        rightLines.push(rawLines[i]);
      }
      changes.push({
        kind: 'added',
        originalStartLineNumber: startL,
        originalEndLineNumber: leftLine + lineCount - 1,
        modifiedStartLineNumber: startR,
        modifiedEndLineNumber: rightLine + lineCount - 1
      });
      leftLine += lineCount;
      rightLine += lineCount;
    } else if (part.removed) {
      const startL = leftLine;
      const startR = rightLine;
      for (let i = 0; i < lineCount; i++) {
        leftLines.push(rawLines[i]);
        rightLines.push('');
      }
      changes.push({
        kind: 'removed',
        originalStartLineNumber: startL,
        originalEndLineNumber: leftLine + lineCount - 1,
        modifiedStartLineNumber: startR,
        modifiedEndLineNumber: rightLine + lineCount - 1
      });
      leftLine += lineCount;
      rightLine += lineCount;
    } else {
      for (let i = 0; i < lineCount; i++) {
        leftLines.push(rawLines[i]);
        rightLines.push(rawLines[i]);
      }
      leftLine += lineCount;
      rightLine += lineCount;
    }
  }

  return {
    leftText: leftLines.join('\n'),
    rightText: rightLines.join('\n'),
    changes
  };
}

/**
 * @param {typeof import('../vendor/jsdiff/diffLines.mjs').diffLines} diffLinesFn
 */
export function buildAlignedDiffWithDiffLines(leftText, rightText, diffLinesFn) {
  const leftRaw = String(leftText == null ? '' : leftText);
  const rightRaw = String(rightText == null ? '' : rightText);
  if (typeof diffLinesFn !== 'function') {
    return { leftText: leftRaw, rightText: rightRaw, changes: [] };
  }
  return buildAlignedDiffFromParts(diffLinesFn(leftRaw, rightRaw));
}

/** Usa `globalThis.Diff` (página) o devuelve textos sin cambios si no hay jsdiff. */
export function buildAlignedDiff(leftText, rightText) {
  const diffLinesFn =
    typeof Diff !== 'undefined' && Diff && typeof Diff.diffLines === 'function'
      ? Diff.diffLines.bind(Diff)
      : null;
  return buildAlignedDiffWithDiffLines(leftText, rightText, diffLinesFn);
}
