import { describe, it, expect } from 'vitest';
import {
  parseApexDebugLog,
  renderApexLogTreeLines,
  buildApexLogTreeModel,
  formatMs,
  formatLogSize,
  classifyLogEvent,
  normalizeSoqlForDedup,
  groupDuplicateSoql
} from '../shared/apexLogParser.js';

const SAMPLE_LOG = `65.0 APEX_CODE,FINEST;APEX_PROFILING,INFO;CALLOUT,INFO;DATA_ACCESS,INFO;DB,INFO;NBA,INFO;SYSTEM,DEBUG;VALIDATION,INFO;VISUALFORCE,INFO;WAVE,INFO;WORKFLOW,INFO
10:26:03.0 (14406125)|USER_INFO|[EXTERNAL]|005xx|Test User|GMT+01:00
10:26:03.0 (14450000)|EXECUTION_STARTED
10:26:03.0 (15000000)|CODE_UNIT_STARTED|[EXTERNAL]|01pxx|MyClass.testMethod
10:26:03.0 (16000000)|METHOD_ENTRY|[5]|01pxx|MyClass.doWork()
10:26:03.0 (17000000)|USER_DEBUG|[7]|DEBUG|Hello from test
10:26:03.0 (18000000)|SOQL_EXECUTE_BEGIN|[10]|Aggregations:0|SELECT Id FROM Account LIMIT 10
10:26:03.0 (19000000)|LIMIT_USAGE|[10]|SOQL|1|200
10:26:03.0 (25000000)|SOQL_EXECUTE_END|[10]|Rows:10
10:26:03.0 (26000000)|DML_BEGIN|[12]|Op:Insert|Account|Rows:1
10:26:03.0 (30000000)|DML_END|[12]
10:26:03.0 (31000000)|CALLOUT_REQUEST|[15]|System.HttpRequest[Endpoint=callout:Test_API/foo, Method=GET]
10:26:03.0 (35000000)|CALLOUT_RESPONSE|[15]|System.HttpResponse[Status=OK, StatusCode=200]
10:26:03.0 (36000000)|VALIDATION_RULE|03dxx|My_Validation_Rule
10:26:03.0 (37000000)|VALIDATION_PASS
10:26:03.0 (38000000)|WF_RULE_EVAL_BEGIN|Assignment
10:26:03.0 (39000000)|METHOD_EXIT|[5]|01pxx|MyClass.doWork()
10:26:03.0 (40000000)|CODE_UNIT_FINISHED|MyClass.testMethod
10:26:03.0 (41000000)|EXECUTION_FINISHED
`;

const PROFILING_TAIL = `
10:26:04.0 (100000000)|CUMULATIVE_PROFILING|SOQL operations|
Class.MyClass.doWork: line 10, column 1: [SELECT Id FROM Account LIMIT 10]: executed 2 times in 45 ms
10:26:04.0 (100000000)|CUMULATIVE_PROFILING|method invocations|
External entry point: public static void testMethod(): executed 1 time in 100 ms
10:26:04.0 (100000000)|CUMULATIVE_PROFILING_END
`;

describe('parseApexDebugLog', () => {
  it('extrae userDebug, soql y dml', () => {
    const p = parseApexDebugLog(SAMPLE_LOG);
    expect(p.userDebug).toHaveLength(1);
    expect(p.userDebug[0].message).toContain('Hello from test');
    expect(p.userDebug[0].apexLine).toBe(7);

    expect(p.soql).toHaveLength(1);
    expect(p.soql[0].query).toContain('SELECT Id FROM Account');
    expect(p.soql[0].rows).toBe(10);
    expect(p.soql[0].durationMs).toBeGreaterThan(0);
    expect(p.soql[0].context).toContain('MyClass.doWork');

    expect(p.dml).toHaveLength(1);
    expect(p.dml[0].operation).toBe('Op:Insert');
    expect(p.dml[0].object).toBe('Account');
    expect(p.dml[0].durationMs).toBeGreaterThan(0);
  });

  it('parsea limits, callouts, validations y workflow', () => {
    const p = parseApexDebugLog(SAMPLE_LOG);
    expect(p.limits.length).toBeGreaterThan(0);
    expect(p.limits[0].type).toBe('SOQL');
    expect(p.limitPeak.SOQL.used).toBe(1);

    expect(p.callouts).toHaveLength(1);
    expect(p.callouts[0].endpoint).toContain('callout:Test_API');
    expect(p.callouts[0].statusCode).toBe(200);
    expect(p.callouts[0].durationMs).toBeGreaterThan(0);

    expect(p.validations.length).toBeGreaterThanOrEqual(2);
    expect(p.workflows.length).toBeGreaterThan(0);
    expect(p.codeUnits.length).toBeGreaterThan(0);
  });

  it('incluye callouts en timeline', () => {
    const p = parseApexDebugLog(SAMPLE_LOG);
    const calloutEv = p.timeline.find((e) => e.type === 'callout');
    expect(calloutEv).toBeTruthy();
    expect(calloutEv.durationMs).toBeGreaterThan(0);
  });

  it('parsea CUMULATIVE_PROFILING', () => {
    const p = parseApexDebugLog(SAMPLE_LOG + PROFILING_TAIL);
    expect(p.profiling.soql.length).toBeGreaterThan(0);
    expect(p.profiling.methods.length).toBeGreaterThan(0);
    expect(p.profiling.soql[0].totalMs).toBe(45);
  });

  it('construye árbol con hijos', () => {
    const p = parseApexDebugLog(SAMPLE_LOG);
    expect(p.tree.children.length).toBeGreaterThan(0);
    const exec = p.tree.children.find((c) => c.kind === 'execution');
    expect(exec).toBeTruthy();
    expect(exec.children.length).toBeGreaterThan(0);
  });

  it('genera timeline con duraciones', () => {
    const p = parseApexDebugLog(SAMPLE_LOG);
    expect(p.timeline.length).toBeGreaterThan(0);
    const soqlEv = p.timeline.find((e) => e.type === 'soql');
    expect(soqlEv?.durationMs).toBeGreaterThan(0);
  });

  it('detecta log truncado', () => {
    const truncated = `${SAMPLE_LOG}\n10:26:04.0 (1)|LIMIT_USAGE|MAXIMUM DEBUG LOG SIZE REACHED`;
    const p = parseApexDebugLog(truncated);
    expect(p.issues.some((i) => i.summary === 'Log truncado')).toBe(true);
    expect(p.meta.issueCount).toBeGreaterThan(0);
  });

  it('meta incluye tamaño y duración', () => {
    const p = parseApexDebugLog(SAMPLE_LOG);
    expect(p.meta.sizeBytes).toBeGreaterThan(0);
    expect(p.meta.durationMs).toBeGreaterThan(0);
    expect(p.user?.name).toBe('Test User');
  });

  it('ordena soql por duración descendente', () => {
    const multi = `${SAMPLE_LOG}
10:26:03.0 (42000000)|EXECUTION_STARTED
10:26:03.0 (43000000)|SOQL_EXECUTE_BEGIN|[20]|Aggregations:0|SELECT Id FROM Contact
10:26:03.0 (50000000)|SOQL_EXECUTE_END|[20]|Rows:1
10:26:03.0 (51000000)|EXECUTION_FINISHED`;
    const p = parseApexDebugLog(multi);
    if (p.soql.length >= 2) {
      expect(p.soql[0].durationMs).toBeGreaterThanOrEqual(p.soql[1].durationMs);
    }
  });
});

describe('classifyLogEvent / groupDuplicateSoql', () => {
  it('clasifica eventos', () => {
    expect(classifyLogEvent('SOQL_EXECUTE_BEGIN')).toBe('soql');
    expect(classifyLogEvent('CALLOUT_REQUEST')).toBe('callout');
    expect(classifyLogEvent('HEAP_ALLOCATE')).toBe('noise');
  });

  it('agrupa soql duplicados', () => {
    const groups = groupDuplicateSoql([
      { query: 'SELECT Id FROM Account', durationMs: 10 },
      { query: 'SELECT  Id   FROM Account', durationMs: 20 }
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
    expect(normalizeSoqlForDedup('SELECT Id FROM Account')).toBe(
      normalizeSoqlForDedup('SELECT  Id   FROM Account')
    );
  });
});

describe('renderApexLogTreeLines', () => {
  const t = (key, params) => {
    const dict = {
      'apexLogViewer.kind.soql': 'SOQL',
      'apexLogViewer.kind.method': 'Method',
      'apexLogViewer.tree.rows': `${params?.n} rows`
    };
    return dict[key] ?? key;
  };

  it('usa árbol unicode, pliegue por nodo y etiquetas i18n', () => {
    const p = parseApexDebugLog(SAMPLE_LOG);
    const { lines, foldRanges } = buildApexLogTreeModel(p.tree, t);
    const joined = lines.join('\n');
    expect(joined).toContain('[SOQL]');
    expect(joined).toContain('[Method]');
    expect(joined).toMatch(/[├└│]/);
    expect(joined).not.toContain('··');
    expect(foldRanges.length).toBeGreaterThan(0);
  });
});

describe('formatMs / formatLogSize', () => {
  it('formatea duración y tamaño', () => {
    expect(formatMs(500)).toBe('500 ms');
    expect(formatMs(1500)).toBe('1.50 s');
    expect(formatLogSize(2048)).toContain('KB');
  });
});
