import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_WORKBENCH_PREFS,
  WORKBENCH_PREFS_KEY,
  loadWorkbenchPrefs,
  normalizeWorkbenchPrefs,
  saveWorkbenchPrefs
} from '../code/workbench/workbenchPrefs.js';

describe('workbenchPrefs', () => {
  it('normaliza el shell sin mezclar preferencias funcionales', () => {
    expect(normalizeWorkbenchPrefs(null)).toEqual(DEFAULT_WORKBENCH_PREFS);
    expect(normalizeWorkbenchPrefs({ panelExpanded: false, panelPinned: true, lastTabByWorkspace: { a: 'b', bad: 1 } })).toEqual({
      panelExpanded: false,
      panelPinned: true,
      lastTabByWorkspace: { a: 'b' }
    });
  });

  it('persiste solo en local a través del área recibida', async () => {
    const storage = {
      get: vi.fn(async () => ({ [WORKBENCH_PREFS_KEY]: { panelPinned: true } })),
      set: vi.fn(async () => {})
    };
    expect((await loadWorkbenchPrefs(storage)).panelPinned).toBe(true);
    await saveWorkbenchPrefs({ panelExpanded: false }, storage);
    expect(storage.set).toHaveBeenCalledWith({
      [WORKBENCH_PREFS_KEY]: {
        panelExpanded: false,
        panelPinned: false,
        lastTabByWorkspace: {}
      }
    });
  });
});
