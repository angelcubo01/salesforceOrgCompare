import { diffLines } from '../../vendor/jsdiff/diffLines.mjs';
import { buildAlignedDiffWithDiffLines } from '../../shared/alignedDiffCore.js';

self.onmessage = (ev) => {
  const data = ev?.data || {};
  const id = Number(data.id);
  try {
    const result = buildAlignedDiffWithDiffLines(data.leftText, data.rightText, diffLines);
    self.postMessage({ id, ok: true, result });
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e?.message || e) });
  }
};
