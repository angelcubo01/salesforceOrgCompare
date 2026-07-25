import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('appThemeToggle', () => {
  it('guarda uiTheme y monacoTheme acoplados', () => {
    const src = readFileSync(join(root, 'code', 'ui', 'appThemeToggle.js'), 'utf8');
    expect(src).toContain('defaultMonacoThemeForUiTheme');
    expect(src).toContain('saveExtensionSettings');
  });

  it('toggle en barra junto a soporte', () => {
    const html = readFileSync(join(root, 'code', 'code.html'), 'utf8');
    const supportIdx = html.indexOf('id="appSupportBtn"');
    const toggleIdx = html.indexOf('id="appThemeToggle"');
    expect(toggleIdx).toBeGreaterThan(-1);
    expect(supportIdx).toBeGreaterThan(toggleIdx);
  });
});
