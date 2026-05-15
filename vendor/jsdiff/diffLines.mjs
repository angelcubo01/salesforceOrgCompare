/**
 * Algoritmo diff línea a línea (LCS). Misma lógica que `diff.min.js` para uso ESM (tests, workers).
 */
export function diffLines(oldStr, newStr) {
  const oldLines = String(oldStr == null ? '' : oldStr).split('\n');
  const newLines = String(newStr == null ? '' : newStr).split('\n');
  const n = oldLines.length;
  const m = newLines.length;

  const dp = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    dp[i] = new Array(m + 1);
    for (let j = 0; j <= m; j++) {
      dp[i][j] = 0;
    }
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = dp[i - 1][j] >= dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
      }
    }
  }

  const parts = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      parts.push({ value: oldLines[i - 1] + '\n' });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      parts.push({ value: newLines[j - 1] + '\n', added: true });
      j--;
    } else if (i > 0 && (j === 0 || dp[i - 1][j] > dp[i][j - 1])) {
      parts.push({ value: oldLines[i - 1] + '\n', removed: true });
      i--;
    } else {
      i--;
      j--;
    }
  }

  parts.reverse();

  const merged = [];
  for (const p of parts) {
    if (!merged.length) {
      merged.push(p);
    } else {
      const last = merged[merged.length - 1];
      const lastType = last.added ? 'added' : last.removed ? 'removed' : 'equal';
      const curType = p.added ? 'added' : p.removed ? 'removed' : 'equal';
      if (lastType === curType) {
        last.value += p.value;
      } else {
        merged.push(p);
      }
    }
  }

  return merged;
}

export const Diff = { diffLines };
