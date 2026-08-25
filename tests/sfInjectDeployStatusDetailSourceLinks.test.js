import { describe, expect, it } from 'vitest';
import {
  isDeployStatusDetailClassicFrame,
  isDeployStatusDetailInjectPage,
  isDeployStatusDetailSetupPage
} from '../sfInject/content/matchers/deployStatusPages.js';
import {
  extractComponentErrorRow,
  extractTestErrorRow,
  findComponentErrorsTable,
  findTestErrorsTable,
  parseApexStackTraceFrames,
  splitTestErrorMessage
} from '../sfInject/content/injectors/deployStatusDetailSourceLinksDom.js';
import { isSfInjectIntegrationEnabled, normalizeSfInjectConfig } from '../sfInject/lib/settings.js';

describe('Deploy Status detail matcher', () => {
  it('reconoce la ruta Lightning sólo con address de detalle decodificado', () => {
    expect(isDeployStatusDetailSetupPage('https://acme--dev.sandbox.my.salesforce-setup.com/lightning/setup/DeployStatus/page?address=%2Fchangemgmt%2FmonitorDeploymentsDetails.apexp%3FasyncId%3D0Af000000000001')).toBe(true);
    expect(isDeployStatusDetailSetupPage('https://acme.lightning.force.com/lightning/setup/DeployStatus/page?address=%2Fchangemgmt%2FmonitorDeployment.apexp')).toBe(false);
  });

  it('reconoce el iframe/direct URL y rechaza páginas ajenas', () => {
    expect(isDeployStatusDetailClassicFrame('https://acme.my.salesforce.com/changemgmt/monitorDeploymentsDetails.apexp?asyncId=0Af000000000001')).toBe(true);
    expect(isDeployStatusDetailInjectPage('https://acme.my.salesforce.com/changemgmt/monitorDeployment.apexp')).toBe(false);
    expect(isDeployStatusDetailInjectPage('https://acme.lightning.force.com/lightning/setup/ApexClasses/home')).toBe(false);
  });
});

describe('Detalle de errores: extracción y stack trace', () => {
  it('detecta las tablas por ID/clase estructural', () => {
    const component = { id: 'component' };
    const tests = { id: 'tests' };
    const doc = { querySelector: (selector) => selector.includes('componentErrorsTable') ? component : tests };
    expect(findComponentErrorsTable(doc)).toBe(component);
    expect(findTestErrorsTable(doc)).toBe(tests);
  });

  it('extrae clase Apex y línea de Component Errors', () => {
    const cells = {
      'td[id$=":type"]': { textContent: 'Apex Class' },
      'td[id$=":apiName"]': { textContent: 'My_Class' },
      'td[id$=":line"]': { textContent: '42' }
    };
    const item = extractComponentErrorRow({ querySelector: (selector) => cells[selector] || null });
    expect(item.isApexClass).toBe(true);
    expect(item.className).toBe('My_Class');
    expect(item.initialLine).toBe(42);
  });

  it('parsea todos los frames válidos y no convierte texto no navegable', () => {
    const trace = 'System.AssertException: failed\nClass.ns__My_Test.testOne: line 12, column 1\nnot a frame\nClass.Helper.run: line 8';
    expect(parseApexStackTraceFrames(trace)).toMatchObject([
      { className: 'ns__My_Test', initialLine: 12 },
      { className: 'Helper', initialLine: 8 }
    ]);
    expect(parseApexStackTraceFrames('System.Exception: plain text')).toEqual([]);
  });

  it('usa Error Message como stack trace en Apex Test Failures', () => {
    const cells = {
      'td[id$=":className"]': { textContent: 'My_Test' },
      'td[id$=":stackTrace"]': null,
      'td[id$=":errorMessage"]': { textContent: 'Assertion failed\nStack Trace: Class.My_Test.testOne: line 389, column 1' }
    };
    const item = extractTestErrorRow({ querySelector: (selector) => cells[selector] || null });
    expect(item.className).toBe('My_Test');
    expect(item.initialLine).toBe(389);
    expect(item.stackCell).toBe(cells['td[id$=":errorMessage"]']);
  });

  it('resuelve Class Name y Error Message desde la cabecera Visualforce headerRow', () => {
    const classCell = { textContent: 'FRA_Case_Cierre_Validation_Test' };
    const methodCell = { textContent: 'tc01ValidoCompleto' };
    const errorCell = {
      textContent: 'System.AssertException: Assertion Failed\nStack Trace: Class.FRA_Case_Cierre_Validation_Test.tc01ValidoCompleto: line 75, column 1'
    };
    const table = {
      querySelectorAll: () => [
        { textContent: 'Class Name' },
        { textContent: 'Method Name' },
        { textContent: 'Error Message' }
      ]
    };
    const row = {
      closest: () => table,
      querySelector: () => null,
      querySelectorAll: () => [classCell, methodCell, errorCell]
    };
    const item = extractTestErrorRow(row);
    expect(item.className).toBe('FRA_Case_Cierre_Validation_Test');
    expect(item.initialLine).toBe(75);
    expect(item.classCell).toBe(classCell);
    expect(item.stackCell).toBe(errorCell);
  });

  it('separa el mensaje legible de los frames del stack trace', () => {
    const text = 'System.AssertException: Assertion Failed\nStack Trace: Class.FRA_Case_Cierre_Validation_Test.tc01ValidoCompleto: line 75, column 1';
    const detail = splitTestErrorMessage(text);
    expect(detail.message).toBe('System.AssertException: Assertion Failed');
    expect(detail.trace).toContain('Stack Trace: Class.FRA_Case_Cierre_Validation_Test');
    expect(detail.frames).toMatchObject([{ className: 'FRA_Case_Cierre_Validation_Test', initialLine: 75 }]);
  });
});

describe('configuración independiente del detalle', () => {
  it('permanece opt-in y se puede activar sin la integración inline', () => {
    const cfg = normalizeSfInjectConfig({ enabled: true, integrations: { deployStatusDetailSourceLinks: true } });
    expect(cfg.integrations.deployStatusInlineDetails).toBe(false);
    expect(isSfInjectIntegrationEnabled(cfg, 'deployStatusDetailSourceLinks')).toBe(true);
  });
});
