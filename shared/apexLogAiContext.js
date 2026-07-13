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

  return {
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
        description: 'Fetch raw log lines by line number range (max 80 lines).',
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
        description: 'Fetch a parsed section of the log (soql, dml, issues, timeline, profiling, etc.).',
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
    }
  ];

  if (allowOrgQuery) {
    tools.push({
      type: 'function',
      function: {
        name: 'org_query',
        description:
          'Run a read-only SOQL/SOSL query against the Salesforce org. Requires explicit user approval.',
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
    });
  }

  return tools;
}

/**
 * @param {string} actionId
 * @param {'es' | 'en'} lang
 */
export function quickActionUserMessage(actionId, lang = 'es') {
  const es = {
    debug_errors:
      'Analiza los errores y excepciones de este log. Indica causa probable, líneas relevantes y pasos para depurar.',
    explain_flow:
      'Explica el flujo de ejecución de este log: qué se ejecutó, en qué orden y dónde está el problema si lo hay.',
    soql_dml:
      'Analiza las consultas SOQL y operaciones DML: rendimiento, duplicados, límites y optimizaciones posibles.',
    test_failure:
      'Este log parece de tests. Ayúdame a entender por qué falló la ejecución y qué revisar.',
    limits:
      'Revisa los límites de gobernador de este log. ¿Hay riesgo de LIMIT_EXCEEDED? ¿Qué operaciones los consumen?',
    suggest_fix:
      'Sugiere una corrección concreta para el problema principal del log, con pasos verificables.'
  };
  const en = {
    debug_errors:
      'Analyze errors and exceptions in this log. Give likely cause, relevant lines, and debugging steps.',
    explain_flow:
      'Explain the execution flow: what ran, in what order, and where the issue is if any.',
    soql_dml:
      'Analyze SOQL queries and DML: performance, duplicates, limits, and possible optimizations.',
    test_failure:
      'This looks like a test log. Help me understand why the run failed and what to check.',
    limits:
      'Review governor limits in this log. Any LIMIT_EXCEEDED risk? Which operations consume them?',
    suggest_fix:
      'Suggest a concrete fix for the main problem in this log with verifiable steps.'
  };
  const map = lang === 'en' ? en : es;
  return map[actionId] || map.debug_errors;
}
