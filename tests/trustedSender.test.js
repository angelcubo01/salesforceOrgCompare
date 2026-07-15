import { describe, expect, it } from 'vitest';
import { isTrustedExtensionSender } from '../shared/trustedSender.js';

describe('isTrustedExtensionSender', () => {
  it('accepts same-extension page sender', () => {
    const sender = {
      id: chrome.runtime.id,
      url: `chrome-extension://${chrome.runtime.id}/popup/popup.html`
    };
    expect(isTrustedExtensionSender(sender)).toBe(true);
  });

  it('rejects external page', () => {
    expect(
      isTrustedExtensionSender({
        id: chrome.runtime.id,
        url: 'https://evil.example/'
      })
    ).toBe(false);
  });

  it('rejects wrong extension id', () => {
    expect(
      isTrustedExtensionSender({
        id: 'other-extension',
        url: 'chrome-extension://other-extension/code.html'
      })
    ).toBe(false);
  });
});
