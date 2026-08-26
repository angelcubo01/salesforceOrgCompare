import { state } from '../core/state.js';
import { t } from '../../shared/i18n.js';
import {
  buildAlignedDiff as buildAlignedDiffSync,
  getTotalDiffLines,
  advanceDiffIndex
} from '../../shared/alignedDiffCore.js';

export { getTotalDiffLines, advanceDiffIndex };

/**
 * Publica el estado del diff en su nodo original. La cabecera contextual V2
 * clona ese nodo, así que además del texto completo deja una versión corta en
 * dataset para que la píldora quepa sin recortar a mitad de palabra.
 * @param {HTMLElement | null} node
 * @param {{ current: number, total: number, lines: number } | null} diff
 */
export function renderDiffStatus(node, diff) {
  if (!node) return;
  if (!diff) {
    node.textContent = t('diff.noDifferences');
    return;
  }
  const full = t('diff.status', diff);
  node.dataset.compact = t('diff.statusCompact', diff);
  // Sella la versión corta contra el texto que la origina: cualquier otro punto
  // que reescriba el nodo (error, diff truncado…) la invalida sin más cambios.
  node.dataset.compactFor = full;
  node.textContent = full;
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
    jsDiffWorker = new Worker(url, { type: 'module' });
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
  } catch (e) {
    jsDiffPending.delete(id);
    try {
      const { reportBug } = await import('../../shared/posthogClient.js');
      reportBug(e, { artifact_type: 'Diff', phase: 'jsdiff_worker' });
    } catch {
      /* ignore telemetry errors */
    }
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
