import { isApexClassComponent } from './deployStatusInlineDetailsDom.js';

export const INTEGRATION_ID = 'deployStatusDetailSourceLinks';
export const COMPONENT_ERRORS_SELECTOR = 'table[id$=":componentErrorsTable"], table.componentErrorsTable';
export const TEST_ERRORS_SELECTOR = 'table[id$=":testErrorsTable"], table.testErrorsTable, table[id$=":apexTestFailuresTable"], table.apexTestFailuresTable';

function fallbackTableByHeading(doc, labels) {
  for (const block of doc?.querySelectorAll?.('.bPageBlock, .apexDefaultPageBlock') || []) {
    // Visualforce usa variantes de h1/h2/h3 y, frecuentemente, una celda
    // `.pbTitle`. No dependemos de una sola de esas estructuras.
    const heading = String(block.querySelector('.pbHeader .pbTitle, .pbHeader h1, .pbHeader h2, .pbHeader h3, .mainTitle')?.textContent || '').trim().toLowerCase();
    if (!labels.some((label) => heading === label)) continue;
    const table = block.querySelector('table.list');
    if (table) return table;
  }
  return null;
}

/** @param {Document} doc */
export function findComponentErrorsTable(doc) {
  return doc?.querySelector(COMPONENT_ERRORS_SELECTOR) || fallbackTableByHeading(doc, ['component errors', 'errores de componentes']);
}

/** @param {Document} doc */
export function findTestErrorsTable(doc) {
  return doc?.querySelector(TEST_ERRORS_SELECTOR) || fallbackTableByHeading(doc, ['test errors', 'errores de prueba', 'errores de tests', 'apex test failures', 'fallos de pruebas apex']);
}

/** @param {Document} doc */
export function isDeployStatusDetailDocument(doc) {
  return !!(findComponentErrorsTable(doc) || findTestErrorsTable(doc));
}

/** @param {Element | null | undefined} table */
export function findDetailRows(table) {
  const tbody = table?.querySelector('tbody[id$=":tb"]') || table?.tBodies?.[0];
  return tbody ? [...tbody.querySelectorAll(':scope > tr.dataRow')] : [];
}

/** @param {Element} row @param {string} suffix */
function cell(row, suffix) {
  return row?.querySelector(`td[id$=":${suffix}"]`) || null;
}

/** Fallback para variantes Visualforce que cambian los sufijos JSF de las celdas. */
function cellByHeader(row, labels) {
  const table = row?.closest?.('table');
  // apex:pageBlockTable pone normalmente la cabecera dentro de tbody,
  // mediante `tr.headerRow`, en vez de crear un thead.
  const headers = table ? [...table.querySelectorAll('thead th, tr.headerRow th, tr.headerRow td')] : [];
  const index = headers.findIndex((header) => {
    const value = String(header.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return labels.some((label) => value === label || value.includes(label));
  });
  if (index < 0) return null;
  return row.querySelectorAll(':scope > td')[index] || null;
}

/** @param {Element} row */
export function extractComponentErrorRow(row) {
  const type = cell(row, 'type')?.textContent?.trim() || '';
  const className = cell(row, 'apiName')?.textContent?.trim() || '';
  const line = Number(cell(row, 'line')?.textContent?.trim());
  return {
    className: /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(className) ? className : '',
    isApexClass: isApexClassComponent(type),
    initialLine: Number.isSafeInteger(line) && line > 0 ? line : undefined,
    classCell: cell(row, 'apiName')
  };
}

/** @param {Element} row */
export function extractTestErrorRow(row) {
  const classCell = cell(row, 'className') || cell(row, 'class') || cell(row, 'name') || row?.querySelector('td[id$=":testClass"]') || cellByHeader(row, ['class name', 'test class', 'clase']);
  // En "Apex Test Failures" el Stack Trace llega dentro de Error Message.
  const stackCell = cell(row, 'stackTrace') || row?.querySelector('td[id$=":stacktrace"]') || cell(row, 'errorMessage') || cellByHeader(row, ['stack trace', 'error message', 'mensaje de error']);
  const className = classCell?.textContent?.trim() || '';
  const frames = parseApexStackTraceFrames(stackCell?.textContent || '');
  return {
    className: /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(className) ? className : '',
    classCell,
    stackCell,
    initialLine: frames.find((frame) => frame.className === className)?.initialLine
  };
}

/** Todos los frames Apex navegables y sus posiciones, conservando el resto como texto. */
export function parseApexStackTraceFrames(value) {
  const text = String(value || '');
  const frames = [];
  const re = /Class\.([A-Za-z_][A-Za-z0-9_]*)\.[A-Za-z_][A-Za-z0-9_]*:\s*line\s+(\d+)(?:,\s*column\s+\d+)?/gi;
  let match;
  while ((match = re.exec(text))) {
    const initialLine = Number(match[2]);
    if (!Number.isSafeInteger(initialLine) || initialLine <= 0) continue;
    frames.push({ className: match[1], initialLine, start: match.index, end: match.index + match[0].length });
  }
  return frames;
}

/** Separa el texto de error del bloque Stack Trace sin interpretar HTML. */
export function splitTestErrorMessage(value, frames = parseApexStackTraceFrames(value)) {
  const text = String(value || '');
  const stackLabel = /stack\s*trace\s*:/i.exec(text);
  const traceStart = stackLabel ? stackLabel.index : (frames[0]?.start ?? text.length);
  return {
    message: text.slice(0, traceStart).trim(),
    trace: text.slice(traceStart),
    frames
  };
}

/** @param {Element} table */
export function findDetailSectionHeaderHost(table) {
  const block = table?.closest('.bPageBlock, .apexDefaultPageBlock') || table?.parentElement;
  return block?.querySelector('.pbHeader td:last-child') || null;
}
