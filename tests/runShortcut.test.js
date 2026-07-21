import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('runShortcut', () => {
  it('bindRunShortcut listens for Ctrl/Meta+Enter', () => {
    const src = readFileSync(join(root, 'code', 'ui', 'runShortcut.js'), 'utf8');
    expect(src).toMatch(/document\.addEventListener\('keydown'/);
    expect(src).toMatch(/e\.key !== 'Enter'/);
    expect(src).toMatch(/e\.ctrlKey \|\| e\.metaKey/);
    expect(src).toMatch(/getSelectedArtifactType\(\)/);
  });

  it('is wired in Query, Anonymous Apex and REST panels', () => {
    for (const file of ['queryExplorerPanel.js', 'anonymousApexPanel.js', 'restExplorerPanel.js']) {
      const src = readFileSync(join(root, 'code', 'ui', file), 'utf8');
      expect(src).toContain('bindRunShortcut');
    }
  });
});
