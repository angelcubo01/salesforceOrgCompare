import { getDisplayFileName } from '../lib/itemLabels.js';
import { t, getCurrentLang } from '../../shared/i18n.js';
import { showToast } from '../ui/toast.js';
import { diffLines } from '../../vendor/jsdiff/diffLines.mjs';
import { splitSummaryByFile } from '../../shared/packageDiffSummary.js';

/** Líneas de contexto sobre y bajo cada hunk (coincide con el plan). */
const CONTEXT_LINES = 3;

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Normaliza un cambio de Monaco o del diff alineado a rangos 1-based inclusivos.
 * Alineado con `focusDiffAtIndex` / diffUtils.
 */
function normalizeLineChange(c) {
  const oS = c.originalStartLineNumber || c.modifiedStartLineNumber || 1;
  const mS = c.modifiedStartLineNumber || c.originalStartLineNumber || 1;
  let oE;
  let mE;
  if (typeof c.originalEndLineNumberExclusive === 'number') {
    oE = c.originalEndLineNumberExclusive - 1;
  } else if (typeof c.originalEndLineNumber === 'number') {
    oE = c.originalEndLineNumber;
  } else {
    oE = oS;
  }
  if (typeof c.modifiedEndLineNumberExclusive === 'number') {
    mE = c.modifiedEndLineNumberExclusive - 1;
  } else if (typeof c.modifiedEndLineNumber === 'number') {
    mE = c.modifiedEndLineNumber;
  } else {
    mE = mS;
  }
  return { oS, oE, mS, mE };
}

function isInChangeLeft(lineNum, rawChanges) {
  for (const ch of rawChanges) {
    const { oS, oE } = normalizeLineChange(ch);
    if (oE >= oS && lineNum >= oS && lineNum <= oE) return true;
    if (oE < oS && lineNum === oS) return true;
  }
  return false;
}

function isInChangeRight(lineNum, rawChanges) {
  for (const ch of rawChanges) {
    const { mS, mE } = normalizeLineChange(ch);
    if (mE >= mS && lineNum >= mS && lineNum <= mE) return true;
    if (mE < mS && lineNum === mS) return true;
  }
  return false;
}

/**
 * Por cada cambio de Monaco, expande con contexto (sin fusionar hunks: evita alinear mal izq/der).
 */
function expandHunksWithContext(changes, nLeft, nRight, contextLines) {
  const ctx = Math.max(0, contextLines | 0);
  const segments = [];

  for (const c of changes || []) {
    const { oS, oE, mS, mE } = normalizeLineChange(c);

    let leftLo;
    let leftHi;
    if (oE >= oS) {
      leftLo = Math.max(1, oS - ctx);
      leftHi = Math.min(nLeft, oE + ctx);
    } else {
      leftLo = Math.max(1, oS - ctx);
      leftHi = Math.min(nLeft, oS + ctx);
    }

    let rightLo;
    let rightHi;
    if (mE >= mS) {
      rightLo = Math.max(1, mS - ctx);
      rightHi = Math.min(nRight, mE + ctx);
    } else {
      rightLo = Math.max(1, mS - ctx);
      rightHi = Math.min(nRight, mS + ctx);
    }

    segments.push({ leftLo, leftHi, rightLo, rightHi });
  }

  if (!segments.length) return [];

  segments.sort((a, b) => a.leftLo - b.leftLo || a.rightLo - b.rightLo);

  return segments;
}

function getOrgLabel(selectId) {
  try {
    const sel = document.getElementById(selectId);
    if (!sel || sel.selectedIndex < 0) return '';
    const opt = sel.options[sel.selectedIndex];
    return (opt && opt.textContent) ? opt.textContent.trim() : '';
  } catch {
    return '';
  }
}

function sanitizeFileName(base) {
  return String(base || 'diff')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

function buildDiffExportHtml({
  leftLines,
  rightLines,
  segments,
  rawChanges,
  leftFileLabel,
  rightFileLabel,
  leftOrgLabel,
  rightOrgLabel,
  exportedAt
}) {
  const title = escapeHtml(leftFileLabel || 'diff');

  let body = '';
  let hunkIndex = 0;
  for (const seg of segments) {
    hunkIndex += 1;
    const { leftLo, leftHi, rightLo, rightHi } = seg;
    const nLeft = Math.max(0, leftHi - leftLo + 1);
    const nRight = Math.max(0, rightHi - rightLo + 1);
    const nRows = Math.max(nLeft, nRight);

    body += `<section class="hunk"><div class="hunk-header">@@ Hunk ${hunkIndex} — left ${leftLo}-${leftHi}, right ${rightLo}-${rightHi} @@</div>`;
    body += '<table class="diff-table"><thead><tr><th class="ln">L</th><th class="lc">Original</th><th class="ln">R</th><th class="lc">Modified</th></tr></thead><tbody>';

    for (let i = 0; i < nRows; i++) {
      const lineL = leftLo + i;
      const lineR = rightLo + i;
      const hasL = lineL <= leftHi;
      const hasR = lineR <= rightHi;
      const textL = hasL ? leftLines[lineL - 1] ?? '' : '';
      const textR = hasR ? rightLines[lineR - 1] ?? '' : '';

      let clsL = 'ctx';
      if (hasL) {
        clsL = isInChangeLeft(lineL, rawChanges) ? 'rem' : 'ctx';
      } else {
        clsL = 'empty';
      }

      let clsR = 'ctx';
      if (hasR) {
        clsR = isInChangeRight(lineR, rawChanges) ? 'add' : 'ctx';
      } else {
        clsR = 'empty';
      }

      body += '<tr>';
      body += `<td class="ln ${clsL}">${hasL ? lineL : ''}</td>`;
      body += `<td class="lc ${clsL}"><pre>${escapeHtml(textL)}</pre></td>`;
      body += `<td class="ln ${clsR}">${hasR ? lineR : ''}</td>`;
      body += `<td class="lc ${clsR}"><pre>${escapeHtml(textR)}</pre></td>`;
      body += '</tr>';
    }

    body += '</tbody></table></section>';
  }

  const metaLeft = [escapeHtml(leftOrgLabel), escapeHtml(leftFileLabel)].filter(Boolean).join(' · ');
  const metaRight = [escapeHtml(rightOrgLabel), escapeHtml(rightFileLabel)].filter(Boolean).join(' · ');

  return wrapDiffExportHtml({ title, metaLeft, metaRight, exportedAt, body });
}

/** Fila de tabla de diff (izq/der) para la vista completa. */
function fullDiffRow(lnL, textL, clsL, lnR, textR, clsR) {
  return (
    '<tr>' +
    `<td class="ln ${clsL}">${lnL || ''}</td>` +
    `<td class="lc ${clsL}"><pre>${escapeHtml(textL)}</pre></td>` +
    `<td class="ln ${clsR}">${lnR || ''}</td>` +
    `<td class="lc ${clsR}"><pre>${escapeHtml(textR)}</pre></td>` +
    '</tr>'
  );
}

/** Filas alineadas (izq/der) de un texto vs otro, mostrando TODAS las líneas. */
function buildFullDiffRows(leftText, rightText) {
  const parts = diffLines(String(leftText ?? ''), String(rightText ?? ''));
  let lineL = 1;
  let lineR = 1;
  let rows = '';
  for (const part of parts || []) {
    const raw = String(part.value ?? '').split('\n');
    const count = raw[raw.length - 1] === '' ? raw.length - 1 : raw.length;
    for (let i = 0; i < count; i++) {
      const text = raw[i];
      if (part.added) {
        rows += fullDiffRow('', '', 'empty', lineR, text, 'add');
        lineR++;
      } else if (part.removed) {
        rows += fullDiffRow(lineL, text, 'rem', '', '', 'empty');
        lineL++;
      } else {
        rows += fullDiffRow(lineL, text, 'ctx', lineR, text, 'ctx');
        lineL++;
        lineR++;
      }
    }
  }
  return rows;
}

/** Tabla de diff (con cabecera de fichero opcional). */
function buildFullDiffTable(rows, fileHeader) {
  const header = fileHeader ? `<div class="hunk-header">${escapeHtml(fileHeader)}</div>` : '';
  return (
    `<section class="hunk">${header}<table class="diff-table"><thead><tr>` +
    '<th class="ln">L</th><th class="lc">Original</th><th class="ln">R</th><th class="lc">Modified</th>' +
    `</tr></thead><tbody>${rows}</tbody></table></section>`
  );
}

/**
 * Cuerpo del export en modo "texto completo": muestra TODAS las líneas (sin
 * recortar a hunks) y, para el resumen de diferencias, lo divide en una sección
 * por fichero (igual que el propio resumen).
 */
function buildFullDiffBody(leftText, rightText) {
  const files = splitSummaryByFile(leftText, rightText, t('packageDiffSummary.fileHeader'));
  if (files.length) {
    return files
      .map((f) => buildFullDiffTable(buildFullDiffRows(f.leftText, f.rightText), f.path))
      .join('');
  }
  return buildFullDiffTable(buildFullDiffRows(leftText, rightText), '');
}

/** Envuelve el cuerpo del diff en el documento HTML con estilos. */
function wrapDiffExportHtml({ title, metaLeft, metaRight, exportedAt, body }) {
  const lang = getCurrentLang() === 'es' ? 'es' : 'en';
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
:root {
  color-scheme: light dark;
  --canvas: #f3f5f8;
  --surface: #ffffff;
  --surface-subtle: #f6f8fb;
  --text: #181818;
  --text-secondary: #444f5e;
  --border: #c5ceda;
  --border-strong: #8f9daf;
  --primary: #0b5cab;
  --add-bg: #dff7e8;
  --add-text: #1b5e36;
  --rem-bg: #fde7e9;
  --rem-text: #8e1725;
  --empty-bg: #eef2f7;
  --empty-text: #687789;
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --canvas: #0b1220;
    --surface: #111c2e;
    --surface-subtle: #17243a;
    --text: #f3f6fb;
    --text-secondary: #b7c3d4;
    --border: #354760;
    --border-strong: #4b607b;
    --primary: #5eb4ff;
    --add-bg: #0f3b32;
    --add-text: #9be8bd;
    --rem-bg: #45212a;
    --rem-text: #ffb3bd;
    --empty-bg: #0b1220;
    --empty-text: #7f8da1;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 16px;
  background: var(--canvas);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.45;
}
header {
  padding: 12px 4px 14px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
header h1 {
  margin: 0 0 8px 0;
  color: var(--text);
  font-size: 17px;
  font-weight: 700;
}
header .meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
header .exported {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-secondary);
}
.hunk { margin-bottom: 20px; }
.hunk-header {
  padding: 6px 8px;
  background: var(--surface-subtle);
  border-bottom: 1px solid var(--border);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 12px;
}
.diff-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--border);
  background: var(--surface);
  table-layout: fixed;
}
.diff-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surface-subtle);
  padding: 6px 8px;
  text-align: left;
  font-family: var(--font-sans);
  font-weight: 700;
  font-size: 11px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-strong);
}
.diff-table .ln {
  width: 44px;
  padding: 2px 6px;
  vertical-align: top;
  text-align: right;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  border-right: 1px solid var(--border);
  user-select: none;
}
.diff-table .lc {
  width: 50%;
  padding: 0;
  vertical-align: top;
}
.diff-table .lc:nth-of-type(2) { border-right: 1px solid var(--border); }
.diff-table .lc pre {
  margin: 0;
  padding: 2px 8px;
  color: var(--text);
  font-family: var(--font-mono);
  white-space: pre-wrap;
  word-break: break-word;
}
.diff-table td.add { background: var(--add-bg); color: var(--add-text); }
.diff-table td.rem { background: var(--rem-bg); color: var(--rem-text); }
.diff-table td.ctx { background: var(--surface); }
.diff-table td.empty { background: var(--empty-bg); color: var(--empty-text); }
@media (max-width: 640px) {
  body { padding: 8px; }
  header .meta { grid-template-columns: 1fr; }
  .diff-table { min-width: 620px; }
  .hunk { overflow-x: auto; }
}
@media (forced-colors: active) {
  .diff-table, .diff-table th, .diff-table td, header { border-color: CanvasText; }
}
</style>
</head>
<body>
<header>
  <h1>${title}</h1>
  <div class="meta">
    <div>${metaLeft || '—'}</div>
    <div>${metaRight || '—'}</div>
  </div>
  <div class="exported">${escapeHtml(exportedAt)}</div>
</header>
${body}
</body>
</html>`;
}

/**
 * Descarga la vista actual del diff como HTML (solo hunks + contexto).
 * @param {object} state Estado global (`code/core/state.js`).
 */
export function downloadDiffHtml(state) {
  if (!state.diffEditor) {
    showToast(t('code.exportDiffHtmlNoDiff'), 'warn');
    return;
  }

  let changes;
  try {
    changes = state.diffEditor.getLineChanges() || [];
  } catch {
    changes = [];
  }

  if (!changes.length) {
    showToast(t('code.exportDiffHtmlNoDiff'), 'warn');
    return;
  }

  const originalEditor = state.diffEditor.getOriginalEditor();
  const modifiedEditor = state.diffEditor.getModifiedEditor();
  const original = originalEditor.getModel();
  const modified = modifiedEditor.getModel();
  if (!original || !modified) {
    showToast(t('code.exportDiffHtmlNoDiff'), 'warn');
    return;
  }

  const leftText = original.getValue();
  const rightText = modified.getValue();
  const leftLines = leftText.split(/\r\n|\r|\n/);
  const rightLines = rightText.split(/\r\n|\r|\n/);
  const nLeft = leftLines.length;
  const nRight = rightLines.length;

  const item = state.selectedItem;
  const isSummary = item?.type === 'PackageXml' && item.descriptor?.source === 'retrieveZipSummary';

  const baseName = getDisplayFileName(item) || 'export';
  const leftFileLabel = baseName;
  const rightFileLabel = baseName;

  const leftOrgLabel = getOrgLabel('leftOrg');
  const rightOrgLabel = getOrgLabel('rightOrg');
  const exportedAt = new Date().toISOString();
  const exportedAtLabel = `${t('code.exportDiffHtmlExportedAt')}: ${exportedAt}`;

  let html;
  if (isSummary) {
    // El resumen ya es un extracto de diferencias: exportamos TODO el texto.
    const body = buildFullDiffBody(leftText, rightText);
    const metaLeft = [escapeHtml(leftOrgLabel), escapeHtml(leftFileLabel)].filter(Boolean).join(' · ');
    const metaRight = [escapeHtml(rightOrgLabel), escapeHtml(rightFileLabel)].filter(Boolean).join(' · ');
    html = wrapDiffExportHtml({
      title: escapeHtml(leftFileLabel || 'diff'),
      metaLeft,
      metaRight,
      exportedAt: exportedAtLabel,
      body
    });
  } else {
    const segments = expandHunksWithContext(changes, nLeft, nRight, CONTEXT_LINES);
    if (!segments.length) {
      showToast(t('code.exportDiffHtmlNoDiff'), 'warn');
      return;
    }
    html = buildDiffExportHtml({
      leftLines,
      rightLines,
      segments,
      rawChanges: changes,
      leftFileLabel: String(leftFileLabel),
      rightFileLabel: String(rightFileLabel),
      leftOrgLabel,
      rightOrgLabel,
      exportedAt: exportedAtLabel
    });
  }

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = exportedAt.replace(/[:.]/g, '-');
  a.href = url;
  a.download = `sfoc-diff-${sanitizeFileName(baseName)}-${stamp}.html`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast(t('code.exportDiffHtmlDone'), 'info');
}
