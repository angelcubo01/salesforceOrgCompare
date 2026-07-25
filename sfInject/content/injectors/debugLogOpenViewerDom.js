/**
 * Utilidades DOM específicas de debugLogOpenViewer.
 */
import { extractApexLogId } from '../matchers/debugLogPages.js';
import { queryAllDeep } from '../domUtils.js';

export const INTEGRATION_ID = 'debugLogOpenViewer';

export const NATIVE_ACTION_LINK_SELECTOR =
  'a.link-button, a.slds-text-link, a.actionLink, button.link-button, button.slds-text-link';

const VIEW_LABELS = new Set(['view', 'ver']);
const SECONDARY_ACTION_LABELS = new Set([
  'delete',
  'analyze',
  'analyse',
  'download',
  'descargar',
  'eliminar',
  'analizar',
  'borrar'
]);

/**
 * @param {Element} el
 */
function actionLinkLabel(el) {
  const text = (el.textContent || '').trim().toLowerCase();
  if (text) return text;
  const aria = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().toLowerCase();
  return aria;
}

/**
 * @param {Element} link
 */
export function isNativeDebugLogActionLink(link) {
  const label = actionLinkLabel(link);
  return VIEW_LABELS.has(label) || SECONDARY_ACTION_LABELS.has(label);
}

/**
 * @param {Element} row
 * @returns {Element[]}
 */
export function findNativeActionLinksInRow(row) {
  try {
    return [...row.querySelectorAll(NATIVE_ACTION_LINK_SELECTOR)].filter(isNativeDebugLogActionLink);
  } catch {
    return queryAllDeep(row, NATIVE_ACTION_LINK_SELECTOR).filter(isNativeDebugLogActionLink);
  }
}

/**
 * @param {Element} row
 * @returns {boolean}
 */
export function isDebugLogActionRow(row) {
  const links = findNativeActionLinksInRow(row);
  const labels = new Set(links.map((a) => actionLinkLabel(a)));
  const hasView = [...labels].some((l) => VIEW_LABELS.has(l));
  const hasOther = [...labels].some((l) => SECONDARY_ACTION_LABELS.has(l));
  return hasView && hasOther;
}

/**
 * @param {Document} doc
 * @returns {boolean}
 */
export function isDebugLogsTableDocument(doc) {
  if (!doc) return false;
  const title = (
    doc.querySelector('h1.pageType, h2.mainTitle, .pageType, .mainTitle')?.textContent || ''
  ).toLowerCase();
  if (title.includes('debug log')) return true;
  return findDebugLogActionRows(doc).length > 0;
}

/**
 * @param {Element} row
 * @returns {string | null}
 */
export function extractLogIdFromRow(row) {
  if (!row) return null;

  const attrCandidates = [
    row.getAttribute('data-row-key-value'),
    row.getAttribute('data-record-id'),
    row.getAttribute('data-key'),
    row.getAttribute('data-id')
  ];
  for (const raw of attrCandidates) {
    const id = extractApexLogId(String(raw || ''));
    if (id) return id.slice(0, 15);
  }

  for (const el of queryAllDeep(row, 'a[href], button[onclick], [data-href], [onclick]')) {
    const href = el.getAttribute('href') || el.getAttribute('data-href') || '';
    const fromHref = extractApexLogId(href);
    if (fromHref) return fromHref.slice(0, 15);
    const onclick = el.getAttribute('onclick') || '';
    const fromOnclick = extractApexLogId(onclick);
    if (fromOnclick) return fromOnclick.slice(0, 15);
  }

  const text = row.textContent || '';
  const m = text.match(/\b(07L[a-zA-Z0-9]{12})\b/);
  return m ? m[1] : null;
}

/**
 * @param {Element} row
 * @returns {Element | null}
 */
export function findDebugLogActionsHost(row) {
  const actionLinks = findNativeActionLinksInRow(row);
  if (!actionLinks.length) return null;
  const parent = actionLinks[0].parentElement;
  if (!parent) return null;
  if (parent.matches('td, th, [role="gridcell"], div, span')) return parent;
  return actionLinks[actionLinks.length - 1].parentElement;
}

/**
 * Ámbito preferido: tabla Debug Logs (evita escanear User Trace Flags, cientos de filas).
 * @param {Document} doc
 * @returns {ParentNode}
 */
export function getDebugLogsScanRoot(doc) {
  const table = doc.getElementById('Apex_Trace_List:traceForm:traceTable');
  if (table) return table;
  return doc;
}

/**
 * @param {Document} doc
 * @returns {Element[]}
 */
export function findDebugLogActionRows(doc) {
  const rows = [];
  const seen = new Set();
  const root = getDebugLogsScanRoot(doc);
  // Classic VF no usa Shadow DOM; querySelectorAll directo es suficiente y mucho más barato.
  let candidates;
  try {
    candidates = root.querySelectorAll('tbody tr, tr.dataRow, tr[class*="dataRow"], [role="row"]');
  } catch {
    candidates = queryAllDeep(root, 'tr, [role="row"]');
  }
  for (const row of candidates) {
    if (!(row instanceof Element) || seen.has(row)) continue;
    if (row.closest('thead, [role="columnheader"]')) continue;
    if (!isDebugLogActionRow(row)) continue;
    seen.add(row);
    rows.push(row);
  }
  return rows;
}
