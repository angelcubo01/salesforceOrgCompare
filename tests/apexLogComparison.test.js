import { describe, expect, it } from 'vitest';
import { parseApexDebugLog } from '../shared/apexLogParser.js';
import { areLogsComparable, compareApexLogs, normalizeLogText, createLogNormalizer, buildComparisonLogiContext } from '../shared/apexLogComparison.js';

const log = (extra = '', entry = 'MyClass.run') => `65.0 APEX_CODE,FINEST
10:00:00.0 (1)|USER_INFO|[EXTERNAL]|005000000000001AAA|User|GMT
10:00:00.0 (2)|EXECUTION_STARTED
10:00:00.0 (3)|CODE_UNIT_STARTED|[EXTERNAL]|01p000000000001AAA|${entry}
10:00:00.0 (4)|METHOD_ENTRY|[5]|01p000000000001AAA|MyClass.work()
10:00:00.0 (5)|SOQL_EXECUTE_BEGIN|[6]|Aggregations:0|SELECT Id FROM Account WHERE Id = '001000000000001AAA'
10:00:00.0 (6)|LIMIT_USAGE|[6]|SOQL|1|100
10:00:00.0 (7)|SOQL_EXECUTE_END|[6]|Rows:1
10:00:00.0 (8)|DML_BEGIN|[8]|Op:Update|Account|Rows:1
10:00:00.0 (9)|DML_END|[8]
10:00:00.0 (10)|CALLOUT_REQUEST|[9]|System.HttpRequest[Endpoint=https://example.test/a?requestId=abc, Method=GET]
10:00:00.0 (11)|CALLOUT_RESPONSE|[9]|System.HttpResponse[Status=OK, StatusCode=200]
${extra}
10:00:00.0 (12)|METHOD_EXIT|[5]|01p000000000001AAA|MyClass.work()
10:00:00.0 (13)|CODE_UNIT_FINISHED|${entry}
10:00:00.0 (14)|EXECUTION_FINISHED`;

function compare(a, b) { return compareApexLogs(a, parseApexDebugLog(a), b, parseApexDebugLog(b)); }

describe('apexLogComparison', () => {
  it('ignora fechas e IDs y conserva aliases por log', () => {
    const normalize = createLogNormalizer();
    expect(normalize('001000000000001AAA y 001000000000001AAA')).toBe('<AccountId:1> y <AccountId:1>');
    const a = log(); const b = log().replaceAll('10:00:00.0', '11:59:59.999').replaceAll('001000000000001AAA', '001000000000002AAA');
    expect(normalizeLogText(a).map(x => x.text)).toEqual(normalizeLogText(b).map(x => x.text));
    expect(compare(a, b).differences.filter(x => ['SOQL', 'DML'].includes(x.category))).toHaveLength(0);
  });

  it('normaliza el ruido técnico antes de construir el diff de texto', () => {
    const a = '10:00:00.0 (1)|HEAP_ALLOCATE|[8]|Bytes:4';
    const b = '11:32:45.999 (99)|HEAP_ALLOCATE|[8]|Bytes:4096';
    expect(normalizeLogText(a)[0].text).toBe(normalizeLogText(b)[0].text);
    expect(normalizeLogText(a)[0].text).toContain('HEAP_ALLOCATE|<technical-noise>');
  });

  it('conserva valores funcionales de asignaciones para el diff de texto', () => {
    const normalized = normalizeLogText('10:00:00.0 (1)|VARIABLE_ASSIGNMENT|[7]|approved|false')[0].text;
    expect(normalized).toContain('approved|false');
  });

  it('detecta ramas exclusivas, SOQL/DML, errores, callouts y límites', () => {
    const a = log('10:00:00.0 (11)|METHOD_ENTRY|[11]|01p|MyClass.onlyA()\n10:00:00.0 (11)|METHOD_EXIT|[11]|01p|MyClass.onlyA()\n10:00:00.0 (11)|FATAL_ERROR|System.AssertException: failed');
    const b = log('10:00:00.0 (11)|DML_BEGIN|[10]|Op:Insert|Contact|Rows:2\n10:00:00.0 (11)|DML_END|[10]').replace('|SOQL|1|100', '|SOQL|90|100').replace('Status=OK, StatusCode=200', 'Status=Bad, StatusCode=500');
    const result = compare(a, b);
    expect(result.differences.some(x => x.category === 'Ruta')).toBe(true);
    expect(result.differences.some(x => x.category === 'DML' && x.status === 'onlyB')).toBe(true);
    expect(result.differences.some(x => x.category === 'Callout' && x.status === 'modified')).toBe(true);
    expect(result.differences.some(x => x.category === 'Error' && x.status === 'onlyA')).toBe(true);
    expect(result.differences.some(x => x.category === 'Límite')).toBe(true);
    expect(result.firstDivergence).toBeTruthy();
  });

  it('rechaza clases o puntos de entrada distintos', () => {
    const a = log('', 'ClassOne.run'); const b = log('', 'ClassTwo.run');
    expect(areLogsComparable(a, parseApexDebugLog(a), b, parseApexDebugLog(b)).ok).toBe(false);
  });

  it('avisa de logs truncados y no envía secretos o IDs a Logi', () => {
    const a = `${log()}\n10:00:01.0 (15)|LIMIT_USAGE|MAXIMUM DEBUG LOG SIZE REACHED`;
    const b = log(); const result = compare(a, b);
    expect(result.truncated).toBe(true);
    const ctx = buildComparisonLogiContext(result, { environment: 'A', entry: 'MyClass.run', result: 'Error' }, { environment: 'B', entry: 'MyClass.run', result: 'Correcto' });
    expect(JSON.stringify(ctx)).not.toMatch(/001000000000001AAA|005000000000001AAA|requestId=abc/);
    expect(ctx.comparison.summary).toBeTruthy();
    expect(Array.isArray(ctx.comparison.flow)).toBe(true);
  });
});
