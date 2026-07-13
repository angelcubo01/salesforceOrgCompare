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
 * Prompt detallado enviado al modelo (no se muestra en la UI del chat).
 * @param {string} actionId
 * @param {'es' | 'en'} lang
 */
export function quickActionUserMessage(actionId, lang = 'es') {
  const es = {
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
- Cita números de línea del log en cada hallazgo.`,

    test_failure: `Este log corresponde a una ejecución de test Apex que falló o es sospechosa.

Antes de responder:
1. Confirma en meta si isTestLog o failedExecutionCount > 0.
2. fetch_parsed_section → "issues", "userDebug" y "executions".
3. fetch_log_lines en el assertion failure, System.AssertException o mensaje de test.

Responde con:
- Qué test/clase/método falló y mensaje de error exacto.
- Assertion o excepción con línea del log y línea Apex si aparece.
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
3. No propongas org_query salvo que sea imprescindible para verificar un dato.

Responde con:
- Problema resumido en una frase con evidencia del log.
- Causa raíz más probable.
- Fix recomendado (pasos verificables, pseudocódigo o snippet Apex breve si aporta).
- Cómo validar el fix (test, escenario manual, qué revisar en el siguiente log).
- Riesgos o efectos secundarios del cambio.`
  };

  const en = {
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
- Cite log line numbers for each finding.`,

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
3. Do not propose org_query unless essential to verify a fact.

Respond with:
- One-sentence problem summary with log evidence.
- Most likely root cause.
- Recommended fix (verifiable steps, brief pseudocode or Apex snippet if useful).
- How to validate the fix (test, manual scenario, what to check in the next log).
- Risks or side effects of the change.`
  };

  const map = lang === 'en' ? en : es;
  return map[actionId] || map.debug_errors;
}

/**
 * @param {string} actionId
 * @returns {boolean}
 */
export function isLogiQuickActionId(actionId) {
  return [
    'debug_errors',
    'explain_flow',
    'soql_dml',
    'test_failure',
    'limits',
    'suggest_fix'
  ].includes(actionId);
}
