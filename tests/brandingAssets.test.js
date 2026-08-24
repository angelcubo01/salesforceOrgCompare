import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function pngSize(relativePath) {
  const bytes = readFileSync(path.join(root, relativePath));
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('identidad visual', () => {
  it('incluye todas las resoluciones cuadradas requeridas por Chrome', () => {
    for (const size of [16, 32, 48, 128, 256, 512]) {
      expect(pngSize(`icons/icon-${size}.png`)).toEqual({ width: size, height: size });
    }
  });

  it('incluye una variante compacta para la barra de Chrome', () => {
    for (const size of [16, 24, 32]) {
      expect(pngSize(`icons/icon-action-${size}.png`)).toEqual({ width: size, height: size });
    }
    expect(pngSize('icons/icon-action-512.png')).toEqual({ width: 512, height: 512 });
  });

  it('incluye una variante horizontal optimizada para superficies de marca', () => {
    expect(pngSize('icons/logo-horizontal.png')).toEqual({ width: 512, height: 336 });
  });

  it('declara favicon en todas las páginas de la extensión', () => {
    for (const relativePath of [
      'code/code.html',
      'code/apex-log-viewer.html',
      'code/apex-source-viewer.html',
      'code/apex-coverage-viewer.html',
      'popup/popup.html',
      'popup/settings.html'
    ]) {
      const html = readFileSync(path.join(root, relativePath), 'utf8');
      expect(html).toContain('rel="icon"');
      expect(html).toContain('icon-32.png');
      expect(html).toContain('icon-16.png');
    }
  });

  it('mantiene el manifiesto conectado a los iconos de marca', () => {
    const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    expect(manifest.icons).toEqual({
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png'
    });
    expect(manifest.action?.default_icon).toEqual({
      16: 'icons/icon-action-16.png',
      24: 'icons/icon-action-24.png',
      32: 'icons/icon-action-32.png'
    });
  });
});
