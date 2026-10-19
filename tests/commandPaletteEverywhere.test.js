import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('paleta global en subpantallas', () => {
  it.each([
    'code/apex-log-viewer.js',
    'code/apex-coverage-viewer.js',
    'code/apex-source-viewer.js',
    'code/health-monitor.js',
    'popup/settings.js'
  ])('activa el puente en %s', (path) => {
    const source = read(path);
    expect(source).toContain("from '../shared/commandPaletteBridge.js'");
    expect(source).toContain('setupStandaloneCommandPalette();');
  });

  it('conecta la aplicación principal y excluye el popup', () => {
    expect(read('code/code.js')).toContain('setupCommandPaletteRequestConsumer(openQuickOpen)');
    expect(read('popup/popup.js')).not.toContain('commandPaletteBridge');
  });
});
