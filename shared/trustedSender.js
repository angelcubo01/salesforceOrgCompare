import { hostnameMatchesSfCloud } from './sfDomains.js';

/** @param {chrome.runtime.MessageSender} sender */
export function isTrustedExtensionSender(sender) {
  if (sender?.id !== chrome.runtime.id) return false;
  if (
    typeof sender.url === 'string' &&
    sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/`)
  ) {
    return true;
  }
  const tabUrl = sender.tab?.url;
  if (typeof tabUrl === 'string') {
    try {
      return hostnameMatchesSfCloud(new URL(tabUrl).hostname);
    } catch {
      return false;
    }
  }
  return false;
}
