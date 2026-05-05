import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { loadMonaco, resolveMonacoThemeId } from '../editor/monaco.js';
import { t } from '../../shared/i18n.js';

const STORAGE_KEY = 'sfoc_query_explorer_editor_text';
const EDITOR_HEIGHT_STORAGE_KEY = 'sfoc_query_explorer_editor_height_px';
const EDITOR_MIN_PX = 120;
const EDITOR_MAX_PX = 720;
const EDITOR_DEFAULT_PX = 200;

/**
 * Ítem mínimo compatible con Monaco 0.52 (sin mezclar range + textEdit rotos).
 * @param {import('monaco-editor').IRange} range
 * @param {import('monaco-editor').languages.CompletionItem} it
 */
function sealCompletionItem(range, it) {
  const insertText = typeof it.insertText === 'string' ? it.insertText : String(it.label);
  /** @type {import('monaco-editor').languages.CompletionItem} */
  const out = {
    label: it.label,
    kind: it.kind,
    insertText,
    range
  };
  if (it.insertTextRules != null) out.insertTextRules = it.insertTextRules;
  if (it.sortText != null) out.sortText = it.sortText;
  if (it.filterText != null) out.filterText = it.filterText;
  if (it.documentation != null) out.documentation = it.documentation;
  return out;
}

/** @typedef {{ name: string, label?: string, type?: string, relationshipName?: string, referenceTo?: string[] }} FieldLite */

let editorInstance = /** @type {import('monaco-editor').editor.IStandaloneCodeEditor | null} */ (null);
let monacoRef = /** @type {typeof import('monaco-editor') | null} */ (null);
/** @type {import('monaco-editor').IDisposable[]} */
let completionProviderDisposables = [];
/** @type {ReturnType<typeof setTimeout> | null} */
let suggestDebounce = null;
let customLanguageRegistered = false;

const GLOBAL_TTL_MS = 10 * 60 * 1000;
const DESCRIBE_TTL_MS = 10 * 60 * 1000;
const MAX_OBJECTS_SUGGEST = 100;
const MAX_FIELDS_SUGGEST = 120;

let globalDescribeCache = {
  orgId: '',
  at: 0,
  names: /** @type string[] */ ([]),
  labels: /** @type Record<string,string> */ ({}),
  /** Objetos estándar + custom de datos para `FROM`; sin Custom Settings ni tipos `__mdt`. */
  fromNames: /** @type string[] */ ([])
};

/** @type Map<string, { at: number, fields: FieldLite[] }>} */
const describeByObject = new Map();

export function invalidateQueryExplorerSchemaCache() {
  globalDescribeCache = { orgId: '', at: 0, names: [], labels: {}, fromNames: [] };
  describeByObject.clear();
}

export function getSavedQueryExplorerEditorHeight() {
  try {
    const v = parseInt(localStorage.getItem(EDITOR_HEIGHT_STORAGE_KEY) || '', 10);
    if (Number.isFinite(v)) return Math.max(EDITOR_MIN_PX, Math.min(EDITOR_MAX_PX, v));
  } catch {
    /* ignore */
  }
  return EDITOR_DEFAULT_PX;
}

/** Ajusta altura del mount del editor (px), persiste y hace layout de Monaco si existe. */
export function applyQueryExplorerEditorHeight(px) {
  const mount = document.getElementById('queryExplorerEditorMount');
  if (!mount) return;
  const n = Math.round(Math.max(EDITOR_MIN_PX, Math.min(EDITOR_MAX_PX, px)));
  mount.style.height = `${n}px`;
  try {
    localStorage.setItem(EDITOR_HEIGHT_STORAGE_KEY, String(n));
  } catch {
    /* ignore */
  }
  if (editorInstance) {
    try {
      editorInstance.layout();
    } catch {
      /* ignore */
    }
  }
}

/** SOQL keywords, funciones típicas y literales habituales (estilo herramientas tipo Inspector). */
const SOQL_WORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'AND',
  'OR',
  'NOT',
  'LIKE',
  'IN',
  'NOT IN',
  'INCLUDES',
  'EXCLUDES',
  'ORDER BY',
  'GROUP BY',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'NULLS FIRST',
  'NULLS LAST',
  'ASC',
  'DESC',
  'FOR VIEW',
  'FOR REFERENCE',
  'FOR UPDATE',
  'SECURITY_ENFORCED',
  'WITH USER_MODE',
  'WITH SYSTEM_MODE',
  'USING SCOPE',
  'TRUE',
  'FALSE',
  'NULL',
  'DISTANCE',
  'GEOLOCATION',
  'COUNT',
  'COUNT_DISTINCT',
  'MIN',
  'MAX',
  'AVG',
  'SUM',
  'FORMAT',
  'CALENDAR_YEAR',
  'CALENDAR_MONTH',
  'CALENDAR_QUARTER',
  'DAY_IN_MONTH',
  'DAY_IN_WEEK',
  'DAY_IN_YEAR',
  'DAY_ONLY',
  'FISCAL_YEAR',
  'FISCAL_QUARTER',
  'HOUR_IN_DAY',
  'WEEK_IN_YEAR',
  'WEEK_IN_MONTH',
  'TODAY',
  'YESTERDAY',
  'TOMORROW',
  'LAST_N_DAYS',
  'NEXT_N_DAYS',
  'THIS_WEEK',
  'LAST_WEEK',
  'NEXT_WEEK',
  'THIS_MONTH',
  'LAST_MONTH',
  'NEXT_MONTH',
  'THIS_QUARTER',
  'LAST_QUARTER',
  'NEXT_QUARTER',
  'THIS_YEAR',
  'LAST_YEAR',
  'NEXT_YEAR',
  'THIS_FISCAL_QUARTER',
  'LAST_FISCAL_QUARTER',
  'NEXT_FISCAL_QUARTER',
  'THIS_FISCAL_YEAR',
  'LAST_FISCAL_YEAR',
  'NEXT_FISCAL_YEAR',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'WITH DATA CATEGORY',
  'ABOVE',
  'AT',
  'BELOW',
  'ROLLUP',
  'CUBE',
  'TYPEOF',
  'ALL ROWS',
  'UPDATE TRACKING',
  'UPDATE VIEWSTAT',
  'CONVERTCURRENCY',
  'TOLABEL',
  'EVERYTHING',
  'DELEGATED',
  'FIELDS',
  'CUSTOM',
  'STANDARD'
];

const SOSL_WORDS = [
  'FIND',
  'IN ALL FIELDS',
  'IN NAME FIELDS',
  'IN EMAIL FIELDS',
  'IN PHONE FIELDS',
  'IN SIDEBAR FIELDS',
  'RETURNING',
  'WITH SNIPPET',
  'WITH HIGHLIGHT',
  'WITH METADATA'
];

/** Org para metadatos SOQL: cabecera izquierda o, si no hay, la derecha (evita cero sugerencias). */
function getQueryExplorerSchemaOrgId() {
  return String(state.leftOrgId || state.rightOrgId || '').trim();
}

/**
 * filterText para que el filtro integrado de Monaco no descarte entradas que ya acotamos por prefijo.
 * @param {string} pref
 * @param {string} insertText
 */
function monacoSafeFilterText(pref, insertText) {
  const p = pref.trim();
  if (!p) return insertText;
  const ins = String(insertText || '');
  const il = ins.toLowerCase();
  const pl = p.toLowerCase();
  if (il.startsWith(pl) || il.includes(pl)) return ins;
  return `${p}${ins}`;
}

/** Incluir en sugerencias de `FROM`: estándar + custom de datos; excluye Custom Settings y Custom Metadata (`__mdt`). */
function includeInFromClauseSobjectList(row, apiName) {
  if (row?.customSetting === true) return false;
  if (typeof apiName === 'string' && apiName.endsWith('__mdt')) return false;
  return true;
}

async function fetchGlobalObjects(orgId) {
  const now = Date.now();
  if (
    globalDescribeCache.orgId === orgId &&
    globalDescribeCache.names.length &&
    Array.isArray(globalDescribeCache.fromNames) &&
    now - globalDescribeCache.at < GLOBAL_TTL_MS
  ) {
    return globalDescribeCache;
  }
  const res = await bg({ type: 'queryExplorer:describeGlobal', orgId });
  if (!res?.ok) throw new Error(res?.reason === 'NO_SID' ? t('queryExplorer.noSid') : res?.error || 'describe');
  const list = Array.isArray(res.sobjects) ? res.sobjects : [];
  /** @type string[] */
  const names = [];
  /** @type string[] */
  const fromNames = [];
  /** @type Record<string,string> */
  const labels = {};
  for (const row of list) {
    const n = row?.name != null ? String(row.name) : '';
    if (!n) continue;
    if (row.queryable === false || row.retrieveable === false) continue;
    names.push(n);
    if (row.label) labels[n] = String(row.label);
    if (includeInFromClauseSobjectList(row, n)) fromNames.push(n);
  }
  names.sort((a, b) => a.localeCompare(b));
  fromNames.sort((a, b) => a.localeCompare(b));
  globalDescribeCache = { orgId, at: now, names, labels, fromNames };
  return globalDescribeCache;
}

async function fetchFields(orgId, objectApiName) {
  const key = String(objectApiName || '');
  const now = Date.now();
  const hit = describeByObject.get(key);
  if (hit && now - hit.at < DESCRIBE_TTL_MS) return hit.fields;
  const res = await bg({ type: 'queryExplorer:describeSobject', orgId, objectApiName: key });
  if (!res?.ok) throw new Error(res?.reason === 'NO_SID' ? t('queryExplorer.noSid') : res?.error || 'describe');
  /** @type FieldLite[] */
  const fields = [];
  const arr = Array.isArray(res.describe?.fields) ? res.describe.fields : [];
  for (const f of arr) {
    const name = f?.name != null ? String(f.name) : '';
    if (!name) continue;
    const type = f.type != null ? String(f.type) : '';
    const relationshipName = f.relationshipName != null ? String(f.relationshipName) : '';
    /** @type string[] */
    const referenceTo = Array.isArray(f.referenceTo) ? f.referenceTo.map((x) => String(x)) : [];
    fields.push({
      name,
      label: f.label != null ? String(f.label) : '',
      type,
      relationshipName,
      referenceTo
    });
  }
  fields.sort((a, b) => a.name.localeCompare(b.name));
  describeByObject.set(key, { at: now, fields });
  while (describeByObject.size > 50) {
    const first = describeByObject.keys().next().value;
    describeByObject.delete(first);
  }
  return fields;
}

/**
 * Último objeto en un `FROM` completo antes de `offset`.
 * @param {string} text
 * @param {number} offset
 */
function lastResolvedObject(text, offset) {
  const before = text.slice(0, offset);
  const re = /\bFROM\s+([A-Za-z][A-Za-z0-9_]*)\b/gi;
  let last = null;
  let m;
  while ((m = re.exec(before)) !== null) last = m[1];
  return last;
}

/**
 * Último `FROM Objeto` en el texto completo (en consultas simples suele ser el de la query principal).
 * @param {string} text
 * @returns {string | null}
 */
function lastFromObjectInFullQuery(text) {
  const re = /\bFROM\s+([A-Za-z][A-Za-z0-9_]*)\b/gi;
  let last = null;
  let m;
  while ((m = re.exec(text)) !== null) last = m[1];
  return last;
}

/**
 * Objeto al que aplican los campos del autocompletado: si ya hubo un `FROM` antes del cursor, ese;
 * si no (p. ej. escribes en el SELECT antes en el texto que el FROM), el último `FROM` de la consulta completa.
 * @param {string} text
 * @param {number} offset
 */
function resolveObjectForFieldCompletion(text, offset) {
  const beforeFrom = lastResolvedObject(text, offset);
  if (beforeFrom) return beforeFrom;
  return lastFromObjectInFullQuery(text);
}

/** True si el cursor termina un identificador de objeto justo tras `FROM`. */
function typingFromObjectSuffix(text, offset) {
  const before = text.slice(0, offset);
  return /\bFROM\s+[A-Za-z][A-Za-z0-9_]*$/i.test(before);
}

/** Cursor inmediatamente después de `FROM ` (incl. espacios). */
function afterBareFrom(text, offset) {
  const before = text.slice(0, offset);
  return /\bFROM\s+$/i.test(before);
}

/**
 * Hay un `FROM` de la consulta actual (profundidad de paréntesis 0) dentro de `segment`.
 * @param {string} segment fragmento tras la palabra SELECT
 */
function segmentHasTopLevelFrom(segment) {
  let depth = 0;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      if (/^\s*FROM\b/i.test(segment.slice(i))) return true;
    }
  }
  return false;
}

/**
 * El cursor está en la lista de campos del SELECT más reciente: después del último `SELECT`
 * y antes del `FROM` de ese mismo nivel (subconsultas entre paréntesis no cuentan).
 * @param {string} text
 * @param {number} offset
 */
function isCursorInSelectClause(text, offset) {
  const before = text.slice(0, offset);
  let lastSelectEnd = -1;
  const re = /\bSELECT\b/gi;
  let m;
  while ((m = re.exec(before)) !== null) lastSelectEnd = m.index + m[0].length;
  if (lastSelectEnd < 0) return false;
  return !segmentHasTopLevelFrom(before.slice(lastSelectEnd));
}

/**
 * Primer `FROM Objeto` a partir de `fromOffset`, solo a profundidad 0 (fuera de subconsultas).
 * @param {string} text
 * @param {number} fromOffset
 * @returns {string | null} API name aproximado del objeto
 */
function firstTopLevelFromObjectRough(text, fromOffset) {
  const rest = text.slice(fromOffset);
  let depth = 0;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const m = rest.slice(i).match(/^\s*FROM\s+([A-Za-z][A-Za-z0-9_]*)/i);
      if (m) return m[1];
    }
  }
  return null;
}

/**
 * API name canónico según describeGlobal (`case` → `Case`) para describe fiable.
 * @param {string[]} names
 * @param {string | null | undefined} rough
 * @returns {string | null}
 */
function canonicalSObjectApiName(names, rough) {
  if (rough == null || rough === '') return null;
  if (!Array.isArray(names) || !names.length) return null;
  const low = String(rough).toLowerCase();
  const hit = names.find((n) => String(n).toLowerCase() === low);
  return hit ?? null;
}

/**
 * Cadena `Rel.SubRel.field` con el cursor tras el último punto.
 * @param {string} text
 * @param {number} offset
 * @returns {{ chain: string[], partialAfterDot: string } | null}
 */
function dotChainCompletionContext(text, offset) {
  const before = text.slice(0, offset);
  const m = before.match(/\.([A-Za-z][A-Za-z0-9_]*)?\s*$/);
  if (!m) return null;
  const left = before.slice(0, before.length - m[0].length);
  const partialAfterDot = m[1] || '';
  const lm = left.match(/([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*)$/);
  if (!lm) return null;
  const chain = lm[1].split('.').filter(Boolean);
  if (!chain.length) return null;
  return { chain, partialAfterDot };
}

/** @param {FieldLite} f */
function isReferenceLikeField(f) {
  const ty = (f.type || '').toLowerCase();
  return ty === 'reference' || ty === 'masterdetail';
}

/**
 * @param {string} orgId
 * @param {string} baseObjectApiName
 * @param {string} prefixToken nombre de relación (p. ej. Account, Owner, Foo__r)
 */
async function resolveRelationshipToObject(orgId, baseObjectApiName, prefixToken) {
  const fields = await fetchFields(orgId, baseObjectApiName);
  const ptLower = prefixToken.toLowerCase();
  for (const f of fields) {
    if (!isReferenceLikeField(f)) continue;
    const rn = (f.relationshipName || '').toLowerCase();
    if (rn && rn === ptLower) {
      const ref = f.referenceTo && f.referenceTo[0];
      return ref || null;
    }
    if (f.name && f.name.endsWith('__c')) {
      const rname = (f.name.slice(0, -3) + '__r').toLowerCase();
      if (rname === ptLower && f.referenceTo && f.referenceTo[0]) return f.referenceTo[0];
    }
  }
  return null;
}

/**
 * Objetivo del autocompletado tras `a.b.c.`: solo relaciones lookup/master-detail declaradas en cada objeto (no por nombre global).
 * @param {string} orgId
 * @param {string | null} fromObjectRough objeto del FROM (cualquier capitalización)
 * @param {string[]} chain p. ej. ['account'] o ['Account','Owner']
 * @param {string[]} allNames nombres describeGlobal para canonicalizar
 */
async function resolveDotChainToTargetObject(orgId, fromObjectRough, chain, allNames) {
  if (!fromObjectRough || !chain.length) return null;
  let current =
    (allNames.length && canonicalSObjectApiName(allNames, fromObjectRough)) || String(fromObjectRough);
  const canon = (x) => (allNames.length && canonicalSObjectApiName(allNames, x)) || x;
  for (let i = 0; i < chain.length; i++) {
    const token = chain[i];
    const nextObj = await resolveRelationshipToObject(orgId, current, token);
    if (!nextObj) return null;
    current = canon(nextObj);
  }
  return current;
}

function mdDoc(monaco, text) {
  try {
    return new monaco.MarkdownString().appendMarkdown(text);
  } catch {
    return undefined;
  }
}

/** Para coincidencias tipo "SLEC" → SELECT: caracteres de needle en orden dentro de haystack. */
function isSubsequenceIc(needle, haystack) {
  if (!needle) return true;
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  let i = 0;
  for (let j = 0; j < h.length && i < n.length; j++) {
    if (h[j] === n[i]) i++;
  }
  return i === n.length;
}

/** @param {string} a @param {string} b */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  /** @type {number[]} */
  let prev = [];
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Puntuación de coincidencia para sugerencias (mayor = mejor). 0 = no incluir.
 * Incluye prefijo, primer token de claves multi-palabra, subcadena, subsecuencia y Levenshtein corto.
 * @param {string} candidate
 * @param {string} pref
 */
function scoreSuggestMatch(candidate, pref) {
  const p = pref.trim();
  if (!p) return 500;
  const d = String(candidate);
  const dl = d.toLowerCase();
  const pl = p.toLowerCase();
  if (dl.startsWith(pl)) return 4000 - dl.length;
  const firstTok = dl.split(/\s+/)[0] || dl;
  if (firstTok.startsWith(pl)) return 3500 - dl.length;
  if (dl.includes(pl)) return 2500 - dl.length;
  if (pl.length >= 2 && isSubsequenceIc(p, d)) return 1800 - dl.length;
  if (pl.length >= 3 && pl.length <= 10 && firstTok.length >= 3) {
    const slice = firstTok.slice(0, Math.min(firstTok.length, pl.length + 3));
    const dist = levenshtein(pl, slice);
    const maxd = pl.length <= 4 ? 2 : 3;
    if (dist <= maxd) return 1200 - dist * 100 - dl.length;
  }
  return 0;
}

/**
 * Rango de reemplazo para sugerencias: debe incluir la columna del cursor; si no, Monaco descarta todas.
 * @param {import('monaco-editor').editor.ITextModel} model
 * @param {import('monaco-editor').Position} position
 * @param {import('monaco-editor').editor.IWordAtPosition} wordUntil
 * @param {import('monaco-editor').editor.IWordAtPosition | null | undefined} wordAt
 */
function soqlSuggestReplaceRange(monaco, model, position, wordUntil, wordAt) {
  void model;
  const startRaw = wordAt?.startColumn ?? wordUntil.startColumn;
  const startCol = Math.min(Math.max(1, startRaw), position.column);
  const endCol = position.column;
  const safeStart = Math.min(startCol, endCol);
  if (monaco?.Range) {
    return new monaco.Range(position.lineNumber, safeStart, position.lineNumber, endCol);
  }
  return {
    startLineNumber: position.lineNumber,
    startColumn: safeStart,
    endLineNumber: position.lineNumber,
    endColumn: endCol
  };
}

function disposeQueryExplorerCompletionProviders() {
  for (const d of completionProviderDisposables) {
    try {
      d.dispose();
    } catch {
      /* ignore */
    }
  }
  completionProviderDisposables = [];
}

function ensureCompletions(monaco, getLang) {
  /** @type {any} */
  const api = monaco?.languages;
  if (!api?.registerCompletionItemProvider) return;

  disposeQueryExplorerCompletionProviders();

  const provide = /** @type {any} */ ({
    triggerCharacters: ['.', ' ', '(', ','],

    /** @returns {Promise<import('monaco-editor').languages.CompletionList>} */
    async provideCompletionItems(model, position) {
      const wordUntil = model.getWordUntilPosition(position);
      const wordAt = model.getWordAtPosition(position);
      const effectiveWord = wordAt?.word || wordUntil.word || '';
      const pref = effectiveWord;
      const replaceRange = soqlSuggestReplaceRange(monaco, model, position, wordUntil, wordAt);

      /** @param {string[]} kws @returns {import('monaco-editor').languages.CompletionItem[]} */
      function fallbackKeywords(kws) {
        return kws.map((kw, i) => ({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          filterText: monacoSafeFilterText(pref, kw),
          sortText: `fallback:${i}:${kw}`,
          range: replaceRange
        }));
      }

      try {
        /** @type {import('monaco-editor').languages.CompletionItem[]} */
        const items = [];

        const text = model.getValue();
        const offset = model.getOffsetAt(position);
        const lang = typeof getLang === 'function' ? getLang() : 'soql';
        const orgId = getQueryExplorerSchemaOrgId();
        const contextualFromObject = resolveObjectForFieldCompletion(text, offset);
        const completingFromObject = typingFromObjectSuffix(text, offset) || afterBareFrom(text, offset);
        const dotChainCtx = lang === 'soql' ? dotChainCompletionContext(text, offset) : null;

        const kwList = lang === 'sosl' ? [...SOSL_WORDS, ...SOQL_WORDS.slice(0, 12)] : SOQL_WORDS;
        for (const kw of kwList) {
          const sc = scoreSuggestMatch(kw, pref);
          if (!sc) continue;
          items.push({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: kw,
            filterText: monacoSafeFilterText(pref, kw),
            sortText: `${100000 - sc}:${kw}`,
            range: replaceRange
          });
        }

        if (orgId) {
          /** @type {string[]} */
          let allObjectNames = [];
          try {
            const glob = await fetchGlobalObjects(orgId);
            allObjectNames = glob.names;
            const { fromNames, labels } = glob;
            if (lang === 'soql' && completingFromObject) {
              if (!pref.trim()) {
                for (const n of fromNames.slice(0, MAX_OBJECTS_SUGGEST)) {
                  const lbl = labels[n] ? `${n} (${labels[n]})` : n;
                  items.push({
                    label: lbl,
                    kind: monaco.languages.CompletionItemKind.Class,
                    insertText: n,
                    filterText: monacoSafeFilterText(pref, n),
                    sortText: `500100:${n}`,
                    range: replaceRange,
                    documentation: mdDoc(monaco, labels[n] ? `**${n}**\n${labels[n]}` : `\`${n}\``)
                  });
                }
              } else {
                /** @type {{ n: string, sc: number }[]} */
                const objScored = [];
                for (const n of fromNames) {
                  const sc = Math.max(scoreSuggestMatch(n, pref), labels[n] ? scoreSuggestMatch(labels[n], pref) : 0);
                  if (!sc) continue;
                  objScored.push({ n, sc });
                }
                objScored.sort((a, b) => b.sc - a.sc || a.n.localeCompare(b.n));
                for (const { n, sc } of objScored.slice(0, MAX_OBJECTS_SUGGEST)) {
                  const lbl = labels[n] ? `${n} (${labels[n]})` : n;
                  items.push({
                    label: lbl,
                    kind: monaco.languages.CompletionItemKind.Class,
                    insertText: n,
                    filterText: monacoSafeFilterText(pref, n),
                    sortText: `${50000 + sc}:${n}`,
                    range: replaceRange,
                    documentation: mdDoc(monaco, labels[n] ? `**${n}**\n${labels[n]}` : `\`${n}\``)
                  });
                }
              }
            }
          } catch {
            /* describe global falla silenciosamente en sugerencias */
          }

          if (lang === 'soql') {
            if (
              isCursorInSelectClause(text, offset) &&
              !dotChainCtx &&
              !completingFromObject
            ) {
              const roughFrom =
                firstTopLevelFromObjectRough(text, offset) || lastFromObjectInFullQuery(text);
              const listObject =
                roughFrom &&
                (allObjectNames.length
                  ? canonicalSObjectApiName(allObjectNames, roughFrom) || roughFrom
                  : roughFrom);
              if (listObject) {
                try {
                  const allForInsert = await fetchFields(orgId, listObject);
                  if (allForInsert.length) {
                    const bulkInsert = allForInsert.map((f) => f.name).join(', ');
                    items.push({
                      label: t('queryExplorer.allFieldsCompletion', { object: listObject }),
                      kind: monaco.languages.CompletionItemKind.Enum,
                      insertText: bulkInsert,
                      filterText: monacoSafeFilterText(pref, bulkInsert),
                      sortText: `00001:${listObject}`,
                      range: replaceRange,
                      documentation: mdDoc(
                        monaco,
                        t('queryExplorer.allFieldsCompletionDoc', { count: String(allForInsert.length) })
                      )
                    });
                  }
                } catch {
                  /* describe falló */
                }
              }
            }

            const baseFromCanonical =
              contextualFromObject && allObjectNames.length
                ? canonicalSObjectApiName(allObjectNames, contextualFromObject) || contextualFromObject
                : contextualFromObject;

            /** @type string | null */
            let fieldSourceObject = null;
            let fieldPrefix = pref;
            if (dotChainCtx) {
              fieldPrefix = dotChainCtx.partialAfterDot || '';
              fieldSourceObject = await resolveDotChainToTargetObject(
                orgId,
                baseFromCanonical,
                dotChainCtx.chain,
                allObjectNames
              );
            } else if (baseFromCanonical && !completingFromObject) {
              fieldSourceObject = baseFromCanonical;
            }
            if (fieldSourceObject) {
              try {
                const fields = await fetchFields(orgId, fieldSourceObject);
                if (!fieldPrefix.trim()) {
                  let fieldAdds = 0;
                  const addedNames = new Set();
                  for (const f of fields) {
                    if (addedNames.has(f.name)) continue;
                    addedNames.add(f.name);
                    items.push({
                      label: f.label ? `${f.name} (${f.label})` : f.name,
                      kind: monaco.languages.CompletionItemKind.Field,
                      insertText: f.name,
                      filterText: monacoSafeFilterText(fieldPrefix, f.name),
                      sortText: `30100:${f.name}`,
                      range: replaceRange,
                      documentation: mdDoc(
                        monaco,
                        `${f.type || 'Field'} — \`${fieldSourceObject}.${f.name}\`${f.label ? `\n${f.label}` : ''}`
                      )
                    });
                    fieldAdds += 1;
                    if (fieldAdds >= MAX_FIELDS_SUGGEST) break;
                  }
                } else {
                  /** @type {{ f: (typeof fields)[number], sc: number }[]} */
                  const fieldRank = [];
                  for (const f of fields) {
                    const sc = Math.max(
                      scoreSuggestMatch(f.name, fieldPrefix),
                      f.label ? scoreSuggestMatch(f.label, fieldPrefix) : 0
                    );
                    if (!sc) continue;
                    fieldRank.push({ f, sc });
                  }
                  fieldRank.sort((a, b) => b.sc - a.sc || a.f.name.localeCompare(b.f.name));
                  let fieldAdds = 0;
                  const addedNames = new Set();
                  for (const { f, sc } of fieldRank) {
                    if (addedNames.has(f.name)) continue;
                    addedNames.add(f.name);
                    items.push({
                      label: f.label ? `${f.name} (${f.label})` : f.name,
                      kind: monaco.languages.CompletionItemKind.Field,
                      insertText: f.name,
                      filterText: monacoSafeFilterText(fieldPrefix, f.name),
                      sortText: `${30000 + sc}:${f.name}`,
                      range: replaceRange,
                      documentation: mdDoc(
                        monaco,
                        `${f.type || 'Field'} — \`${fieldSourceObject}.${f.name}\`${f.label ? `\n${f.label}` : ''}`
                      )
                    });
                    fieldAdds += 1;
                    if (fieldAdds >= MAX_FIELDS_SUGGEST) break;
                  }
                }
              } catch {
                /* describe objeto falló */
              }
            }
          }
        }

        const seen = new Set();
        /** @type {import('monaco-editor').languages.CompletionItem[]} */
        const uniq = [];
        for (const it of items) {
          const ins = typeof it.insertText === 'string' ? it.insertText : String(it.label);
          const k = `${it.kind}:${ins}`;
          if (seen.has(k)) continue;
          seen.add(k);
          uniq.push(it);
          if (uniq.length >= 320) break;
        }

        const finalUniq = uniq.length
          ? uniq
          : fallbackKeywords(['SELECT', 'FROM', 'WHERE', 'LIMIT', 'ORDER BY']);
        const sealed = finalUniq.map((x) => sealCompletionItem(replaceRange, x));
        return { suggestions: sealed, incomplete: false };
      } catch {
        return {
          suggestions: fallbackKeywords(['SELECT', 'FROM', 'WHERE', 'LIMIT', 'ORDER BY']).map((x) =>
            sealCompletionItem(replaceRange, x)
          ),
          incomplete: false
        };
      }
    }
  });

  if (!customLanguageRegistered) {
    try {
      api.register({ id: 'sfoc-soql' });
      if (api.setLanguageConfiguration) {
        api.setLanguageConfiguration('sfoc-soql', {
          wordPattern: /[A-Za-z_][A-Za-z0-9_]*/
        });
      }
      if (api.setMonarchTokensProvider) {
        api.setMonarchTokensProvider('sfoc-soql', {
          ignoreCase: true,
          tokenizer: {
            root: [
              [
                /\b(?:select|from|where|and|or|not|like|in|includes|excludes|order|by|group|having|limit|offset|asc|desc|nulls|with|security_enforced|using|scope|for|reference|view|update|tracking|viewstat|all rows|typeof|when|then|else|end)\b/i,
                'keyword'
              ],
              [/'(?:[^'\\]|\\.|'')*'/, 'string'],
              [/\d+(?:\.\d+)?/, 'number'],
              [/[A-Za-z_][A-Za-z0-9_]*/, 'identifier'],
              [/[(),.;]/, 'delimiter']
            ]
          }
        });
      }
      customLanguageRegistered = true;
    } catch {
      /* el lenguaje ya estaba registrado o falla; el provider seguirá enganchado abajo */
    }
  }

  // Una sola registración para evitar invocaciones (y duplicados) múltiples del provider.
  try {
    const disposable = api.registerCompletionItemProvider('sfoc-soql', provide);
    if (disposable) completionProviderDisposables.push(disposable);
  } catch {
    /* ignore */
  }
}

/** @returns {Promise<import('monaco-editor').editor.IStandaloneCodeEditor | null>} */
export async function ensureQueryExplorerEditor() {
  const mount = document.getElementById('queryExplorerEditorMount');
  if (!mount) return null;
  monacoRef = state.monaco || (await loadMonaco());
  state.monaco = monacoRef;

  /** @type {typeof import('monaco-editor')} */
  const monaco = /** @type {typeof import('monaco-editor')} */ (monacoRef);

  ensureCompletions(monaco, () => {
    const sel = /** @type {HTMLSelectElement} */ (document.getElementById('queryExplorerLangSelect'));
    return sel?.value === 'sosl' ? 'sosl' : 'soql';
  });

  if (editorInstance) {
    const prev = editorInstance.getModel();
    if (prev && prev.getLanguageId() !== 'sfoc-soql') {
      monaco.editor.setModelLanguage(prev, 'sfoc-soql');
    }
    editorInstance.updateOptions({
      wordWrap: 'on',
      wrappingStrategy: 'advanced',
      wrappingIndent: 'same',
      scrollbar: { useShadows: false, vertical: 'auto', horizontal: 'hidden' }
    });
    editorInstance.layout();
    return editorInstance;
  }

  let initial = '';
  try {
    initial = localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    /* ignore */
  }
  if (!initial.trim()) initial = 'SELECT Id, Name FROM Account LIMIT 10';

  mount.style.height = `${getSavedQueryExplorerEditorHeight()}px`;

  editorInstance = monaco.editor.create(mount, {
    value: initial,
    language: 'sfoc-soql',
    readOnly: false,
    automaticLayout: true,
    minimap: { enabled: false },
    wordWrap: 'on',
    wrappingStrategy: 'advanced',
    wrappingIndent: 'same',
    theme: resolveMonacoThemeId(),
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
    scrollbar: { useShadows: false, vertical: 'auto', horizontal: 'hidden' },
    quickSuggestions: { other: true, comments: false, strings: false },
    quickSuggestionsDelay: 10,
    wordBasedSuggestions: 'off',
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnCommitCharacter: true,
    tabCompletion: 'on',
    suggest: {
      showKeywords: true,
      showSnippets: false,
      snippetsPreventQuickSuggestions: false,
      filterGraceful: true,
      localityBonus: true,
      insertMode: 'insert'
    },
    tabSize: 2
  });

  editorInstance.onDidChangeModelContent(() => {
    try {
      localStorage.setItem(STORAGE_KEY, editorInstance?.getValue() || '');
    } catch {
      /* ignore */
    }

    if (suggestDebounce) clearTimeout(suggestDebounce);
    suggestDebounce = setTimeout(() => {
      suggestDebounce = null;
      const ed = editorInstance;
      if (!ed) return;
      ed.trigger('sfoc-query-explorer', 'editor.action.triggerSuggest', {});
    }, 80);
  });

  return editorInstance;
}

export function syncQueryExplorerEditorLanguage() {
  if (!monacoRef || !editorInstance?.getModel) return;
  const m = editorInstance.getModel();
  if (!m) return;
  monacoRef.editor.setModelLanguage(m, 'sfoc-soql');
}

export function refreshQueryExplorerEditorTheme() {
  if (!monacoRef || !editorInstance) return;
  try {
    editorInstance.updateOptions({ theme: resolveMonacoThemeId() });
  } catch {
    /* ignore */
  }
}

export function getQueryExplorerQueryText() {
  return editorInstance ? String(editorInstance.getValue() || '').trim() : '';
}

/** Texto del editor sin recortar (p. ej. guardar consulta). */
export function getQueryExplorerEditorRawText() {
  return editorInstance ? String(editorInstance.getValue() || '') : '';
}

/** Sustituye el texto del editor y persiste en `localStorage` como el flujo normal del panel. */
export async function setQueryExplorerEditorValue(value) {
  await ensureQueryExplorerEditor();
  if (!editorInstance) return;
  const v = String(value ?? '');
  try {
    editorInstance.setValue(v);
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    /* ignore */
  }
}
