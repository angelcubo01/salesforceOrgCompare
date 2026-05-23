import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isTrustedExtensionSender } from '../shared/trustedSender.js';

describe('isTrustedExtensionSender', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      runtime: { id: 'test-extension-id' }
    });
  });

  it('acepta URL de página de la extensión', () => {
    expect(
      isTrustedExtensionSender({
        id: 'test-extension-id',
        url: 'chrome-extension://test-extension-id/code/code.html'
      })
    ).toBe(true);
  });

  it('rechaza otro extension id o origen web', () => {
    expect(
      isTrustedExtensionSender({
        id: 'other-id',
        url: 'chrome-extension://test-extension-id/popup/popup.html'
      })
    ).toBe(false);
    expect(
      isTrustedExtensionSender({
        id: 'test-extension-id',
        url: 'https://evil.example/'
      })
    ).toBe(false);
    expect(isTrustedExtensionSender({})).toBe(false);
  });
});
