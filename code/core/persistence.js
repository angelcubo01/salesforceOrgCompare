import { state } from './state.js';

export function option(value, label) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  return o;
}

/** Todo package.xml (manifiesto, árbol retrieve, hijos ZIP) es de sesión: no persiste al recargar. */
export function isEphemeralPackageXmlItem(item) {
  return item?.type === 'PackageXml';
}

/** Clave de fijado (`type:key`) de un package.xml efímero. */
export function isEphemeralPackageXmlPinKey(pinKeyStr) {
  return typeof pinKeyStr === 'string' && pinKeyStr.startsWith('PackageXml:');
}

/** Al restaurar sesión: ningún package.xml ni fijado de package.xml. */
export function restoreSessionWithoutEphemeralPackageXml() {
  state.savedItems = state.savedItems.filter((i) => i && !isEphemeralPackageXmlItem(i));
  state.packageXmlLocalContent = {};
  state.packageRetrieveZipCache = {};

  if (state.selectedItem && isEphemeralPackageXmlItem(state.selectedItem)) {
    state.selectedItem = null;
  }

  const nextPins = state.pinnedKeys.filter((pk) => !isEphemeralPackageXmlPinKey(pk));
  if (nextPins.length !== state.pinnedKeys.length) {
    state.pinnedKeys = nextPins;
    savePinnedKeys();
  }
  prunePinnedKeysToSavedItems();
}

export function saveItemsToStorage() {
  const storable = state.savedItems.filter((i) => i && !isEphemeralPackageXmlItem(i));
  chrome.storage.local.set({ savedCodeItems: storable });
}

export function loadItemsFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['savedCodeItems'], (result) => {
      state.savedItems = (result.savedCodeItems || []).filter(
        (i) => i && !isEphemeralPackageXmlItem(i)
      );
      restoreSessionWithoutEphemeralPackageXml();
      saveItemsToStorage();
      resolve(state.savedItems);
    });
  });
}

/**
 * Persiste la lista de comparación al ocultar o cerrar la pestaña (historial completo entre sesiones).
 * Los fijados siguen ordenándose arriba vía `pinnedKeys`; el borrado manual usa el botón de papelera.
 */
export function setupPersistSavedItemsOnPageClose() {
  const persist = () => {
    try {
      saveItemsToStorage();
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('pagehide', persist, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist();
  });
}


/** Elimina entradas de `pinnedKeys` que no tienen ítem en la lista cargada (p. ej. no persistibles). */
export function prunePinnedKeysToSavedItems() {
  const keysInItems = new Set(state.savedItems.filter(Boolean).map((i) => pinKey(i)));
  const next = state.pinnedKeys.filter((pk) => keysInItems.has(pk));
  if (next.length !== state.pinnedKeys.length) {
    state.pinnedKeys = next;
    savePinnedKeys();
  }
}

const MAX_PINNED = 5;

export function pinKey(item) {
  if (!item) return '';
  return `${item.type}:${item.key}`;
}

export async function loadPinnedKeys() {
  try {
    const res = await chrome.storage.local.get('pinnedKeys');
    const raw = Array.isArray(res.pinnedKeys) ? res.pinnedKeys : [];
    state.pinnedKeys = raw
      .filter((pk) => !isEphemeralPackageXmlPinKey(pk))
      .slice(0, MAX_PINNED);
    if (raw.length !== state.pinnedKeys.length) {
      savePinnedKeys();
    }
  } catch {}
  return state.pinnedKeys;
}

export function savePinnedKeys() {
  chrome.storage.local.set({ pinnedKeys: state.pinnedKeys.slice(0, MAX_PINNED) });
}

export function togglePin(item) {
  if (item?.type === 'PackageXml') return null;
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
