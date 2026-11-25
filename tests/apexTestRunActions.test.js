import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apexTestLogsZipFileName,
  buildApexLogZipEntries,
  formatApexRunTime,
  formatApexTestFailuresText,
  mapWithConcurrency,
  summarizeApexTestTimings
} from '../shared/apexTestRunActions.js';
import { copyTextToClipboard } from '../code/lib/copyText.js';
import { setLang, t } from '../shared/i18n.js';

describe('summarizeApexTestTimings', () => {
  const row = (cls, method, RunTime, Outcome = 'Pass') => ({
    ApexClass: { Name: cls },
    MethodName: method,
    Outcome,
    RunTime
  });

  it('ordena por tiempo descendente y calcula el reparto sobre el total', () => {
    const out = summarizeApexTestTimings([
      row('A', 'fast', 100),
      row('B', 'slow', 700),
      row('A', 'mid', 200, 'Fail')
    ]);
    expect(out.count).toBe(3);
    expect(out.totalMs).toBe(1000);
    expect(out.truncated).toBe(false);
    expect(out.top.map((r) => `${r.className}.${r.methodName}`)).toEqual(['B.slow', 'A.mid', 'A.fast']);
    expect(out.top.map((r) => r.share)).toEqual([0.7, 0.2, 0.1]);
    expect(out.top[1].outcome).toBe('Fail');
  });

  it('acepta RunTime como cadena e ignora filas sin tiempo numérico o sin método', () => {
    const out = summarizeApexTestTimings([
      row('A', 'ok', '1500'),
      row('A', 'nulo', null),
      row('A', 'vacio', ''),
      row('A', 'texto', 'abc'),
      row('A', 'negativo', -5),
      { ApexClass: { Name: 'A' }, RunTime: 10 },
      null
    ]);
    expect(out.count).toBe(1);
    expect(out.totalMs).toBe(1500);
    expect(out.top[0].runTime).toBe(1500);
  });

  it('cuenta los métodos con 0 ms pero no los reparte entre un total vacío', () => {
    const out = summarizeApexTestTimings([row('A', 'm1', 0), row('A', 'm2', 0)]);
    expect(out.count).toBe(2);
    expect(out.totalMs).toBe(0);
    expect(out.top.map((r) => r.share)).toEqual([0, 0]);
  });

  it('desempata por clase y método para que el orden sea estable', () => {
    const out = summarizeApexTestTimings([row('B', 'x', 5), row('A', 'z', 5), row('A', 'y', 5)]);
    expect(out.top.map((r) => `${r.className}.${r.methodName}`)).toEqual(['A.y', 'A.z', 'B.x']);
  });

  it('recorta a `limit` conservando el total real y marca truncated', () => {
    const rows = Array.from({ length: 10 }, (_, i) => row('A', `m${i}`, (i + 1) * 10));
    const out = summarizeApexTestTimings(rows, { limit: 3 });
    expect(out.count).toBe(10);
    expect(out.totalMs).toBe(550);
    expect(out.top).toHaveLength(3);
    expect(out.truncated).toBe(true);
    expect(out.top[0].methodName).toBe('m9');
  });

  it('incluye los @TestSetup (suelen ser la causa de una clase lenta) y los marca', () => {
    const out = summarizeApexTestTimings([
      { ...row('A', 'setup', 900), IsTestSetup: true },
      { ...row('A', 'test', 100), IsTestSetup: false },
      { ...row('A', 'legacy', 50), IsTestSetup: 'true' },
      row('A', 'sinCampo', 10)
    ]);
    expect(out.top.map((r) => [r.methodName, r.isTestSetup])).toEqual([
      ['setup', true],
      ['test', false],
      ['legacy', true],
      ['sinCampo', false]
    ]);
    expect(out.totalMs).toBe(1060);
  });

  it('devuelve un resumen vacío sin filas', () => {
    expect(summarizeApexTestTimings(undefined)).toEqual({ count: 0, totalMs: 0, truncated: false, top: [] });
  });
});

describe('formatApexRunTime', () => {
  it('formatea milisegundos, segundos y minutos', () => {
    expect(formatApexRunTime(0)).toBe('0 ms');
    expect(formatApexRunTime(850)).toBe('850 ms');
    expect(formatApexRunTime(1000)).toBe('1 s');
    expect(formatApexRunTime(1234)).toBe('1.2 s');
    expect(formatApexRunTime(125_000)).toBe('2 min 5 s');
  });

  it('respeta el separador decimal del idioma', () => {
    expect(formatApexRunTime(1234, 'es-ES')).toBe('1,2 s');
  });

  it('no muestra "60 s" al redondear justo antes del minuto ni "1000 ms"', () => {
    expect(formatApexRunTime(59_950)).toBe('1 min 0 s');
    expect(formatApexRunTime(999.6)).toBe('1 s');
  });

  it('devuelve un guion para valores no válidos', () => {
    for (const bad of [null, undefined, '', 'abc', -1, NaN]) expect(formatApexRunTime(bad)).toBe('—');
  });
});

describe('formatApexTestFailuresText', () => {
  it('incluye clase, método, resultado, mensaje y stack trace indentados', () => {
    const { text, count } = formatApexTestFailuresText([
      {
        ApexClass: { Name: 'MyTest' },
        MethodName: 'testOne',
        Outcome: 'Fail',
        Message: 'System.AssertException: boom',
        StackTrace: 'Class.MyTest.testOne: line 5, column 1\nClass.MyTest.run: line 9'
      },
      { ApexClass: { Name: 'OtherTest' }, MethodName: 'testTwo', Outcome: 'CompileFail', Message: '' }
    ]);
    expect(count).toBe(2);
    expect(text).toBe(
      [
        'MyTest.testOne (Fail)',
        '  System.AssertException: boom',
        '  Class.MyTest.testOne: line 5, column 1',
        '  Class.MyTest.run: line 9',
        '',
        'OtherTest.testTwo (CompileFail)'
      ].join('\n')
    );
  });

  it('ignora filas sin nombre y devuelve vacío sin fallos', () => {
    expect(formatApexTestFailuresText([{ Outcome: 'Fail' }, null])).toEqual({ text: '', count: 0 });
    expect(formatApexTestFailuresText(undefined)).toEqual({ text: '', count: 0 });
  });
});

describe('ZIP de logs', () => {
  it('nombra cada entrada <Id>.log y evita colisiones', () => {
    const entries = buildApexLogZipEntries([
      { logId: '07L000000000001', body: 'a' },
      { logId: '07L000000000001', body: 'b' },
      { logId: '07L000000000001', body: 'c' },
      { logId: 'we/ird:id', body: null }
    ]);
    expect(entries.map((e) => e.name)).toEqual([
      '07L000000000001.log',
      '07L000000000001-2.log',
      '07L000000000001-3.log',
      'we-ird-id.log'
    ]);
    expect(entries[3].data).toBe('');
  });

  it('genera un nombre de ZIP seguro con marca de tiempo', () => {
    const name = apexTestLogsZipFileName('Sandbox QA / eu', new Date('2026-03-04T05:06:07.890Z'));
    expect(name).toBe('apex-test-logs-Sandbox_QA_-_eu-2026-03-04T05-06-07.zip');
    expect(apexTestLogsZipFileName('', new Date('2026-03-04T05:06:07Z'))).toBe(
      'apex-test-logs-run-2026-03-04T05-06-07.zip'
    );
  });
});

describe('mapWithConcurrency', () => {
  it('conserva el orden y respeta el límite de paralelismo', async () => {
    let active = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5 * (8 - n)));
      active -= 1;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it('acepta listas vacías', async () => {
    await expect(mapWithConcurrency([], 4, async () => 1)).resolves.toEqual([]);
  });
});

describe('copyTextToClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('usa navigator.clipboard cuando está disponible', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(copyTextToClipboard('hola')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hola');
  });

  it('devuelve false si no hay portapapeles ni DOM para el método clásico', async () => {
    vi.stubGlobal('navigator', {});
    await expect(copyTextToClipboard('x')).resolves.toBe(false);
  });

  it('cae al método clásico si la API moderna rechaza', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const area = { value: '', style: {}, setAttribute: vi.fn(), select: vi.fn(), remove: vi.fn() };
    vi.stubGlobal('document', {
      body: { appendChild: vi.fn() },
      createElement: vi.fn(() => area),
      execCommand: vi.fn(() => true)
    });
    await expect(copyTextToClipboard('texto')).resolves.toBe(true);
    expect(area.value).toBe('texto');
    expect(area.remove).toHaveBeenCalled();
  });
});

describe('textos de las acciones de ejecución', () => {
  const KEYS = [
    'apexTests.menuCopyRunId',
    'apexTests.menuCopyFailures',
    'apexTests.menuDownloadLogsZip',
    'apexTests.menuSlowestMethods',
    'apexTests.menuRemoveRun',
    'apexTests.runRemovedOk',
    'apexTests.copyFailuresDone',
    'apexTests.noFailuresToCopy',
    'apexTests.copyFailed',
    'apexTests.logsZipPreparing',
    'apexTests.logsZipDone',
    'apexTests.logsZipPartial',
    'apexTests.logsZipError',
    'apexTests.timingsTitle',
    'apexTests.timingsLoading',
    'apexTests.timingsSummary',
    'apexTests.timingsTruncated',
    'apexTests.timingsNoData',
    'apexTests.timingsParallelNote',
    'apexTests.timingsColClass',
    'apexTests.timingsColMethod',
    'apexTests.timingsColOutcome',
    'apexTests.timingsColTime',
    'apexTests.timingsColShare',
    'apexTests.runsCoverageSkippedHint',
    'apexTests.runsAbortNotRunningHint',
    'apexTests.runsNeedsFinishedHint'
  ];

  for (const lang of ['es', 'en']) {
    it(`tiene todas las claves en ${lang}`, () => {
      setLang(lang);
      for (const key of KEYS) expect(t(key), `${lang}:${key}`).not.toBe(key);
      expect(t('apexTests.copyFailuresDone', { count: '3' })).toContain('3');
      expect(t('apexTests.logsZipDone', { count: '4' })).toContain('4');
      expect(t('apexTests.logsZipPartial', { downloaded: '5', failed: '2' })).toMatch(/5.*2/);
    });
  }
});
