/**
 * Despierta el service worker MV3 antes de enviar mensajes desde páginas de la extensión.
 */
export async function wakeServiceWorker() {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
  try {
    await chrome.runtime.sendMessage({ type: 'sfoc:ping' });
  } catch {
    /* El SW puede estar inactivo; el siguiente sendMessage lo reactivará. */
  }
}
