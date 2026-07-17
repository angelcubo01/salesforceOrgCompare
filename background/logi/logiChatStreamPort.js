import { handleLogiAdvisorChat } from './apexLogAiAdvisor.js';

export const LOGI_CHAT_STREAM_PORT = 'logi-chat-stream';

/**
 * Port-based streaming for Logi chat (extension pages ↔ service worker).
 */
export function installLogiChatStreamPort() {
  if (typeof chrome === 'undefined' || !chrome.runtime?.onConnect) return;

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== LOGI_CHAT_STREAM_PORT) return;

    let closed = false;
    port.onDisconnect.addListener(() => {
      closed = true;
    });

    port.onMessage.addListener((msg) => {
      if (!msg || msg.type !== 'aiAdvisor:chatStream') return;
      const payload = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};

      void (async () => {
        try {
          const result = await handleLogiAdvisorChat(payload, {
            onDelta: (text) => {
              if (closed || !text) return;
              try {
                port.postMessage({ type: 'delta', text: String(text) });
              } catch {
                /* port closed */
              }
            }
          });
          if (closed) return;
          try {
            port.postMessage({ type: 'done', result });
          } catch {
            /* port closed */
          }
        } catch (e) {
          if (closed) return;
          try {
            port.postMessage({
              type: 'error',
              error: String(e?.message || e || 'LLM_ERROR'),
              reason: 'LLM_ERROR'
            });
          } catch {
            /* port closed */
          }
        }
      })();
    });
  });
}
