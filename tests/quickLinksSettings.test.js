import { describe, expect, it } from 'vitest';
import {
  removeQuickLinkFromAllScopes
} from '../sfInject/popup/quickLinksSettings.js';

describe('Quick Links globales', () => {
  it('elimina el enlace global de todos los entornos donde se aplicó', () => {
    const quickLinks = {
      __global__: [{ id: 'global-home' }, { id: 'other-global' }],
      orgA: [{ id: 'global-home' }, { id: 'only-a' }],
      orgB: [{ id: 'only-b' }, { id: 'global-home' }]
    };

    removeQuickLinkFromAllScopes(quickLinks, 'global-home');

    expect(quickLinks).toEqual({
      __global__: [{ id: 'other-global' }],
      orgA: [{ id: 'only-a' }],
      orgB: [{ id: 'only-b' }]
    });
  });
});
