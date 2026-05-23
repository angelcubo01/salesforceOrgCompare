/** @param {chrome.runtime.MessageSender} sender */
export function isTrustedExtensionSender(sender) {
  return (
    sender?.id === chrome.runtime.id &&
    typeof sender.url === 'string' &&
    sender.url.startsWith(`chrome-extension://${chrome.runtime.id}/`)
  );
}
