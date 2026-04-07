import { state } from './state.js';

export function option(value, label) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  return o;
}

export function saveItemsToStorage() {
  const storable = state.savedItems.filter(
    (i) =>
      !(i.type === 'PackageXml' && i.descriptor?.source === 'localFile') &&
      !(i.type === 'PackageXml' && i.descriptor?.source === 'retrieveZipFile')
  );
  chrome.storage.local.set({ savedCodeItems: storable });
}

export function loadItemsFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['savedCodeItems'], (result) => {
      state.savedItems = result.savedCodeItems || [];
      resolve(state.savedItems);
    });
  });
}

/**
 * Al cerrar/navegar fuera se borra el historial no fijado, pero los pineados deben
 * seguir en `savedCodeItems` para que coincidan con `pinnedKeys` en la siguiente sesión.
 */
export function setupClearFileHistoryOnPageClose() {
  const persistPinnedOnly = () => {
    try {
      const pinned = new Set(state.pinnedKeys);
      const storablePinned = state.savedItems.filter(
        (i) =>
          pinned.has(pinKey(i)) &&
          !(i.type === 'PackageXml' && i.descriptor?.source === 'localFile') &&
          !(i.type === 'PackageXml' && i.descriptor?.source === 'retrieveZipFile')
      );
      if (storablePinned.length > 0) {
        chrome.storage.local.set({ savedCodeItems: storablePinned });
      } else {
        chrome.storage.local.remove('savedCodeItems');
      }
    } catch (_) {
      // ignore
    }
  };
  window.addEventListener('pagehide', persistPinnedOnly, { capture: true });
}

/** Elimina entradas de `pinnedKeys` que no tienen ítem en la lista cargada (p. ej. no persistibles). */
export function prunePinnedKeysToSavedItems() {
  const keysInItems = new Set(state.savedItems.map((i) => pinKey(i)));
  const next = state.pinnedKeys.filter((pk) => keysInItems.has(pk));
  if (next.length !== state.pinnedKeys.length) {
    state.pinnedKeys = next;
    savePinnedKeys();
  }
}

const MAX_PINNED = 5;

export function pinKey(item) {
  return `${item.type}:${item.key}`;
}

export async function loadPinnedKeys() {
  try {
    const res = await chrome.storage.local.get('pinnedKeys');
    state.pinnedKeys = Array.isArray(res.pinnedKeys) ? res.pinnedKeys.slice(0, MAX_PINNED) : [];
  } catch {}
  return state.pinnedKeys;
}

export function savePinnedKeys() {
  chrome.storage.local.set({ pinnedKeys: state.pinnedKeys.slice(0, MAX_PINNED) });
}

export function togglePin(item) {
  const key = pinKey(item);
  const idx = state.pinnedKeys.indexOf(key);
  if (idx >= 0) {
    state.pinnedKeys.splice(idx, 1);
    savePinnedKeys();
    return false;
  }
  if (state.pinnedKeys.length >= MAX_PINNED) return null;
  state.pinnedKeys.push(key);
  savePinnedKeys();
  return true;
}

export function isPinned(item) {
  return state.pinnedKeys.includes(pinKey(item));
}
