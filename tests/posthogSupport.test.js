import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extensionMatchesSupportDomains,
  showPosthogSupport,
  resetPosthogSupport
} from '../shared/posthogSupport.js';

vi.mock('../shared/posthogSupportFlag.js', () => ({
  isPosthogSupportFlagEnabled: vi.fn(async () => true)
}));

describe('extensionMatchesSupportDomains', () => {
  it('acepta chrome-extension con id exacto', () => {
    expect(
      extensionMatchesSupportDomains(['mpocihehhnklfhplkdlmahmopinjnpcg'], 'mpocihehhnklfhplkdlmahmopinjnpcg')
    ).toBe(true);
  });

  it('rechaza si el dominio no está en la lista', () => {
    expect(extensionMatchesSupportDomains(['otherid'], 'mpocihehhnklfhplkdlmahmopinjnpcg')).toBe(false);
  });
});

describe('showPosthogSupport', () => {
  beforeEach(() => {
    resetPosthogSupport();
    vi.stubGlobal('requestAnimationFrame', (cb) => {
      cb(0);
      return 0;
    });
    vi.stubGlobal('document', {
      getElementById: (id) => (id === 'sfoc-ph-support-bubble-style' ? {} : null),
      createElement: () => ({ id: '', textContent: '' }),
      head: { appendChild: () => {} },
      dispatchEvent: () => true
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ conversations: { domains: [] } }) })));
  });

  it('no lanza ReferenceError si el widget no aparece', async () => {
    const ph = {
      get_distinct_id: () => 'test',
      conversations: {
        isAvailable: () => true,
        show: vi.fn(),
        isVisible: () => false
      },
      reloadFeatureFlags: vi.fn()
    };

    const result = await showPosthogSupport(ph);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('widget_not_found');
      expect(typeof result.extensionId).toBe('string');
      expect(Array.isArray(result.configuredDomains)).toBe(true);
    }
  });
});
