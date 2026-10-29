import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { setLang, t } from '../shared/i18n.js';

describe('descarga directa de Debug Logs', () => {
  it('expone una acción de descarga que no abre el visor', async () => {
    const source = await readFile(
      new URL('../code/ui/debugLogBrowserPanel.js', import.meta.url),
      'utf8'
    );

    expect(source).toContain('downloadDebugLog(logId)');
    expect(source).toContain('ACTION_ICONS.download');
    expect(source).toContain('download.download = fileName');
  });

  it('traduce la acción de descarga', () => {
    setLang('es');
    expect(t('debugLogs.downloadLog')).toBe('Descargar log');
    setLang('en');
    expect(t('debugLogs.downloadLog')).toBe('Download log');
  });
});
