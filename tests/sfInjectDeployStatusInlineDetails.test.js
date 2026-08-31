import { describe, expect, it } from 'vitest';
import {
  DEPLOY_STATUS_CLASSIC_FRAME_RE,
  DEPLOY_STATUS_SETUP_RE,
  isDeployStatusClassicFrame,
  isDeployStatusInjectPage,
  isDeployStatusSetupPage
} from '../sfInject/content/matchers/deployStatusPages.js';
import {
  buildDeployDetailModel,
  decodeDeployHtmlEntities,
  extractApexClassAndLineFromStackTrace,
  extractDeployAsyncIdFromRow,
  findFailedDeploymentRows,
  isApexClassComponent,
  normalizeComponentType,
  normalizeDeployAsyncId,
  parseApexStackTraceFrames
} from '../sfInject/content/injectors/deployStatusInlineDetailsDom.js';
import {
  handleSfInjectMessage,
  normalizeApexClassId,
  normalizeApexClassName,
  normalizeDeployStatusAsyncId,
  normalizeInitialLine
} from '../sfInject/background/handlers.js';
import { normalizeSfInjectConfig } from '../sfInject/lib/settings.js';

describe('Deployment Status URL matcher', () => {
  it('acepta Lightning, sandbox y el iframe/direct URL', () => {
    expect(isDeployStatusSetupPage('https://acme.lightning.force.com/lightning/setup/DeployStatus/page')).toBe(true);
    expect(isDeployStatusSetupPage('https://acme--dev.sandbox.my.salesforce-setup.com/lightning/setup/DeployStatus/page?address=%2Fchangemgmt%2FmonitorDeployment.apexp')).toBe(true);
    expect(isDeployStatusClassicFrame('https://acme--dev.sandbox.my.salesforce.com/changemgmt/monitorDeployment.apexp?isdtp=p1')).toBe(true);
    expect(isDeployStatusInjectPage('https://acme.salesforce.com/changemgmt/monitorDeployment.apexp')).toBe(true);
    expect(DEPLOY_STATUS_SETUP_RE.test('/lightning/setup/DeployStatus/page')).toBe(true);
    expect(DEPLOY_STATUS_CLASSIC_FRAME_RE.test('/changemgmt/monitorDeployment.apexp')).toBe(true);
  });

  it('rechaza URLs no relacionadas', () => {
    expect(isDeployStatusInjectPage('https://acme.lightning.force.com/lightning/setup/ApexClasses/home')).toBe(false);
    expect(isDeployStatusInjectPage('https://example.test/changemgmt/other.apexp')).toBe(false);
  });
});

describe('Deployment Status DOM helpers', () => {
  it('usa tabla y tbody por sufijo de ID, sin mirar el texto de cabecera', () => {
    const rows = [{ className: 'dataRow' }];
    const tbody = { querySelectorAll: () => rows };
    const table = { querySelector: (selector) => selector.includes('FailedDeploymentsList:tb') ? tbody : null, tBodies: [] };
    const doc = { querySelector: (selector) => selector.includes('FailedDeploymentsList') ? table : null };
    expect(findFailedDeploymentRows(doc)).toEqual(rows);
  });

  it('extrae Async ID desde celda y como fallback desde href', () => {
    const fromCell = {
      querySelector: () => ({ textContent: '0Af000000000001' }),
      querySelectorAll: () => []
    };
    const fromHref = {
      querySelector: () => ({ textContent: '' }),
      querySelectorAll: () => [{ getAttribute: () => "javascript:srcUp('/changemgmt/monitorDeploymentsDetails.apexp?asyncId=0Af000000000002')" }]
    };
    expect(extractDeployAsyncIdFromRow(fromCell)).toBe('0Af000000000001');
    expect(extractDeployAsyncIdFromRow(fromHref)).toBe('0Af000000000002');
    expect(normalizeDeployAsyncId('0Af000000000001')).toBe('0Af000000000001');
  });
});

describe('modelo de detalle de deploy', () => {
  it('conserva simultáneamente fallos de componentes, tests, error global y cobertura', () => {
    const model = buildDeployDetailModel({ soap: {
      componentFailures: [{ fullName: 'MyClass', componentType: 'Apex_Class', lineNumber: '12', columnNumber: '4', problem: 'Nope', fileName: 'classes/MyClass.cls' }],
      runTestResult: { failures: [{ className: 'MyTest', methodName: 'shouldFail', message: 'Assertion', stackTrace: 'Class.MyTest.shouldFail: line 28, column 1', time: '22' }], codeCoverageWarnings: [{ message: 'Coverage warning' }] },
      errorMessage: 'General error'
    } });
    expect(model.componentFailures).toHaveLength(1);
    expect(model.testFailures).toHaveLength(1);
    expect(model.errorMessage).toBe('General error');
    expect(model.coverageWarnings).toEqual(['Coverage warning']);
  });

  it('soporta respuesta vacía y normaliza ApexClass/stack trace', () => {
    const empty = buildDeployDetailModel({ soap: {} });
    expect(empty.componentFailures).toEqual([]);
    expect(empty.testFailures).toEqual([]);
    expect(normalizeComponentType('Apex_Class')).toBe('apexclass');
    expect(isApexClassComponent('apex class')).toBe(true);
    expect(extractApexClassAndLineFromStackTrace('Class.My_Test.run: line 44, column 2')).toEqual({ className: 'My_Test', initialLine: 44 });
  });
});

describe('entidades y trazas de deploy', () => {
  it('decodifica entidades HTML/XML literales antes de mostrar los fallos', () => {
    const message = 'An object &apos;Task.AV_OrigenApp__c&apos; &amp; &quot;other&quot; was not found';
    expect(decodeDeployHtmlEntities(message)).toBe('An object \'Task.AV_OrigenApp__c\' & "other" was not found');
    expect(decodeDeployHtmlEntities('&amp;apos;')).toBe("'");
    expect(buildDeployDetailModel({ soap: { componentFailures: [{ problem: message }] } }).componentFailures[0].problem)
      .toBe('An object \'Task.AV_OrigenApp__c\' & "other" was not found');
  });

  it('identifica todos los frames Apex navegables del stack trace inline', () => {
    const trace = 'Class.My_Test.methodOne: line 44, column 2\nClass.Helper.run: line 9';
    expect(parseApexStackTraceFrames(trace)).toMatchObject([
      { className: 'My_Test', initialLine: 44 },
      { className: 'Helper', initialLine: 9 }
    ]);
  });
});

describe('validación del handler de Apex', () => {
  it('acepta sólo IDs, nombres y líneas válidos', () => {
    expect(normalizeDeployStatusAsyncId('0Af000000000001')).toBe('0Af000000000001');
    expect(normalizeApexClassId('01p000000000001')).toBe('01p000000000001');
    expect(normalizeApexClassName('ns__My_Class')).toBe('ns__My_Class');
    expect(normalizeInitialLine(42)).toBe(42);
    expect(normalizeDeployStatusAsyncId('x')).toBeNull();
    expect(normalizeApexClassId('../../bad')).toBeNull();
    expect(normalizeApexClassName('Bad name; DROP')).toBeNull();
    expect(normalizeInitialLine(-1)).toBeNull();
  });

  it('mantiene deployStatusInlineDetails desactivada por defecto', () => {
    const cfg = normalizeSfInjectConfig({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.integrations.deployStatusInlineDetails).toBe(false);
  });

  it('rechaza sender ajeno y no consulta detalles con la integración desactivada', async () => {
    const message = { type: 'sfInject:getDeployStatusDetail', orgId: '00D000000000001', asyncId: '0Af000000000001' };
    await expect(handleSfInjectMessage(message, { url: 'https://example.test/' })).resolves.toEqual({ ok: false, reason: 'FORBIDDEN' });
    await expect(handleSfInjectMessage(message, { url: 'https://acme.my.salesforce.com/changemgmt/monitorDeployment.apexp' })).resolves.toEqual({ ok: false, reason: 'DISABLED' });
  });
});
