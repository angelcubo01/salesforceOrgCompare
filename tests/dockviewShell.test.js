import { describe, expect, it, vi } from 'vitest';
import {
  COMPARATOR_DOCK_STORAGE_KEY,
  debounceLayoutSave,
  sfocDockviewThemeClass
} from '../code/lib/dockviewShell.js';

describe('dockviewShell', () => {
  it('sfocDockviewThemeClass incluye tema abyss y prefijo sfoc', () => {
    expect(sfocDockviewThemeClass()).toContain('dockview-theme-abyss');
    expect(sfocDockviewThemeClass()).toContain('sfoc-dockview');
  });

  it('debounceLayoutSave agrupa llamadas', async () => {
    vi.useFakeTimers();
    let count = 0;
    const save = debounceLayoutSave(() => {
      count += 1;
    }, 100);
    save();
    save();
    save();
    expect(count).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(count).toBe(1);
    vi.useRealTimers();
  });

  it('expone clave de almacenamiento del comparador', () => {
    expect(COMPARATOR_DOCK_STORAGE_KEY).toBe('dockviewLayout.comparator');
  });
});
