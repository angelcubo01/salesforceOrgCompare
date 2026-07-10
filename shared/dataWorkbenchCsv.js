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

