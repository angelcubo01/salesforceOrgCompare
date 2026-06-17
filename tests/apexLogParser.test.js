import { describe, it, expect } from 'vitest';
import {
  parseApexDebugLog,
  renderApexLogTreeLines,
  buildApexLogTreeModel,
  formatMs,
  formatLogSize
} from '../shared/apexLogParser.js';

const SAMPLE_LOG = `65.0 APEX_CODE,FINEST;APEX_PROFILING,INFO;CALLOUT,INFO;DATA_ACCESS,INFO;DB,INFO;NBA,INFO;SYSTEM,DEBUG;VALIDATION,INFO;VISUALFORCE,INFO;WAVE,INFO;WORKFLOW,INFO
10:26:03.0 (14406125)|USER_INFO|[EXTERNAL]|005xx|Test User|GMT+01:00
10:26:03.0 (14450000)|EXECUTION_STARTED
10:26:03.0 (15000000)|CODE_UNIT_STARTED|[EXTERNAL]|01pxx|MyClass.testMethod
10:26:03.0 (16000000)|METHOD_ENTRY|[5]|01pxx|MyClass.doWork()
10:26:03.0 (17000000)|USER_DEBUG|[7]|DEBUG|Hello from test
10:26:03.0 (18000000)|SOQL_EXECUTE_BEGIN|[10]|Aggregations:0|SELECT Id FROM Account LIMIT 10
10:26:03.0 (25000000)|SOQL_EXECUTE_END|[10]|Rows:10
10:26:03.0 (26000000)|DML_BEGIN|[12]|Op:Insert|Account|Rows:1
10:26:03.0 (30000000)|DML_END|[12]
10:26:03.0 (31000000)|METHOD_EXIT|[5]|01pxx|MyClass.doWork()
10:26:03.0 (32000000)|CODE_UNIT_FINISHED|MyClass.testMethod
10:26:03.0 (33000000)|EXECUTION_FINISHED
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

    expect(p.dml).toHaveLength(1);
    expect(p.dml[0].operation).toBe('Op:Insert');
    expect(p.dml[0].object).toBe('Account');
    expect(p.dml[0].durationMs).toBeGreaterThan(0);
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
