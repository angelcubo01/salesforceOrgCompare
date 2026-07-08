/**
 * Resumen de diferencias de un package.xml comparado entre dos orgs.
 *
 * Genera dos textos (uno por org) que contienen SOLO los fragmentos que cambian
 * de cada fichero (con unas pocas líneas de contexto), precedidos por una cabecera
 * por fichero. Están pensados para pintarse en el visor de diferencias Monaco:
 * las líneas de contexto y cabeceras son idénticas en ambos lados (Monaco las
 * alinea como "sin cambio") y solo se resaltan las diferencias reales.
 */

const DEFAULT_GAP_MARKER = '  ⋮';

/**
 * @param {(leftText: string, rightText: string) => Array<{ value?: string, added?: boolean, removed?: boolean }>} diffLinesFn
 */
function partsFor(diffLinesFn, leftText, rightText) {
  if (typeof diffLinesFn === 'function') {
    return diffLinesFn(leftText, rightText) || [];
  }
  // Fallback sin jsdiff: mostramos el fichero completo (izquierda como borrado, derecha como añadido).
  const parts = [];
  if (leftText) parts.push({ removed: true, value: leftText.endsWith('\n') ? leftText : `${leftText}\n` });
  if (rightText) parts.push({ added: true, value: rightText.endsWith('\n') ? rightText : `${rightText}\n` });
  return parts;
}

/**
 * Convierte las partes de un diff en dos listas de líneas condensadas (izq/der),
 * conservando solo los cambios y `contextLines` líneas de contexto alrededor.
 * @returns {{ left: string[], right: string[] } | null} null si no hay cambios reales.
 */
function fileSummaryLines(parts, contextLines, gapMarker) {
  /** @type {Array<{ t: 'ctx' | 'del' | 'add', v: string }>} */
  const tokens = [];
  for (const part of parts || []) {
    const raw = String(part.value || '').split('\n');
    const lineCount = raw[raw.length - 1] === '' ? raw.length - 1 : raw.length;
    if (lineCount === 0) continue;
    const type = part.added ? 'add' : part.removed ? 'del' : 'ctx';
    for (let i = 0; i < lineCount; i++) tokens.push({ t: type, v: raw[i] });
  }

  const hasChange = tokens.some((tk) => tk.t !== 'ctx');
  if (!hasChange) return null;

  const keep = new Array(tokens.length).fill(false);
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].t !== 'ctx') keep[i] = true;
  }
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].t === 'ctx') continue;
    for (let d = 1; d <= contextLines; d++) {
      if (i - d >= 0 && tokens[i - d].t === 'ctx') keep[i - d] = true;
      if (i + d < tokens.length && tokens[i + d].t === 'ctx') keep[i + d] = true;
    }
  }

  const left = [];
  const right = [];
  let inGap = false;
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (!keep[i]) {
      if (!inGap) {
        left.push(gapMarker);
        right.push(gapMarker);
        inGap = true;
      }
      continue;
    }
    inGap = false;
    if (tk.t === 'ctx') {
      left.push(tk.v);
      right.push(tk.v);
    } else if (tk.t === 'del') {
      left.push(tk.v);
    } else {
      right.push(tk.v);
    }
  }

  return { left, right };
}

/**
 * Construye el resumen de diferencias para todos los ficheros de un package.xml.
 *
 * @param {Record<string, string>} leftByPath  contenido por ruta (org izquierda)
 * @param {Record<string, string>} rightByPath contenido por ruta (org derecha)
 * @param {string[]} paths rutas a comparar (unión de ambos lados)
 * @param {{
 *   diffLines?: (leftText: string, rightText: string) => Array<{ value?: string, added?: boolean, removed?: boolean }>,
 *   contextLines?: number,
 *   header?: (path: string) => string,
 *   gapMarker?: string
 * }} [opts]
 * @returns {{ summaryLeft: string, summaryRight: string, changedFileCount: number }}
 */
export function buildPackageDiffSummary(leftByPath, rightByPath, paths, opts = {}) {
  const diffLinesFn = typeof opts.diffLines === 'function' ? opts.diffLines : null;
  const contextLines = Number.isFinite(opts.contextLines) ? Math.max(0, Math.trunc(opts.contextLines)) : 3;
  const header = typeof opts.header === 'function' ? opts.header : (p) => `====== ${p} ======`;
  const gapMarker = typeof opts.gapMarker === 'string' ? opts.gapMarker : DEFAULT_GAP_MARKER;

  const leftOut = [];
  const rightOut = [];
  let changedFileCount = 0;

  const list = Array.isArray(paths) ? paths : [];
  for (const path of list) {
    const leftText = leftByPath && leftByPath[path] != null ? String(leftByPath[path]) : '';
    const rightText = rightByPath && rightByPath[path] != null ? String(rightByPath[path]) : '';
    if (leftText === rightText) continue;

    const parts = partsFor(diffLinesFn, leftText, rightText);
    const block = fileSummaryLines(parts, contextLines, gapMarker);
    if (!block) continue;

    changedFileCount++;
    const h = header(path);
    if (leftOut.length) {
      leftOut.push('');
      rightOut.push('');
    }
    leftOut.push(h);
    rightOut.push(h);
    for (const l of block.left) leftOut.push(l);
    for (const r of block.right) rightOut.push(r);
  }

  return {
    summaryLeft: leftOut.join('\n'),
    summaryRight: rightOut.join('\n'),
    changedFileCount
  };
}

/**
 * Construye un regex que reconoce las líneas de cabecera por fichero del resumen
 * a partir de la plantilla i18n (que contiene el marcador `{path}`).
 * @param {string} headerTemplate p. ej. `══════ {path} ══════`
 * @returns {RegExp}
 */
export function summaryFileHeaderRegexFromTemplate(headerTemplate) {
  const tmpl = String(headerTemplate ?? '');
  const idx = tmpl.indexOf('{path}');
  const pre = idx >= 0 ? tmpl.slice(0, idx) : tmpl;
  const post = idx >= 0 ? tmpl.slice(idx + '{path}'.length) : '';
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${esc(pre)}(.*?)${esc(post)}$`);
}

/**
 * Parte los textos de resumen (izq/der) en bloques por fichero usando las cabeceras.
 * Devuelve una lista en el orden en que aparecen, con el fragmento de cada lado.
 * @param {string} summaryLeft
 * @param {string} summaryRight
 * @param {string} headerTemplate plantilla i18n con `{path}`
 * @returns {Array<{ path: string, leftText: string, rightText: string }>}
 */
export function splitSummaryByFile(summaryLeft, summaryRight, headerTemplate) {
  const re = summaryFileHeaderRegexFromTemplate(headerTemplate);
  const splitOne = (text) => {
    const lines = String(text ?? '').split(/\r\n|\r|\n/);
    const groups = [];
    let cur = null;
    for (const line of lines) {
      const m = re.exec(line);
      if (m) {
        cur = { path: m[1], lines: [] };
        groups.push(cur);
      } else if (cur) {
        cur.lines.push(line);
      }
    }
    for (const g of groups) {
      while (g.lines.length && g.lines[g.lines.length - 1] === '') g.lines.pop();
    }
    return groups;
  };

  const leftGroups = splitOne(summaryLeft);
  const rightGroups = splitOne(summaryRight);
  const rightByPath = new Map();
  for (const g of rightGroups) {
    if (!rightByPath.has(g.path)) rightByPath.set(g.path, g);
  }

  const files = [];
  const usedRight = new Set();
  for (const lg of leftGroups) {
    const rg = rightByPath.get(lg.path);
    files.push({
      path: lg.path,
      leftText: lg.lines.join('\n'),
      rightText: rg ? rg.lines.join('\n') : ''
    });
    if (rg) usedRight.add(rg);
  }
  for (const rg of rightGroups) {
    if (usedRight.has(rg)) continue;
    files.push({ path: rg.path, leftText: '', rightText: rg.lines.join('\n') });
  }
  return files;
}
