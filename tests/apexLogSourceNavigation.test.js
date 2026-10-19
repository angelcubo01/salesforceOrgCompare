import { describe, expect, it } from 'vitest';
import {
  buildApexLogSourceIndex,
  findApexLogSourceTokenRange,
  parseApexLogSourceLabel,
  resolveApexLogSourceTarget
} from '../code/lib/apexLogViewer/apexSourceNavigation.js';

describe('navegación a fuente desde el analizador de logs', () => {
  const raw = [
    '00:00:00.0 (1)|EXECUTION_STARTED',
    '00:00:00.1 (2)|CODE_UNIT_STARTED|[EXTERNAL]|01p000000000001|MyService',
    '00:00:00.2 (3)|METHOD_ENTRY|[3]|01p000000000001|MyService.run()',
    '00:00:00.3 (4)|SOQL_EXECUTE_BEGIN|[8]|Aggregations:0|SELECT Id FROM Account',
    '00:00:00.4 (5)|METHOD_EXIT|[3]|01p000000000001|MyService.run()',
    '00:00:00.5 (6)|FATAL_ERROR|Class.MyService.run: line 12, column 1'
  ].join('\n');

  it('mantiene clase, método y línea Apex en operaciones anidadas', () => {
    const index = buildApexLogSourceIndex(raw);
    expect(resolveApexLogSourceTarget(index, { line: 4 })).toEqual({
      className: 'MyService', methodName: 'run', apexLine: 8
    });
    expect(resolveApexLogSourceTarget(index, { line: 6 })).toEqual({
      className: 'MyService', methodName: 'run', apexLine: 12, exactLine: true
    });
  });

  it('resuelve etiquetas usadas por summary, timeline y profiling', () => {
    expect(parseApexLogSourceLabel('Class.CaseService.assignOwner: line 27, column 1')).toEqual({
      className: 'CaseService', methodName: 'assignOwner', apexLine: 27
    });
    expect(parseApexLogSourceLabel('CaseService.assignOwner()')).toEqual({
      className: 'CaseService', methodName: 'assignOwner', apexLine: 0
    });
    expect(parseApexLogSourceLabel('System.List.add(Object)')).toBeNull();
    expect(parseApexLogSourceLabel('SELECT Id FROM Account')).toBeNull();
    expect(parseApexLogSourceLabel('Class.OuterService.Worker.runBatch: line 10')).toEqual({
      className: 'OuterService', methodName: 'runBatch', apexLine: 10
    });
  });

  it('subraya el método o la clase que realmente se puede abrir', () => {
    expect(findApexLogSourceTokenRange(
      '00:00:00.2|METHOD_ENTRY|[3]|MyService.run()',
      { className: 'MyService', methodName: 'run' }
    )).toEqual({ startColumn: 39, endColumn: 42 });
    expect(findApexLogSourceTokenRange(
      '00:00:00.1|CODE_UNIT_STARTED|MyService',
      { className: 'MyService', methodName: '' }
    )).toEqual({ startColumn: 30, endColumn: 39 });
    expect(findApexLogSourceTokenRange('SELECT Id FROM Account', null)).toBeNull();
  });
});
