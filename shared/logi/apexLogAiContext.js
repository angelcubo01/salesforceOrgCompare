const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * @param {unknown} text
 * @param {number} max
 */
export function truncateText(text, max = 240) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/**
 * @param {unknown} text
 */
export function redactPii(text) {
  return String(text ?? '').replace(EMAIL_RE, '[email]');
}

/**
 * @param {object} row
 * @param {number} maxFields
 */
function slimRecord(row, maxFields = 12) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  const keys = Object.keys(row).filter((k) => k !== 'attributes');
  for (const key of keys.slice(0, maxFields)) {
    const val = row[key];
    if (val != null && typeof val === 'object') {
      out[key] = truncateText(JSON.stringify(val), 120);
    } else {
      out[key] = truncateText(redactPii(val), 120);
    }
  }
  if (keys.length > maxFields) out._truncatedFields = keys.length - maxFields;
  return out;
}

/**
 * @param {object | null | undefined} parsed
 * @param {{ orgId?: string, logId?: string, instanceUrl?: string }} [ctx]
 */
export function buildInitialLogContext(parsed, ctx = {}) {
  if (!parsed) {
    return { context: { orgId: ctx.orgId || null, logId: ctx.logId || null }, empty: true };
  }

  const issues = (parsed.issues || []).slice(0, 20).map((issue) => ({
    line: issue.line,
    type: issue.type,
    message: truncateText(redactPii(issue.message || issue.text || ''), 200),
    severity: issue.severity
  }));

  const executions = (parsed.executions || [])
    .filter((e) => e.hasError)
    .slice(0, 10)
    .map((e) => ({
      id: e.id,
      label: truncateText(e.label, 80),
      hasError: e.hasError,
      durationMs: e.durationMs,
      startLine: e.startLine,
      endLine: e.endLine
    }));

  const soql = (parsed.soql || []).slice(0, 15).map((q) => ({
    line: q.line,
    text: truncateText(q.text || q.query, 180),
    rows: q.rows,
    timeMs: q.timeMs ?? q.elapsed,
    countsTowardSoqlLimit: q.countsTowardSoqlLimit
  }));

  const dml = (parsed.dml || []).slice(0, 15).map((d) => ({
    line: d.line,
    type: d.type,
    object: d.object || d.sobject,
    rows: d.rows,
    timeMs: d.timeMs ?? d.elapsed
  }));

  const limits = [];
  for (const entry of parsed.limits || []) {
    const used = Number(entry.used ?? entry.value);
    const max = Number(entry.max ?? entry.limit);
    if (!Number.isFinite(used) || !Number.isFinite(max) || max <= 0) continue;
    const pct = used / max;
    if (pct >= 0.7) {
      limits.push({
        name: entry.name || entry.type,
        used,
        max,
        pct: Math.round(pct * 100)
      });
    }
  }

  const callouts = (parsed.callouts || []).slice(0, 10).map((c) => ({
    line: c.line,
    method: c.method,
    url: truncateText(redactPii(c.url), 120),
    status: c.status,
    timeMs: c.timeMs
  }));

  const validations = (parsed.validations || []).slice(0, 10).map((v) => ({
    line: v.line,
    object: v.object,
    field: v.field,
    message: truncateText(redactPii(v.message), 160)
  }));

  const userDebug = (parsed.userDebug || [])
    .filter((d) => String(d.text || d.message || '').trim())
    .slice(-20)
    .map((d) => ({
      line: d.line,
      text: truncateText(redactPii(d.text || d.message), 160)
    }));

  /** @type {Record<string, unknown>} */
  const out = {
    meta: {
      sizeBytes: parsed.meta?.sizeBytes,
      durationMs: parsed.meta?.durationMs,
      issueCount: parsed.meta?.issueCount,
      executionCount: parsed.meta?.executionCount,
      isTestLog: parsed.meta?.isTestLog,
      failedExecutionCount: parsed.meta?.failedExecutionCount
    },
    context: {
      orgId: ctx.orgId || null,
      logId: ctx.logId || null,
      instanceUrl: ctx.instanceUrl ? truncateText(ctx.instanceUrl, 80) : null
    },
    issues,
    executions,
    soql,
    dml,
    limits: limits.slice(0, 15),
    callouts,
    validations,
    userDebug,
    soqlDuplicates: (parsed.soqlDuplicates || []).slice(0, 5).map((g) => ({
      count: g.count,
      query: truncateText(g.query || g.text, 120)
    }))
  };
  const resumeSummary =
    typeof ctx.resumeSummary === 'string' ? ctx.resumeSummary.trim() : '';
  if (resumeSummary) {
    out.resumeSummary = truncateText(resumeSummary, 8000);
  }
  return out;
}

/**
 * @param {string} rawText
 * @param {number} startLine 1-based
 * @param {number} endLine 1-based
 * @param {number} maxLines
 */
export function fetchLogLines(rawText, startLine, endLine, maxLines = 80) {
  const lines = String(rawText || '').split(/\r?\n/);
  const start = Math.max(1, Math.min(startLine, lines.length));
  let end = Math.max(start, Math.min(endLine, lines.length));
  if (end - start + 1 > maxLines) {
    end = start + maxLines - 1;
  }
  const slice = lines.slice(start - 1, end).map((line) => redactPii(line));
  return {
    startLine: start,
    endLine: end,
    truncated: end - start + 1 >= maxLines,
    lines: slice
  };
}

const PARSED_SECTIONS = new Set([
  'soql',
  'dml',
  'issues',
  'timeline',
  'profiling',
  'callouts',
  'validations',
  'limits',
  'userDebug',
  'executions'
]);

/**
 * @param {object | null | undefined} parsed
 * @param {string} section
 * @param {number} limit
 */
export function fetchParsedSection(parsed, section, limit = 30) {
  const key = String(section || '').trim();
  if (!PARSED_SECTIONS.has(key) || !parsed) {
    return { section: key, error: 'unknown_section' };
  }
  const data = parsed[key];
  if (!Array.isArray(data)) {
    return { section: key, data: data ?? null };
  }
  return {
    section: key,
    count: data.length,
    items: data.slice(0, limit).map((item) => {
      if (!item || typeof item !== 'object') return item;
      const slim = { ...item };
      for (const k of Object.keys(slim)) {
        if (typeof slim[k] === 'string') slim[k] = truncateText(redactPii(slim[k]), 200);
      }
      return slim;
    }),
    truncated: data.length > limit
  };
}

/**
 * Search raw log text line by line.
 * @param {string} rawText
 * @param {string} query
 * @param {{ maxResults?: number, caseSensitive?: boolean }} [opts]
 */
export function searchLog(rawText, query, opts = {}) {
  const q = String(query ?? '');
  if (!q.trim()) {
    return { matches: [], truncated: false, error: 'empty_query' };
  }
  const maxResults = Math.min(40, Math.max(1, Math.floor(Number(opts.maxResults) || 20)));
  const caseSensitive = opts.caseSensitive === true;
  const needle = caseSensitive ? q : q.toLowerCase();
  const lines = String(rawText || '').split(/\r?\n/);
  /** @type {{ line: number, text: string }[]} */
  const matches = [];
  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const hay = caseSensitive ? rawLine : rawLine.toLowerCase();
    if (!hay.includes(needle)) continue;
    matches.push({
      line: i + 1,
      text: truncateText(redactPii(rawLine), 240)
    });
    if (matches.length > maxResults) break;
  }
  const truncated = matches.length > maxResults;
  return {
    matches: truncated ? matches.slice(0, maxResults) : matches,
    truncated
  };
}

/**
 * @param {object} item
 * @param {number} start
 * @param {number} end
 */
function lineOverlapsRange(item, start, end) {
  const line = Number(item?.line);
  if (Number.isFinite(line) && line >= start && line <= end) return true;
  const startLine = Number(item?.startLine);
  const endLine = Number(item?.endLine);
  if (Number.isFinite(startLine) && Number.isFinite(endLine)) {
    return startLine <= end && endLine >= start;
  }
  return false;
}

/**
 * Raw lines around a center line plus overlapping issues/executions from parsed.
 * @param {string} rawText
 * @param {object | null | undefined} parsed
 * @param {number} line
 * @param {{ radius?: number, reason?: string }} [opts]
 */
export function getStackAround(rawText, parsed, line, opts = {}) {
  const center = Math.max(1, Math.floor(Number(line) || 1));
  const radius = Math.min(40, Math.max(0, Math.floor(Number(opts.radius) || 15)));
  const start = Math.max(1, center - radius);
  const end = center + radius;
  const fetched = fetchLogLines(rawText, start, end, radius * 2 + 1);
  const rangeStart = fetched.startLine;
  const rangeEnd = fetched.endLine;

  const nearby_issues = (parsed?.issues || [])
    .filter((issue) => lineOverlapsRange(issue, rangeStart, rangeEnd))
    .slice(0, 20)
    .map((issue) => ({
      line: issue.line,
      type: issue.type,
      message: truncateText(redactPii(issue.message || issue.text || issue.summary || ''), 200),
      severity: issue.severity
    }));

  const nearby_executions = (parsed?.executions || [])
    .filter((exec) => lineOverlapsRange(exec, rangeStart, rangeEnd))
    .slice(0, 15)
    .map((e) => ({
      id: e.id,
      label: truncateText(e.label || e.codeUnitLabel || '', 80),
      hasError: e.hasError,
      durationMs: e.durationMs,
      startLine: e.startLine,
      endLine: e.endLine
    }));

  return {
    center_line: center,
    lines: fetched.lines.map((text, idx) => ({
      line: rangeStart + idx,
      text: truncateText(text, 240)
    })),
    nearby_issues,
    nearby_executions
  };
}

/**
 * @param {object} a
 * @param {object} b
 */
function soqlImpactScore(a) {
  const rows = Number(a?.rows) || 0;
  const time = Number(a?.timeMs ?? a?.elapsed ?? a?.durationMs) || 0;
  return rows * 1000 + time;
}

/**
 * Top SOQL/DML/profiling/duplicates hotspots from parsed log.
 * @param {object | null | undefined} parsed
 * @param {{ reason?: string }} [opts]
 */
export function getHotspots(parsed, opts = {}) {
  void opts;
  const limit = 10;
  if (!parsed) {
    return {
      soql: [],
      dml: [],
      profiling: [],
      soqlDuplicates: [],
      empty: true
    };
  }

  const soql = [...(parsed.soql || [])]
    .sort((a, b) => soqlImpactScore(b) - soqlImpactScore(a))
    .slice(0, limit)
    .map((q) => ({
      line: q.line,
      text: truncateText(q.text || q.query, 180),
      rows: q.rows,
      timeMs: q.timeMs ?? q.elapsed ?? q.durationMs,
      countsTowardSoqlLimit: q.countsTowardSoqlLimit
    }));

  const dml = [...(parsed.dml || [])]
    .sort((a, b) => {
      const rowsDiff = (Number(b?.rows) || 0) - (Number(a?.rows) || 0);
      if (rowsDiff) return rowsDiff;
      return (
        (Number(b?.timeMs ?? b?.elapsed ?? b?.durationMs) || 0) -
        (Number(a?.timeMs ?? a?.elapsed ?? a?.durationMs) || 0)
      );
    })
    .slice(0, limit)
    .map((d) => ({
      line: d.line,
      type: d.type,
      object: d.object || d.sobject,
      rows: d.rows,
      timeMs: d.timeMs ?? d.elapsed ?? d.durationMs
    }));

  const profilingSrc = parsed.profiling || {};
  /** @type {object[]} */
  const profilingFlat = [];
  for (const kind of ['soql', 'dml', 'methods']) {
    for (const entry of profilingSrc[kind] || []) {
      profilingFlat.push({
        kind,
        location: truncateText(entry.location || '', 120),
        detail: truncateText(redactPii(entry.detail || ''), 160),
        apexLine: entry.apexLine,
        executions: entry.executions,
        totalMs: entry.totalMs
      });
    }
  }
  profilingFlat.sort((a, b) => (Number(b.totalMs) || 0) - (Number(a.totalMs) || 0));
  const profiling = profilingFlat.slice(0, limit);

  const soqlDuplicates = [...(parsed.soqlDuplicates || [])]
    .sort((a, b) => (Number(b?.count) || 0) - (Number(a?.count) || 0))
    .slice(0, limit)
    .map((g) => ({
      count: g.count,
      query: truncateText(g.query || g.text, 120)
    }));

  return { soql, dml, profiling, soqlDuplicates };
}

/**
 * UI bridge: signal the client to highlight a line range.
 * @param {number} startLine
 * @param {number} endLine
 * @param {string} [_reason]
 */
export function highlightLogLines(startLine, endLine, _reason) {
  void _reason;
  const start = Math.max(1, Math.floor(Number(startLine) || 1));
  const end = Math.max(start, Math.floor(Number(endLine) || start));
  return { ok: true, start_line: start, end_line: end, action: 'highlight' };
}

/**
 * Añade señales de reintento a resultados de herramientas locales del log.
 * @param {string} toolName
 * @param {unknown} result
 * @param {'es' | 'en'} [lang]
 */
export function enrichLocalToolResult(toolName, result, lang = 'es') {
  const es = lang === 'en';
  /** @type {Record<string, unknown>} */
  const out =
    result && typeof result === 'object' && !Array.isArray(result)
      ? { ...(/** @type {Record<string, unknown>} */ (result)) }
      : { data: result };

  if (toolName === 'fetch_parsed_section') {
    if (out.error === 'unknown_section') {
      out.ok = false;
      out.retryable = true;
      out.insufficient = true;
      out.retry_hint = es
        ? 'Invalid section. Valid values: soql, dml, issues, timeline, profiling, callouts, validations, limits, userDebug, executions. Call fetch_parsed_section again with a valid section.'
        : 'Sección inválida. Valores válidos: soql, dml, issues, timeline, profiling, callouts, validations, limits, userDebug, executions. Vuelve a llamar fetch_parsed_section con una sección válida.';
    } else if (out.count === 0 || (Array.isArray(out.items) && out.items.length === 0)) {
      out.ok = true;
      out.insufficient = true;
      out.retry_hint = es
        ? 'Section is empty. Try another section, fetch_log_lines around relevant lines, or broaden your search before answering.'
        : 'La sección está vacía. Prueba otra sección, fetch_log_lines en líneas relevantes o amplía la búsqueda antes de responder.';
    } else if (out.truncated === true) {
      out.insufficient = true;
      out.retry_hint = es
        ? 'Section truncated. Call fetch_log_lines for specific line ranges or fetch_parsed_section on a narrower slice if you need more detail.'
        : 'Sección truncada. Usa fetch_log_lines en rangos concretos o profundiza con líneas adyacentes si necesitas más detalle.';
    } else {
      out.ok = true;
    }
    return out;
  }

  if (toolName === 'fetch_log_lines') {
    const lines = Array.isArray(out.lines) ? out.lines : [];
    if (lines.length === 0) {
      out.ok = false;
      out.retryable = true;
      out.insufficient = true;
      out.retry_hint = es
        ? 'No lines returned. Check start_line/end_line (1-based) and try an adjacent or wider range with fetch_log_lines.'
        : 'No se devolvieron líneas. Revisa start_line/end_line (base 1) y prueba un rango adyacente o más amplio con fetch_log_lines.';
    } else if (out.truncated === true) {
      out.ok = true;
      out.insufficient = true;
      out.retry_hint = es
        ? 'Line range truncated (max 80). Fetch the next chunk or a narrower range around the key stack trace.'
        : 'Rango truncado (máx. 80 líneas). Pide el siguiente bloque o un rango más estrecho alrededor del stack trace.';
    } else {
      out.ok = true;
    }
    return out;
  }

  if (toolName === 'search_log') {
    if (out.error === 'empty_query') {
      out.ok = false;
      out.retryable = true;
      out.insufficient = true;
      out.retry_hint = es
        ? 'Empty query. Call search_log again with a non-empty query string (exception type, class name, SOQL fragment, etc.).'
        : 'Consulta vacía. Vuelve a llamar search_log con un query no vacío (tipo de excepción, clase, fragmento SOQL, etc.).';
    } else if (!Array.isArray(out.matches) || out.matches.length === 0) {
      out.ok = true;
      out.insufficient = true;
      out.retry_hint = es
        ? 'No matches. Try a shorter substring, toggle case_sensitive, or use fetch_parsed_section / get_hotspots before answering.'
        : 'Sin coincidencias. Prueba un substring más corto, case_sensitive, o usa fetch_parsed_section / get_hotspots antes de responder.';
    } else if (out.truncated === true) {
      out.ok = true;
      out.insufficient = true;
      out.retry_hint = es
        ? 'Results truncated. Narrow the query or call get_stack_around / fetch_log_lines on specific match lines.'
        : 'Resultados truncados. Acota el query o usa get_stack_around / fetch_log_lines en líneas concretas.';
    } else {
      out.ok = true;
    }
    return out;
  }

  if (toolName === 'get_stack_around') {
    const lines = Array.isArray(out.lines) ? out.lines : [];
    if (lines.length === 0) {
      out.ok = false;
      out.retryable = true;
      out.insufficient = true;
      out.retry_hint = es
        ? 'No lines around center. Check line (1-based) and retry get_stack_around with a valid line or larger radius.'
        : 'Sin líneas alrededor del centro. Revisa line (base 1) y reintenta get_stack_around con una línea válida o mayor radius.';
    } else {
      out.ok = true;
      if (
        (!Array.isArray(out.nearby_issues) || out.nearby_issues.length === 0) &&
        (!Array.isArray(out.nearby_executions) || out.nearby_executions.length === 0)
      ) {
        out.insufficient = true;
        out.retry_hint = es
          ? 'No overlapping issues/executions. Widen radius, search_log for EXCEPTION, or fetch_parsed_section → issues.'
          : 'Sin issues/executions solapados. Amplía radius, usa search_log para EXCEPTION o fetch_parsed_section → issues.';
      }
    }
    return out;
  }

  if (toolName === 'get_hotspots') {
    const soql = Array.isArray(out.soql) ? out.soql : [];
    const dml = Array.isArray(out.dml) ? out.dml : [];
    const profiling = Array.isArray(out.profiling) ? out.profiling : [];
    const dups = Array.isArray(out.soqlDuplicates) ? out.soqlDuplicates : [];
    if (out.empty || (soql.length === 0 && dml.length === 0 && profiling.length === 0 && dups.length === 0)) {
      out.ok = true;
      out.insufficient = true;
      out.retry_hint = es
        ? 'No hotspots found. Use fetch_parsed_section on soql/dml/limits or search_log for SOQL_EXECUTE / DML_BEGIN.'
        : 'Sin hotspots. Usa fetch_parsed_section en soql/dml/limits o search_log para SOQL_EXECUTE / DML_BEGIN.';
    } else {
      out.ok = true;
    }
    return out;
  }

  if (toolName === 'highlight_log_lines') {
    if (out.action === 'highlight' && out.start_line != null) {
      out.ok = true;
    } else {
      out.ok = false;
      out.retryable = true;
      out.insufficient = true;
      out.retry_hint = es
        ? 'Highlight failed. Pass valid start_line and end_line (1-based) and call highlight_log_lines again.'
        : 'Highlight fallido. Pasa start_line y end_line válidos (base 1) y vuelve a llamar highlight_log_lines.';
    }
    return out;
  }

  out.ok = out.ok !== false;
  return out;
}

/**
 * @param {object | null | undefined} queryRes
 * @param {'es' | 'en'} [lang]
 */
export function formatOrgQueryToolResult(queryRes, lang = 'es') {
  const es = lang === 'en';
  const errText = queryRes?.error || queryRes?.reason || 'query_failed';
  if (errText === 'user_denied' || queryRes?.reason === 'user_denied') {
    return {
      ok: false,
      retryable: false,
      error: 'user_denied',
      message: es
        ? 'The user denied this org query. Continue with log context only; do not propose the same query again unless the user asks.'
        : 'El usuario rechazó esta consulta. Continúa solo con el log; no propongas la misma consulta salvo que el usuario lo pida.'
    };
  }
  if (!queryRes?.ok) {
    return {
      ok: false,
      retryable: true,
      insufficient: true,
      error: queryRes?.error || queryRes?.reason || 'query_failed',
      errorCode: queryRes?.errorCode || undefined,
      retry_hint: es
        ? 'Query failed. Read the Salesforce error, fix query_text or variant (rest-soql, tooling-soql, rest-sosl), and call org_query again. Do not answer the user until you retried or explain why not.'
        : 'Consulta fallida. Lee el error de Salesforce, corrige query_text o variant (rest-soql, tooling-soql, rest-sosl) y vuelve a llamar org_query. No respondas al usuario hasta reintentar o explicar por qué no.'
    };
  }

  const records = queryRes.records || [];
  const totalSize = queryRes.totalSize ?? records.length;
  /** @type {Record<string, unknown>} */
  const out = {
    ok: true,
    records,
    totalSize,
    done: queryRes.done !== false
  };

  if (totalSize === 0 || records.length === 0) {
    out.insufficient = true;
    out.retryable = true;
    out.retry_hint = es
      ? 'Zero records. Broaden filters, fix object/field API names, or switch variant, then call org_query again.'
      : 'Cero registros. Amplía filtros, corrige API names de objeto/campo o cambia variant, y vuelve a llamar org_query.';
  } else if (queryRes.done === false) {
    out.insufficient = true;
    out.retry_hint = es
      ? 'Partial result set. Narrow the query with filters or LIMIT, then call org_query again if needed.'
      : 'Resultado parcial. Acota la consulta con filtros o LIMIT y vuelve a llamar org_query si hace falta.';
  }

  return out;
}

/**
 * @param {unknown[]} records
 * @param {number} max
 */
export function slimQueryRecords(records, max = 50) {
  return (records || []).slice(0, max).map((r) => slimRecord(r));
}

/** OpenAI-compatible tool definitions for Logi. */
export function buildLogiToolDefinitions({ allowOrgQuery = true } = {}) {
  const tools = [
    {
      type: 'function',
      function: {
        name: 'fetch_log_lines',
        description:
          'Fetch raw log lines by line number range (max 80 lines). If the result is empty, truncated, or insufficient, call again with a corrected or adjacent range before answering.',
        parameters: {
          type: 'object',
          properties: {
            start_line: { type: 'integer', description: 'Start line (1-based)' },
            end_line: { type: 'integer', description: 'End line (1-based)' },
            reason: { type: 'string', description: 'Why these lines are needed' }
          },
          required: ['start_line', 'end_line', 'reason']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'fetch_parsed_section',
        description:
          'Fetch a parsed section of the log (soql, dml, issues, timeline, profiling, etc.). If empty, unknown, or truncated, try another section or fetch_log_lines before answering.',
        parameters: {
          type: 'object',
          properties: {
            section: {
              type: 'string',
              enum: [...PARSED_SECTIONS]
            },
            reason: { type: 'string' }
          },
          required: ['section', 'reason']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_log',
        description:
          'Search raw Apex log text line by line for a substring. Returns matching line numbers and truncated text. If empty or truncated, refine the query or follow up with get_stack_around / fetch_log_lines.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Substring to find in the raw log' },
            max_results: {
              type: 'integer',
              description: 'Max matches to return (default 20, max 40)'
            },
            case_sensitive: {
              type: 'boolean',
              description: 'Case-sensitive match (default false)'
            }
          },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_stack_around',
        description:
          'Fetch raw log lines around a center line plus any overlapping issues/executions from the parsed log. Use after locating an exception or key line.',
        parameters: {
          type: 'object',
          properties: {
            line: { type: 'integer', description: 'Center line (1-based)' },
            radius: {
              type: 'integer',
              description: 'Lines before/after center (default 15, max 40)'
            },
            reason: { type: 'string' }
          },
          required: ['line', 'reason']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_hotspots',
        description:
          'Return top SOQL (by rows/time), DML, cumulative profiling entries, and soqlDuplicates from the parsed log (~10 each). Prefer this for performance analysis.',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string' }
          },
          required: ['reason']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'highlight_log_lines',
        description:
          'UI bridge: ask the viewer to highlight a log line range for the user. Does not return log content; use after identifying important lines.',
        parameters: {
          type: 'object',
          properties: {
            start_line: { type: 'integer', description: 'Start line (1-based)' },
            end_line: { type: 'integer', description: 'End line (1-based)' },
            reason: { type: 'string' }
          },
          required: ['start_line', 'end_line', 'reason']
        }
      }
    }
  ];

  if (allowOrgQuery) {
    tools.push(
      {
        type: 'function',
        function: {
          name: 'org_query',
          description:
            'Run a read-only SOQL/SOSL query against the Salesforce org. Requires explicit user approval. If it fails or returns no useful data, fix the query and call org_query again.',
          parameters: {
            type: 'object',
            properties: {
              variant: {
                type: 'string',
                enum: ['rest-soql', 'tooling-soql', 'rest-sosl']
              },
              query_text: { type: 'string' },
              reason: { type: 'string' }
            },
            required: ['variant', 'query_text', 'reason']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_apex_source',
          description:
            'Read-only Tooling query for ApexClass or ApexTrigger Body by API name. Requires explicit user approval before running.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Apex class or trigger API name' },
              type: {
                type: 'string',
                enum: ['ApexClass', 'ApexTrigger']
              },
              reason: { type: 'string' }
            },
            required: ['name', 'type', 'reason']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_flow_metadata',
          description:
            'Read-only Tooling query for FlowDefinition and active Flow version metadata by API name (DeveloperName). Requires explicit user approval before running.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Flow API name (DeveloperName)' },
              reason: { type: 'string' }
            },
            required: ['name', 'reason']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'describe_sobject_fields',
          description:
            'Describe fields on an sObject in the connected org. Requires explicit user approval before running.',
          parameters: {
            type: 'object',
            properties: {
              sobject: { type: 'string', description: 'sObject API name (e.g. Account)' },
              reason: { type: 'string' }
            },
            required: ['sobject', 'reason']
          }
        }
      }
    );
  }

  return tools;
}

/** @type {Record<'es' | 'en', Record<string, string>>} */
const QUICK_ACTION_USER_MESSAGES = {
  es: {
    debug_errors: `Analiza errores y excepciones en este log de Apex.

Antes de responder:
1. fetch_parsed_section → "issues" y "userDebug" (líneas ERROR, FATAL, EXCEPTION).
2. fetch_log_lines alrededor del stack trace y de la primera excepción no capturada.
3. Si hay varias excepciones, prioriza la raíz (la más temprana en el flujo).

Responde con:
- Excepción principal (tipo, mensaje, línea del log y clase/método Apex si aparece).
- Causa raíz probable (ordenada por probabilidad, sin inventar datos).
- Cadena de eventos que llevó al fallo.
- Pasos concretos de depuración en Salesforce (logs, tests, puntos de ruptura).
- Si aplica: trigger, flow, callout o límite de gobernador implicado.`,

    explain_flow: `Explica el flujo de ejecución de este log de Apex.

Antes de responder:
1. fetch_parsed_section → "executions", "timeline" y "userDebug".
2. fetch_log_lines en los bloques CODE_UNIT_STARTED / FINISHED más relevantes.
3. Identifica el punto de entrada (trigger, batch, schedulable, test, API).
4. Si aparecen flows de Salesforce, usa get_flow_metadata (con aprobación) para contrastar con la definición en la org.

Responde con:
- Punto de entrada y contexto (usuario, test, async).
- Secuencia cronológica de unidades ejecutadas (clase → método → triggers/DML hijos).
- Dónde se concentra el tiempo o la complejidad.
- Problema o anomalía del flujo, si existe, con líneas del log.
- Diagrama textual breve del flujo si ayuda.`,

    soql_dml: `Analiza SOQL y DML de este log con foco en rendimiento y límites.

Antes de responder:
1. fetch_parsed_section → "soql", "dml" y "limits".
2. Revisa duplicados en soqlDuplicates del contexto inicial.
3. fetch_log_lines en consultas con muchas filas, errores o DML en bucle.

Responde con:
- Top consultas/DML por impacto (filas, repeticiones, tiempo si consta).
- Patrones problemáticos: SOQL en bucle, DML parcial, consultas duplicadas, full table scan probable.
- Consumo de límites de gobernador relacionado.
- Recomendaciones concretas (bulkificación, caché, selectividad, índices, reducir round-trips).
- Cita líneas del log como L123 (nunca uses L-prefijo para líneas de clase Apex).`,

    test_failure: `Este log corresponde a una ejecución de test Apex que falló o es sospechosa.

Antes de responder:
1. Confirma en meta si isTestLog o failedExecutionCount > 0.
2. fetch_parsed_section → "issues", "userDebug" y "executions".
3. fetch_log_lines en el assertion failure, System.AssertException o mensaje de test.

Responde con:
- Qué test/clase/método falló y mensaje de error exacto.
- Assertion o excepción con línea del log (formato L123) y línea Apex si aparece ("línea N de ClassName", sin prefijo L).
- Datos de prueba (@TestSetup, mocks) que podrían explicar el fallo.
- Hipótesis ordenadas y cómo reproducir localmente.
- Cambios mínimos sugeridos para estabilizar el test.`,

    limits: `Revisa límites de gobernador y riesgo de LIMIT_EXCEEDED en este log.

Antes de responder:
1. fetch_parsed_section → "limits", "soql", "dml" y "callouts".
2. Compara con meta (durationMs, sizeBytes) si el log es muy grande o lento.
3. fetch_log_lines donde aparezcan MAX_* o CUMULATIVE_LIMIT_USAGE si hace falta.

Responde con:
- Límites más consumidos (SOQL rows/queries, DML rows, CPU, heap, callouts).
- Porcentaje estimado del límite si los datos lo permiten.
- Operaciones concretas que más consumen (con líneas del log).
- Riesgo: bajo / medio / alto y qué límite fallaría primero.
- Acciones para reducir consumo sin cambiar la funcionalidad de negocio.`,

    suggest_fix: `Propón una corrección concreta para el problema principal de este log.

Antes de responder:
1. Identifica el problema dominante (error, límite, rendimiento o lógica).
2. Usa fetch_parsed_section y fetch_log_lines para evidencia antes de sugerir código.
3. No propongas consultar la org salvo que sea imprescindible para verificar un dato.

Responde con:
- Problema resumido en una frase con evidencia del log.
- Causa raíz más probable.
- Fix recomendado (pasos verificables, pseudocódigo o snippet Apex breve si aporta).
- Cómo validar el fix (test, escenario manual, qué revisar en el siguiente log).
- Riesgos o efectos secundarios del cambio.`,

    callouts: `Analiza los callouts HTTP de este log de Apex.

Antes de responder:
1. fetch_parsed_section → "callouts" (y "userDebug" si aporta contexto).
2. search_log o get_stack_around alrededor de callouts con status ≥ 400 o lentos.
3. highlight_log_lines en el callout más relevante si ayuda al usuario a verlo en el visor.

Responde con:
- Lista de callouts (método, endpoint, status, tiempo si consta) priorizando fallos.
- Causa probable de errores HTTP o timeouts (sin inventar cuerpos de respuesta).
- Relación con el flujo Apex (antes/después de DML, en bucle, etc.).
- Recomendaciones concretas (reintentos, timeouts, bulk, mocks en tests).
- Cita líneas del log como L123 (líneas de clase: "línea N de ClassName", sin L).`,

    validations: `Revisa reglas de validación y fallos de validación en este log.

Antes de responder:
1. fetch_parsed_section → "validations" e "issues".
2. get_stack_around o fetch_log_lines alrededor de validaciones fallidas y del DML asociado.
3. Si hace falta contexto de campos, puedes proponer describe_sobject_fields (requiere aprobación).

Responde con:
- Qué reglas fallaron o se evaluaron (objeto, campo, mensaje, línea).
- Si el fallo es de negocio esperado o un bug de datos/código.
- Cadena: entrada → DML → validación → resultado.
- Pasos para corregir datos, regla o código Apex.
- Cita líneas del log como L123 (no L-prefijo para líneas de clase).`,

    hotspots: `Identifica hotspots de rendimiento en este log (SOQL, DML, profiling, duplicados).

Antes de responder:
1. get_hotspots (obligatorio) para top SOQL/DML/profiling/soqlDuplicates.
2. fetch_parsed_section → "limits" si el consumo de gobernadores es relevante.
3. get_stack_around o fetch_log_lines en las 2–3 operaciones más costosas; highlight_log_lines si conviene.

Responde con:
- Top operaciones por impacto (filas, tiempo, repeticiones).
- Patrones: SOQL/DML en bucle, consultas duplicadas, métodos lentos.
- Relación con límites de gobernador.
- Recomendaciones priorizadas (bulkificación, selectividad, caché).
- Líneas del log en cada hallazgo.`
  },
  en: {
    debug_errors: `Analyze errors and exceptions in this Apex debug log.

Before answering:
1. fetch_parsed_section → "issues" and "userDebug" (ERROR, FATAL, EXCEPTION lines).
2. fetch_log_lines around the stack trace and the first uncaught exception.
3. If multiple exceptions exist, prioritize the root cause (earliest in the flow).

Respond with:
- Primary exception (type, message, log line, and Apex class/method if present).
- Likely root cause ranked by probability without inventing data.
- Event chain that led to the failure.
- Concrete Salesforce debugging steps (logs, tests, breakpoints).
- Whether a trigger, flow, callout, or governor limit is involved.`,

    explain_flow: `Explain the execution flow of this Apex debug log.

Before answering:
1. fetch_parsed_section → "executions", "timeline", and "userDebug".
2. fetch_log_lines on the most relevant CODE_UNIT_STARTED / FINISHED blocks.
3. Identify the entry point (trigger, batch, schedulable, test, API).
4. If Salesforce flows appear, use get_flow_metadata (with approval) to compare against the org definition.

Respond with:
- Entry point and context (user, test, async).
- Chronological sequence of executed units (class → method → child triggers/DML).
- Where time or complexity concentrates.
- Flow issue or anomaly, if any, with log line references.
- A brief text diagram of the flow if helpful.`,

    soql_dml: `Analyze SOQL and DML in this log with focus on performance and limits.

Before answering:
1. fetch_parsed_section → "soql", "dml", and "limits".
2. Review duplicates in soqlDuplicates from the initial context.
3. fetch_log_lines for high-row queries, errors, or DML inside loops.

Respond with:
- Top queries/DML by impact (rows, repetitions, elapsed time if stated).
- Problematic patterns: SOQL in loop, partial DML, duplicate queries, likely full scans.
- Related governor limit consumption.
- Concrete recommendations (bulkification, caching, selectivity, indexes, fewer round-trips).
- Cite debug-log lines as L123 (never L-prefix Apex class source lines).`,

    test_failure: `This log is from a failed or suspicious Apex test run.

Before answering:
1. Confirm isTestLog or failedExecutionCount > 0 in meta.
2. fetch_parsed_section → "issues", "userDebug", and "executions".
3. fetch_log_lines at assertion failure, System.AssertException, or test error message.

Respond with:
- Which test/class/method failed and the exact error message.
- Assertion or exception with log line and Apex line if available.
- Test data (@TestSetup, mocks) that may explain the failure.
- Ranked hypotheses and how to reproduce locally.
- Minimal changes suggested to stabilize the test.`,

    limits: `Review governor limits and LIMIT_EXCEEDED risk in this log.

Before answering:
1. fetch_parsed_section → "limits", "soql", "dml", and "callouts".
2. Compare with meta (durationMs, sizeBytes) if the log is large or slow.
3. fetch_log_lines where MAX_* or CUMULATIVE_LIMIT_USAGE appear if needed.

Respond with:
- Most consumed limits (SOQL rows/queries, DML rows, CPU, heap, callouts).
- Estimated percentage of the limit when data allows.
- Concrete operations that consume the most (with log lines).
- Risk: low / medium / high and which limit would fail first.
- Actions to reduce usage without changing business behavior.`,

    suggest_fix: `Propose a concrete fix for the main problem in this log.

Before answering:
1. Identify the dominant issue (error, limit, performance, or logic).
2. Use fetch_parsed_section and fetch_log_lines for evidence before suggesting code.
3. Do not propose querying the org unless essential to verify a fact.

Respond with:
- One-sentence problem summary with log evidence.
- Most likely root cause.
- Recommended fix (verifiable steps, brief pseudocode or Apex snippet if useful).
- How to validate the fix (test, manual scenario, what to check in the next log).
- Risks or side effects of the change.`,

    callouts: `Analyze HTTP callouts in this Apex debug log.

Before answering:
1. fetch_parsed_section → "callouts" (and "userDebug" if useful).
2. search_log or get_stack_around around callouts with status ≥ 400 or slow ones.
3. highlight_log_lines on the most relevant callout if it helps the user see it in the viewer.

Respond with:
- Callout list (method, endpoint, status, time if present), prioritizing failures.
- Likely cause of HTTP errors or timeouts (do not invent response bodies).
- Relationship to the Apex flow (before/after DML, in a loop, etc.).
- Concrete recommendations (retries, timeouts, bulk, test mocks).
- Cite debug-log lines as L123 (class source: "line N in ClassName", no L-prefix).`,

    validations: `Review validation rules and validation failures in this log.

Before answering:
1. fetch_parsed_section → "validations" and "issues".
2. get_stack_around or fetch_log_lines around failed validations and related DML.
3. If field context is needed, you may propose describe_sobject_fields (requires approval).

Respond with:
- Which rules failed or ran (object, field, message, line).
- Whether the failure is expected business behavior or a data/code bug.
- Chain: entry → DML → validation → outcome.
- Steps to fix data, the rule, or Apex code.
- Cite debug-log lines as L123 (no L-prefix for class source lines).`,

    hotspots: `Identify performance hotspots in this log (SOQL, DML, profiling, duplicates).

Before answering:
1. get_hotspots (required) for top SOQL/DML/profiling/soqlDuplicates.
2. fetch_parsed_section → "limits" if governor usage matters.
3. get_stack_around or fetch_log_lines on the 2–3 costliest operations; highlight_log_lines if helpful.

Respond with:
- Top operations by impact (rows, time, repetitions).
- Patterns: SOQL/DML in loops, duplicate queries, slow methods.
- Relationship to governor limits.
- Prioritized recommendations (bulkification, selectivity, caching).
- Log line numbers for each finding.`
  }
};

/**
 * @param {string} actionId
 * @param {'es' | 'en'} lang
 */
export function getDefaultQuickActionUserMessage(actionId, lang = 'es') {
  if (isLogiCustomQuickActionId(actionId)) return '';
  const map = lang === 'en' ? QUICK_ACTION_USER_MESSAGES.en : QUICK_ACTION_USER_MESSAGES.es;
  return map[actionId] || map.debug_errors;
}

/**
 * Prompt detallado enviado al modelo (no se muestra en la UI del chat).
 * @param {string} actionId
 * @param {'es' | 'en'} lang
 * @param {Record<'es' | 'en', Record<string, string>> | null | undefined} [customPrompts]
 */
export function quickActionUserMessage(actionId, lang = 'es', customPrompts = null) {
  const custom =
    customPrompts?.[lang === 'en' ? 'en' : 'es']?.[actionId] ??
    customPrompts?.es?.[actionId] ??
    customPrompts?.en?.[actionId];
  if (typeof custom === 'string' && custom.trim()) return custom.trim();
  return getDefaultQuickActionUserMessage(actionId, lang);
}

/**
 * @param {string} actionId
 * @returns {boolean}
 */
export function isLogiCustomQuickActionId(actionId) {
  return /^custom_[a-z0-9]{6,24}$/i.test(String(actionId || '').trim());
}

/**
 * @param {string} actionId
 * @returns {boolean}
 */
export function isLogiQuickActionId(actionId) {
  const id = String(actionId || '').trim();
  if (
    [
      'debug_errors',
      'explain_flow',
      'soql_dml',
      'test_failure',
      'limits',
      'suggest_fix',
      'callouts',
      'validations',
      'hotspots'
    ].includes(id)
  ) {
    return true;
  }
  return isLogiCustomQuickActionId(id);
}
