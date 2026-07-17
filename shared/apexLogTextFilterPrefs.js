/** Preferencias del filtro de texto del visor de logs Apex. */
export const STORAGE_KEY = 'sfocApexLogTextFilterPrefs';

export const DEFAULT_RELEVANT_CATEGORIES = [
  'soql',
  'dml',
  'debug',
  'callout',
  'limit',
  'error',
  'stack',
  'method',
  'unit',
  'validation'
];

/**
 * @param {unknown} raw
 * @returns {{ stripHiddenLines: boolean }}
 */
export function normalizeApexLogTextFilterPrefs(raw) {
  const p = raw && typeof raw === 'object' && !Array.isArray(raw) ? /** @type {Record<string, unknown>} */ (raw) : {};
  return {
    stripHiddenLines: p.stripHiddenLines === true
  };
}

/**
 * @returns {Promise<{ stripHiddenLines: boolean }>}
 */
export async function readApexLogTextFilterPrefs() {
  try {
    const bag = await chrome.storage.local.get(STORAGE_KEY);
    return normalizeApexLogTextFilterPrefs(bag[STORAGE_KEY]);
  } catch {
    return normalizeApexLogTextFilterPrefs(null);
  }
}

/**
 * @param {Partial<{ stripHiddenLines: boolean }>} partial
 * @returns {Promise<{ stripHiddenLines: boolean }>}
 */
export async function writeApexLogTextFilterPrefs(partial) {
  const current = await readApexLogTextFilterPrefs();
  const next = { ...current, ...partial };
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
  } catch {
    /* ignore */
  }
  return next;
}

/**
 * @param {string[]} sourceLines
 * @param {Set<string> | string[]} enabledCategories
 * @param {Map<number, string> | Record<number, string>} categoryByLine
 * @returns {{ text: string, lineMap: number[] }}
 */
export function buildStrippedText(sourceLines, enabledCategories, categoryByLine) {
  const enabled =
    enabledCategories instanceof Set ? enabledCategories : new Set(enabledCategories || []);
  /** @type {string[]} */
  const kept = [];
  /** @type {number[]} lineMap[editorLine - 1] = fileLine (1-based) */
  const lineMap = [];

  const getCategory = (fileLine) => {
    if (categoryByLine instanceof Map) return categoryByLine.get(fileLine) || 'other';
    return categoryByLine?.[fileLine] || 'other';
  };

  for (let i = 0; i < sourceLines.length; i++) {
    const fileLine = i + 1;
    if (enabled.has(getCategory(fileLine))) {
      kept.push(sourceLines[i]);
      lineMap.push(fileLine);
    }
  }

  return { text: kept.join('\n'), lineMap };
}
