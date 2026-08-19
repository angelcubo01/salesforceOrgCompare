export const SFOC_UI_MODE_STORAGE_KEY = 'sfocUiMode';
export const UI_MODE_CLASSIC = 'classic';
export const UI_MODE_V2 = 'v2';

/**
 * Normaliza valores históricos o corruptos sin crear una segunda preferencia.
 * La ausencia de valor conserva Classic como opción segura.
 * @param {unknown} value
 * @returns {'classic'|'v2'}
 */
export function normalizeUiMode(value) {
  return value === UI_MODE_V2 ? UI_MODE_V2 : UI_MODE_CLASSIC;
}

function defaultStorageArea() {
  return typeof chrome !== 'undefined' ? chrome.storage?.local : null;
}

/** @param {{ get: Function } | null | undefined} [storageArea] */
export async function loadUiMode(storageArea = defaultStorageArea()) {
  if (!storageArea?.get) return UI_MODE_CLASSIC;
  try {
    const result = await storageArea.get(SFOC_UI_MODE_STORAGE_KEY);
    return normalizeUiMode(result?.[SFOC_UI_MODE_STORAGE_KEY]);
  } catch {
    return UI_MODE_CLASSIC;
  }
}

/**
 * @param {unknown} value
 * @param {{ set: Function } | null | undefined} [storageArea]
 */
export async function saveUiMode(value, storageArea = defaultStorageArea()) {
  const mode = normalizeUiMode(value);
  if (storageArea?.set) {
    await storageArea.set({ [SFOC_UI_MODE_STORAGE_KEY]: mode });
  }
  return mode;
}

/** @param {Document} doc @param {unknown} value */
export function applyUiModeToDocument(doc, value) {
  const mode = normalizeUiMode(value);
  if (doc?.documentElement) doc.documentElement.dataset.uiMode = mode;
  if (doc?.body) doc.body.dataset.uiMode = mode;
  return mode;
}

