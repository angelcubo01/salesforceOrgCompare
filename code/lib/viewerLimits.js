/**
 * Límites Monaco + jsdiff. Valores efectivos desde `shared/extensionSettings.js` (Ajustes → Avanzado).
 */

import { t } from '../../shared/i18n.js';
import {
  getMaxMonacoModelChars,
  getMaxDiffAlgorithmChars,
  getMaxAlignedBufferChars,
  getViewerChunkSize
} from '../../shared/extensionSettings.js';

export { getViewerChunkSize } from '../../shared/extensionSettings.js';

/**
 * Un fragmento del fichero para mostrar en Monaco sin cargar todo el modelo.
 * @returns {{ text: string, start: number, end: number, hasPrev: boolean, hasNext: boolean, total: number }}
 */
export function sliceViewerChunk(fullText, offsetChars = 0) {
  const chunk = getViewerChunkSize();
  const s = String(fullText ?? '');
  const total = s.length;
  const start = Math.max(0, Math.min(offsetChars | 0, total));

  if (total <= chunk && start === 0) {
    return {
      text: s,
      start: 0,
      end: total,
      hasPrev: false,
      hasNext: false,
      total
    };
  }

  const end = Math.min(total, start + chunk);
  const body = s.slice(start, end);
  const hasPrev = start > 0;
  const hasNext = end < total;
  const head = t('chunk.header', { start: start + 1, end, total: total.toLocaleString() }) + '\n';
  const tail = hasNext
    ? '\n\n' + t('chunk.footer') + '\n'
    : '';
  return {
    text: head + body + tail,
    start,
    end,
    hasPrev,
    hasNext,
    total
  };
}

/**
 * Recorta texto para un único editor (primer fragmento).
 * @returns {{ text: string, truncated: boolean, originalLength: number }}
 */
export function truncateForSingleViewer(text) {
  const slice = sliceViewerChunk(text, 0);
  return {
    text: slice.text,
    truncated: slice.hasNext,
    originalLength: slice.total
  };
}

function truncateAlignedPair(leftText, rightText) {
  const maxM = getMaxMonacoModelChars();
  if (leftText.length <= maxM && rightText.length <= maxM) {
    return { leftText, rightText, truncated: false };
  }
  const leftLines = leftText.split('\n');
  const rightLines = rightText.split('\n');
  const n = Math.min(leftLines.length, rightLines.length);
  let acc = 0;
  let cut = n;
  for (let i = 0; i < n; i++) {
    const lineLen = Math.max(leftLines[i].length, rightLines[i].length) + 1;
    if (acc + lineLen > maxM) {
      cut = i;
      break;
    }
    acc += lineLen;
  }
  cut = Math.max(1, cut);
  const suffix = '\n\n' + t('chunk.truncatedSuffix', { max: maxM.toLocaleString() }) + '\n';
  return {
    leftText: leftLines.slice(0, cut).join('\n') + suffix,
    rightText: rightLines.slice(0, cut).join('\n') + suffix,
    truncated: true
  };
}

/**
 * Fragmento del diff alineado por líneas (mismas líneas izq/der).
 * @returns {{ leftText: string, rightText: string, hasPrev: boolean, hasNext: boolean, startLine: number, endLineExclusive: number, totalLines: number }}
 */
export function sliceAlignedLinesChunk(leftFull, rightFull, startLineIndex) {
  const maxM = getMaxMonacoModelChars();
  const ll = String(leftFull ?? '').split('\n');
  const lr = String(rightFull ?? '').split('\n');
  const nLines = Math.min(ll.length, lr.length);
  let start = Math.max(0, Math.min(startLineIndex | 0, Math.max(0, nLines - 1)));

  if (nLines === 0) {
    return {
      leftText: '',
      rightText: '',
      hasPrev: false,
      hasNext: false,
      startLine: 0,
      endLineExclusive: 0,
      totalLines: 0
    };
  }

  let acc = 0;
  let cutEnd = start;
  for (let i = start; i < nLines; i++) {
    const lineLen = Math.max((ll[i] || '').length, (lr[i] || '').length) + 1;
    if (acc + lineLen > maxM) {
      cutEnd = i;
      break;
    }
    acc += lineLen;
    cutEnd = i + 1;
  }
  if (cutEnd === start) {
    cutEnd = Math.min(start + 1, nLines);
  }

  const hasPrev = start > 0;
  const hasNext = cutEnd < nLines;
  const head = t('chunk.alignedHeader', { start: start + 1, end: cutEnd, total: nLines.toLocaleString() }) + '\n';
  const tail = hasNext
    ? '\n\n' + t('chunk.alignedFooter') + '\n'
    : '';

  return {
    leftText: head + ll.slice(start, cutEnd).join('\n') + tail,
    rightText: head + lr.slice(start, cutEnd).join('\n') + tail,
    hasPrev,
    hasNext,
    startLine: start,
    endLineExclusive: cutEnd,
    totalLines: nLines
  };
}

/**
 * Inicio del fragmento anterior (líneas) para diff alineado.
 */
export function sliceAlignedPrevChunkStart(leftFull, rightFull, currentStartLine) {
  if (currentStartLine <= 0) return 0;
  const maxM = getMaxMonacoModelChars();
  const ll = String(leftFull ?? '').split('\n');
  const lr = String(rightFull ?? '').split('\n');
  let acc = 0;
  let cut = currentStartLine;
  for (let i = currentStartLine - 1; i >= 0; i--) {
    const lineLen = Math.max((ll[i] || '').length, (lr[i] || '').length) + 1;
    if (acc + lineLen > maxM) {
      cut = i + 1;
      break;
    }
    acc += lineLen;
    cut = i;
  }
  return cut;
}

/**
 * Construye el contenido para el diff: o bien diff alineado (jsdiff), o paralelo por fragmentos si es demasiado grande.
 * @param {string} leftRaw
 * @param {string} rightRaw
 * @param {{ buildAlignedDiff: (a: string, b: string) => { leftText: string; rightText: string; changes: unknown[] } }} diffImpl
 */
export function prepareDiffForViewer(leftRaw, rightRaw, diffImpl) {
  const left = String(leftRaw ?? '');
  const right = String(rightRaw ?? '');
  const maxIn = Math.max(left.length, right.length);
  const maxDiffAlg = getMaxDiffAlgorithmChars();

  if (maxIn > maxDiffAlg) {
    const sl = sliceViewerChunk(left, 0);
    const sr = sliceViewerChunk(right, 0);
    return {
      leftText: sl.text,
      rightText: sr.text,
      changes: [],
      skippedHeavyDiff: true,
      userMessage: t('viewer.tooLargeSkipDiff', { chars: maxIn.toLocaleString() }),
      parallelChunk: { fullLeft: left, fullRight: right },
      alignedChunk: null
    };
  }

  const aligned = diffImpl.buildAlignedDiff(left, right);
  const chunk0 = sliceAlignedLinesChunk(aligned.leftText, aligned.rightText, 0);

  if (!chunk0.hasNext) {
    return {
      leftText: aligned.leftText,
      rightText: aligned.rightText,
      changes: aligned.changes || [],
      skippedHeavyDiff: false,
      userMessage: null,
      parallelChunk: null,
      alignedChunk: null
    };
  }

  const sumLen = aligned.leftText.length + aligned.rightText.length;
  const maxAligned = getMaxAlignedBufferChars();
  if (sumLen <= maxAligned) {
    return {
      leftText: chunk0.leftText,
      rightText: chunk0.rightText,
      changes: [],
      skippedHeavyDiff: false,
      userMessage: t('viewer.alignedChunked'),
      parallelChunk: null,
      alignedChunk: {
        leftFull: aligned.leftText,
        rightFull: aligned.rightText,
        startLine: chunk0.startLine,
        endLineExclusive: chunk0.endLineExclusive,
        totalLines: chunk0.totalLines,
        hasPrev: chunk0.hasPrev,
        hasNext: chunk0.hasNext
      }
    };
  }

  const pair = truncateAlignedPair(aligned.leftText, aligned.rightText);
  const maxM = getMaxMonacoModelChars();
  return {
    leftText: pair.leftText,
    rightText: pair.rightText,
    changes: pair.truncated ? [] : aligned.changes || [],
    skippedHeavyDiff: false,
    userMessage: pair.truncated
      ? t('viewer.truncated', { max: maxM.toLocaleString() })
      : null,
    parallelChunk: null,
    alignedChunk: null
  };
}
