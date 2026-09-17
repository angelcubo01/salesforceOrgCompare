import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('Quick Edit: persistencia local', () => {
  it('importa el ajuste que usan Guardar, Revertir y Ctrl/Cmd+S', async () => {
    const source = await readFile(new URL('../code/ui/quickEditPanel.js', import.meta.url), 'utf8');
    expect(source).toContain(
      "import { getCodeEditorPersistenceEnabled } from '../../shared/extensionSettings.js';"
    );
  });
});
