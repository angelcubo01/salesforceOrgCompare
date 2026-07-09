import { describe, it, expect } from 'vitest';
import { searchApexLog } from '../code/lib/apexLogViewer/findBar.js';
import { parseApexDebugLog } from '../shared/apexLogParser.js';
import { readFileSync } from 'node:fs';

const SAMPLE = `65.0 APEX_CODE,FINEST;APEX_PROFILING,INFO;CALLOUT,INFO;DATA_ACCESS,INFO;DB,INFO;NBA,INFO;SYSTEM,DEBUG;VALIDATION,INFO;VISUALFORCE,INFO;WAVE,INFO;WORKFLOW,INFO
10:26:03.0 (14406125)|USER_INFO|[EXTERNAL]|005xx|Test User|GMT+01:00
10:26:03.0 (14450000)|EXECUTION_STARTED
10:26:03.0 (15000000)|CODE_UNIT_STARTED|[EXTERNAL]|01pxx|MyClass.testMethod
10:26:03.0 (17000000)|USER_DEBUG|[7]|DEBUG|Hello from test
10:26:03.0 (18000000)|SOQL_EXECUTE_BEGIN|[10]|Aggregations:0|SELECT Id FROM Account LIMIT 10
10:26:03.0 (25000000)|SOQL_EXECUTE_END|[10]|Rows:10
10:26:03.0 (26000000)|FATAL_ERROR|System.AssertException: Failed
Class.MyClass.testMethod: line 12, column 1
10:26:03.0 (28000000)|EXECUTION_FINISHED`;

describe('searchApexLog', () => {
  it('encuentra SOQL y errores', () => {
    const parsed = parseApexDebugLog(SAMPLE);
    const hits = searchApexLog(parsed, 'account');
    expect(hits.some((h) => h.label === 'SOQL')).toBe(true);
    const errHits = searchApexLog(parsed, 'assert');
    expect(errHits.some((h) => h.tab === 'errors')).toBe(true);
    expect(parsed.issues.filter((i) => i.type === 'error')).toHaveLength(1);
  });
});

describe('log real falloSTR1', () => {
  it('parsea ejecuciones de test y deduplica errores', () => {
    const logPath = 'c:/Users/0020553/Downloads/falloSTR1 CONTRASENA.log';
    let raw = '';
    try {
      raw = readFileSync(logPath, 'utf8');
    } catch {
      return;
    }
    const parsed = parseApexDebugLog(raw);
    expect(parsed.meta.isTestLog).toBe(true);
    expect(parsed.meta.executionCount).toBe(25);
    expect(parsed.meta.failedExecutionCount).toBe(3);
    expect(parsed.issues.filter((i) => i.type === 'error' && i.summary === 'Error fatal')).toHaveLength(3);
    const failExec = parsed.executions.find((e) => e.label.includes('testCrearNuevoIdentificadorClienteOk'));
    expect(failExec?.hasError).toBe(true);
  });
});
