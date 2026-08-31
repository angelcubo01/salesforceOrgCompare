import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('contraste del intercambio de entornos', () => {
  it('da un estado visual destacado a las flechas de intercambio', () => {
    const css = readFileSync(join(root, 'code', 'workbench', 'workbench-refresh.css'), 'utf8');
    expect(css).toContain('body[data-ui-mode="v2"] .org-swap-btn svg');
    expect(css).toContain('stroke-width: 2.6');
    expect(css).toContain('color: #c8e9ff');
  });
});
