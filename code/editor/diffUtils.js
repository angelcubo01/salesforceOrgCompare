import { state } from '../core/state.js';

export function getTotalDiffLines(changes) {
  if (!Array.isArray(changes) || !changes.length) return 0;
  let total = 0;
  for (const c of changes) {
    const origLen = c.originalEndLineNumber > 0
      ? c.originalEndLineNumber - c.originalStartLineNumber + 1
      : 0;
    const modLen = c.modifiedEndLineNumber > 0
      ? c.modifiedEndLineNumber - c.modifiedStartLineNumber + 1
      : 0;
    total += Math.max(origLen, modLen, 1);
  }
  return total;
}

function buildAlignedDiffSync(leftText, rightText) {
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

let jsDiffWorker = null;
let jsDiffReqSeq = 0;
const jsDiffPending = new Map();
const JS_DIFF_WORKER_TIMEOUT_MS = 15000;

function ensureJsDiffWorker() {
  if (jsDiffWorker) return jsDiffWorker;
  if (typeof Worker === 'undefined') return null;
  const url =
    typeof chrome !== 'undefined' && chrome?.runtime?.getURL
      ? chrome.runtime.getURL('code/workers/jsdiff.worker.js')
      : '/code/workers/jsdiff.worker.js';
  try {
    jsDiffWorker = new Worker(url);
  } catch {
    jsDiffWorker = null;
    return null;
  }
  jsDiffWorker.onmessage = (ev) => {
    const data = ev?.data || {};
    const id = Number(data.id);
    if (!Number.isFinite(id) || !jsDiffPending.has(id)) return;
    const h = jsDiffPending.get(id);
    jsDiffPending.delete(id);
    if (data.ok) h.resolve(data.result);
    else h.reject(new Error(data.error || 'worker_error'));
  };
  jsDiffWorker.onerror = () => {
    for (const h of jsDiffPending.values()) h.reject(new Error('worker_crash'));
    jsDiffPending.clear();
    try {
      jsDiffWorker?.terminate();
    } catch {}
    jsDiffWorker = null;
  };
  return jsDiffWorker;
}

export async function buildAlignedDiff(leftText, rightText) {
  const leftRaw = String(leftText == null ? '' : leftText);
  const rightRaw = String(rightText == null ? '' : rightText);
  const worker = ensureJsDiffWorker();
  if (!worker) return buildAlignedDiffSync(leftRaw, rightRaw);

  const id = ++jsDiffReqSeq;
  const p = new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (!jsDiffPending.has(id)) return;
      jsDiffPending.delete(id);
      try {
        jsDiffWorker?.terminate();
      } catch {}
      jsDiffWorker = null;
      reject(new Error('worker_timeout'));
    }, JS_DIFF_WORKER_TIMEOUT_MS);
    jsDiffPending.set(id, {
      resolve: (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  });
  try {
    worker.postMessage({ id, leftText: leftRaw, rightText: rightRaw });
    return await p;
  } catch {
    jsDiffPending.delete(id);
    return buildAlignedDiffSync(leftRaw, rightRaw);
  }
}

export function applyDiffDecorations(changes) {
  if (!state.monaco || !state.diffEditor) return;
  try {
    const monaco = state.monaco;
    const originalEditor = state.diffEditor.getOriginalEditor();
    const modifiedEditor = state.diffEditor.getModifiedEditor();

    const originalDecos = [];
    const modifiedDecos = [];

    for (const c of changes || []) {
      const oStart = c.originalStartLineNumber || 1;
      const oEnd = c.originalEndLineNumber || oStart;
      const mStart = c.modifiedStartLineNumber || 1;
      const mEnd = c.modifiedEndLineNumber || mStart;

      originalDecos.push({
        range: new monaco.Range(oStart, 1, oEnd, 1),
        options: {
          isWholeLine: true,
          className: 'sfoc-diff-removed-line',
          overviewRulerLane: monaco.editor.OverviewRulerLane.Right,
          overviewRulerColor: 'rgba(251, 113, 133, 0.63)'
        }
      });

      modifiedDecos.push({
        range: new monaco.Range(mStart, 1, mEnd, 1),
        options: {
          isWholeLine: true,
          className: 'sfoc-diff-added-line',
          overviewRulerLane: monaco.editor.OverviewRulerLane.Right,
          overviewRulerColor: 'rgba(45, 212, 191, 0.63)'
        }
      });
    }

    state.diffDecorationsOriginal = originalEditor.deltaDecorations(state.diffDecorationsOriginal || [], originalDecos);
    state.diffDecorationsModified = modifiedEditor.deltaDecorations(state.diffDecorationsModified || [], modifiedDecos);
  } catch {
    // ignore decoration errors
  }
}
