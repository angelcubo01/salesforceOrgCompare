import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('Event Monitor listening badge', () => {
  it('oculta el indicador mientras no haya una suscripción activa', () => {
    const source = readFileSync(join(root, 'code', 'ui', 'eventMonitorPanel.js'), 'utf8');
    expect(source).toContain('badge.hidden = !listening');
    expect(source).not.toContain("t('eventMonitor.idle')");
  });
});
