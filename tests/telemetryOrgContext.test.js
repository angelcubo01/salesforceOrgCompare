import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  enrichUsageLogWithOrgContext,
  normalizeInstanceUrlForTelemetry,
  orgFieldsForTelemetry
} from '../shared/telemetryOrgContext.js';

describe('normalizeInstanceUrlForTelemetry', () => {
  it('devuelve solo el origin', () => {
    expect(
      normalizeInstanceUrlForTelemetry('https://caixa--uat.sandbox.my.salesforce.com/foo')
    ).toBe('https://caixa--uat.sandbox.my.salesforce.com');
  });
});

describe('orgFieldsForTelemetry', () => {
  it('extrae nombre de compañía e URL', () => {
    const f = orgFieldsForTelemetry({
      id: '00Dxxx',
      displayName: 'CaixaBank',
      instanceUrl: 'https://caixa--dev.sandbox.my.salesforce.com/',
      isSandbox: true,
      label: 'DEV'
    });
    expect(f?.companyName).toBe('CaixaBank');
    expect(f?.instanceUrl).toBe('https://caixa--dev.sandbox.my.salesforce.com');
    expect(f?.isSandbox).toBe(true);
  });
});

describe('enrichUsageLogWithOrgContext', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      storage: {
        sync: {
          get: vi.fn(async () => ({}))
        }
      }
    });
  });

  it('rellena campos izquierda y derecha desde savedOrgs', async () => {
    const map = {
      L: {
        id: 'L',
        displayName: 'Empresa Izq',
        instanceUrl: 'https://left.sandbox.my.salesforce.com',
        isSandbox: true,
        label: 'UAT'
      },
      R: {
        id: 'R',
        displayName: 'Empresa Der',
        instanceUrl: 'https://right.sandbox.my.salesforce.com',
        isSandbox: true
      }
    };
    const out = await enrichUsageLogWithOrgContext(
      { leftOrgId: 'L', rightOrgId: 'R', kind: 'codeComparison' },
      map
    );
    expect(out.leftCompanyName).toBe('Empresa Izq');
    expect(out.leftInstanceUrl).toBe('https://left.sandbox.my.salesforce.com');
    expect(out.leftIsSandbox).toBe(true);
    expect(out.rightCompanyName).toBe('Empresa Der');
    expect(out.rightInstanceUrl).toBe('https://right.sandbox.my.salesforce.com');
  });
});
