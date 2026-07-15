import { describe, it, expect } from 'vitest';
import { deriveOpFromDeepLink } from '../code/lib/compareDeepLink.js';

describe('appHistoryNavigation helpers', () => {
  it('deriveOpFromDeepLink alinea con la lógica de init en code.js', () => {
    const parsed = parseLikeInit({
      op: null,
      itemType: 'LWC',
      itemKey: 'myCmp'
    });
    expect(deriveOpFromDeepLink(parsed)).toBe('LWC');
  });

  it('prioriza op de URL sobre tipo de ítem', () => {
    const parsed = parseLikeInit({
      op: 'QueryExplorer',
      itemType: 'ApexClass',
      itemKey: 'Foo'
    });
    expect(deriveOpFromDeepLink(parsed)).toBe('QueryExplorer');
  });
});

/** @param {{ op: string | null, itemType: string | null, itemKey: string | null }} fields */
function parseLikeInit(fields) {
  return {
    leftOrgId: null,
    rightOrgId: null,
    fileName: null,
    descriptor: null,
    navMode: 'comparator',
    ...fields
  };
}
