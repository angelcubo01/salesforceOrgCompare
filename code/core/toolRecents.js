const STORAGE_KEY = 'sfocToolRecents';
const MAX_RECENTS = 8;
const MAX_PINS = 8;

/** @typedef {{ recents: string[]; pins: string[] }} ToolRecentsState */

/** @type {ToolRecentsState} */
let cache = { recents: [], pins: [] };
let loaded = false;

/** @returns {ToolRecentsState} */
function normalizeState(raw) {
  const recents = Array.isArray(raw?.recents)
    ? raw.recents.filter((t) => typeof t === 'string' && t.trim()).slice(0, MAX_RECENTS)
    : [];
  const pins = Array.isArray(raw?.pins)
    ? raw.pins.filter((t) => typeof t === 'string' && t.trim()).slice(0, MAX_PINS)
    : [];
  return { recents, pins };
}

export async function loadToolRecents() {
  if (loaded) return cache;
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    cache = normalizeState(result[STORAGE_KEY]);
  } catch {
    cache = { recents: [], pins: [] };
  }
  loaded = true;
  return cache;
}

async function saveToolRecents() {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: cache });
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('sfoc:tool-recents-change', { detail: getToolRecentsSnapshot() }));
  }
}

/**
 * @param {string} toolId
 */
export async function recordToolVisit(toolId) {
  if (!toolId || toolId === 'Home' || toolId === 'Comparator') return;
  await loadToolRecents();
  const next = [toolId, ...cache.recents.filter((t) => t !== toolId)].slice(0, MAX_RECENTS);
  cache = { ...cache, recents: next };
  await saveToolRecents();
}

/**
 * @param {string} toolId
 */
export async function toggleToolPin(toolId) {
  if (!toolId) return cache;
  await loadToolRecents();
  const pinned = cache.pins.includes(toolId);
  let pins = pinned ? cache.pins.filter((t) => t !== toolId) : [toolId, ...cache.pins];
  if (!pinned && pins.length > MAX_PINS) pins = pins.slice(0, MAX_PINS);
  cache = { ...cache, pins };
  await saveToolRecents();
  return cache;
}

/**
 * Alterna un favorito compartido por varias herramientas relacionadas.
 * Al activarlo conserva como destino la herramienta desde la que se realizó
 * la acción; al desactivarlo elimina el favorito de todo el grupo.
 *
 * @param {string[]} toolIds
 * @param {string} preferredToolId
 */
export async function toggleToolPinGroup(toolIds, preferredToolId) {
  const group = [...new Set((Array.isArray(toolIds) ? toolIds : [])
    .filter((toolId) => typeof toolId === 'string' && toolId.trim()))];
  if (!group.length) return cache;
  await loadToolRecents();
  const pinned = cache.pins.some((toolId) => group.includes(toolId));
  const remainingPins = cache.pins.filter((toolId) => !group.includes(toolId));
  const toolId = group.includes(preferredToolId) ? preferredToolId : group[0];
  const pins = pinned ? remainingPins : [toolId, ...remainingPins].slice(0, MAX_PINS);
  cache = { ...cache, pins };
  await saveToolRecents();
  return cache;
}

export function getToolRecentsSnapshot() {
  return { ...cache, recents: [...cache.recents], pins: [...cache.pins] };
}

export function isToolPinned(toolId) {
  return cache.pins.includes(toolId);
}
