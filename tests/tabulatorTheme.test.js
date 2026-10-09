import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyTabulatorTheme,
  disposeTabulatorTheme,
  styleTabulatorRow
} from '../code/ui/tabulatorTheme.js';

describe('Tabulator theme integration', () => {
  const originalObserver = globalThis.MutationObserver;

  afterEach(() => {
    globalThis.MutationObserver = originalObserver;
  });

  it('marca filas sin recorrer ni reescribir sus celdas', () => {
    const add = vi.fn();
    styleTabulatorRow({ getElement: () => ({ classList: { add } }) });
    expect(add).toHaveBeenCalledWith('sfoc-tabulator-row');
  });

  it('fuerza un único redraw al cambiar el tema y libera el observer', () => {
    let observerCallback;
    const disconnect = vi.fn();
    globalThis.MutationObserver = class {
      constructor(callback) { observerCallback = callback; }
      observe() {}
      disconnect() { disconnect(); }
    };

    const listeners = new Map();
    const doc = {
      documentElement: { dataset: { uiTheme: 'dark' } },
      defaultView: {
        requestAnimationFrame(callback) { callback(); return 1; },
        cancelAnimationFrame: vi.fn()
      },
      addEventListener(type, callback) { listeners.set(type, callback); },
      removeEventListener: vi.fn()
    };
    const root = { dataset: {}, ownerDocument: doc };
    const table = { getElement: () => root, redraw: vi.fn() };

    applyTabulatorTheme(table);
    expect(root.dataset.sfocTheme).toBe('dark');
    doc.documentElement.dataset.uiTheme = 'light';
    observerCallback();
    expect(root.dataset.sfocTheme).toBe('light');
    expect(table.redraw).toHaveBeenCalledWith(true);

    disposeTabulatorTheme(table);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(doc.removeEventListener).toHaveBeenCalledWith(
      'sfoc:theme-ui-synced',
      listeners.get('sfoc:theme-ui-synced')
    );
  });
});
