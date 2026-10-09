/**
 * Parsea CSV simple (comillas dobles, separador configurable).
 * @param {string} text
 * @param {{ delimiter?: string }} [opts]
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseCsv(text, opts = {}) {
  const delimiter = opts.delimiter || ',';
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line, i, arr) => line.length > 0 || i < arr.length - 1);
  if (!lines.length) return { headers: [], rows: [] };

  /** @param {string} line */
  function parseLine(line) {
    /** @type {string[]} */
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        cells.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells;
  }

  const headers = parseLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => parseLine(line));
  return { headers, rows };
}

/**
 * Mapea filas CSV a objetos con nombres de campo Salesforce.
 * @param {string[]} headers
 * @param {string[][]} rows
 * @param {Record<string, string>} columnMap csvHeader -> sfField (vacío omite columna)
 * @returns {Record<string, string>[]}
 */
export function mapColumns(headers, rows, columnMap) {
  const map = columnMap && typeof columnMap === 'object' ? columnMap : {};
  return (rows || []).map((row) => {
    /** @type {Record<string, string>} */
    const rec = {};
    headers.forEach((header, i) => {
      const sfField = map[header];
      if (!sfField) return;
      rec[sfField] = row[i] != null ? String(row[i]) : '';
    });
    return rec;
  });
}

/**
 * @param {string} text
 * @returns {'csv' | 'excel' | 'json' | ''}
 */
export function detectImportFormat(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      return '';
    }
  }
  if (trimmed.includes('\t')) return 'excel';
  if (trimmed.includes(',')) return 'csv';
  return '';
}

/**
 * @param {string} text
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseTsv(text) {
  return parseCsv(text, { delimiter: '\t' });
}

/**
 * @param {string} text
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseJsonImport(text) {
  const parsed = JSON.parse(String(text || '').trim());
  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (!list.length || typeof list[0] !== 'object') return { headers: [], rows: [] };
  const headers = [...new Set(list.flatMap((row) => Object.keys(row || {})))];
  const rows = list.map((row) => headers.map((h) => (row[h] == null ? '' : String(row[h]))));
  return { headers, rows };
}

/**
 * @param {string} text
 * @returns {{ format: string, headers: string[], rows: string[][] }}
 */
export function parseImportData(text) {
  const format = detectImportFormat(text);
  if (format === 'json') {
    const data = parseJsonImport(text);
    return { format, ...data };
  }
  if (format === 'excel') {
    const data = parseTsv(text);
    return { format, ...data };
  }
  const data = parseCsv(text);
  return { format: format || 'csv', ...data };
}

function hasInvalidControlCharacters(text) {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text);
}

function hasBalancedCsvQuotes(text) {
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '"') continue;
    if (quoted && text[index + 1] === '"') {
      index += 1;
      continue;
    }
    quoted = !quoted;
  }
  return !quoted;
}

function hasValidHeaders(headers) {
  if (!headers.length || headers.some((header) => !String(header || '').trim())) return false;
  const normalized = headers.map((header) => String(header).trim().toLocaleLowerCase());
  return new Set(normalized).size === normalized.length;
}

function isFlatJsonRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((field) => field == null || !['object', 'function'].includes(typeof field));
}

function serializeExcelCell(value) {
  if (value == null) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.valueOf())) return '';
    return value.toISOString().slice(0, 10);
  }
  return String(value);
}

/**
 * Verifica y normaliza las filas leídas de la primera hoja de un Excel.
 * @param {unknown} rawRows
 * @returns {{ ok: true, data: { format: 'excel', headers: string[], rows: string[][] } } | { ok: false, reason: string }}
 */
export function validateExcelImportRows(rawRows) {
  if (!Array.isArray(rawRows) || rawRows.length < 2 || !rawRows.every(Array.isArray)) {
    return { ok: false, reason: 'invalid_excel' };
  }
  const headers = rawRows[0].map((value) => serializeExcelCell(value).trim());
  if (!hasValidHeaders(headers)) return { ok: false, reason: 'invalid_headers' };

  const rows = rawRows
    .slice(1)
    .filter((row) => row.some((value) => serializeExcelCell(value).trim()))
    .map((row) => {
      if (row.length > headers.length && row.slice(headers.length).some((value) => serializeExcelCell(value).trim())) {
        return null;
      }
      return headers.map((_, index) => serializeExcelCell(row[index]));
    });
  if (!rows.length || rows.some((row) => row === null)) {
    return { ok: false, reason: 'invalid_excel_rows' };
  }
  return { ok: true, data: { format: 'excel', headers, rows } };
}

/**
 * Verifica que el contenido de un fichero sea importable antes de mostrarlo en la UI.
 * @param {string} text
 * @param {'csv'|'json'} expectedFormat
 * @returns {{ ok: true, data: { format: string, headers: string[], rows: string[][] } } | { ok: false, reason: string }}
 */
export function validateImportFileContent(text, expectedFormat) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const trimmed = source.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (hasInvalidControlCharacters(source)) return { ok: false, reason: 'binary' };

  if (expectedFormat === 'json') {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { ok: false, reason: 'invalid_json' };
    }
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    if (!rows.length || !rows.every(isFlatJsonRecord)) return { ok: false, reason: 'invalid_json_records' };
    const data = parseJsonImport(trimmed);
    if (!hasValidHeaders(data.headers) || !data.rows.length) return { ok: false, reason: 'invalid_headers' };
    return { ok: true, data: { format: 'json', ...data } };
  }

  if (/^[\[{]/.test(trimmed) || !hasBalancedCsvQuotes(source)) {
    return { ok: false, reason: 'invalid_csv' };
  }
  const data = parseCsv(source);
  if (!hasValidHeaders(data.headers) || !data.rows.length) return { ok: false, reason: 'invalid_headers' };
  if (data.rows.some((row) => row.length !== data.headers.length)) {
    return { ok: false, reason: 'inconsistent_columns' };
  }
  return { ok: true, data: { format: 'csv', ...data } };
}

/**
 * Auto-mapea columnas CSV a campos SF cuando el header coincide (case-insensitive).
 * @param {string[]} headers
 * @param {Array<{ name: string }>} describeFields
 */
export function autoMapColumns(headers, describeFields) {
  const fields = Array.isArray(describeFields) ? describeFields : [];
  const byLower = new Map(fields.map((f) => [String(f.name || '').toLowerCase(), String(f.name || '')]));
  /** @type {Record<string, string>} */
  const map = {};
  for (const h of headers) {
    const match = byLower.get(String(h).trim().toLowerCase());
    if (match) map[h] = match;
  }
  return map;
}

