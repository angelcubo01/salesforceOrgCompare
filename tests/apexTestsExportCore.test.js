import { describe, it, expect } from 'vitest';
import {
  apexTestsExportToCsv,
  apexTestsExportToJson,
  buildApexTestsExportDocument,
  mergeApexTestRowsWithFailures
} from '../shared/apexTestsExportCore.js';

describe('apexTestsExportCore', () => {
  it('merges stack traces from failure rows', () => {
    const methods = [
      {
        ApexClass: { Name: 'MyTest' },
        MethodName: 'testOne',
        Outcome: 'Fail',
        Message: 'Assert failed'
      }
    ];
    const failures = [
      {
        ApexClass: { Name: 'MyTest' },
        MethodName: 'testOne',
        Outcome: 'Fail',
        StackTrace: 'Class.MyTest: line 5'
      }
    ];
    const rows = mergeApexTestRowsWithFailures(methods, failures);
    expect(rows[0].stackTrace).toBe('Class.MyTest: line 5');
  });

  it('exports CSV with header and escaped values', () => {
    const doc = buildApexTestsExportDocument(
      { orgId: 'o1', jobId: 'j1', envLabel: 'DEV' },
      [{ className: 'A', methodName: 'm', outcome: 'Pass', message: '', stackTrace: '' }]
    );
    const csv = apexTestsExportToCsv(doc);
    expect(csv).toContain('className,methodName,outcome,message,stackTrace');
    expect(csv).toContain('A,m,Pass');
  });

  it('exports JSON document', () => {
    const doc = buildApexTestsExportDocument({ orgId: 'o1', jobId: 'j1' }, []);
    const json = JSON.parse(apexTestsExportToJson(doc));
    expect(json.orgId).toBe('o1');
    expect(json.tests).toEqual([]);
  });
});
