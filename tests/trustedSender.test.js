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

  it('accepts content script sender on Salesforce tab', () => {
    expect(
      isTrustedExtensionSender({
        id: chrome.runtime.id,
        url: 'https://evil.example/',
        tab: { url: 'https://myorg.lightning.force.com/lightning/setup/ApexDebugLogs/home' }
      })
    ).toBe(true);
  });

  it('accepts content script on my.salesforce-setup.com', () => {
    expect(
      isTrustedExtensionSender({
        id: chrome.runtime.id,
        tab: {
          url: 'https://myorg.my.salesforce-setup.com/lightning/setup/ApexDebugLogs/home'
        }
      })
    ).toBe(true);
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
