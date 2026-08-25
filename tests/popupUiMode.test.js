import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('popup UI 2.0', () => {
  it('usa un ancho fijo que no realimenta el viewport del popup de Chrome', async () => {
    const css = await readFile(new URL('../popup/popup.css', import.meta.url), 'utf8');
    expect(css).toMatch(/html,\s*body\s*\{[^}]*width:\s*var\(--sfoc-popup-width,\s*640px\);/s);
    expect(css).not.toContain('calc(100vw - 24px)');
  });

  it('ya no expone el selector de modo ni mensajes para volver a la interfaz clásica', async () => {
    const html = await readFile(new URL('../popup/popup.html', import.meta.url), 'utf8');
    expect(html).not.toContain('popup-ui-mode');
    expect(html).not.toContain('popupUiModeToggle');
    expect(html).not.toContain('popup.uiMode.help');
    expect(html).not.toContain('interfaz clásica');
  });
});
