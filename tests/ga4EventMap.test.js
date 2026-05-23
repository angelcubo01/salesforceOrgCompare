import { describe, it, expect } from 'vitest';
import {
  parseAppModeFromComparisonUrl,
  usageEntryToGa4Event,
  telemetryOptOutGa4Event
} from '../shared/ga4EventMap.js';

describe('parseAppModeFromComparisonUrl', () => {
  it('extrae nav/op de chrome-extension', () => {
    const url =
      'chrome-extension://abc/code/code.html?left=a&right=b&nav=development&op=ApexTests';
    expect(parseAppModeFromComparisonUrl(url)).toBe('development/ApexTests');
  });

  it('rechaza URLs no extension', () => {
    expect(parseAppModeFromComparisonUrl('https://evil.example/')).toBe('');
  });
});

describe('usageEntryToGa4Event', () => {
  it('mapea comparison_run sin nombres de descriptor', () => {
    const ev = usageEntryToGa4Event(
      {
        kind: 'codeComparison',
        artifactType: 'ApexClass',
        phase: 'render',
        leftOrgId: '00Dsecret000001',
        rightOrgId: '00Dsecret000002',
        viaRetrieveZip: true,
        descriptor: { name: 'SecretClass', testLevel: 'RunSpecifiedTests', testsConfigured: 3 },
        comparisonUrl:
          'chrome-extension://x/code/code.html?nav=comparator&op=Comparator'
      },
      { extensionVersion: '2.6', uiLanguage: 'es' }
    );
    expect(ev?.name).toBe('comparison_run');
    expect(ev?.params.artifact_type).toBe('ApexClass');
    expect(ev?.params.via_retrieve_zip).toBe(1);
    expect(ev?.params.has_left_org).toBe(1);
    expect(ev?.params.has_right_org).toBe(1);
    expect(ev?.params.two_orgs_selected).toBe(1);
    expect(ev?.params.left_org_slot).toBeUndefined();
    expect(ev?.params.app_mode).toBe('comparator/Comparator');
    expect(ev?.params.desc_testLevel).toBe('RunSpecifiedTests');
    expect(ev?.params.desc_testsConfigured).toBe(3);
    expect(ev?.params.desc_name).toBeUndefined();
    expect(ev?.params.extension_version).toBe('2.6');
  });

  it('devuelve null sin kind ni artifactType', () => {
    expect(usageEntryToGa4Event({})).toBeNull();
  });
});

describe('telemetryOptOutGa4Event', () => {
  it('nombre fijo telemetry_opt_out', () => {
    const ev = telemetryOptOutGa4Event({ extensionVersion: '2.6' });
    expect(ev.name).toBe('telemetry_opt_out');
    expect(ev.params.sfoc_source).toBe('extension');
  });
});
