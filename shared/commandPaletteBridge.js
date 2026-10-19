const COMMAND_PALETTE_REQUEST_KEY = 'sfoc_command_palette_request_v1';
const REQUEST_MAX_AGE_MS = 15_000;

/** Acepta Ctrl/Cmd+K y mantiene Ctrl/Cmd+Shift+P por compatibilidad. */
export function isCommandPaletteShortcut(event) {
  if (!event || event.altKey || !(event.ctrlKey || event.metaKey)) return false;
  const key = String(event.key || '').toLowerCase();
  return (key === 'k' && event.shiftKey !== true) || (key === 'p' && event.shiftKey === true);
}

function findMainAppOpener() {
  let candidate = window.opener;
  for (let depth = 0; candidate && depth < 6; depth += 1) {
    try {
      if (candidate.closed) return null;
      if (candidate.document?.getElementById('quickOpenOverlay')) return candidate;
      candidate = candidate.opener;
    } catch {
      return null;
    }
  }
  return null;
}

function requestStorage() {
  return chrome?.storage?.session || chrome?.storage?.local || null;
}

async function writePaletteRequest(targetTabId) {
  const area = requestStorage();
  if (!area) return false;
  await area.set({
    [COMMAND_PALETTE_REQUEST_KEY]: {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      targetTabId,
      createdAt: Date.now()
    }
  });
  return true;
}

function mainAppUrl() {
  return chrome.runtime.getURL('code/code.html');
}

/**
 * Abre la paleta real de la aplicación desde una página independiente de la
 * extensión. No se importa desde popup/popup.html.
 */
export function setupStandaloneCommandPalette() {
  document.addEventListener('keydown', (event) => {
    if (!isCommandPaletteShortcut(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const opener = findMainAppOpener();
    if (opener) {
      opener.document.dispatchEvent(new opener.CustomEvent('sfoc:open-command-palette'));
      opener.focus();
      return;
    }

    void (async () => {
      const appUrl = mainAppUrl();
      if (!chrome?.tabs?.query || !chrome?.tabs?.create) {
        window.open(`${appUrl}?commandPalette=1`, '_blank');
        return;
      }
      const tabs = await chrome.tabs.query({});
      const existing = tabs
        .filter((tab) => typeof tab.url === 'string' && tab.url.startsWith(appUrl))
        .sort((a, b) => Number(b.active) - Number(a.active) || Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0))[0];
      if (!existing?.id) {
        await chrome.tabs.create({ url: `${appUrl}?commandPalette=1`, active: true });
        return;
      }
      await writePaletteRequest(existing.id);
      await chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId != null && chrome.windows?.update) {
        await chrome.windows.update(existing.windowId, { focused: true }).catch(() => {});
      }
    })().catch(() => {
      window.open(`${mainAppUrl()}?commandPalette=1`, '_blank');
    });
  }, true);
}

function getCurrentTab() {
  return new Promise((resolve) => {
    if (!chrome?.tabs?.getCurrent) {
      resolve(null);
      return;
    }
    chrome.tabs.getCurrent((tab) => resolve(tab || null));
  });
}

/** Escucha solicitudes enviadas por Ajustes y demás páginas sin `opener`. */
export function setupCommandPaletteRequestConsumer(onOpen) {
  if (typeof onOpen !== 'function') return () => {};
  const area = requestStorage();
  if (!area) return () => {};
  let lastRequestId = '';

  const consume = async (request) => {
    if (!request?.id || request.id === lastRequestId) return;
    if (Date.now() - Number(request.createdAt || 0) > REQUEST_MAX_AGE_MS) {
      await area.remove(COMMAND_PALETTE_REQUEST_KEY);
      return;
    }
    const tab = await getCurrentTab();
    if (request.targetTabId != null && tab?.id !== request.targetTabId) return;
    lastRequestId = request.id;
    await area.remove(COMMAND_PALETTE_REQUEST_KEY);
    requestAnimationFrame(() => onOpen());
  };

  const onStorageChanged = (changes, areaName) => {
    if (areaName !== 'session' && areaName !== 'local') return;
    const request = changes[COMMAND_PALETTE_REQUEST_KEY]?.newValue;
    if (request) void consume(request);
  };
  chrome.storage.onChanged.addListener(onStorageChanged);
  void area.get(COMMAND_PALETTE_REQUEST_KEY).then((values) => consume(values?.[COMMAND_PALETTE_REQUEST_KEY]));
  return () => chrome.storage.onChanged.removeListener(onStorageChanged);
}
