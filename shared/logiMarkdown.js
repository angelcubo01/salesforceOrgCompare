import { escapeHtml } from './htmlEscape.js';

/**
 * Renderiza markdown básico de Logi a HTML seguro (sin scripts ni HTML arbitrario).
 * @param {string} text
 * @returns {string}
 */
export function renderLogiMarkdown(text) {
  const raw = String(text || '');
  if (!raw.trim()) return '';

  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  /** @type {string[]} */
  const html = [];
  /** @type {string[]} */
  let codeLines = [];
  let inCode = false;
  /** @type {'ul' | 'ol' | null} */
  let listType = null;
  /** @type {string[]} */
  let listItems = [];
  /** @type {string[]} */
  let paraLines = [];
  /** @type {string[]} */
  let quoteLines = [];

  const flushPara = () => {
    if (!paraLines.length) return;
    const body = paraLines.map((line) => inlineMarkdown(line)).join('<br>');
    html.push(`<p class="logi-md-p">${body}</p>`);
    paraLines = [];
  };

  const flushQuote = () => {
    if (!quoteLines.length) return;
    const body = quoteLines.map((line) => inlineMarkdown(line)).join('<br>');
    html.push(`<blockquote class="logi-md-quote">${body}</blockquote>`);
    quoteLines = [];
  };

  const flushList = () => {
    if (!listType || !listItems.length) return;
    const tag = listType;
    const items = listItems.map((item) => `<li class="logi-md-li">${inlineMarkdown(item)}</li>`).join('');
    html.push(`<${tag} class="logi-md-${tag}">${items}</${tag}>`);
    listType = null;
    listItems = [];
  };

  const flushBlocks = () => {
    flushPara();
    flushQuote();
    flushList();
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      flushBlocks();
      if (inCode) {
        html.push(renderCodeBlockHtml(codeLines.join('\n')));
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const tableBlock = tryParseTableBlock(lines, i);
    if (tableBlock) {
      flushBlocks();
      html.push(renderTableHtml(tableBlock.header, tableBlock.aligns, tableBlock.body));
      i = tableBlock.nextIndex;
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushBlocks();
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushBlocks();
      html.push('<hr class="logi-md-hr">');
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushBlocks();
      const level = heading[1].length;
      html.push(`<h${level} class="logi-md-h${level}">${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      flushPara();
      flushList();
      quoteLines.push(quote[1]);
      continue;
    }

    const ul = trimmed.match(/^[-*+]\s+(.+)$/);
    if (ul) {
      flushPara();
      flushQuote();
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(ul[1]);
      continue;
    }

    const ol = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      flushPara();
      flushQuote();
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(ol[1]);
      continue;
    }

    flushQuote();
    flushList();
    paraLines.push(line);
  }

  if (inCode) {
    html.push(renderCodeBlockHtml(codeLines.join('\n')));
  }
  flushBlocks();

  return linkifyLogiLineRefs(html.join(''));
}

/**
 * @param {string} code
 */
function renderCodeBlockHtml(code) {
  const escaped = escapeHtml(code);
  return `<div class="logi-md-pre-wrap"><button type="button" class="logi-md-pre-copy" data-logi-copy-code="1" aria-label="Copy">Copy</button><pre class="logi-md-pre"><code>${escaped}</code></pre></div>`;
}

/**
 * Linkifica referencias a líneas de log en HTML ya escapado (solo nodos de texto).
 * Patrones: L123, línea/linea/line 123, líneas/lines 40-80 (guion o en-dash).
 * No modifica texto dentro de pre/code/button/a.
 * @param {string} html
 * @returns {string}
 */
export function linkifyLogiLineRefs(html) {
  const raw = String(html || '');
  if (!raw) return '';
  /** @type {string[]} */
  const skipStack = [];
  return raw
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (!part) return part;
      if (part.startsWith('<')) {
        const open = part.match(/^<\s*(pre|code|button|a)\b/i);
        if (open) skipStack.push(open[1].toLowerCase());
        const close = part.match(/^<\s*\/\s*(pre|code|button|a)\b/i);
        if (close) {
          const tag = close[1].toLowerCase();
          for (let i = skipStack.length - 1; i >= 0; i -= 1) {
            if (skipStack[i] === tag) {
              skipStack.splice(i, 1);
              break;
            }
          }
        }
        return part;
      }
      if (skipStack.length) return part;
      return linkifyTextSegment(part);
    })
    .join('');
}

/**
 * @param {string} text
 */
function linkifyTextSegment(text) {
  const rangeRe = /\b((?:l[ií]neas?|lines?)\s+)(\d+)\s*[-–—]\s*(\d+)\b/gi;
  const singleWordRe = /\b((?:l[ií]nea|line)\s+)(\d+)\b/gi;
  const lPrefixRe = /\b(L)(\d+)\b/g;

  let out = text.replace(rangeRe, (match, prefix, start, end) => {
    const s = Number(start);
    const e = Number(end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || s < 1 || e < 1) return match;
    const a = Math.min(s, e);
    const b = Math.max(s, e);
    return `<button type="button" class="logi-md-line-ref" data-start-line="${a}" data-end-line="${b}">${prefix}${start}-${end}</button>`;
  });

  out = out.replace(singleWordRe, (match, prefix, line) => {
    const n = Number(line);
    if (!Number.isFinite(n) || n < 1) return match;
    return `<button type="button" class="logi-md-line-ref" data-line="${n}">${prefix}${line}</button>`;
  });

  out = out.replace(lPrefixRe, (match, prefix, line) => {
    const n = Number(line);
    if (!Number.isFinite(n) || n < 1) return match;
    return `<button type="button" class="logi-md-line-ref" data-line="${n}">${prefix}${line}</button>`;
  });

  return out;
}

/**
 * Split a GFM table row on `|`, ignoring pipes inside inline `code`.
 * @param {string} line
 * @returns {string[]}
 */
function parseTableRow(line) {
  const raw = String(line || '').trim();
  if (!raw.includes('|')) return [];

  /** @type {string[]} */
  const cells = [];
  let cur = '';
  let inCode = false;

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '`') {
      inCode = !inCode;
      cur += ch;
      continue;
    }
    if (ch === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());

  // Outer pipes produce leading/trailing empty cells.
  if (cells.length && cells[0] === '') cells.shift();
  if (cells.length && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

/**
 * @param {string} cell
 */
function isSeparatorCell(cell) {
  const compact = String(cell || '').replace(/\s+/g, '');
  return /^:?-{1,}:?$/.test(compact);
}

/**
 * @param {string} line
 */
function isTableSeparator(line) {
  const cells = parseTableRow(line);
  if (!cells.length) return false;
  return cells.every((cell) => isSeparatorCell(cell));
}

/**
 * @param {string} line
 * @param {{ minCells?: number }} [opts]
 */
function isTableDataRow(line, opts = {}) {
  const minCells = opts.minCells ?? 2;
  const trimmed = String(line || '').trim();
  if (!trimmed.includes('|')) return false;
  if (isTableSeparator(line)) return false;
  return parseTableRow(line).length >= minCells;
}

/**
 * @param {string[]} lines
 * @param {number} start
 */
function tryParseTableBlock(lines, start) {
  if (!isTableDataRow(lines[start])) return null;

  let sepIdx = start + 1;
  let blanks = 0;
  while (sepIdx < lines.length && !String(lines[sepIdx] || '').trim()) {
    blanks += 1;
    sepIdx += 1;
    if (blanks > 2) return null;
  }
  if (sepIdx >= lines.length || !isTableSeparator(lines[sepIdx])) return null;

  const header = parseTableRow(lines[start]);
  const aligns = parseTableAlignments(lines[sepIdx]);
  const colCount = Math.max(header.length, aligns.length, 2);

  /** @type {string[][]} */
  const body = [];
  let i = sepIdx + 1;

  while (i < lines.length) {
    const rowLine = lines[i];
    if (!String(rowLine || '').trim()) break;
    // Body rows: accept any pipe row (incl. partial / streaming) that is not a new separator.
    if (isTableSeparator(rowLine)) break;
    if (!String(rowLine).includes('|')) break;
    const cells = parseTableRow(rowLine);
    if (!cells.length) break;
    body.push(normalizeRowCells(cells, colCount));
    i += 1;
  }

  return {
    header: normalizeRowCells(header, colCount),
    aligns: normalizeAligns(aligns, colCount),
    body,
    nextIndex: i - 1
  };
}

/**
 * @param {string[]} cells
 * @param {number} colCount
 */
function normalizeRowCells(cells, colCount) {
  if (cells.length <= colCount) {
    const out = cells.slice();
    while (out.length < colCount) out.push('');
    return out;
  }
  // Merge overflow into the last cell (pipes in prose / mismatched columns).
  const out = cells.slice(0, colCount - 1);
  out.push(cells.slice(colCount - 1).join(' | '));
  return out;
}

/**
 * @param {Array<'left' | 'center' | 'right'>} aligns
 * @param {number} colCount
 */
function normalizeAligns(aligns, colCount) {
  /** @type {Array<'left' | 'center' | 'right'>} */
  const out = aligns.slice(0, colCount);
  while (out.length < colCount) out.push('left');
  return out;
}

/**
 * @param {string} line
 * @returns {Array<'left' | 'center' | 'right'>}
 */
function parseTableAlignments(line) {
  return parseTableRow(line).map((cell) => {
    const t = String(cell || '').replace(/\s+/g, '');
    const left = t.startsWith(':');
    const right = t.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  });
}

/**
 * @param {string[]} header
 * @param {Array<'left' | 'center' | 'right'>} aligns
 * @param {string[][]} rows
 */
function renderTableHtml(header, aligns, rows) {
  const colCount = Math.max(header.length, aligns.length, ...rows.map((r) => r.length), 1);

  const ths = Array.from({ length: colCount }, (_, idx) => {
    const align = aligns[idx] || 'left';
    const cls = align !== 'left' ? ` class="logi-md-ta-${align}"` : '';
    return `<th${cls}>${inlineMarkdown(header[idx] || '')}</th>`;
  }).join('');

  const trs = rows
    .map((row) => {
      const tds = Array.from({ length: colCount }, (_, idx) => {
        const align = aligns[idx] || 'left';
        const cls = align !== 'left' ? ` class="logi-md-ta-${align}"` : '';
        return `<td${cls}>${inlineMarkdown(row[idx] || '')}</td>`;
      }).join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');

  const tbody = trs ? `<tbody>${trs}</tbody>` : '<tbody></tbody>';

  return `<div class="logi-md-table-wrap"><table class="logi-md-table"><thead><tr>${ths}</tr></thead>${tbody}</table></div>`;
}

/**
 * @param {string} line
 */
function inlineMarkdown(line) {
  let s = escapeHtml(line);
  s = s.replace(/`([^`]+)`/g, '<code class="logi-md-code">$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  s = s.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const href = String(url || '').trim();
    if (!/^https?:\/\//i.test(href)) return label;
    const safeHref = escapeHtml(href);
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="logi-md-link">${label}</a>`;
  });
  return s;
}
