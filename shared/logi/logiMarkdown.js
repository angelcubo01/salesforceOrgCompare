import { escapeHtml } from '../htmlEscape.js';
import { normalizeLightningSetupBase } from '../dependencyExplorer.js';

/**
 * @typedef {{ instanceUrl?: string }} LogiMarkdownOptions
 */

/**
 * Renderiza markdown básico de Logi a HTML seguro (sin scripts ni HTML arbitrario).
 * @param {string} text
 * @param {LogiMarkdownOptions} [opts]
 * @returns {string}
 */
export function renderLogiMarkdown(text, opts = {}) {
  const raw = String(text || '');
  if (!raw.trim()) return '';
  const instanceUrl = typeof opts.instanceUrl === 'string' ? opts.instanceUrl.trim() : '';

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
    const body = paraLines.map((line) => inlineMarkdown(line, instanceUrl)).join('<br>');
    html.push(`<p class="logi-md-p">${body}</p>`);
    paraLines = [];
  };

  const flushQuote = () => {
    if (!quoteLines.length) return;
    const body = quoteLines.map((line) => inlineMarkdown(line, instanceUrl)).join('<br>');
    html.push(`<blockquote class="logi-md-quote">${body}</blockquote>`);
    quoteLines = [];
  };

  const flushList = () => {
    if (!listType || !listItems.length) return;
    const tag = listType;
    const items = listItems
      .map((item) => `<li class="logi-md-li">${inlineMarkdown(item, instanceUrl)}</li>`)
      .join('');
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
        html.push(renderCodeBlockHtml(codeLines.join('\n'), instanceUrl));
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

    const tableBlock = tryParseTableBlock(lines, i, instanceUrl);
    if (tableBlock) {
      flushBlocks();
      html.push(renderTableHtml(tableBlock.header, tableBlock.aligns, tableBlock.body, instanceUrl));
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
      html.push(
        `<h${level} class="logi-md-h${level}">${inlineMarkdown(heading[2], instanceUrl)}</h${level}>`
      );
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
    html.push(renderCodeBlockHtml(codeLines.join('\n'), instanceUrl));
  }
  flushBlocks();

  return linkifyLogiLineRefs(html.join(''));
}

/**
 * @param {Array<{ role?: string, content?: string, displayText?: string, quickActionId?: string }>} messages
 * @returns {string}
 */
export function exportChatAsMarkdown(messages) {
  if (!Array.isArray(messages) || !messages.length) return '';
  const lines = ['# Logi chat export', ''];
  for (const msg of messages) {
    const role = String(msg?.role || '').toLowerCase();
    if (role !== 'user' && role !== 'assistant') continue;
    const label = role === 'user' ? 'User' : 'Logi';
    let body = String(msg.content || '').trim();
    if (role === 'user' && msg.quickActionId) {
      body = `[Quick action: ${msg.quickActionId}]${body ? `\n\n${body}` : ''}`;
    } else if (role === 'user' && msg.displayText) {
      body = `${msg.displayText}${body ? `\n\n${body}` : ''}`;
    }
    if (!body) continue;
    lines.push(`## ${label}`, '', body, '');
  }
  return lines.join('\n').trim();
}

/**
 * @param {string} instanceUrl
 * @param {'ApexClass' | 'ApexTrigger' | 'Flow'} kind
 * @param {string} apiName
 * @returns {string | null}
 */
export function buildLogiSetupUrl(instanceUrl, kind, apiName) {
  const name = String(apiName || '').trim();
  if (!name) return null;
  const lightning = normalizeLightningSetupBase(instanceUrl);
  const classic = String(instanceUrl || '').replace(/\/$/, '');
  const encodedName = encodeURIComponent(name);
  if (kind === 'ApexClass') {
    if (lightning) {
      return `${lightning}/lightning/setup/ApexClasses/page?address=${encodeURIComponent(`/apex/${name}`)}`;
    }
    return classic ? `${classic}/01p` : null;
  }
  if (kind === 'ApexTrigger') {
    if (lightning) {
      return `${lightning}/lightning/setup/ApexTriggers/page?address=${encodeURIComponent(`/apex/${name}`)}`;
    }
    return classic ? `${classic}/01q` : null;
  }
  if (kind === 'Flow') {
    if (lightning) {
      return `${lightning}/lightning/setup/Flows/page?address=${encodeURIComponent(`/flow/${name}`)}`;
    }
    return classic ? `${classic}/300` : null;
  }
  return null;
}

/**
 * @param {string} code
 * @param {string} instanceUrl
 */
function renderCodeBlockHtml(code, instanceUrl) {
  const escaped = escapeHtml(code);
  const setupLink = instanceUrl ? linkifySetupPatterns(escaped, instanceUrl, true) : escaped;
  return `<div class="logi-md-pre-wrap"><button type="button" class="logi-md-pre-copy" data-logi-copy-code="1" aria-label="Copy">Copy</button><pre class="logi-md-pre"><code>${setupLink}</code></pre></div>`;
}

/**
 * Linkifica referencias a líneas de log en HTML ya escapado (solo nodos de texto).
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
 * @param {string} text escaped HTML text
 * @param {string} instanceUrl
 * @param {boolean} [inCode]
 */
function linkifySetupPatterns(text, instanceUrl, inCode = false) {
  if (!instanceUrl) return text;
  const openLabel = inCode ? '↗' : 'Open in Salesforce';
  const linkClass = inCode ? 'logi-md-setup-link logi-md-setup-link--inline' : 'logi-md-setup-link';

  const replaceTyped = (
    /** @type {RegExp} */ re,
    /** @type {'ApexClass' | 'ApexTrigger' | 'Flow'} */ kind
  ) =>
    text.replace(re, (match, apiName) => {
      const href = buildLogiSetupUrl(instanceUrl, kind, apiName);
      if (!href) return match;
      const safeHref = escapeHtml(href);
      const safeName = escapeHtml(apiName);
      return `${match} <a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="${linkClass}" title="${safeName}">${openLabel}</a>`;
    });

  let out = replaceTyped(/\bApexClass\/([A-Za-z][A-Za-z0-9_]*)\b/g, 'ApexClass');
  out = replaceTyped(/\bApexTrigger\/([A-Za-z][A-Za-z0-9_]*)\b/g, 'ApexTrigger');
  out = replaceTyped(/\bFlow\/([A-Za-z][A-Za-z0-9_]*)\b/g, 'Flow');
  return out;
}

/**
 * @param {string} line
 * @param {string} instanceUrl
 */
function inlineMarkdown(line, instanceUrl = '') {
  let s = escapeHtml(line);
  s = s.replace(/`([^`]+)`/g, (_m, code) => {
    const escaped = escapeHtml(code);
    const linked = instanceUrl ? linkifySetupPatterns(escaped, instanceUrl, true) : escaped;
    return `<code class="logi-md-code">${linked}</code>`;
  });
  if (instanceUrl) {
    s = linkifySetupPatterns(s, instanceUrl, false);
  }
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
 * @param {string} instanceUrl
 */
function tryParseTableBlock(lines, start, instanceUrl = '') {
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
 * @param {string} instanceUrl
 */
function renderTableHtml(header, aligns, rows, instanceUrl = '') {
  const colCount = Math.max(header.length, aligns.length, ...rows.map((r) => r.length), 1);

  const ths = Array.from({ length: colCount }, (_, idx) => {
    const align = aligns[idx] || 'left';
    const cls = align !== 'left' ? ` class="logi-md-ta-${align}"` : '';
    return `<th${cls}>${inlineMarkdown(header[idx] || '', instanceUrl)}</th>`;
  }).join('');

  const trs = rows
    .map((row) => {
      const tds = Array.from({ length: colCount }, (_, idx) => {
        const align = aligns[idx] || 'left';
        const cls = align !== 'left' ? ` class="logi-md-ta-${align}"` : '';
        return `<td${cls}>${inlineMarkdown(row[idx] || '', instanceUrl)}</td>`;
      }).join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');

  const tbody = trs ? `<tbody>${trs}</tbody>` : '<tbody></tbody>';

  return `<div class="logi-md-table-wrap"><table class="logi-md-table"><thead><tr>${ths}</tr></thead>${tbody}</table></div>`;
}
