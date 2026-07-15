import { describe, expect, it } from 'vitest';
import { isDualOrgUiActiveFromBody, isSingleOrgToolActiveFromBody } from '../code/ui/orgs.js';

/** @param {string[]} classes */
function hasClassFactory(classes) {
  const set = new Set(classes);
  return (name) => set.has(name);
}

describe('org swap button visibility helpers', () => {
  it('detecta herramientas mono-org como Quick Edit', () => {
    const hasClass = hasClassFactory(['artifact-quick-edit']);
    expect(isSingleOrgToolActiveFromBody(hasClass)).toBe(true);
    expect(isDualOrgUiActiveFromBody(hasClass)).toBe(false);
  });

  it('detecta modos compare dual-org', () => {
    const hasClass = hasClassFactory(['artifact-anonymous-apex', 'artifact-anonymous-apex-compare']);
    expect(isSingleOrgToolActiveFromBody(hasClass)).toBe(false);
    expect(isDualOrgUiActiveFromBody(hasClass)).toBe(true);
  });

  it('Anonymous Apex sin compare es mono-org', () => {
    const hasClass = hasClassFactory(['artifact-anonymous-apex']);
    expect(isSingleOrgToolActiveFromBody(hasClass)).toBe(true);
  });
});
