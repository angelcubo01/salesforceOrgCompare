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

  const flushPara = () => {
    if (!paraLines.length) return;
    const body = paraLines.map((line) => inlineMarkdown(line)).join('<br>');
    html.push(`<p class="logi-md-p">${body}</p>`);
    paraLines = [];
  };

  const flushList = () => {
    if (!listType || !listItems.length) return;
    const tag = listType;
    const items = listItems.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('');
    html.push(`<${tag} class="logi-md-${tag}">${items}</${tag}>`);
    listType = null;
    listItems = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      flushPara();
      flushList();
      if (inCode) {
        html.push(`<pre class="logi-md-pre"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
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
      flushPara();
      flushList();
      html.push(renderTableHtml(tableBlock.header, tableBlock.aligns, tableBlock.body));
      i = tableBlock.nextIndex;
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
      flushList();
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushPara();
      flushList();
      html.push('<hr class="logi-md-hr">');
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      html.push(`<h${level} class="logi-md-h${level}">${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const ul = trimmed.match(/^[-*+]\s+(.+)$/);
    if (ul) {
      flushPara();
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(ul[1]);
      continue;
    }

    const ol = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      flushPara();
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(ol[1]);
      continue;
    }

    flushList();
    paraLines.push(line);
  }

  if (inCode) {
    html.push(`<pre class="logi-md-pre"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }
  flushPara();
  flushList();

  return html.join('');
}

/**
 * @param {string} line
 * @returns {string[]}
 */
function parseTableRow(line) {
  let trimmed = String(line || '').trim();
  if (!trimmed.includes('|')) return [];
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

/**
 * @param {string} line
 */
function isTableSeparator(line) {
  const cells = parseTableRow(line);
  if (!cells.length) return false;
  return cells.every((cell) => /^:?-{1,}:?$/.test(cell));
}

/**
 * @param {string} line
 */
function isTableDataRow(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed.includes('|')) return false;
  if (isTableSeparator(line)) return false;
  return parseTableRow(line).length >= 2;
}

/**
 * @param {string[]} lines
 * @param {number} start
 */
function tryParseTableBlock(lines, start) {
  if (start + 1 >= lines.length) return null;
  if (!isTableDataRow(lines[start]) || !isTableSeparator(lines[start + 1])) return null;

  const header = parseTableRow(lines[start]);
  const aligns = parseTableAlignments(lines[start + 1]);
  /** @type {string[][]} */
  const body = [];
  let i = start + 2;

  while (i < lines.length) {
    const rowLine = lines[i];
    if (!String(rowLine || '').trim()) break;
    if (!isTableDataRow(rowLine)) break;
    body.push(parseTableRow(rowLine));
    i += 1;
  }

  return {
    header,
    aligns,
    body,
    nextIndex: i - 1
  };
}

/**
 * @param {string} line
 * @returns {Array<'left' | 'center' | 'right'>}
 */
function parseTableAlignments(line) {
  return parseTableRow(line).map((cell) => {
    const t = cell.trim();
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
  const colCount = Math.max(header.length, ...rows.map((r) => r.length), 1);

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
