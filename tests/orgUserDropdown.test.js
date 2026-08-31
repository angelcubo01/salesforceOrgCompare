import { describe, expect, it } from 'vitest';
import { shouldShowOrgUserBadge } from '../code/ui/orgUserDropdown.js';

describe('orgUserDropdown', () => {
  it('no muestra el icono de información si el selector está inactivo', () => {
    expect(shouldShowOrgUserBadge({ username: 'user@example.com' }, true)).toBe(false);
  });

  it('muestra el icono únicamente con usuario conectado y selector activo', () => {
    expect(shouldShowOrgUserBadge({ username: 'user@example.com' }, false)).toBe(true);
    expect(shouldShowOrgUserBadge(null, false)).toBe(false);
  });
});
