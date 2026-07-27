/**
 * DOM helpers: User Trace Flags (Setup Classic iframe).
 *
 * Estructura real (listApexTraces.apexp):
 *   table#Apex_Trace_List:panelGrid > tbody
 *     tr  ← sección User Trace Flags (contiene TODA la lista)
 *       td > div.listRelatedObject > div.bPageBlock
 *              div.pbHeader > form#Apex_Trace_List:monitoredUsersForm (título + New)
 *              div.pbBody   > table.list > tbody > tr.headerRow | tr.dataRow*
 *     tr  ← sección Debug Logs (form#Apex_Trace_List:traceForm)
 *
 * Por eso la tabla se busca desde un enlace delTraceFlag hacia arriba (`closest`):
 * usar querySelectorAll('table') devolvía el panelGrid exterior y el filtro
 * acababa ocultando la sección entera.
 */
import { queryAllDeep } from '../domUtils.js';
import { decodeSalesforceHref, normalizeTraceFlagId } from '../matchers/traceFlagIds.js';

export { normalizeTraceFlagId };

export const INTEGRATION_ID = 'userTraceFlagsEnhance';

export const MONITORED_FORM_ID = 'Apex_Trace_List:monitoredUsersForm';

const DEL_TRACE_FLAG_SELECTOR = 'a[href*="delTraceFlag"], a[onclick*="delTraceFlag"]';

const FILTER_WRAP_ATTR = 'data-sfoc-utf-filter';
const BADGE_ATTR = 'data-sfoc-utf-badge';
const ROW_HIDDEN_ATTR = 'data-sfoc-utf-hidden';
const ROW_TRACE_ATTR = 'data-sfoc-utf-trace-id';
const SYNTHETIC_ROW_ATTR = 'data-sfoc-utf-synthetic';
const NATIVE_PAGER_HIDDEN_ATTR = 'data-sfoc-utf-pager-hidden';

/** Enlaces de acción Classic (con o sin class actionLink). */
const TRACE_ACTION_LABELS = new Set([
  'del',
  'delete',
  'eliminar',
  'borrar',
  'edit',
  'editar',
  'modify',
  'modificar',
  'filters',
  'filter',
  'filtros',
  'filtro'
]);

const USER_ID_RE = /005[a-zA-Z0-9]{12,15}/i;

/**
 * @param {ParentNode | null | undefined} root
 * @returns {Element | null}
 */
function findDelTraceFlagLink(root) {
  if (!root || typeof root.querySelector !== 'function') return null;
  try {
    return root.querySelector(DEL_TRACE_FLAG_SELECTOR);
  } catch {
    return null;
  }
}

/**
 * @param {Element} el
 */
function actionLinkLabel(el) {
  const text = (el.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (text && text.length < 40) return text;
  return (el.getAttribute('aria-label') || el.getAttribute('title') || '')
    .trim()
    .toLowerCase()
    .split(/[\s—–-]+/)[0];
}

/**
 * @param {string} raw
 * @returns {string | null}
 */
export function normalizeUserId(raw) {
  const decoded = decodeSalesforceHref(raw);
  const m = decoded.match(USER_ID_RE) || String(raw || '').match(USER_ID_RE);
  if (!m) return null;
  return m[0].slice(0, 15);
}

/**
 * Documento Classic Debug Logs con sección User Trace Flags.
 * @param {Document} doc
 * @returns {boolean}
 */
export function isUserTraceFlagsDocument(doc) {
  if (!doc) return false;
  if (doc.getElementById?.(MONITORED_FORM_ID)) return true;
  return !!findDelTraceFlagLink(doc);
}

/**
 * @param {Document} doc
 * @returns {Element | null}
 */
export function findMonitoredUsersForm(doc) {
  return doc?.getElementById?.(MONITORED_FORM_ID) || null;
}

/**
 * @param {Element} row
 * @returns {Element[]}
 */
export function findTraceActionLinksInRow(row) {
  let links;
  try {
    links = [...row.querySelectorAll('a')];
  } catch {
    links = queryAllDeep(row, 'a');
  }
  return links.filter((a) => {
    const label = actionLinkLabel(a);
    if (TRACE_ACTION_LABELS.has(label)) return true;
    const title = (a.getAttribute('title') || '').trim().toLowerCase();
    return /^(del|delete|eliminar|edit|editar|modify|modificar|filter)\b/.test(title);
  });
}

/**
 * @param {Element} row
 * @returns {string | null}
 */
export function extractTraceFlagIdFromRow(row) {
  if (!row) return null;

  const cached = normalizeTraceFlagId(row.getAttribute(ROW_TRACE_ATTR) || '');
  if (cached) return cached;

  // Prioridad: el enlace Delete de la propia fila (delTraceFlag=<id>).
  const delLink = findDelTraceFlagLink(row);
  if (delLink) {
    const fromDel = normalizeTraceFlagId(
      `${delLink.getAttribute('href') || ''} ${delLink.getAttribute('onclick') || ''}`
    );
    if (fromDel) return fromDel;
  }

  const attrCandidates = [
    row.getAttribute('data-row-key-value'),
    row.getAttribute('data-record-id'),
    row.getAttribute('data-key'),
    row.getAttribute('data-id')
  ];
  for (const raw of attrCandidates) {
    const id = normalizeTraceFlagId(String(raw || ''));
    if (id) return id;
  }

  let els;
  try {
    els = row.querySelectorAll('a[href], [onclick], input[value], input[name]');
  } catch {
    els = queryAllDeep(row, 'a[href], [onclick], input[value], input[name]');
  }
  for (const el of els) {
    for (const chunk of [
      el.getAttribute('href') || '',
      el.getAttribute('onclick') || '',
      el.getAttribute('value') || '',
      el.getAttribute('name') || '',
      el.getAttribute('title') || ''
    ]) {
      const id = normalizeTraceFlagId(chunk);
      if (id) return id;
    }
  }

  return normalizeTraceFlagId(row.textContent || '');
}

/**
 * @param {Element} row
 * @returns {string | null}
 */
export function extractUserIdFromRow(row) {
  if (!row) return null;
  let els;
  try {
    els = row.querySelectorAll('a[href], [onclick], input[value]');
  } catch {
    els = queryAllDeep(row, 'a[href], [onclick], input[value]');
  }
  for (const el of els) {
    for (const chunk of [
      el.getAttribute('href') || '',
      el.getAttribute('onclick') || '',
      el.getAttribute('value') || ''
    ]) {
      const id = normalizeUserId(chunk);
      if (id) return id;
    }
  }
  return null;
}

/**
 * Fila de datos real: enlace delTraceFlag propio y sin tablas anidadas.
 * (La sección entera también contiene delTraceFlag; no debe tratarse como fila.)
 * @param {Element} row
 * @returns {boolean}
 */
export function isUserTraceFlagRow(row) {
  if (!row) return false;
  if (!findDelTraceFlagLink(row)) return false;
  try {
    if (row.querySelector('table')) return false;
  } catch {
    /* ignore */
  }
  return !!extractTraceFlagIdFromRow(row);
}

/**
 * @param {Element} row
 * @returns {Element | null}
 */
export function findTraceActionsHost(row) {
  const actionCol = row.querySelector?.('td.actionColumn, th.actionColumn');
  if (actionCol) return actionCol;
  const actionLinks = findTraceActionLinksInRow(row);
  if (actionLinks.length && actionLinks[0].parentElement) {
    return actionLinks[0].parentElement;
  }
  return row.querySelector?.('td:first-child') || null;
}

/**
 * Tabla `table.list` que contiene las filas (nunca un ancestro).
 * @param {Document | Element} root
 * @returns {HTMLTableElement | null}
 */
export function findUserTraceFlagsTable(root) {
  const doc = root?.ownerDocument || root;
  const link = findDelTraceFlagLink(root) || findDelTraceFlagLink(doc);
  if (!link) return null;
  const table = link.closest?.('table') || null;
  return /** @type {HTMLTableElement | null} */ (table);
}

/**
 * @param {HTMLTableElement} table
 * @returns {number}
 */
export function findExpirationColumnIndex(table) {
  const headerRow =
    table.querySelector('thead tr') ||
    table.querySelector('tr.headerRow') ||
    table.querySelector('tr');
  if (!headerRow) return -1;
  const cells = [...headerRow.querySelectorAll('th, td')];
  for (let i = 0; i < cells.length; i += 1) {
    const text = (cells[i].textContent || '').trim().toLowerCase();
    if (/expiration|caducidad|expiraci|fecha de caducidad/.test(text)) return i;
  }
  return -1;
}

/**
 * Texto de una celda por índice (mismo orden que la cabecera).
 * @param {Element} row
 * @param {number} index
 * @returns {string}
 */
export function readRowCellText(row, index) {
  if (!row || index < 0) return '';
  let cells;
  try {
    cells = row.querySelectorAll('td, th');
  } catch {
    return '';
  }
  const cell = cells[index];
  return cell ? (cell.textContent || '').trim() : '';
}

/**
 * @param {Document} doc
 * @returns {Element[]}
 */
export function findUserTraceFlagRows(doc) {
  const table = findUserTraceFlagsTable(doc);
  if (!table) return [];
  const rows = [];
  const seen = new Set();
  let candidates;
  try {
    candidates = table.querySelectorAll('tr');
  } catch {
    candidates = queryAllDeep(table, 'tr');
  }
  for (const row of candidates) {
    if (seen.has(row)) continue;
    if (row.classList?.contains('headerRow')) continue;
    if (!isUserTraceFlagRow(row)) continue;
    seen.add(row);
    rows.push(row);
  }
  return rows;
}

/**
 * Justo debajo del título/New (dentro de div.pbHeader, encima de la tabla).
 * @param {Document} doc
 * @returns {{ parent: Element, before: Element | null } | null}
 */
export function findFilterInsertPoint(doc) {
  const form = findMonitoredUsersForm(doc);
  if (form?.parentElement) {
    return { parent: form.parentElement, before: form.nextElementSibling };
  }

  const dataTable = findUserTraceFlagsTable(doc);
  if (dataTable?.parentElement) {
    return { parent: dataTable.parentElement, before: dataTable };
  }

  return null;
}

/**
 * @param {Document} doc
 * @returns {HTMLElement | null}
 */
export function findExistingFilterWrap(doc) {
  return doc.querySelector(`[${FILTER_WRAP_ATTR}]`);
}

/**
 * @param {Document} doc
 * @param {string} labelText
 * @param {boolean} checked
 * @param {(next: boolean) => void} onChange
 * @returns {HTMLElement}
 */
export function ensureFilterCheckbox(doc, labelText, checked, onChange) {
  let wrap = findExistingFilterWrap(doc);
  if (wrap) {
    /** @type {any} */ (wrap)._sfocOnChange = onChange;
    const input = /** @type {HTMLInputElement | null} */ (wrap.querySelector('input[type="checkbox"]'));
    const span = wrap.querySelector('.sfoc-utf-filter-text');
    if (span && span.textContent !== labelText) span.textContent = labelText;
    if (input && input.checked !== checked) input.checked = checked;
    return wrap;
  }

  const insert = findFilterInsertPoint(doc);
  if (!insert) {
    return doc.createElement('div');
  }

  wrap = doc.createElement('div');
  wrap.className = 'sfoc-utf-filter';
  wrap.setAttribute(FILTER_WRAP_ATTR, '1');
  wrap.setAttribute('data-sfoc-inject', INTEGRATION_ID);
  /** @type {any} */ (wrap)._sfocOnChange = onChange;

  const label = doc.createElement('label');
  label.className = 'sfoc-utf-filter-label';

  const input = doc.createElement('input');
  input.type = 'checkbox';
  input.className = 'sfoc-utf-filter-input';
  input.checked = checked;
  input.addEventListener('change', () => {
    /** @type {any} */ (wrap)._sfocOnChange?.(!!input.checked);
  });

  const span = doc.createElement('span');
  span.className = 'sfoc-utf-filter-text';
  span.textContent = labelText;

  label.append(input, span);
  wrap.appendChild(label);
  insert.parent.insertBefore(wrap, insert.before);
  return wrap;
}

/**
 * @param {Element} row
 * @param {boolean} hidden
 */
export function setRowFilteredHidden(row, hidden) {
  if (hidden) {
    row.setAttribute(ROW_HIDDEN_ATTR, '1');
    /** @type {HTMLElement} */ (row).style.display = 'none';
  } else {
    row.removeAttribute(ROW_HIDDEN_ATTR);
    /** @type {HTMLElement} */ (row).style.display = '';
  }
}

/**
 * Deshace ocultaciones previas (incluidas las de builds anteriores).
 * @param {Document} doc
 */
export function restoreAllUserTraceFlagRows(doc) {
  let nodes;
  try {
    nodes = doc.querySelectorAll(`[${ROW_HIDDEN_ATTR}], [data-sfoc-utf-dim]`);
  } catch {
    return;
  }
  for (const row of nodes) {
    row.removeAttribute(ROW_HIDDEN_ATTR);
    row.removeAttribute('data-sfoc-utf-dim');
    /** @type {HTMLElement} */ (row).style.opacity = '';
    /** @type {HTMLElement} */ (row).style.display = '';
  }
}

/**
 * @param {Element} row
 * @param {string} traceId
 */
export function stampRowTraceId(row, traceId) {
  if (traceId) row.setAttribute(ROW_TRACE_ATTR, traceId);
}

/**
 * @param {Element} row
 * @param {string} badgeText
 * @param {number} [expirationColIndex]
 */
export function ensureExpiredBadge(row, badgeText, expirationColIndex = -1) {
  if (row.querySelector(`[${BADGE_ATTR}]`)) return;

  const ownerDoc = row.ownerDocument || document;
  const badge = ownerDoc.createElement('span');
  badge.className = 'sfoc-utf-badge slds-badge';
  badge.setAttribute(BADGE_ATTR, '1');
  badge.setAttribute('data-sfoc-inject', INTEGRATION_ID);
  badge.textContent = badgeText;

  if (expirationColIndex >= 0) {
    const cells = row.querySelectorAll('td, th');
    const cell = cells[expirationColIndex];
    if (cell) {
      cell.appendChild(ownerDoc.createTextNode(' '));
      cell.appendChild(badge);
      return;
    }
  }

  const host = findTraceActionsHost(row);
  if (host) {
    host.appendChild(ownerDoc.createTextNode(' '));
    host.appendChild(badge);
  }
}

/**
 * @param {Element} row
 */
export function removeExpiredBadge(row) {
  row.querySelectorAll(`[${BADGE_ATTR}]`).forEach((el) => el.remove());
}

/**
 * @param {Document} doc
 */
export function clearSyntheticTraceRows(doc) {
  const table = findUserTraceFlagsTable(doc);
  if (!table) return;
  table.querySelectorAll(`tr[${SYNTHETIC_ROW_ATTR}]`).forEach((el) => el.remove());
}

/**
 * Oculta paginación / fewer-more / selector View de la lista UTF
 * mientras el filtro API está activo. Al desactivar, restaura todo lo
 * marcado con el atributo (Previous/Next, View, etc.).
 * @param {Document} doc
 * @param {boolean} hide
 */
export function setUserTraceFlagsPagerHidden(doc, hide) {
  if (!hide) {
    let marked;
    try {
      marked = doc.querySelectorAll(`[${NATIVE_PAGER_HIDDEN_ATTR}]`);
    } catch {
      return;
    }
    for (const el of marked) {
      if (el.closest?.('[id="Apex_Trace_List:traceForm"]')) continue;
      const prev = el.getAttribute(NATIVE_PAGER_HIDDEN_ATTR);
      const htmlEl = /** @type {HTMLElement} */ (el);
      if (prev) htmlEl.style.display = prev;
      else htmlEl.style.removeProperty('display');
      el.removeAttribute(NATIVE_PAGER_HIDDEN_ATTR);
    }
    return;
  }

  const form = findMonitoredUsersForm(doc);
  const related = form?.closest?.('.listRelatedObject') || null;
  const sectionCell = related?.parentElement || form?.closest?.('td') || form?.parentElement;
  const root = sectionCell || doc;

  /** @type {Element[]} */
  const nodes = [];
  try {
    for (const el of root.querySelectorAll(
      '.bNext, .fewerMore, .listElementBottomNav, .withFilter, .bFilterView, form#filter_element'
    )) {
      if (el.closest?.('[id="Apex_Trace_List:traceForm"]')) continue;
      nodes.push(el);
    }
  } catch {
    return;
  }

  for (const el of nodes) {
    const htmlEl = /** @type {HTMLElement} */ (el);
    if (!el.hasAttribute(NATIVE_PAGER_HIDDEN_ATTR)) {
      el.setAttribute(NATIVE_PAGER_HIDDEN_ATTR, htmlEl.style.display || '');
    }
    htmlEl.style.display = 'none';
  }
}

/**
 * Fila sintética con el aspecto Classic, para mostrar trazas activas de otras páginas.
 * @param {Document} doc
 * @param {{
 *   id: string,
 *   name: string,
 *   startText: string,
 *   expirationText: string,
 *   logType: string,
 *   debugLevel: string,
 *   even: boolean
 * }} opts
 * @returns {HTMLTableRowElement}
 */
export function createSyntheticTraceRow(doc, opts) {
  const tr = doc.createElement('tr');
  tr.className = opts.even ? 'dataRow even' : 'dataRow odd';
  tr.setAttribute(SYNTHETIC_ROW_ATTR, '1');
  tr.setAttribute(ROW_TRACE_ATTR, opts.id);
  tr.setAttribute('data-sfoc-inject', INTEGRATION_ID);

  const encId = encodeURIComponent(opts.id);
  const editHref = `javascript:srcUp(${JSON.stringify(`/udd/TraceFlag/editTraceFlag.apexp?Id=${opts.id}&isdtp=p1`)});`;
  const filtersHref = `javascript:srcUp(${JSON.stringify(`/udd/DebugLevel/editDebugLevel.apexp?traceflag_id=${opts.id}&isdtp=p1`)});`;

  const actionTd = doc.createElement('td');
  actionTd.className = 'actionColumn';
  const edit = doc.createElement('a');
  edit.className = 'actionLink';
  edit.href = editHref;
  edit.textContent = 'Edit';
  const filters = doc.createElement('a');
  filters.className = 'actionLink';
  filters.href = filtersHref;
  filters.textContent = 'Filters';
  actionTd.append(edit, doc.createTextNode(' | '), filters);

  const idTh = doc.createElement('th');
  idTh.scope = 'row';
  idTh.className = ' dataCell  ';
  const idLink = doc.createElement('a');
  idLink.href = editHref;
  idLink.textContent = opts.id;
  idTh.appendChild(idLink);

  const mkTextTd = (text) => {
    const td = doc.createElement('td');
    td.className = ' dataCell  ';
    td.textContent = text;
    return td;
  };

  const nameTd = doc.createElement('td');
  nameTd.className = ' dataCell  ';
  nameTd.textContent = opts.name;

  const levelTd = doc.createElement('td');
  levelTd.className = ' dataCell  ';
  const levelLink = doc.createElement('a');
  levelLink.href = filtersHref;
  levelLink.textContent = opts.debugLevel || '';
  levelTd.appendChild(levelLink);

  tr.append(
    actionTd,
    idTh,
    nameTd,
    mkTextTd(opts.startText),
    mkTextTd(opts.expirationText),
    mkTextTd(opts.logType || 'USER_DEBUG'),
    levelTd
  );

  // Referencia silenciosa para extractTraceFlagIdFromRow / isUserTraceFlagRow.
  const ghost = doc.createElement('a');
  ghost.href = `javascript:srcSelf(%27delTraceFlag%3D${encId}%27)`;
  ghost.style.display = 'none';
  ghost.setAttribute('aria-hidden', 'true');
  actionTd.appendChild(ghost);

  return /** @type {HTMLTableRowElement} */ (tr);
}

/**
 * @param {HTMLTableElement} table
 * @param {HTMLTableRowElement[]} rows
 */
export function appendSyntheticTraceRows(table, rows) {
  const tbody = table.tBodies?.[0] || table.querySelector('tbody') || table;
  for (const row of rows) tbody.appendChild(row);
}

export {
  FILTER_WRAP_ATTR,
  BADGE_ATTR,
  ROW_HIDDEN_ATTR,
  ROW_TRACE_ATTR,
  SYNTHETIC_ROW_ATTR
};
