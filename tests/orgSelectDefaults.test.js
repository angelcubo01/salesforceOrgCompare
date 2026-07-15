import { describe, expect, it } from 'vitest';
import { pickLeftOrgSelection, pickRightOrgSelection } from '../code/ui/orgs.js';

const orgs = [{ id: 'org-a' }, { id: 'org-b' }, { id: 'org-c' }];

describe('org select defaults', () => {
  it('asigna orgs por defecto solo en el primer relleno', () => {
    expect(pickLeftOrgSelection(null, orgs, false)).toBe('org-a');
    expect(pickRightOrgSelection(null, orgs, false)).toBe('org-b');
  });

  it('conserva None si el usuario ya eligió sin segundo entorno', () => {
    expect(pickLeftOrgSelection(null, orgs, true)).toBeNull();
    expect(pickRightOrgSelection(null, orgs, true)).toBeNull();
  });

  it('conserva selección válida existente', () => {
    expect(pickRightOrgSelection('org-c', orgs, true)).toBe('org-c');
    expect(pickLeftOrgSelection('org-b', orgs, true)).toBe('org-b');
  });
});
