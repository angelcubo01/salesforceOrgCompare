const STORAGE_KEY = 'sfocToolRecents';
const MAX_RECENTS = 5;
const MAX_PINS = 3;

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

export function getToolRecentsSnapshot() {
  return { ...cache, recents: [...cache.recents], pins: [...cache.pins] };
}

export function isToolPinned(toolId) {
  return cache.pins.includes(toolId);
}
