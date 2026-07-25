/**
 * Resolución de filas Debug Logs → Id de ApexLog (DOM + API).
 */
import {
  extractLogIdFromRow,
  findDebugLogActionRows
} from './debugLogOpenViewerDom.js';

/**
 * @param {Document} doc
 * @param {string} orgId
 * @param {(orgId: string) => Promise<{ ok?: boolean, logs?: Array<{ id?: string }> }>} fetchCatalog
 * @returns {Promise<Array<{ row: Element, logId: string }>>}
 */
export async function resolveDebugLogRowsWithIds(doc, orgId, fetchCatalog) {
  const listRows = findDebugLogActionRows(doc);
  if (!listRows.length) return [];

  const pairs = listRows.map((row) => ({
    row,
    logId: extractLogIdFromRow(row)
  }));
  const needsCatalog = pairs.some((p) => !p.logId);

  let catalog = [];
  if (needsCatalog) {
    try {
      const res = await fetchCatalog(orgId);
      if (res?.ok && Array.isArray(res.logs)) catalog = res.logs;
    } catch {
      /* ignore */
    }
  }

  return listRows
    .map((row, index) => {
      const fromDom = extractLogIdFromRow(row);
      const fromApi = catalog[index]?.id ? String(catalog[index].id).slice(0, 15) : null;
      const logId = fromDom || fromApi;
      return logId ? { row, logId } : null;
    })
    .filter(Boolean);
}
