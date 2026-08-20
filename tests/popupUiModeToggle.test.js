import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('popup UI 2.0 toggle', () => {
  it('usa un ancho fijo que no realimenta el viewport del popup de Chrome', async () => {
    const css = await readFile(new URL('../popup/popup.css', import.meta.url), 'utf8');
    expect(css).toMatch(/html,\s*body\s*\{[^}]*width:\s*460px;/s);
    expect(css).not.toContain('calc(100vw - 24px)');
  });

  it('declara solo el switch accesible, la ayuda y Beta sin un CTA duplicado', async () => {
    const html = await readFile(new URL('../popup/popup.html', import.meta.url), 'utf8');
    expect(html).toContain('id="popupUiModeToggle"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-describedby="popupUiModeHelp"');
    expect(html).toContain('data-i18n="popup.uiMode.beta"');
    expect(html).not.toContain('id="popupUiModeOpenBtn"');
    expect(html).not.toContain('id="popupUiModeStatus"');
  });
});
