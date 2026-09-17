import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('settings backup', () => {
  it('incluye las preferencias persistentes recomendadas y la identidad de telemetría', async () => {
    const source = await readFile(new URL('../popup/settings.js', import.meta.url), 'utf8');

    expect(source).toContain('formatVersion: 3');
    for (const field of [
      'toolFavorites',
      'queryExplorerSavedQueries',
      'orgReadOnlyById',
      'sfInjectSettings',
      'apexLogTextFilterPrefs'
    ]) {
      expect(source).toContain(field);
    }
    expect(source).toContain('telemetryInstallId');
    expect(source).toContain('applyTelemetryInstallIdFromBackup');
  });
});
