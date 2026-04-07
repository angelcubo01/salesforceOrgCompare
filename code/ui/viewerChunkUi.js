import { state } from '../core/state.js';
import { sliceViewerChunk, getViewerChunkSize } from '../lib/viewerLimits.js';
import { t } from '../../shared/i18n.js';

/**
 * Actualiza la barra de fragmentos (Anterior / Siguiente) según `state.viewerChunk`.
 */
export function updateViewerChunkBar() {
  const bar = document.getElementById('viewerChunkBar');
  const prev = document.getElementById('viewerChunkPrev');
  const next = document.getElementById('viewerChunkNext');
  const label = document.getElementById('viewerChunkLabel');
  const vc = state.viewerChunk;
  if (!bar || !prev || !next || !label) return;

  if (!vc) {
    bar.classList.add('hidden');
    bar.setAttribute('aria-hidden', 'true');
    return;
  }

  bar.classList.remove('hidden');
  bar.setAttribute('aria-hidden', 'false');

  prev.disabled = !vc.hasPrev;
  next.disabled = !vc.hasNext;

  let text = '';
  if (vc.mode === 'single') {
    text = t('chunk.singleLabel', { start: vc.displayStart, end: vc.displayEnd, total: vc.totalChars.toLocaleString() });
  } else if (vc.mode === 'diffParallel') {
    text = t('chunk.parallelLabel', { start: vc.displayStart, end: vc.displayEnd, leftTotal: vc.leftTotal.toLocaleString(), rightTotal: vc.rightTotal.toLocaleString() });
  } else if (vc.mode === 'diffAligned') {
    text = t('chunk.alignedLabel', { start: vc.lineLabelStart, end: vc.lineLabelEnd, total: vc.totalLines.toLocaleString() });
  }
  label.textContent = text;
}

/** Oculta la barra sin tocar `state.viewerChunk` (p. ej. durante transición). */
export function hideViewerChunkBar() {
  const bar = document.getElementById('viewerChunkBar');
  if (bar) {
    bar.classList.add('hidden');
    bar.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Configura la barra de fragmentos a partir del resultado de `prepareDiffForViewer` (diff dos orgs / retrieve).
 */
export function setViewerChunkFromPrepared(prepared, lFileName, rFileName) {
  if (prepared.parallelChunk) {
    const pc = prepared.parallelChunk;
    const sl = sliceViewerChunk(pc.fullLeft, 0);
    const sr = sliceViewerChunk(pc.fullRight, 0);
    const step = getViewerChunkSize();
    state.viewerChunk = {
      mode: 'diffParallel',
      fullLeft: pc.fullLeft,
      fullRight: pc.fullRight,
      offset: 0,
      hasPrev: false,
      hasNext: step < pc.fullLeft.length || step < pc.fullRight.length,
      displayStart: sl.start + 1,
      displayEnd: Math.max(sl.end, sr.end),
      leftTotal: pc.fullLeft.length,
      rightTotal: pc.fullRight.length,
      lFileName,
      rFileName
    };
  } else if (prepared.alignedChunk) {
    const ac = prepared.alignedChunk;
    state.viewerChunk = {
      mode: 'diffAligned',
      leftFull: ac.leftFull,
      rightFull: ac.rightFull,
      startLine: ac.startLine,
      endLineExclusive: ac.endLineExclusive,
      totalLines: ac.totalLines,
      hasPrev: ac.hasPrev,
      hasNext: ac.hasNext,
      lineLabelStart: ac.startLine + 1,
      lineLabelEnd: ac.endLineExclusive,
      lFileName,
      rFileName
    };
  } else {
    state.viewerChunk = null;
  }
  updateViewerChunkBar();
}

/** Limpia estado y oculta la barra. */
export function clearViewerChunkState() {
  state.viewerChunk = null;
  hideViewerChunkBar();
  const prev = document.getElementById('viewerChunkPrev');
  const next = document.getElementById('viewerChunkNext');
  if (prev) prev.disabled = true;
  if (next) next.disabled = true;
}
