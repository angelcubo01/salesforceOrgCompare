/**
 * @param {unknown} value
 */
function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * @param {object[]} rows
 * @param {string[]} headers
 */
function rowsToCsv(rows, headers) {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell(row[h])).join(','));
  }
  return lines.join('\r\n');
}

/**
 * @param {string} content
 * @param {string} mime
 * @param {string} filename
 */
export function downloadTimelineFile(content, mime, filename) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * @param {object[]} nodes
 * @param {number} logStartNs
 * @param {number} viewStartNs
 * @param {number} viewEndNs
 * @param {(key: string) => string} t
 */
export function buildTimelineExportRows(nodes, logStartNs, viewStartNs, viewEndNs, t) {
  return nodes
    .filter((n) => n.endNs > viewStartNs && n.startNs < viewEndNs)
    .map((n) => ({
      type: t(`apexLogViewer.kind.${n.type}`) || n.type,
      typeKey: n.type,
      label: n.label,
      startMs: Number(((n.startNs - logStartNs) / 1_000_000).toFixed(3)),
      endMs: Number(((n.endNs - logStartNs) / 1_000_000).toFixed(3)),
      durationMs: n.durationMs,
      rows: n.rows || 0,
      line: n.line || '',
      depth: n.depth,
      hasError: n.hasError ? 'yes' : 'no'
    }));
}

/**
 * @param {object[]} exportRows
 * @param {object} meta
 */
export function timelineToCsv(exportRows, meta) {
  const headers = [
    'type',
    'typeKey',
    'label',
    'startMs',
    'endMs',
    'durationMs',
    'rows',
    'line',
    'depth',
    'hasError'
  ];
  const preamble = [
    `# viewStartMs,${meta.viewStartMs}`,
    `# viewEndMs,${meta.viewEndMs}`,
    `# viewDurationMs,${meta.viewDurationMs}`,
    `# rowCount,${exportRows.length}`
  ];
  return `${preamble.join('\r\n')}\r\n${rowsToCsv(exportRows, headers)}`;
}

/**
 * @param {object[]} exportRows
 * @param {object} meta
 */
export function timelineToJson(exportRows, meta) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      view: meta,
      events: exportRows
    },
    null,
    2
  );
}
