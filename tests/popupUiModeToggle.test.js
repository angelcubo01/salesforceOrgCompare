import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { getPopupUiModeCopyKeys } from '../popup/uiModeToggle.js';

describe('popup UI 2.0 toggle', () => {
  it('mantiene copys distintos para rollback y apertura V2', () => {
    expect(getPopupUiModeCopyKeys('classic')).toEqual({
      status: 'popup.uiMode.statusClassic',
      open: 'popup.uiMode.openClassic'
    });
    expect(getPopupUiModeCopyKeys('v2')).toEqual({
      status: 'popup.uiMode.statusV2',
      open: 'popup.uiMode.openV2'
    });
  });

  it('declara switch accesible, ayuda, Beta y CTA sin scripts inline', async () => {
    const html = await readFile(new URL('../popup/popup.html', import.meta.url), 'utf8');
    expect(html).toContain('id="popupUiModeToggle"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-describedby="popupUiModeHelp popupUiModeStatus"');
    expect(html).toContain('data-i18n="popup.uiMode.beta"');
    expect(html).toContain('id="popupUiModeOpenBtn"');
  });
});
