import { diffLines } from '../vendor/jsdiff/diffLines.mjs';

function splitPartLines(part) {
  const s = String(part?.value ?? '');
  if (!s) return [];
  const lines = s.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function partsToMarkedChunks(parts) {
  const chunks = [];
  for (const part of parts || []) {
    const lines = splitPartLines(part);
    const mark = part.added ? '+' : part.removed ? '-' : ' ';
    for (const line of lines) chunks.push({ mark, line });
  }
  return chunks;
}

function countPositionsBefore(chunks, index) {
  let old = 0;
  let neu = 0;
  for (let k = 0; k < index; k++) {
    const m = chunks[k].mark;
    if (m === ' ') {
      old++;
      neu++;
    } else if (m === '-') old++;
    else if (m === '+') neu++;
  }
  return { old, new: neu };
}

function formatRange(start, count) {
  return count === 1 ? String(start) : `${start},${count}`;
}

/**
 * Genera un parche unified diff estilo `git diff` entre dos textos.
 * @param {string} oldText
 * @param {string} newText
 * @param {{ oldPath?: string, newPath?: string, context?: number }} [opts]
 * @returns {string}
 */
export function buildUnifiedDiffPatch(oldText, newText, opts = {}) {
  const oldPath = opts.oldPath ?? 'a/file';
  const newPath = opts.newPath ?? 'b/file';
  const context = Math.max(0, opts.context ?? 3);

  const parts = diffLines(String(oldText ?? ''), String(newText ?? ''));
  const chunks = partsToMarkedChunks(parts);
  if (!chunks.some((c) => c.mark !== ' ')) return '';

  const hunks = [];
  let i = 0;
  while (i < chunks.length) {
    while (i < chunks.length && chunks[i].mark === ' ') i++;
    if (i >= chunks.length) break;

    let changeStart = i;
    let changeEnd = i;
    while (changeEnd < chunks.length && chunks[changeEnd].mark !== ' ') changeEnd++;

    let hunkStart = Math.max(0, changeStart - context);
    let hunkEnd = Math.min(chunks.length, changeEnd + context);

    while (true) {
      let nextChange = hunkEnd;
      while (nextChange < chunks.length && chunks[nextChange].mark === ' ') nextChange++;
      if (nextChange >= chunks.length) break;
      if (nextChange - context <= hunkEnd) {
        changeEnd = nextChange;
        while (changeEnd < chunks.length && chunks[changeEnd].mark !== ' ') changeEnd++;
        hunkEnd = Math.min(chunks.length, changeEnd + context);
      } else break;
    }

    hunks.push({ start: hunkStart, end: hunkEnd });
    i = hunkEnd;
  }

  const out = [`diff --git a/${oldPath} b/${newPath}`, `--- a/${oldPath}`, `+++ b/${newPath}`];

  for (const { start, end } of hunks) {
    const slice = chunks.slice(start, end);
    const { old: oldBefore, new: newBefore } = countPositionsBefore(chunks, start);

    let oldCount = 0;
    let newCount = 0;
    const body = [];
    for (const { mark, line } of slice) {
      body.push(`${mark}${line}`);
      if (mark !== '+') oldCount++;
      if (mark !== '-') newCount++;
    }

    const oldStart = oldCount ? oldBefore + 1 : oldBefore;
    const newStart = newCount ? newBefore + 1 : newBefore;
    out.push(`@@ -${formatRange(oldStart, oldCount)} +${formatRange(newStart, newCount)} @@`);
    out.push(...body);
  }

  return `${out.join('\n')}\n`;
}
