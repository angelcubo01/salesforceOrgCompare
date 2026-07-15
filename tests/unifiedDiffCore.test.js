import { describe, it, expect } from 'vitest';
import { buildUnifiedDiffPatch } from '../shared/unifiedDiffCore.js';

describe('buildUnifiedDiffPatch', () => {
  it('returns empty string when texts are equal', () => {
    expect(buildUnifiedDiffPatch('a\nb\n', 'a\nb\n')).toBe('');
  });

  it('produces git-style headers and hunks for a simple change', () => {
    const patch = buildUnifiedDiffPatch('line1\nline2\n', 'line1\nline2 changed\n', {
      oldPath: 'left/File.cls',
      newPath: 'right/File.cls',
      context: 1
    });
    expect(patch).toContain('diff --git a/left/File.cls b/right/File.cls');
    expect(patch).toContain('--- a/left/File.cls');
    expect(patch).toContain('+++ b/right/File.cls');
    expect(patch).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@/m);
    expect(patch).toContain('-line2');
    expect(patch).toContain('+line2 changed');
  });

  it('includes pure insertions', () => {
    const patch = buildUnifiedDiffPatch('a\n', 'a\nb\n', { context: 0 });
    expect(patch).toContain('+b');
  });
});
