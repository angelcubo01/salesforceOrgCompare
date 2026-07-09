import { normalizeApexLogBodyText } from './salesforceApi.js';

const LOG_LINE_RE = /^(\d{2}:\d{2}:\d{2}\.\d+)\s*(?:\((\d+)\))?\|/;
const DEBUG_LEVELS_RE = /^\d+\.\d+\s+APEX_CODE,/m;
const ENTRY_EXIT = {
  METHOD_ENTRY: { exit: 'METHOD_EXIT', kind: 'method', label: 'Método' },
  CONSTRUCTOR_ENTRY: { exit: 'CONSTRUCTOR_EXIT', kind: 'method', label: 'Constructor' },
  SYSTEM_METHOD_ENTRY: { exit: 'SYSTEM_METHOD_EXIT', kind: 'system', label: 'Sistema' },
  SYSTEM_CONSTRUCTOR_ENTRY: { exit: 'SYSTEM_CONSTRUCTOR_EXIT', kind: 'system', label: 'Sistema' },
  CODE_UNIT_STARTED: { exit: 'CODE_UNIT_FINISHED', kind: 'codeUnit', label: 'Unidad' },
  SOQL_EXECUTE_BEGIN: { exit: 'SOQL_EXECUTE_END', kind: 'soql', label: 'SOQL' },
  DML_BEGIN: { exit: 'DML_END', kind: 'dml', label: 'DML' },
  EXECUTION_STARTED: { exit: 'EXECUTION_FINISHED', kind: 'execution', label: 'Ejecución' },
  FLOW_START_INTERVIEW_BEGIN: { exit: 'FLOW_START_INTERVIEW_END', kind: 'flow', label: 'Flow' },
  FLOW_START_INTERVIEWS_BEGIN: { exit: 'FLOW_START_INTERVIEWS_END', kind: 'flow', label: 'Flow' },
  FLOW_ELEMENT_BEGIN: { exit: 'FLOW_ELEMENT_END', kind: 'flow', label: 'Flow' },
  FLOW_BULK_ELEMENT_BEGIN: { exit: 'FLOW_BULK_ELEMENT_END', kind: 'flow', label: 'Flow' }
};

const SF_ID_RE = /\b([a-zA-Z0-9]{15,18})\b/g;
const STACK_TRACE_RE = /^(?:Class|Trigger)\.[^:]+:\s*line\s+\d+/i;
const TEST_METHOD_RE = /Test\.\w+/i;

/** @param {string} text */
export function computeLogLineOffset(text) {
  const idx = String(text || '').search(/^.*EXECUTION_STARTED.*$/m);
  if (idx < 0) return 0;
  const before = text.slice(0, idx);
  if (!before) return 0;
  return (before.match(/\r?\n/g) || []).length;
}

/** @param {number} bodyLine @param {number} lineOffset */
export function toFileLine(bodyLine, lineOffset) {
  return bodyLine + lineOffset;
}

/** @param {object[]} issues */
export function deduplicateIssues(issues) {
  const out = [];
  const normalizeDesc = (desc) => String(desc || '').replace(/\s+/g, ' ').trim();
  for (const issue of issues || []) {
    const desc = normalizeDesc(issue.description);
    const dup = out.find(
      (existing) =>
        issue.type === 'error' &&
        existing.type === 'error' &&
        existing.summary === issue.summary &&
        normalizeDesc(existing.description) === desc &&
        Math.abs((issue.line || 0) - (existing.line || 0)) <= 10
    );
    if (dup) continue;
    out.push(issue);
  }
  return out;
}

/**
 * @param {string} explainText
 */
export function parseSoqlExplain(explainText) {
  const raw = String(explainText || '').trim();
  if (!raw) return null;
  const tableScan = raw.match(/TableScan on (\S+)/i);
  const cardinality = raw.match(/cardinality:\s*([^,]+)/i);
  const sobjectCardinality = raw.match(/sobjectCardinality:\s*([^,]+)/i);
  const relativeCost = raw.match(/relativeCost\s*([\d.]+)/i);
  const noPlan = /no explain plan is available/i.test(raw);
  return {
    raw,
    table: tableScan?.[1] || '',
    cardinality: cardinality?.[1]?.trim() || '',
    sobjectCardinality: sobjectCardinality?.[1]?.trim() || '',
    relativeCost: relativeCost ? Number(relativeCost[1]) : null,
    noPlan
  };
}

/** @param {string} event */
export function classifyLogEvent(event) {
  const ev = String(event || '');
  if (ev.includes('SOQL')) return 'soql';
  if (ev.includes('DML')) return 'dml';
  if (ev === 'USER_DEBUG') return 'debug';
  if (ev.startsWith('CALLOUT')) return 'callout';
  if (ev === 'LIMIT_USAGE' || ev === 'CUMULATIVE_LIMIT_USAGE') return 'limit';
  if (ev === 'EXCEPTION_THROWN' || ev === 'FATAL_ERROR') return 'error';
  if (ev.includes('METHOD') || ev.includes('CONSTRUCTOR')) return 'method';
  if (ev.startsWith('VALIDATION_') || ev.startsWith('WF_')) return 'validation';
  if (
    ev === 'HEAP_ALLOCATE' ||
    ev === 'STATEMENT_EXECUTE' ||
    ev === 'VARIABLE_ASSIGNMENT' ||
    ev === 'VARIABLE_SCOPE_BEGIN' ||
    ev === 'SYSTEM_MODE_ENTER' ||
    ev === 'SYSTEM_MODE_EXIT'
  ) {
    return 'noise';
  }
  if (ev.startsWith('CODE_UNIT') || ev.startsWith('EXECUTION_') || ev.startsWith('FLOW_')) return 'unit';
  return 'other';
}

/**
 * Construye eventos de línea para todo el archivo (Monaco usa líneas de archivo).
 * @param {string} text
 * @param {{ line: number, event: string, category: string }[]} parsedEvents
 */
function buildFullLineEvents(text, parsedEvents) {
  const byLine = new Map((parsedEvents || []).map((e) => [e.line, e]));
  const rawLines = String(text || '').split(/\r?\n/);
  const out = [];
  let lastCategory = 'other';
  for (let i = 0; i < rawLines.length; i++) {
    const lineNum = i + 1;
    const lineText = rawLines[i];
    const known = byLine.get(lineNum);
    if (known) {
      lastCategory = known.category;
      out.push({ line: lineNum, event: known.event, category: known.category });
      continue;
    }
    if (!lineText.trim()) {
      out.push({ line: lineNum, event: '', category: 'other' });
      continue;
    }
    if (STACK_TRACE_RE.test(lineText.trim())) {
      out.push({ line: lineNum, event: 'STACK_TRACE', category: 'stack' });
      lastCategory = 'stack';
      continue;
    }
    const m = lineText.match(/\|([A-Z_]+)\|/);
    if (m) {
      const cat = classifyLogEvent(m[1]);
      lastCategory = cat;
      out.push({ line: lineNum, event: m[1], category: cat });
      continue;
    }
    if (lastCategory === 'error' || lastCategory === 'stack') {
      out.push({ line: lineNum, event: 'STACK_TRACE', category: 'stack' });
      continue;
    }
    out.push({ line: lineNum, event: '', category: 'other' });
  }
  return out;
}

/**
 * @param {object | null} node
 * @param {number} startLine
 * @param {number} endLine
 */
export function sliceTreeForLineRange(node, startLine, endLine) {
  if (!node) return null;
  const inRange = (line) => line >= startLine && line <= endLine;

  if (node.kind === 'root') {
    const children = (node.children || [])
      .map((ch) => sliceTreeForLineRange(ch, startLine, endLine))
      .filter(Boolean);
    return { ...node, children };
  }

  const children = (node.children || [])
    .map((ch) => sliceTreeForLineRange(ch, startLine, endLine))
    .filter(Boolean);
  const line = node.line || 0;
  if (!inRange(line) && !children.length) return null;
  return { ...node, children };
}

/**
 * @param {object} parsed
 * @param {number | string} executionId
 */
export function sliceParsedForExecution(parsed, executionId) {
  if (!parsed || executionId == null || executionId === 'all') return parsed;
  const exec = (parsed.executions || []).find((e) => String(e.id) === String(executionId));
  if (!exec) return parsed;
  const { startLine, endLine } = exec;
  const inRange = (line) => line >= startLine && line <= endLine;
  const filterByLine = (arr) => (arr || []).filter((r) => inRange(r.line || 0));
  const issues = (parsed.issues || []).filter((i) => inRange(i.line || 0));
  const soql = filterByLine(parsed.soql);
  const dml = filterByLine(parsed.dml);
  const limits = filterByLine(parsed.limits);
  const callouts = filterByLine(parsed.callouts);
  const validations = filterByLine(parsed.validations);
  const workflows = filterByLine(parsed.workflows);
  const userDebug = filterByLine(parsed.userDebug);
  const codeUnits = filterByLine(parsed.codeUnits);
  const timeline = (parsed.timeline || []).filter((e) => inRange(e.line || 0));
  const lineEvents = (parsed.lineEvents || []).filter((e) => inRange(e.line));
  const tree = sliceTreeForLineRange(parsed.tree, startLine, endLine);
  const limitPeak = {};
  for (const l of limits) {
    if (!limitPeak[l.type] || l.used > limitPeak[l.type].used) {
      limitPeak[l.type] = { used: l.used, max: l.max, line: l.line };
    }
  }
  const soqlGovernor = buildSoqlGovernorSummary(soql, limitPeak);
  return {
    ...parsed,
    issues,
    soql,
    dml,
    limits,
    limitPeak,
    callouts,
    validations,
    workflows,
    userDebug,
    codeUnits,
    timeline,
    lineEvents,
    tree,
    soqlGovernor,
    soqlDuplicates: groupDuplicateSoql(soql.filter((s) => s.countsTowardSoqlLimit)),
    meta: {
      ...parsed.meta,
      durationMs: exec.durationMs || parsed.meta?.durationMs || 0,
      issueCount: issues.length,
      scopedExecutionId: exec.id
    },
    scopedExecution: exec
  };
}

/** @param {string} query */
export function normalizeSoqlForDedup(query) {
  return String(query || '')
    .replace(/\s+/g, ' ')
    .replace(/:tmpVar\d+/gi, ':bind')
    .trim()
    .toLowerCase();
}

const SOQL_FROM_OBJECT_RE = /\bFROM\s+([a-zA-Z0-9_.]+)\b/i;

/** @param {string} query */
export function extractSoqlFromObject(query) {
  const m = String(query || '').match(SOQL_FROM_OBJECT_RE);
  return m ? m[1] : '';
}

/** Consultas contra Custom Metadata (`__mdt`) no cuentan para el límite de 100 SOQL en Apex. */
export function isCustomMetadataSoql(query) {
  return extractSoqlFromObject(query).endsWith('__mdt');
}

/**
 * Determina si una consulta del log cuenta para el límite SOQL (100/200) según deltas de LIMIT_USAGE.
 * @param {string} query
 * @param {number} soqlDelta incremento del contador SOQL entre BEGIN y END
 * @param {number} aggsDelta incremento del contador AGGS (subconsultas padre-hijo)
 * @param {boolean} [limitsKnown] si el log incluye eventos LIMIT_USAGE
 */
export function classifySoqlGovernorImpact(query, soqlDelta, aggsDelta, limitsKnown = true) {
  if (soqlDelta > 0) {
    return { countsTowardSoqlLimit: true, exemptReason: null };
  }
  if (limitsKnown) {
    if (aggsDelta > 0) {
      return { countsTowardSoqlLimit: false, exemptReason: 'aggregateSubquery' };
    }
    if (isCustomMetadataSoql(query)) {
      return { countsTowardSoqlLimit: false, exemptReason: 'customMetadata' };
    }
    return { countsTowardSoqlLimit: false, exemptReason: 'exemptOther' };
  }
  if (isCustomMetadataSoql(query)) {
    return { countsTowardSoqlLimit: false, exemptReason: 'customMetadata' };
  }
  return { countsTowardSoqlLimit: true, exemptReason: null };
}

/** @param {object[]} soql */
export function buildSoqlGovernorSummary(soql, limitPeak = {}) {
  const counted = soql.filter((s) => s.countsTowardSoqlLimit);
  const exempt = soql.filter((s) => !s.countsTowardSoqlLimit);
  const byReason = { customMetadata: 0, aggregateSubquery: 0, exemptOther: 0 };
  for (const row of exempt) {
    const key = row.exemptReason || 'exemptOther';
    if (key in byReason) byReason[key] += 1;
    else byReason.exemptOther += 1;
  }
  return {
    counted: counted.length,
    exempt: exempt.length,
    total: soql.length,
    peakUsed: limitPeak.SOQL?.used ?? null,
    peakMax: limitPeak.SOQL?.max ?? null,
    byReason
  };
}

/** @param {object[]} soql */
export function groupDuplicateSoql(soql) {
  const groups = new Map();
  for (const row of soql || []) {
    const key = normalizeSoqlForDedup(row.query);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({
      key,
      query: rows[0].query,
      count: rows.length,
      totalDurationMs: rows.reduce((s, r) => s + (r.durationMs || 0), 0),
      rows
    }))
    .sort((a, b) => b.count - a.count || b.totalDurationMs - a.totalDurationMs);
}

function extractRecordIds(text, records) {
  const matches = String(text || '').matchAll(SF_ID_RE);
  for (const m of matches) {
    const id = m[1];
    const prefix = id.slice(0, 3).toLowerCase();
    if (prefix === '001') records.accounts.add(id);
    else if (prefix === '500') records.cases.add(id);
    else if (prefix === '005') records.users.add(id);
    else if (prefix === '003') records.contacts.add(id);
    else if (/^[a-z0-9]{15,18}$/i.test(id)) records.other.add(id);
  }
}

function recordsToObject(sets) {
  return {
    accounts: [...sets.accounts],
    cases: [...sets.cases],
    users: [...sets.users],
    contacts: [...sets.contacts],
    other: [...sets.other]
  };
}

function parseCumulativeProfiling(text) {
  const profiling = { soql: [], dml: [], methods: [] };
  const idx = text.indexOf('CUMULATIVE_PROFILING|');
  if (idx < 0) return profiling;

  const block = text.slice(idx);
  const lines = block.split(/\r?\n/);
  let section = '';

  for (const raw of lines) {
    if (!raw.trim()) continue;
    if (raw.includes('CUMULATIVE_PROFILING_END')) break;

    const profMatch = raw.match(/CUMULATIVE_PROFILING\|([^|]+)\|/);
    if (profMatch) {
      const label = profMatch[1].trim().toLowerCase();
      if (label.includes('soql')) section = 'soql';
      else if (label.includes('dml')) section = 'dml';
      else if (label.includes('method')) section = 'methods';
      else section = '';
      continue;
    }

    if (!section || raw.includes('CUMULATIVE_PROFILING|')) continue;

    const entryMatch = raw.match(
      /^(?:Class\.|Trigger\.)?([^:]+):\s*line\s+(\d+),\s*column\s+\d+:\s*(.+?):\s*executed\s+(\d+)\s+time[s]?\s+in\s+(\d+)\s*ms/i
    );
    const externalMatch = raw.match(
      /^External entry point:\s*(.+?):\s*executed\s+(\d+)\s+time[s]?\s+in\s+(\d+)\s*ms/i
    );

    if (entryMatch) {
      profiling[section].push({
        location: entryMatch[1].trim(),
        apexLine: Number(entryMatch[2]),
        detail: entryMatch[3].trim(),
        executions: Number(entryMatch[4]),
        totalMs: Number(entryMatch[5]),
        line: 0
      });
      continue;
    }

    if (externalMatch && section === 'methods') {
      profiling.methods.push({
        location: externalMatch[1].trim(),
        apexLine: 0,
        detail: externalMatch[1].trim(),
        executions: Number(externalMatch[2]),
        totalMs: Number(externalMatch[3]),
        line: 0
      });
    }
  }

  for (const key of ['soql', 'dml', 'methods']) {
    profiling[key].sort((a, b) => b.totalMs - a.totalMs);
  }
  return profiling;
}

let nextNodeId = 0;

function freshId() {
  nextNodeId += 1;
  return nextNodeId;
}

/** @param {string} ts */
function parseTimestampNs(ts) {
  const m = String(ts || '').match(/^(\d{2}):(\d{2}):(\d{2})\.(\d+)/);
  if (!m) return 0;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3]);
  const frac = m[4];
  const ms = Number(frac.padEnd(3, '0').slice(0, 3));
  return ((h * 3600 + min * 60 + s) * 1000 + ms) * 1_000_000;
}

/** @param {string} bracket */
function parseApexLineNumber(bracket) {
  if (!bracket || bracket === '[EXTERNAL]') return null;
  const m = String(bracket).match(/^\[(\d+)\]$/);
  return m ? Number(m[1]) : null;
}

function parseRowsFromTail(parts) {
  for (const p of parts) {
    const m = String(p || '').match(/Rows:(\d+)/i);
    if (m) return Number(m[1]);
  }
  return 0;
}

function splitLogLines(text) {
  const startIdx = text.search(/^.*EXECUTION_STARTED.*$/m);
  const body = startIdx >= 0 ? text.slice(startIdx) : text;
  const lineOffset = computeLogLineOffset(text);
  const lines = [];
  const raw = body.split(/\r?\n/);
  let buf = '';
  let bufLine = 0;
  /** @type {number[]} */
  let bufContinuationLines = [];
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i];
    const fileLine = i + 1 + lineOffset;
    if (!line.trim() && !buf) continue;
    if (LOG_LINE_RE.test(line) && buf) {
      lines.push({ text: buf, line: bufLine, continuationLines: bufContinuationLines });
      buf = line;
      bufLine = fileLine;
      bufContinuationLines = [];
    } else if (!buf) {
      buf = line;
      bufLine = fileLine;
      bufContinuationLines = [];
    } else {
      buf += '\n' + line;
      if (line.trim()) bufContinuationLines.push(fileLine);
    }
  }
  if (buf) lines.push({ text: buf, line: bufLine, continuationLines: bufContinuationLines });
  return { lines, lineOffset };
}

function parseDebugLevels(text) {
  const m = text.match(DEBUG_LEVELS_RE);
  if (!m) return [];
  const header = m[0];
  const rest = header.replace(/^\d+\.\d+\s+/, '');
  return rest
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [category, level] = pair.split(',');
      return { category: category || '', level: level || '' };
    });
}

function parseLineFields(text) {
  const tsMatch = text.match(LOG_LINE_RE);
  if (!tsMatch) return null;
  const timeStr = tsMatch[1];
  const ns = tsMatch[2] ? Number(tsMatch[2]) : parseTimestampNs(timeStr);
  const after = text.slice(tsMatch[0].length);
  const parts = after.split('|');
  const event = parts[0] || '';
  return { timeStr, timestampNs: ns, event, parts, raw: text };
}

function createNode(kind, label, line, timestampNs, extra = {}) {
  return {
    id: freshId(),
    kind,
    label,
    line,
    timestampNs,
    exitTimestampNs: null,
    durationMs: 0,
    rows: 0,
    children: [],
    ...extra
  };
}

function closeNode(node, exitNs, rows = 0) {
  node.exitTimestampNs = exitNs;
  if (rows > 0) node.rows = rows;
  if (exitNs > node.timestampNs) {
    node.durationMs = Math.round((exitNs - node.timestampNs) / 1_000_000);
  }
}

function flattenTimeline(node, depth, out) {
  if (!node) return;
  if (node.kind !== 'root' && node.durationMs > 0) {
    out.push({
      id: node.id,
      label: node.label,
      type: node.kind,
      depth,
      startNs: node.timestampNs,
      endNs: node.exitTimestampNs || node.timestampNs,
      durationMs: node.durationMs,
      rows: node.rows || 0,
      line: node.line,
      hasError: Boolean(node.hasError)
    });
  }
  for (const ch of node.children || []) flattenTimeline(ch, depth + 1, out);
}

/**
 * @param {string} rawText
 * @returns {import('./apexLogParser.js').ApexLogParseResult}
 */
export function parseApexDebugLog(rawText) {
  nextNodeId = 0;
  const text = normalizeApexLogBodyText(rawText);
  const sizeBytes = new TextEncoder().encode(text).length;
  const issues = [];
  const userDebug = [];
  const soql = [];
  const dml = [];
  const limits = [];
  const callouts = [];
  const validations = [];
  const workflows = [];
  const codeUnits = [];
  const lineEvents = [];
  /** @type {object[]} */
  const executions = [];
  /** @type {object | null} */
  let currentExecution = null;
  /** @type {Map<number, object>} */
  const openSoqlByLine = new Map();
  const recordSets = {
    accounts: new Set(),
    cases: new Set(),
    users: new Set(),
    contacts: new Set(),
    other: new Set()
  };
  /** @type {Map<string|number, object>} */
  const openCallouts = new Map();
  /** @type {object[]} */
  const methodStack = [];
  /** @type {Map<number, object>} */
  const openCodeUnits = new Map();
  const limitPeak = {};
  let lastSoqlLimitUsed = 0;
  let lastAggsLimitUsed = 0;
  let hasLimitUsageEvents = false;
  const debugLevels = parseDebugLevels(text);
  let user = null;

  const root = createNode('root', 'LOG', 0, 0);
  const stack = [root];
  const openByKey = new Map();

  const preludeEnd = text.search(/^.*EXECUTION_STARTED.*$/m);
  if (preludeEnd > 0) {
    for (const lineText of text.slice(0, preludeEnd).split(/\r?\n/)) {
      const parsed = parseLineFields(lineText);
      if (parsed?.event === 'USER_INFO') {
        const { parts } = parsed;
        const off = parts[1] === '[EXTERNAL]' ? 1 : 0;
        user = { id: parts[1 + off] || '', name: parts[2 + off] || '' };
        break;
      }
    }
  }

  const { lines, lineOffset } = splitLogLines(text);
  let minNs = null;
  let maxNs = null;

  for (const { text: lineText, line: lineNum, continuationLines = [] } of lines) {
    const parsed = parseLineFields(lineText);
    if (!parsed) continue;

    const { timestampNs, event, parts, timeStr } = parsed;
    if (minNs == null || timestampNs < minNs) minNs = timestampNs;
    if (maxNs == null || timestampNs > maxNs) maxNs = timestampNs;

    const category = classifyLogEvent(event);
    lineEvents.push({ line: lineNum, event, category });
    for (const contLine of continuationLines) {
      const contCat = category === 'error' ? 'stack' : category;
      lineEvents.push({ line: contLine, event: 'STACK_TRACE', category: contCat });
    }
    extractRecordIds(lineText, recordSets);

    if (event === 'EXECUTION_STARTED') {
      currentExecution = {
        id: executions.length,
        label: '',
        startLine: lineNum,
        endLine: lineNum,
        durationMs: 0,
        hasError: false,
        codeUnitLabel: '',
        isTest: false,
        startNs: timestampNs,
        endNs: timestampNs
      };
      executions.push(currentExecution);
    }

    if (event === 'EXECUTION_FINISHED' && currentExecution) {
      currentExecution.endLine = lineNum;
      currentExecution.endNs = timestampNs;
      if (timestampNs > currentExecution.startNs) {
        currentExecution.durationMs = Math.round(
          (timestampNs - currentExecution.startNs) / 1_000_000
        );
      }
      if (!currentExecution.label) {
        currentExecution.label = `Ejecución ${currentExecution.id + 1}`;
      }
      currentExecution = null;
    }

    if (event === 'CODE_UNIT_STARTED' && parts[1] === '[EXTERNAL]' && currentExecution) {
      const cuLabel = parts[3] || parts[2] || '';
      if (!currentExecution.codeUnitLabel) {
        currentExecution.codeUnitLabel = cuLabel;
        currentExecution.label = cuLabel || currentExecution.label;
      }
      if (TEST_METHOD_RE.test(cuLabel)) currentExecution.isTest = true;
    }

    if (event === 'SOQL_EXECUTE_EXPLAIN') {
      const apexLine = parseApexLineNumber(parts[1]);
      const explainText = parts.slice(2).join('|') || lineText;
      const explain = parseSoqlExplain(explainText);
      const soqlRec =
        openSoqlByLine.get(apexLine ?? -1) ||
        [...soql].reverse().find((s) => s.apexLine === apexLine);
      if (soqlRec && explain) soqlRec.explain = explain;
      continue;
    }

    if (event === 'LIMIT_USAGE') {
      if (lineText.includes('MAXIMUM DEBUG LOG SIZE REACHED')) {
        issues.push({
          summary: 'Log truncado',
          description: 'Se alcanzó el tamaño máximo del log de depuración.',
          type: 'warning',
          line: lineNum
        });
      }
      const apexLine = parseApexLineNumber(parts[1]);
      const limitType = parts[2] || '';
      const used = Number(parts[3]) || 0;
      const max = Number(parts[4]) || 0;
      limits.push({
        line: lineNum,
        timestamp: timeStr,
        timestampNs,
        apexLine,
        type: limitType,
        used,
        max
      });
      if (!limitPeak[limitType] || used > limitPeak[limitType].used) {
        limitPeak[limitType] = { used, max, line: lineNum };
      }
      hasLimitUsageEvents = true;
      if (limitType === 'SOQL') lastSoqlLimitUsed = used;
      if (limitType === 'AGGS') lastAggsLimitUsed = used;
      continue;
    }

    if (event === 'CALLOUT_REQUEST') {
      const apexLine = parseApexLineNumber(parts[1]);
      const reqText = parts.slice(2).join('|');
      const endpointM = reqText.match(/Endpoint=([^,\]]+)/);
      const methodM = reqText.match(/Method=(\w+)/);
      const rec = {
        line: lineNum,
        requestLine: lineNum,
        responseLine: 0,
        apexLine: apexLine ?? '',
        endpoint: endpointM?.[1] || reqText,
        method: methodM?.[1] || '',
        statusCode: 0,
        status: '',
        durationMs: 0,
        timestampNs
      };
      openCallouts.set(apexLine ?? lineNum, rec);
      callouts.push(rec);
      continue;
    }

    if (event === 'CALLOUT_RESPONSE') {
      const apexLine = parseApexLineNumber(parts[1]);
      const respText = parts.slice(2).join('|');
      const statusM = respText.match(/StatusCode=(\d+)/);
      const statusTextM = respText.match(/Status=([^,\]]+)/);
      const rec = openCallouts.get(apexLine) || callouts[callouts.length - 1];
      if (rec && !rec.responseLine) {
        rec.responseLine = lineNum;
        rec.statusCode = Number(statusM?.[1]) || 0;
        rec.status = statusTextM?.[1] || '';
        rec.durationMs = Math.round((timestampNs - rec.timestampNs) / 1_000_000);
      }
      continue;
    }

    if (event === 'VALIDATION_RULE') {
      validations.push({
        line: lineNum,
        kind: 'rule',
        ruleId: parts[1] || '',
        name: parts[2] || parts.slice(1).join('|'),
        result: ''
      });
      continue;
    }

    if (event === 'VALIDATION_PASS' || event === 'VALIDATION_FAIL') {
      validations.push({
        line: lineNum,
        kind: event === 'VALIDATION_PASS' ? 'pass' : 'fail',
        ruleId: '',
        name: '',
        result: event === 'VALIDATION_PASS' ? 'pass' : 'fail'
      });
      continue;
    }

    if (event.startsWith('WF_')) {
      workflows.push({ line: lineNum, event, detail: parts.slice(1).join('|') || '' });
      continue;
    }

    if (event === 'USER_INFO') {
      if (!user) {
        const off = parts[1] === '[EXTERNAL]' ? 1 : 0;
        user = { id: parts[1 + off] || '', name: parts[2 + off] || '' };
      }
      continue;
    }

    if (event === 'USER_DEBUG') {
      const apexLine = parseApexLineNumber(parts[1]);
      const message = parts.slice(2).join('|') || lineText;
      userDebug.push({
        line: lineNum,
        timestamp: timeStr,
        apexLine: apexLine ?? '',
        message
      });
      continue;
    }

    if (event === 'EXCEPTION_THROWN' || event === 'FATAL_ERROR') {
      if (stack.length > 1) {
        stack[stack.length - 1].hasError = true;
      }
      if (event === 'FATAL_ERROR' && currentExecution) currentExecution.hasError = true;
      const stackMatch = lineText.match(/Class\.([^:]+):\s*line\s+(\d+)/i);
      issues.push({
        summary: event === 'FATAL_ERROR' ? 'Error fatal' : 'Excepción',
        description: parts.slice(1).join('|') || lineText,
        type: 'error',
        line: lineNum,
        apexClass: stackMatch?.[1]?.trim() || '',
        apexLine: stackMatch ? Number(stackMatch[2]) : null
      });
      continue;
    }

    if (lineText.includes('MAXIMUM DEBUG LOG SIZE REACHED')) {
      issues.push({
        summary: 'Log truncado',
        description: 'Se alcanzó el tamaño máximo del log de depuración.',
        type: 'warning',
        line: lineNum
      });
    }

    const entryDef = ENTRY_EXIT[event];
    if (entryDef) {
      let label = '';
      let rows = 0;
      let aggregations = 0;
      const apexLine = parseApexLineNumber(parts[1]);

      if (event === 'SOQL_EXECUTE_BEGIN') {
        label = parts[3] || parts[2] || 'SOQL';
        const agg = parts[2] || '';
        const aggM = agg.match(/Aggregations:(\d+)/i);
        if (aggM) aggregations = Number(aggM[1]);
      } else if (event === 'DML_BEGIN') {
        label = `DML ${parts[2] || ''} ${parts[3] || ''}`.trim();
        rows = parseRowsFromTail(parts);
      } else if (event === 'CODE_UNIT_STARTED') {
        label = parts[3] || parts[2] || 'CODE_UNIT';
      } else if (event === 'METHOD_ENTRY' || event === 'CONSTRUCTOR_ENTRY') {
        label = parts[3] || parts[2] || event;
        methodStack.push({ label, apexLine: apexLine ?? '', line: lineNum });
      } else if (event === 'SYSTEM_METHOD_ENTRY') {
        label = parts[2] || 'SYSTEM';
      } else if (event.startsWith('FLOW_')) {
        label = parts.slice(1).join('|') || event.replace(/_BEGIN$/, '');
      } else {
        label = parts.slice(1).join(' ') || event;
      }

      const node = createNode(entryDef.kind, label, lineNum, timestampNs, {
        event,
        apexLine
      });
      const parent = stack[stack.length - 1];
      parent.children.push(node);
      stack.push(node);

      const key = `${entryDef.exit}:${apexLine ?? ''}:${label}`;
      openByKey.set(key, node);

      if (event === 'CODE_UNIT_STARTED') {
        const cu = {
          line: lineNum,
          label,
          durationMs: 0,
          timestampNs,
          exitLine: 0,
          _nodeId: node.id
        };
        codeUnits.push(cu);
        openCodeUnits.set(node.id, cu);
      }

      if (event === 'SOQL_EXECUTE_BEGIN') {
        const ctx = methodStack.length ? methodStack[methodStack.length - 1] : null;
        const soqlRec = {
          line: lineNum,
          query: label,
          rows: 0,
          durationMs: 0,
          aggregations,
          context: ctx ? `${ctx.label}:${ctx.apexLine}` : '',
          apexLine: apexLine ?? '',
          _soqlLimitAtBegin: lastSoqlLimitUsed,
          _aggsLimitAtBegin: lastAggsLimitUsed,
          _nodeId: node.id,
          explain: null
        };
        soql.push(soqlRec);
        openSoqlByLine.set(apexLine ?? lineNum, soqlRec);
      }
      if (event === 'DML_BEGIN') {
        dml.push({
          line: lineNum,
          operation: parts[2] || '',
          object: parts[3] || '',
          rows,
          durationMs: 0,
          _nodeId: node.id
        });
      }
      continue;
    }

    for (const [entryEvent, def] of Object.entries(ENTRY_EXIT)) {
      if (event !== def.exit) continue;
      const apexLine = parseApexLineNumber(parts[1]);
      const labelGuess =
        event === 'SOQL_EXECUTE_END'
          ? ''
          : event === 'DML_END'
            ? ''
            : parts[2] || parts[1] || '';
      const rows = parseRowsFromTail(parts);
      let node = null;
      for (let i = stack.length - 1; i >= 1; i--) {
        const cand = stack[i];
        if (cand.event && ENTRY_EXIT[cand.event]?.exit === event) {
          node = cand;
          stack.length = i;
          break;
        }
      }
      if (!node) {
        issues.push({
          summary: 'Salida sin entrada',
          description: `${event} en línea ${lineNum}`,
          type: 'warning',
          line: lineNum
        });
        continue;
      }
      closeNode(node, timestampNs, rows);
      if (event === 'METHOD_EXIT' || event === 'CONSTRUCTOR_EXIT') {
        if (methodStack.length) methodStack.pop();
      }
      if (event === 'CODE_UNIT_FINISHED') {
        const cu = openCodeUnits.get(node.id);
        if (cu) {
          cu.durationMs = node.durationMs;
          cu.exitLine = lineNum;
          openCodeUnits.delete(node.id);
        }
      }
      if (event === 'SOQL_EXECUTE_END') {
        const rec = soql.find((s) => s._nodeId === node.id);
        if (rec) {
          rec.rows = rows;
          rec.durationMs = node.durationMs;
          const soqlDelta = lastSoqlLimitUsed - (rec._soqlLimitAtBegin ?? lastSoqlLimitUsed);
          const aggsDelta = lastAggsLimitUsed - (rec._aggsLimitAtBegin ?? lastAggsLimitUsed);
          Object.assign(
            rec,
            classifySoqlGovernorImpact(rec.query, soqlDelta, aggsDelta, hasLimitUsageEvents)
          );
        }
      }
      if (event === 'DML_END') {
        const rec = dml.find((d) => d._nodeId === node.id);
        if (rec) {
          rec.rows = rows || rec.rows;
          rec.durationMs = node.durationMs;
        }
      }
      openByKey.delete(`${event}:${apexLine ?? ''}:${labelGuess}`);
      break;
    }
  }

  while (stack.length > 1) {
    const node = stack.pop();
    if (node && !node.exitTimestampNs) {
      node.exitTimestampNs = maxNs || node.timestampNs;
      if (node.exitTimestampNs > node.timestampNs) {
        node.durationMs = Math.round((node.exitTimestampNs - node.timestampNs) / 1_000_000);
      }
      issues.push({
        summary: 'Entrada sin salida',
        description: `${node.event || node.kind}: ${node.label}`,
        type: 'warning',
        line: node.line
      });
    }
  }

  if (root.children.length && root.children[0].timestampNs) {
    root.timestampNs = root.children[0].timestampNs;
  }
  const lastChild = root.children[root.children.length - 1];
  if (lastChild?.exitTimestampNs) {
    root.exitTimestampNs = lastChild.exitTimestampNs;
  } else if (maxNs != null) {
    root.exitTimestampNs = maxNs;
  }
  if (root.exitTimestampNs && root.timestampNs) {
    root.durationMs = Math.round((root.exitTimestampNs - root.timestampNs) / 1_000_000);
  }

  const timeline = [];
  flattenTimeline(root, 0, timeline);

  for (const c of callouts) {
    if (c.durationMs > 0) {
      timeline.push({
        id: freshId(),
        label: c.endpoint || 'Callout',
        type: 'callout',
        depth: 0,
        startNs: c.timestampNs,
        endNs: c.timestampNs + c.durationMs * 1_000_000,
        durationMs: c.durationMs,
        rows: 0,
        line: c.requestLine,
        hasError: c.statusCode >= 400
      });
    }
  }
  timeline.sort((a, b) => a.startNs - b.startNs);

  soql.sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0));

  const profiling = parseCumulativeProfiling(text);
  const records = recordsToObject(recordSets);

  for (const s of soql) {
    delete s._nodeId;
    delete s._soqlLimitAtBegin;
    delete s._aggsLimitAtBegin;
  }
  for (const d of dml) delete d._nodeId;

  const soqlGovernor = buildSoqlGovernorSummary(soql, limitPeak);
  const dedupedIssues = deduplicateIssues(issues);
  const fullLineEvents = buildFullLineEvents(text, lineEvents);
  const testExecutions = executions.filter((e) => e.isTest);
  const isTestLog = testExecutions.length >= 2 || (executions.length >= 2 && testExecutions.length > 0);

  for (const exec of executions) {
    if (!exec.label && exec.codeUnitLabel) exec.label = exec.codeUnitLabel;
    if (!exec.label) exec.label = `Ejecución ${exec.id + 1}`;
  }

  return {
    meta: {
      sizeBytes,
      durationMs: root.durationMs || 0,
      issueCount: dedupedIssues.length,
      lineOffset,
      executionCount: executions.length,
      isTestLog,
      failedExecutionCount: executions.filter((e) => e.hasError).length
    },
    debugLevels,
    user,
    issues: dedupedIssues,
    executions,
    tree: root,
    userDebug,
    soql,
    dml,
    limits,
    limitPeak,
    callouts,
    validations,
    workflows,
    codeUnits,
    profiling,
    records,
    lineEvents: fullLineEvents,
    soqlGovernor,
    soqlDuplicates: groupDuplicateSoql(soql.filter((s) => s.countsTowardSoqlLimit)),
    timeline
  };
}

/**
 * @param {object} node
 * @param {(key: string, params?: object) => string} [t]
 * @param {string} [prefix]
 * @param {boolean} [isLast]
 * @returns {{ lines: string[], foldRanges: { start: number, end: number }[], logLineToRow: Map<number, number>, rowMeta: { hasError: boolean, parentRow: number }[], childrenOf: number[][] }}
 */
export function buildApexLogTreeModel(node, t, prefix = '', isLast = true) {
  const tr = typeof t === 'function' ? t : (k) => k;
  const lines = [];
  const foldRanges = [];
  /** @type {Map<number, number>} */
  const logLineToRow = new Map();
  /** @type {{ hasError: boolean, parentRow: number }[]} */
  const rowMeta = [];
  /** @type {number[][]} */
  const childrenOf = [];

  function walk(n, pfx, last, parentRow = 0) {
    if (!n || n.kind === 'root') {
      const children = n?.children || [];
      for (let i = 0; i < children.length; i++) {
        walk(children[i], '', i === children.length - 1, 0);
      }
      return;
    }
    const startLine = lines.length + 1;
    const branch = pfx + (last ? '└─ ' : '├─ ');
    const kindTag = kindToTag(n.kind, tr);
    const dur = n.durationMs > 0 ? ` (${formatMs(n.durationMs)})` : '';
    const rows =
      n.rows > 0 ? ` — ${tr('apexLogViewer.tree.rows', { n: n.rows })}` : '';
    lines.push(`${branch}[${kindTag}] ${n.label}${dur}${rows}`);
    const currentRow = lines.length;
    rowMeta[currentRow] = { hasError: Boolean(n.hasError), parentRow };
    if (parentRow > 0) {
      if (!childrenOf[parentRow]) childrenOf[parentRow] = [];
      childrenOf[parentRow].push(currentRow);
    }
    if (n.line) logLineToRow.set(n.line, currentRow);
    const childPrefix = pfx + (last ? '   ' : '│  ');
    const children = n.children || [];
    for (let i = 0; i < children.length; i++) {
      walk(children[i], childPrefix, i === children.length - 1, currentRow);
    }
    const endLine = lines.length;
    if (children.length > 0 && endLine > startLine) {
      foldRanges.push({ start: startLine + 1, end: endLine });
    }
  }

  walk(node, prefix, isLast);
  return { lines, foldRanges, logLineToRow, rowMeta, childrenOf };
}

/**
 * Filas del árbol (1-based) visibles con «solo errores»: nodos con error, ancestros y descendientes.
 * @param {{ hasError: boolean, parentRow: number }[]} rowMeta
 * @param {number[][]} childrenOf
 * @param {Map<number, number>} logLineToRow
 * @param {{ line?: number, type?: string }[]} [issues]
 */
export function collectTreeErrorVisibleRows(rowMeta, childrenOf, logLineToRow, issues = []) {
  const lineCount = rowMeta.length - 1;
  if (lineCount <= 0) return new Set();

  const errorRoots = new Set();
  for (let r = 1; r <= lineCount; r++) {
    if (rowMeta[r]?.hasError) errorRoots.add(r);
  }

  for (const issue of issues) {
    if (issue.type !== 'error' || !issue.line) continue;
    const direct = logLineToRow.get(issue.line);
    if (direct) {
      errorRoots.add(direct);
      continue;
    }
    let bestLine = 0;
    let bestRow = 0;
    for (const [logLine, treeRow] of logLineToRow) {
      if (logLine <= issue.line && logLine > bestLine) {
        bestLine = logLine;
        bestRow = treeRow;
      }
    }
    if (bestRow) errorRoots.add(bestRow);
  }

  const visible = new Set();
  function addDescendants(row) {
    for (const child of childrenOf[row] || []) {
      if (visible.has(child)) continue;
      visible.add(child);
      addDescendants(child);
    }
  }

  for (const root of errorRoots) {
    let r = root;
    while (r > 0) {
      visible.add(r);
      r = rowMeta[r]?.parentRow ?? 0;
    }
    addDescendants(root);
  }

  return visible;
}

/**
 * @param {object} node
 * @param {(key: string, params?: object) => string} [t]
 * @returns {string[]}
 */
export function renderApexLogTreeLines(node, t) {
  return buildApexLogTreeModel(node, t).lines;
}

/** @param {string} kind @param {(key: string, params?: object) => string} t */
function kindToTag(kind, t) {
  const key = `apexLogViewer.kind.${kind}`;
  const label = t(key);
  return label !== key ? label : String(kind || 'event');
}

/** @param {number} ms */
export function formatMsPrecise(ms) {
  if (ms < 1) return '0.0 ms';
  if (ms < 1000) return `${(Math.round(ms * 10) / 10).toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** @param {number} ms */
export function formatMs(ms) {
  if (ms < 1) return '<1 ms';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

/** @param {number} bytes */
export function formatLogSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
