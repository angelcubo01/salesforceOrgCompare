import { describe, expect, it } from 'vitest';
import { nextKeyboardOptionIndex } from '../code/ui/keyboardPicklists.js';

describe('keyboardPicklists', () => {
  it('recorre las opciones con flechas de forma circular', () => {
    expect(nextKeyboardOptionIndex(-1, 'ArrowDown', 3)).toBe(0);
    expect(nextKeyboardOptionIndex(2, 'ArrowDown', 3)).toBe(0);
    expect(nextKeyboardOptionIndex(0, 'ArrowUp', 3)).toBe(2);
  });

  it('admite Home, End y listas vacías', () => {
    expect(nextKeyboardOptionIndex(1, 'Home', 3)).toBe(0);
    expect(nextKeyboardOptionIndex(1, 'End', 3)).toBe(2);
    expect(nextKeyboardOptionIndex(0, 'ArrowDown', 0)).toBe(-1);
  });
});
