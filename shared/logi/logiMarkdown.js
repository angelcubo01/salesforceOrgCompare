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
 * Export chat as plain text ready to paste into a document (no Markdown syntax).
 * @param {Array<{ role?: string, content?: string, displayText?: string }>} messages
 * @returns {string}
 */
export function exportChatAsPlainText(messages) {
  if (!Array.isArray(messages) || !messages.length) return '';
  /** @type {string[]} */
  const blocks = [];
  for (const msg of messages) {
    const role = String(msg?.role || '').toLowerCase();
    if (role !== 'user' && role !== 'assistant') continue;
    const label = role === 'user' ? 'User' : 'Logi';
    let body = '';
    if (role === 'user' && msg.displayText) {
      body = String(msg.displayText || '').trim();
    } else {
      body = logiMarkdownToPlainText(String(msg.content || ''));
    }
    if (!body) continue;
    blocks.push(`${label}\n${body}`);
  }
  return blocks.join('\n\n').trim();
}

/**
 * Convert Logi Markdown to plain text suitable for pasting into Word/email/docs.
 * Strips headings, emphasis, links, tables, and fences — keeps readable content.
 * @param {string} text
 * @returns {string}
 */
export function logiMarkdownToPlainText(text) {
  let raw = decodeCommonHtmlEntities(String(text || '')).replace(/\r\n/g, '\n');
  if (!raw.trim()) return '';

  /** @type {string[]} */
  const fences = [];
  raw = raw.replace(/```[^\n]*\n?([\s\S]*?)```/g, (_m, code) => {
    const i = fences.length;
    fences.push(String(code || '').replace(/\s+$/g, ''));
    return `\n%%LOGI_FENCE_${i}%%\n`;
  });

  const lines = raw.split('\n');
  /** @type {string[]} */
  const out = [];
  /** @type {string[][]} */
  let tableRows = [];

  const flushTable = () => {
    if (!tableRows.length) return;
    const dataRows = tableRows.filter(
      (row) => !row.every((cell) => /^:?-{1,}:?$/.test(String(cell || '').replace(/\s+/g, '')))
    );
    for (const row of dataRows) {
      out.push(row.map((cell) => inlineMarkdownToPlain(cell)).filter(Boolean).join('\t'));
    }
    if (dataRows.length) out.push('');
    tableRows = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = line.trim().match(/^%%LOGI_FENCE_(\d+)%%$/);
    if (fenceMatch) {
      flushTable();
      const code = fences[Number(fenceMatch[1])] || '';
      if (code) {
        out.push(code);
        out.push('');
      }
      continue;
    }

    if (isTableDataRow(line) || isTableSeparator(line)) {
      const cells = parseTableRow(line);
      if (cells.length) tableRows.push(cells);
      continue;
    }

    flushTable();

    const trimmed = line.trim();
    if (!trimmed) {
      out.push('');
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      out.push('');
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      out.push(inlineMarkdownToPlain(heading[2]));
      out.push('');
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      out.push(inlineMarkdownToPlain(quote[1]));
      continue;
    }

    const ul = trimmed.match(/^[-*+]\s+(.+)$/);
    if (ul) {
      out.push(`• ${inlineMarkdownToPlain(ul[1])}`);
      continue;
    }

    const ol = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (ol) {
      out.push(`${ol[1]}. ${inlineMarkdownToPlain(ol[2])}`);
      continue;
    }

    out.push(inlineMarkdownToPlain(line));
  }

  flushTable();

  return out
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * @param {string} text
 * @returns {string}
 */
function inlineMarkdownToPlain(text) {
  let s = String(text || '');
  s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/(?<![A-Za-z0-9_])__([^_\n]+)__(?![A-Za-z0-9_])/g, '$1');
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');
  s = s.replace(/(?<![A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])/g, '$1');
  s = s.replace(/`([^`]+)`/g, '$1');
  return s.replace(/\s+/g, ' ').trim();
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
 * LLMs often emit HTML entities as literal text (`&quot;`, `&amp;`, …).
 * Decode a safe subset before escaping so they render as the intended characters.
 * @param {string} text
 * @returns {string}
 */
function decodeCommonHtmlEntities(text) {
  return String(text ?? '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

/**
 * @param {string} code
 * @param {string} instanceUrl
 */
function renderCodeBlockHtml(code, instanceUrl) {
  const escaped = escapeHtml(decodeCommonHtmlEntities(code));
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
 * Surrounding text suggests an Apex class/trigger source line, not a debug-log line.
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @returns {boolean}
 */
function isApexSourceLineContext(text, start, end) {
  const before = text.slice(Math.max(0, start - 120), start);
  const after = text.slice(end, Math.min(text.length, end + 80));
  const window = `${before} ${after}`;

  // Stack-trace style: "line 151, column 1"
  if (/^\s*[,:]?\s*(column|columna)\b/i.test(after)) return true;

  // Explicit Apex source phrasing
  if (
    /\b(en la clase|de la clase|of (the )?class|in (the )?class|en el (método|metodo|trigger|handler)|in (the )?(method|trigger|handler)|source line|línea (de|del) (código|codigo|fuente|clase|método|metodo|trigger)|class line|apex line)\b/i.test(
      window
    )
  ) {
    return true;
  }

  // "ClassName.method: line N" / "ClassName: L123"
  if (/[A-Za-z][A-Za-z0-9_]{2,}\s*([.:]\s*[A-Za-z][A-Za-z0-9_]*)?\s*:\s*$/.test(before)) {
    return true;
  }

  // Nearby class/trigger/method wording without an explicit "log" cue in the same clause
  const nearbyBefore = before.slice(-80);
  if (
    /\b(class|clase|classes|clases|trigger|método|metodo|method|handler|apex)\b/i.test(nearbyBefore) &&
    !/\b(log|debug\s*log)\b/i.test(nearbyBefore)
  ) {
    return true;
  }

  return false;
}

/**
 * @param {string} text
 */
function linkifyTextSegment(text) {
  // Only link unambiguous log-line citations:
  // - L123 / L10-L20 (Logi convention for debug-log lines)
  // - "log line 12" / "línea del log 12" / "log lines 10-20"
  // Never link bare "line 12" / "línea 12" — those often mean Apex source lines.
  const logWordRangeRe =
    /\b((?:log\s+lines?|l[ií]neas?\s+del?\s+log|lines?\s+of\s+(?:the\s+)?log)\s+)(\d+)\s*[-–—]\s*(\d+)\b/gi;
  const logWordSingleRe =
    /\b((?:log\s+line|l[ií]nea\s+del?\s+log|line\s+of\s+(?:the\s+)?log)\s+)(\d+)\b/gi;
  const lRangeRe = /\b(L)(\d+)\s*[-–—]\s*(L)?(\d+)\b/g;
  const lPrefixRe = /\b(L)(\d+)\b/g;

  /**
   * @param {string} match
   * @param {number} offset
   * @param {() => string} toHtml
   */
  const maybeLink = (match, offset, toHtml) => {
    if (isApexSourceLineContext(text, offset, offset + match.length)) return match;
    return toHtml();
  };

  let out = text.replace(logWordRangeRe, (match, prefix, start, end, offset) =>
    maybeLink(match, offset, () => {
      const s = Number(start);
      const e = Number(end);
      if (!Number.isFinite(s) || !Number.isFinite(e) || s < 1 || e < 1) return match;
      const a = Math.min(s, e);
      const b = Math.max(s, e);
      return `<button type="button" class="logi-md-line-ref" data-start-line="${a}" data-end-line="${b}">${prefix}${start}-${end}</button>`;
    })
  );

  out = out.replace(logWordSingleRe, (match, prefix, line, offset) =>
    maybeLink(match, offset, () => {
      const n = Number(line);
      if (!Number.isFinite(n) || n < 1) return match;
      return `<button type="button" class="logi-md-line-ref" data-line="${n}">${prefix}${line}</button>`;
    })
  );

  // Replace on `out` but evaluate Apex context against the current string offsets.
  out = out.replace(lRangeRe, (match, p1, start, _p2, end, offset) => {
    if (isApexSourceLineContext(out, offset, offset + match.length)) return match;
    const s = Number(start);
    const e = Number(end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || s < 1 || e < 1) return match;
    const a = Math.min(s, e);
    const b = Math.max(s, e);
    return `<button type="button" class="logi-md-line-ref" data-start-line="${a}" data-end-line="${b}">${p1}${start}-${end}</button>`;
  });

  out = out.replace(lPrefixRe, (match, prefix, line, offset) => {
    if (isApexSourceLineContext(out, offset, offset + match.length)) return match;
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
  let s = decodeCommonHtmlEntities(line);

  // Extract inline code before HTML escape / emphasis so we never double-escape
  // and so underscores inside `Apex_Names` are not treated as italic.
  /** @type {string[]} */
  const codeSlots = [];
  s = s.replace(/`([^`]+)`/g, (_m, code) => {
    const i = codeSlots.length;
    let body = escapeHtml(code);
    if (instanceUrl) body = linkifySetupPatterns(body, instanceUrl, true);
    codeSlots.push(`<code class="logi-md-code">${body}</code>`);
    return `\uE000${i}\uE001`;
  });

  s = escapeHtml(s);
  if (instanceUrl) {
    s = linkifySetupPatterns(s, instanceUrl, false);
  }
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Require non-identifier boundaries so Salesforce names like ns__Field__c stay intact.
  s = s.replace(/(?<![A-Za-z0-9_])__([^_\n]+)__(?![A-Za-z0-9_])/g, '<strong>$1</strong>');
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  // Same for _italic_: do not match CCEmailMessageBI_TRHan_method or ns__Field__c.
  s = s.replace(/(?<![A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])/g, '<em>$1</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const href = String(url || '').trim();
    if (!/^https?:\/\//i.test(href)) return label;
    const safeHref = escapeHtml(href);
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="logi-md-link">${label}</a>`;
  });

  s = s.replace(/\uE000(\d+)\uE001/g, (_m, i) => codeSlots[Number(i)] || '');
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
