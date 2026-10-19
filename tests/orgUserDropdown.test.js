import { describe, expect, it } from 'vitest';
import {
  resolveOrgKeyboardShortcut,
  shouldShowOrgUserBadge
} from '../code/ui/orgUserDropdown.js';

describe('orgUserDropdown', () => {
  it('no muestra el icono de información si el selector está inactivo', () => {
    expect(shouldShowOrgUserBadge({ username: 'user@example.com' }, true)).toBe(false);
  });

  it('muestra el icono únicamente con usuario conectado y selector activo', () => {
    expect(shouldShowOrgUserBadge({ username: 'user@example.com' }, false)).toBe(true);
    expect(shouldShowOrgUserBadge(null, false)).toBe(false);
  });

  it('resuelve Alt+1 y Alt+2 sin interceptar otras combinaciones', () => {
    expect(resolveOrgKeyboardShortcut({ altKey: true, code: 'Digit1' })).toBe('left');
    expect(resolveOrgKeyboardShortcut({ altKey: true, code: 'Digit2' })).toBe('right');
    expect(resolveOrgKeyboardShortcut({ altKey: true, shiftKey: true, code: 'Digit1' })).toBeNull();
    expect(resolveOrgKeyboardShortcut({ code: 'Digit1' })).toBeNull();
  });
});
