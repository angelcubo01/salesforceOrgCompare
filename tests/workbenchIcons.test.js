import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  ACTION_ICONS,
  CATEGORY_ICONS,
  STATE_ICONS,
  TOOL_ICONS,
  USED_ICON_NAMES,
  WORKBENCH_ICON_VERSION
} from '../code/workbench/iconRegistry.js';

describe('workbench icon sprite', () => {
  it('empaqueta exactamente los iconos registrados una sola vez', async () => {
    const source = await readFile(new URL('../code/assets/tabler-icons.svg', import.meta.url), 'utf8');
    const symbols = [...source.matchAll(/<symbol id="icon-([^"]+)"/g)].map((match) => match[1]);
    expect(symbols).toEqual(USED_ICON_NAMES);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it('cubre herramientas, categorías, estados y acciones', () => {
    expect(Object.keys(TOOL_ICONS)).toContain('Comparator');
    expect(Object.keys(CATEGORY_ICONS)).toHaveLength(11);
    expect(STATE_ICONS.production).toBeTruthy();
    expect(STATE_ICONS.sandbox).toBeTruthy();
    expect(STATE_ICONS.readOnly).toBeTruthy();
    for (const action of ['search', 'save', 'run', 'cancel', 'copy', 'export', 'download', 'refresh', 'delete', 'close', 'help', 'settings']) {
      expect(ACTION_ICONS[action]).toBeTruthy();
    }
    expect(WORKBENCH_ICON_VERSION).toBe('3.46.0');
  });
});
