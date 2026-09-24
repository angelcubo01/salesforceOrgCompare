import { parseApexLogExecutionContext } from './salesforceApi.js';
import { normalizeSoqlForDedup } from './apexLogParser.js';

const SF_ID = /\b([A-Za-z0-9]{15,18})\b/g;
const TOKEN = /\b(?:Bearer\s+)?(?:sid|session(?:[_-]?id)?|token|request(?:[_-]?id)?|transaction(?:[_-]?id)?|organization(?:[_-]?id)?)\s*[=:]\s*[^\s,;|\]}]+/gi;
const ISO_OR_TIME = /\b\d{4}-\d{2}-\d{2}[T ][^\s|,]+|\b\d{2}:\d{2}:\d{2}\.\d+(?:\s*\(\d+\))?/g;
const TECHNICAL_NOISE_EVENT = /\|(?:HEAP_ALLOCATE|HEAP_DEALLOCATE|STATEMENT_EXECUTE|SYSTEM_MODE_ENTER|SYSTEM_MODE_EXIT)\|/;

const ID_TYPES = { '001': 'AccountId', '003': 'ContactId', '005': 'UserId', '500': 'CaseId', '00D': 'OrganizationId' };

function normalizeComparableText(value) {
  return String(value || '').replace(SF_ID, (id) => `<${ID_TYPES[id.slice(0, 3)] || 'SalesforceId'}>`).replace(ISO_OR_TIME, '<time>').replace(/\s+/g, ' ').trim();
}

/** Normaliza valores variables manteniendo aliases consistentes dentro de un log. */
export function createLogNormalizer() {
  const aliases = new Map();
  const counters = new Map();
  return (value) => String(value ?? '')
    .replace(TOKEN, (match) => `${match.split(/[=:]/)[0]}=<redacted>`)
    .replace(ISO_OR_TIME, '<time>')
    .replace(SF_ID, (id) => {
      if (!aliases.has(id)) {
        const type = ID_TYPES[id.slice(0, 3)] || 'SalesforceId';
        const n = (counters.get(type) || 0) + 1;
        counters.set(type, n);
        aliases.set(id, `<${type}:${n}>`);
      }
      return aliases.get(id);
    })
    .replace(/\b(?:0x[0-9a-f]+|[a-f0-9]{8}-[a-f0-9-]{27,})\b/gi, '<technical-id>')
    .replace(/\s+/g, ' ').trim();
}

export function normalizeLogText(rawText) {
  const normalize = createLogNormalizer();
  return String(rawText || '').split(/\r?\n/).map((text, i) => {
    const value = normalize(text);
    // Keep the source line and event kind, but suppress variable instrumentation data.
    const comparable = TECHNICAL_NOISE_EVENT.test(value)
      ? value.replace(/^([^|]*\|[^|]*)\|.*$/, '$1|<technical-noise>')
      : value;
    return { line: i + 1, text: comparable };
  });
}

export function getComparisonEntry(rawText, parsed) {
  const ctx = parseApexLogExecutionContext(rawText);
  const execution = (parsed?.executions || []).find((item) => item.codeUnitLabel) || parsed?.executions?.[0];
  const name = String(ctx.logName && ctx.logName !== 'N/A' ? ctx.logName : execution?.codeUnitLabel || execution?.label || '').trim();
  // La restricción de compatibilidad es por clase/trigger/flow, no por el método de test concreto.
  const owner = name.replace(/\([^)]*\)$/, '').split('.')[0].trim();
  return { type: ctx.logType || 'N/A', name, method: ctx.logMethod || 'N/A', key: owner.toLowerCase() };
}

export function areLogsComparable(aRaw, aParsed, bRaw, bParsed) {
  const a = getComparisonEntry(aRaw, aParsed);
  const b = getComparisonEntry(bRaw, bParsed);
  if (a.key && b.key && a.key !== b.key) return { ok: false, reason: 'different-entry', a, b };
  return { ok: true, a, b };
}

function semanticEvents(parsed) {
  const events = [];
  const add = (type, label, line, data = {}) => events.push({ type, label: String(label || '').replace(/\s+/g, ' ').trim(), line: Number(line) || 0, ...data });
  const walk = (node, parent = '') => {
    for (const child of node?.children || []) {
      if (['codeUnit', 'method', 'flow', 'execution'].includes(child.kind)) add(child.kind, child.label, child.line, { parent, durationMs: child.durationMs || 0, apexLine: child.apexLine || '' });
      walk(child, `${parent}/${child.label || child.kind}`);
    }
  };
  walk(parsed?.tree);
  for (const q of parsed?.soql || []) add('soql', normalizeComparableText(normalizeSoqlForDedup(q.query)), q.line, { rows: q.rows || 0, durationMs: q.durationMs || 0 });
  for (const d of parsed?.dml || []) add('dml', `${d.operation}|${d.object}`, d.line, { rows: d.rows || 0, durationMs: d.durationMs || 0 });
  for (const c of parsed?.callouts || []) add('callout', `${c.method}|${String(c.endpoint || '').replace(/[?#].*$/, '')}`, c.line, { statusCode: c.statusCode || 0, durationMs: c.durationMs || 0 });
  for (const v of parsed?.validations || []) add('validation', `${v.kind}|${v.name || v.result}`, v.line, { result: v.result || '' });
  for (const w of parsed?.workflows || []) add('workflow', `${w.event}|${w.detail}`, w.line);
  for (const i of parsed?.issues || []) if (i.type === 'error') add('error', String(i.description || i.summary || '').replace(/\bline\s+\d+/gi, 'line <n>'), i.line);
  return events.sort((a, b) => a.line - b.line || a.type.localeCompare(b.type));
}

function signature(e) { return `${e.type}|${e.label}|${e.parent || ''}|${e.apexLine || ''}`; }

/** LCS acotado: evita bloquear el visor con logs muy extensos. */
export function alignSemanticEvents(a, b, max = 700) {
  const left = a.slice(0, max); const right = b.slice(0, max);
  const dp = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) dp[i][j] = signature(left[i]) === signature(right[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0; let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && signature(left[i]) === signature(right[j])) { out.push({ status: 'same', a: left[i++], b: right[j++] }); continue; }
    if (j >= right.length || (i < left.length && dp[i + 1][j] >= dp[i][j + 1])) out.push({ status: 'onlyA', a: left[i++], b: null });
    else out.push({ status: 'onlyB', a: null, b: right[j++] });
  }
  return out;
}

function diff(status, category, element, a, b, impact = 'medium') { return { status, category, element, a, b, impact, lineA: a?.line || 0, lineB: b?.line || 0 }; }
function keyed(rows, fn) { return new Map((rows || []).map((row) => [fn(row), row])); }

function aggregateDifferences(a, b, tolerance) {
  const out = [];
  const compareRows = (category, ar, br, key, comparable) => {
    const am = keyed(ar, key); const bm = keyed(br, key);
    for (const [k, x] of am) {
      const y = bm.get(k);
      if (!y) out.push(diff('onlyA', category, k, x, null));
      else if (!comparable(x, y)) out.push(diff('modified', category, k, x, y));
    }
    for (const [k, y] of bm) if (!am.has(k)) out.push(diff('onlyB', category, k, null, y));
  };
  compareRows('SOQL', a.soql, b.soql, q => normalizeComparableText(normalizeSoqlForDedup(q.query)), (x, y) => x.rows === y.rows);
  compareRows('DML', a.dml, b.dml, d => `${d.operation}|${d.object}`, (x, y) => x.rows === y.rows);
  compareRows('Callout', a.callouts, b.callouts, c => `${c.method}|${String(c.endpoint || '').replace(/[?#].*$/, '')}`, (x, y) => x.statusCode === y.statusCode);
  compareRows('Error', a.issues?.filter(x => x.type === 'error'), b.issues?.filter(x => x.type === 'error'), x => String(x.description || x.summary).replace(/\d+/g, '<n>'), () => true);
  const aLimits = a.limitPeak || {}; const bLimits = b.limitPeak || {};
  for (const type of new Set([...Object.keys(aLimits), ...Object.keys(bLimits)])) {
    const x = aLimits[type]; const y = bLimits[type];
    if (!x || !y) out.push(diff(x ? 'onlyA' : 'onlyB', 'Límite', type, x, y));
    else if (x.used !== y.used || x.max !== y.max) out.push(diff('modified', 'Límite', type, x, y, x.max && x.used / x.max >= .8 ? 'high' : 'medium'));
  }
  const unitsA = keyed(a.codeUnits, x => x.label);
  const unitsB = keyed(b.codeUnits, x => x.label);
  for (const [name, x] of unitsA) {
    const y = unitsB.get(name);
    if (!y) continue;
    const delta = Math.abs((x.durationMs || 0) - (y.durationMs || 0));
    const base = Math.max(1, Math.min(x.durationMs || 0, y.durationMs || 0));
    if (delta && (delta >= 20 || (delta / base) * 100 >= tolerance)) {
      out.push(diff('performance', 'Rendimiento', name, x, y, delta >= 250 ? 'high' : 'medium'));
    }
  }
  return out;
}

export function compareApexLogs(aRaw, aParsed, bRaw, bParsed, options = {}) {
  const compatible = areLogsComparable(aRaw, aParsed, bRaw, bParsed);
  if (!compatible.ok) return { compatible, differences: [], alignment: [], normalizedA: [], normalizedB: [] };
  const eventsA = semanticEvents(aParsed); const eventsB = semanticEvents(bParsed);
  const alignment = alignSemanticEvents(eventsA, eventsB, options.maxEvents || 700);
  const differences = aggregateDifferences(aParsed, bParsed, Number(options.performanceTolerancePct) || 15);
  for (const row of alignment) if (row.status !== 'same' && ['method', 'codeUnit', 'flow', 'workflow', 'validation'].includes((row.a || row.b).type)) differences.push(diff('routeDivergent', 'Ruta', (row.a || row.b).label, row.a, row.b, 'high'));
  const first = differences.slice().sort((x, y) => Math.max(1, x.lineA || x.lineB) - Math.max(1, y.lineA || y.lineB))[0] || null;
  return {
    compatible, eventsA, eventsB, alignment, differences, firstDivergence: first,
    normalizedA: normalizeLogText(aRaw), normalizedB: normalizeLogText(bRaw),
    truncated: (aParsed?.issues || []).concat(bParsed?.issues || []).some(x => /truncado/i.test(x.summary || ''))
  };
}

export function buildComparisonLogiContext(comparison, a, b) {
  const redactA = createLogNormalizer();
  const redactB = createLogNormalizer();
  const redact = (value, normalize) => {
    if (value == null || typeof value !== 'object') return normalize(value);
    if (Array.isArray(value)) return value.map(x => redact(x, normalize));
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, redact(val, normalize)]));
  };
  const compact = (items, max = 12) => (items || []).slice(0, max).map(x => ({ category: x.category, element: x.element, status: x.status, impact: x.impact, refA: x.lineA ? `Log A L${x.lineA}` : null, refB: x.lineB ? `Log B L${x.lineB}` : null, logA: x.a ? { line: x.lineA, value: redact(x.a, redactA) } : null, logB: x.b ? { line: x.lineB, value: redact(x.b, redactB) } : null }));
  const compactFlow = (comparison.alignment || []).filter((row) => row.status !== 'same').slice(0, 24).map((row) => ({
    status: row.status,
    logA: row.a ? { label: redact(row.a.label, redactA), line: row.a.line, ref: `Log A L${row.a.line}` } : null,
    logB: row.b ? { label: redact(row.b.label, redactB), line: row.b.line, ref: `Log B L${row.b.line}` } : null
  }));
  const summary = {
    total: (comparison.differences || []).length,
    routes: (comparison.differences || []).filter((row) => row.category === 'Ruta').length,
    exclusiveErrors: (comparison.differences || []).filter((row) => row.category === 'Error' && row.status !== 'modified').length,
    exclusiveSoqlOrDml: (comparison.differences || []).filter((row) => ['SOQL', 'DML'].includes(row.category) && row.status !== 'modified').length,
    highImpact: (comparison.differences || []).filter((row) => row.impact === 'high').length,
    resultA: a.parsed?.issues?.some((row) => row.type === 'error') ? 'error' : 'success',
    resultB: b.parsed?.issues?.some((row) => row.type === 'error') ? 'error' : 'success'
  };
  return {
    comparison: {
      logA: { environment: a.environment, entry: a.entry, result: summary.resultA },
      logB: { environment: b.environment, entry: b.entry, result: summary.resultB },
      summary,
      firstDivergence: comparison.firstDivergence && compact([comparison.firstDivergence], 1)[0],
      differences: compact(comparison.differences),
      flow: compactFlow,
      truncated: comparison.truncated,
      instructions: 'Use comparison summary, differences, and flow. Separate proven facts, likely inferences, and missing information. Never claim a branch or condition value without evidence.'
    }
  };
  return { comparison: { logA: { environment: a.environment, entry: a.entry, result: a.result }, logB: { environment: b.environment, entry: b.entry, result: b.result }, firstDivergence: comparison.firstDivergence && compact([comparison.firstDivergence], 1)[0], differences: compact(comparison.differences), truncated: comparison.truncated, instructions: 'For this comparison answer in this order: Resultado principal, Primera divergencia, Evidencia Log A, Evidencia Log B, Causa probable, Impacto, Próximas comprobaciones. Separate proven facts, likely inferences, and missing information. Never claim a branch or condition value without evidence.' } };
}
