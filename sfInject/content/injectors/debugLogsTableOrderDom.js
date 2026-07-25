/**
 * Reordenación DOM: Debug Logs encima de User Trace Flags (Setup Classic iframe).
 */
export const INTEGRATION_ID = 'debugLogsTableOrder';

const TRACE_FORM_ID = 'Apex_Trace_List:traceForm';
const MONITORED_FORM_ID = 'Apex_Trace_List:monitoredUsersForm';
const ORDER_APPLIED_ATTR = 'data-sfoc-debug-logs-order';

/**
 * @param {ParentNode} el
 * @returns {boolean}
 */
function containsUserTraceFlags(el) {
  if (!el || typeof el.querySelector !== 'function') return false;
  if (el.querySelector(`[id="${MONITORED_FORM_ID}"]`)) return true;
  for (const h2 of el.querySelectorAll('h2.mainTitle')) {
    if (/user trace flags/i.test((h2.textContent || '').trim())) return true;
  }
  return false;
}

/**
 * @param {Element} el
 * @param {Element | null} [excludeTr]
 * @returns {HTMLTableRowElement | null}
 */
function findOuterTbodyRow(el, excludeTr = null) {
  let node = el;
  while (node) {
    if (
      node.tagName === 'TR' &&
      node.parentElement?.tagName === 'TBODY' &&
      node !== excludeTr &&
      containsUserTraceFlags(node)
    ) {
      return /** @type {HTMLTableRowElement} */ (node);
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * @param {Document} doc
 * @returns {boolean}
 */
export function isApexDebugLogsSetupDocument(doc) {
  if (!doc) return false;
  return !!(doc.getElementById(TRACE_FORM_ID) || doc.getElementById(MONITORED_FORM_ID));
}

/**
 * Fila de sección que contiene el formulario Debug Logs (tabla + paginación).
 * @param {Document} doc
 * @returns {HTMLTableRowElement | null}
 */
export function findDebugLogsSectionRow(doc) {
  const form = doc.getElementById(TRACE_FORM_ID);
  if (!form) return null;
  const tr = form.closest?.('tr') ?? null;
  if (!tr || tr.tagName !== 'TR') return null;
  if (!tr.querySelector(`[id="${TRACE_FORM_ID}"]`)) return null;
  return /** @type {HTMLTableRowElement} */ (tr);
}

/**
 * Fila de sección User Trace Flags (hermana anterior del bloque Debug Logs en el layout nativo).
 * @param {Document} doc
 * @param {HTMLTableRowElement | null} [debugTr]
 * @returns {HTMLTableRowElement | null}
 */
export function findUserTraceFlagsSectionRow(doc, debugTr = null) {
  const debugRow = debugTr || findDebugLogsSectionRow(doc);
  if (debugRow?.parentElement) {
    let prev = debugRow.previousElementSibling;
    while (prev) {
      if (prev.tagName === 'TR' && containsUserTraceFlags(prev)) {
        return /** @type {HTMLTableRowElement} */ (prev);
      }
      prev = prev.previousElementSibling;
    }
  }

  const form = doc.getElementById(MONITORED_FORM_ID);
  if (!form) return null;
  return findOuterTbodyRow(form, debugRow);
}

/**
 * @param {Document} doc
 * @returns {boolean}
 */
export function isDebugLogsAboveUserTraceFlags(doc) {
  const debugTr = findDebugLogsSectionRow(doc);
  const userTr = findUserTraceFlagsSectionRow(doc, debugTr);
  if (!debugTr || !userTr || debugTr === userTr) return false;
  if (debugTr.parentElement !== userTr.parentElement) return false;
  const parent = debugTr.parentElement;
  const rows = [...parent.children].filter((child) => child.tagName === 'TR');
  const debugIdx = rows.indexOf(debugTr);
  const userIdx = rows.indexOf(userTr);
  return debugIdx !== -1 && userIdx !== -1 && debugIdx < userIdx;
}

/**
 * Mueve la sección Debug Logs (incl. Previous/Next Page) encima de User Trace Flags.
 * @param {Document} doc
 * @returns {{ ok: boolean, reason: string }}
 */
export function reorderDebugLogsAboveUserTraceFlags(doc) {
  const debugTr = findDebugLogsSectionRow(doc);
  const userTr = findUserTraceFlagsSectionRow(doc, debugTr);
  if (!debugTr || !userTr) return { ok: false, reason: 'not-found' };
  if (debugTr === userTr) return { ok: false, reason: 'same-row' };

  const parent = debugTr.parentElement;
  if (!parent || parent !== userTr.parentElement) {
    return { ok: false, reason: 'different-parent' };
  }

  if (isDebugLogsAboveUserTraceFlags(doc)) {
    doc.documentElement?.setAttribute(ORDER_APPLIED_ATTR, 'applied');
    return { ok: true, reason: 'already-ordered' };
  }

  parent.insertBefore(debugTr, userTr);
  doc.documentElement?.setAttribute(ORDER_APPLIED_ATTR, 'applied');
  return { ok: true, reason: 'reordered' };
}
