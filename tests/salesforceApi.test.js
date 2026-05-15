import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseApexTestMethodNames,
  stripLeadingWhileOneJson,
  sourceSignatureFromFiles,
  apexLogLocationMatchesTestClass,
  apexLogBodyLooksLikeTestClass,
  pickBestApexLogForTestRun,
  restSoqlQueryPage,
  probeApiVersion
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
