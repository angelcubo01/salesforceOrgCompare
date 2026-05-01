/* global importScripts, Diff */
importScripts('../../vendor/jsdiff/diff.min.js');

function buildAlignedDiff(leftText, rightText) {
  const leftRaw = String(leftText == null ? '' : leftText);
  const rightRaw = String(rightText == null ? '' : rightText);
  if (!(typeof Diff !== 'undefined' && Diff && typeof Diff.diffLines === 'function')) {
    return { leftText: leftRaw, rightText: rightRaw, changes: [] };
  }

  const parts = Diff.diffLines(leftRaw, rightRaw);
  const leftLines = [];
  const rightLines = [];
  const changes = [];
  let leftLine = 1;
  let rightLine = 1;

  for (const part of parts) {
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
      const endL = leftLine + lineCount - 1;
      const endR = rightLine + lineCount - 1;
      changes.push({
        kind: 'added',
        originalStartLineNumber: startL,
        originalEndLineNumber: endL,
        modifiedStartLineNumber: startR,
        modifiedEndLineNumber: endR
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
      const endL = leftLine + lineCount - 1;
      const endR = rightLine + lineCount - 1;
      changes.push({
        kind: 'removed',
        originalStartLineNumber: startL,
        originalEndLineNumber: endL,
        modifiedStartLineNumber: startR,
        modifiedEndLineNumber: endR
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

self.onmessage = (ev) => {
  const data = ev?.data || {};
  const id = Number(data.id);
  try {
    const result = buildAlignedDiff(data.leftText, data.rightText);
    self.postMessage({ id, ok: true, result });
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e?.message || e) });
  }
};

