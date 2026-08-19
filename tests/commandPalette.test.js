import { describe, expect, it } from 'vitest';
import { isCommandPaletteShortcut } from '../code/ui/quickOpen.js';

describe('command palette', () => {
  it('abre con Ctrl/Cmd+K y conserva Ctrl/Cmd+Shift+P', () => {
    expect(isCommandPaletteShortcut({ key: 'k', ctrlKey: true, shiftKey: false })).toBe(true);
    expect(isCommandPaletteShortcut({ key: 'K', metaKey: true, shiftKey: false })).toBe(true);
    expect(isCommandPaletteShortcut({ key: 'p', ctrlKey: true, shiftKey: true })).toBe(true);
    expect(isCommandPaletteShortcut({ key: 'p', metaKey: true, shiftKey: true })).toBe(true);
  });

  it('no secuestra atajos sin modificador o con Alt', () => {
    expect(isCommandPaletteShortcut({ key: 'k' })).toBe(false);
    expect(isCommandPaletteShortcut({ key: 'k', ctrlKey: true, altKey: true })).toBe(false);
    expect(isCommandPaletteShortcut({ key: 'p', ctrlKey: true, shiftKey: false })).toBe(false);
  });
});
