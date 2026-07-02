import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseApexTestMethodNames,
  stripLeadingWhileOneJson,
  sourceSignatureFromFiles,
  normalizeApexLogBodyText,
  parseApexLogExecutionContext,
  inferApexLogExecutionFromMetadata,
  mergeApexLogExecutionContext,
  resolveApexLogExecutionContext,
  filterApexTestRunCandidateLogs,
  filterApexTestRunLogsByExecutionType,
  apexLogLocationMatchesTestClass,
  apexLogBodyLooksLikeTestClass,
  pickBestApexLogForTestRun,
  restSoqlQueryPage,
  probeApiVersion,
  resolveApexLogsInWindowLimit
} from '../shared/salesforceApi.js';

describe('parseApexTestMethodNames', () => {
  it('detecta @IsTest y testMethod', () => {
    const st = {
      methods: [
        { name: 'testFoo', annotations: [{ name: 'IsTest' }] },
        { name: 'legacy', modifiers: ['testMethod'] },
        { name: 'helper', modifiers: ['public'] }
      ]
    };
    expect(parseApexTestMethodNames(st)).toEqual(['legacy', 'testFoo']);
  });

  it('detecta nombres que empiezan por test', () => {
    expect(parseApexTestMethodNames({ methods: [{ name: 'testBar' }] })).toEqual(['testBar']);
  });

  it('parsea SymbolTable en string JSON', () => {
    const st = JSON.stringify({ methods: [{ name: 'testX', annotations: [{ name: 'istest' }] }] });
    expect(parseApexTestMethodNames(st)).toEqual(['testX']);
  });

  it('devuelve [] con JSON inválido', () => {
    expect(parseApexTestMethodNames('not json')).toEqual([]);
  });
});

describe('stripLeadingWhileOneJson', () => {
  it('elimina while(1); al inicio', () => {
    expect(stripLeadingWhileOneJson('while(1);{"ok":true}')).toBe('{"ok":true}');
    expect(stripLeadingWhileOneJson('  while ( 1 ) ;  []')).toBe('[]');
  });
});

describe('sourceSignatureFromFiles', () => {
  it('ordena por fileName y concatena fechas', () => {
    const sig = sourceSignatureFromFiles([
      { fileName: 'b.js', lastModifiedDate: '2' },
      { fileName: 'a.js', lastModifiedDate: '1' }
    ]);
    expect(sig).toBe('a.js\t1\nb.js\t2');
  });
});

describe('apexLogLocationMatchesTestClass', () => {
  it('coincide por igualdad o segmento', () => {
    expect(apexLogLocationMatchesTestClass('MyTest.testMethod', 'MyTest')).toBe(true);
    expect(apexLogLocationMatchesTestClass('ns.MyTest', 'MyTest')).toBe(true);
    expect(apexLogLocationMatchesTestClass('Other', 'MyTest')).toBe(false);
  });

  it('sin className acepta cualquier location', () => {
    expect(apexLogLocationMatchesTestClass('anything', '')).toBe(true);
  });
});

describe('apexLogBodyLooksLikeTestClass', () => {
  it('encuentra el nombre de clase en el cuerpo', () => {
    const body = 'EXECUTION_STARTED\nClass.MyTest.testSomething';
    expect(apexLogBodyLooksLikeTestClass(body, 'MyTest')).toBe(true);
  });

  it('devuelve false sin className o cuerpo', () => {
    expect(apexLogBodyLooksLikeTestClass('log', '')).toBe(false);
    expect(apexLogBodyLooksLikeTestClass(null, 'X')).toBe(false);
  });
});

describe('parseApexLogExecutionContext', () => {
  it('detecta apex://Class/ACTION$Method', () => {
    const parsed = parseApexLogExecutionContext(
      '66.0 APEX_CODE,DEBUG\napex://CC_MyClass/ACTION$runProcess\n...'
    );
    expect(parsed).toEqual({
      logType: 'Apex',
      logName: 'CC_MyClass',
      logMethod: 'runProcess'
    });
  });

  it('detecta Trigger y evento', () => {
    const parsed = parseApexLogExecutionContext(
      'CODE_UNIT_STARTED|[EXTERNAL]|01qxx|CC_MyTrigger on Case trigger event BeforeUpdate'
    );
    expect(parsed).toEqual({
      logType: 'Trigger',
      logName: 'CC_MyTrigger',
      logMethod: 'BeforeUpdate'
    });
  });

  it('normaliza body JSON con campo Body', () => {
    const parsed = parseApexLogExecutionContext(
      JSON.stringify({
        Body: 'CODE_UNIT_STARTED|[EXTERNAL]|01qxx|CC_MyTrigger on Case trigger event BeforeUpdate'
      })
    );
    expect(parsed.logType).toBe('Trigger');
    expect(parsed.logName).toBe('CC_MyTrigger');
  });

  it('devuelve N/A si no hay coincidencia', () => {
    const parsed = parseApexLogExecutionContext('UNRELATED_LINE|foo');
    expect(parsed).toEqual({
      logType: 'N/A',
      logName: 'N/A',
      logMethod: 'N/A'
    });
  });
});

describe('inferApexLogExecutionFromMetadata', () => {
  it('usa Location clase.metodo', () => {
    expect(
      inferApexLogExecutionFromMetadata({
        Location: 'CC_MyClass.testMethod',
        Operation: 'ApexTestHandler'
      })
    ).toEqual({
      logType: 'Apex',
      logName: 'CC_MyClass',
      logMethod: 'testMethod'
    });
  });

  it('usa Operation si no hay Location', () => {
    expect(inferApexLogExecutionFromMetadata({ Operation: 'Api' })).toEqual({
      logType: 'Api',
      logName: 'N/A',
      logMethod: 'N/A'
    });
  });
});

describe('resolveApexLogExecutionContext', () => {
  it('prioriza body y rellena huecos con metadata', () => {
    const resolved = resolveApexLogExecutionContext('', {
      Location: 'CC_Fallback.test',
      Operation: 'ApexTestHandler'
    });
    expect(resolved.logName).toBe('CC_Fallback');
    expect(resolved.logMethod).toBe('test');
  });
});

describe('normalizeApexLogBodyText', () => {
  it('extrae Body de JSON', () => {
    expect(normalizeApexLogBodyText('{"Body":"line1\\nline2"}')).toBe('line1\nline2');
  });
});

describe('filterApexTestRunCandidateLogs', () => {
  const jobStart = Date.parse('2024-06-17T10:00:00Z');

  it('excluye logs con StartTime anterior al job', () => {
    const rows = filterApexTestRunCandidateLogs(
      [
        { Id: '1', StartTime: '2024-06-17T09:59:00Z' },
        { Id: '2', StartTime: '2024-06-17T10:00:00Z' },
        { Id: '3', StartTime: '2024-06-17T10:01:00Z' }
      ],
      jobStart
    );
    expect(rows.map((r) => r.Id)).toEqual(['2', '3']);
  });
});

describe('filterApexTestRunLogsByExecutionType', () => {
  it('conserva solo Type Apex', () => {
    const rows = filterApexTestRunLogsByExecutionType([
      { Id: '1', Type: 'Apex', Name: 'MyClass', Method: 'test' },
      { Id: '2', Type: 'Trigger', Name: 'MyTrigger', Method: 'BeforeInsert' }
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].Id).toBe('1');
  });
});

describe('pickBestApexLogForTestRun', () => {
  const createdMs = Date.parse('2024-01-01T10:00:00Z');
  const completedMs = Date.parse('2024-01-01T10:05:00Z');

  it('prioriza Location que coincide con la clase de test', () => {
    const logs = [
      {
        Id: '1',
        StartTime: '2024-01-01T10:02:00Z',
        Operation: 'Api',
        LogLength: 5000,
        LogUserId: '005xx',
        Location: 'Unrelated'
      },
      {
        Id: '2',
        StartTime: '2024-01-01T10:02:00Z',
        Operation: 'ApexTestHandler',
        LogLength: 1000,
        LogUserId: '005xx',
        Location: 'MyTestClass'
      }
    ];
    const best = pickBestApexLogForTestRun(logs, {
      createdById: '005xx',
      createdMs,
      completedMs,
      apexTestClassName: 'MyTestClass'
    });
    expect(best.Id).toBe('2');
  });

  it('devuelve null sin logs', () => {
    expect(pickBestApexLogForTestRun([], {})).toBeNull();
  });
});

describe('restSoqlQueryPage (fetch mock)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('construye path SOQL y devuelve records', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          records: [{ Id: '001' }],
          done: true,
          totalSize: 1
        })
      }))
    );
    const page = await restSoqlQueryPage('https://example.my.salesforce.com', 'sid', '62.0', 'SELECT Id FROM Account');
    expect(page.records).toHaveLength(1);
    expect(page.done).toBe(true);
    expect(page.nextPath).toBeNull();
  });

  it('lanza con mensaje Salesforce en error HTTP', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => '[{"message":"Unauthorized"}]'
      }))
    );
    await expect(
      restSoqlQueryPage('https://example.my.salesforce.com/', 'bad', '62.0', 'SELECT x')
    ).rejects.toThrow('Unauthorized');
  });
});

describe('probeApiVersion', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [{ version: '60.0' }, { version: '62.0' }]
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('devuelve la última versión de la lista', async () => {
    const v = await probeApiVersion('https://example.my.salesforce.com', 'sid');
    expect(v).toBe('62.0');
  });
});

describe('resolveApexLogsInWindowLimit', () => {
  it('respeta el límite configurado sin capar a 200', () => {
    expect(resolveApexLogsInWindowLimit({ limit: 15_000 })).toBe(15_000);
    expect(resolveApexLogsInWindowLimit({ limit: 500 })).toBe(500);
    expect(resolveApexLogsInWindowLimit({ limit: 200 })).toBe(200);
  });

  it('acota al máximo de plataforma/ajustes', () => {
    expect(resolveApexLogsInWindowLimit({ limit: 99_999 })).toBe(50_000);
    expect(resolveApexLogsInWindowLimit({ limit: 5 })).toBe(10);
  });

  it('usa 80 por defecto cuando no hay límite válido', () => {
    expect(resolveApexLogsInWindowLimit({})).toBe(80);
    expect(resolveApexLogsInWindowLimit({ limit: 0 })).toBe(80);
  });
});

describe('buildActiveUserSearchSoql', () => {
  it('genera LIKE por Name y Username sin ESCAPE', async () => {
    const { buildActiveUserSearchSoql } = await import('../shared/salesforceApi.js');
    const byName = buildActiveUserSearchSoql('Name', 'Angel');
    const byUser = buildActiveUserSearchSoql('Username', 'Angel');
    expect(byName).toMatch(/Name LIKE '%Angel%'/);
    expect(byUser).toMatch(/Username LIKE '%Angel%'/);
    expect(byName).not.toMatch(/ESCAPE/i);
    expect(byUser).not.toMatch(/ESCAPE/i);
  });

  it('elimina comodines LIKE del término', async () => {
    const { buildActiveUserSearchSoql } = await import('../shared/salesforceApi.js');
    expect(buildActiveUserSearchSoql('Name', 'A%ng_el')).toMatch(/LIKE '%Angel%'/);
  });

  it('devuelve null con término demasiado corto', async () => {
    const { buildActiveUserSearchSoql } = await import('../shared/salesforceApi.js');
    expect(buildActiveUserSearchSoql('Name', 'A')).toBeNull();
  });
});
