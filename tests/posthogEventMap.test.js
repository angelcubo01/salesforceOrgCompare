import { describe, it, expect } from 'vitest';
import {
  decodeTelemetryPathValue,
  parseAppModeFromComparisonUrl,
  parseComparisonUrlParams,
  telemetrySafeComparisonUrl,
  usageEntryToPosthogEvent,
  extensionLifecyclePosthogEvent,
  telemetryEnabledPosthogEvent,
  telemetryOptOutPosthogEvent
} from '../shared/posthogEventMap.js';

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

describe('decodeTelemetryPathValue', () => {
  it('convierte %2F en /', () => {
    expect(decodeTelemetryPathValue('CC_OTP%2Fcontroller.js')).toBe('CC_OTP/controller.js');
  });
});

describe('parseComparisonUrlParams', () => {
  it('extrae key, type y fileName', () => {
    const url =
      'chrome-extension://abc/code/code.html?type=ApexClass&key=MyClass&fileName=MyClass.cls';
    expect(parseComparisonUrlParams(url)).toEqual({
      item_key: 'MyClass',
      item_type: 'ApexClass',
      item_file: 'MyClass.cls'
    });
  });

  it('decodifica key con %2F en la URL', () => {
    const url =
      'chrome-extension://abc/code/code.html?type=Aura&key=CC_MCC_Clasificar%2Fcontroller.js';
    expect(parseComparisonUrlParams(url).item_key).toBe('CC_MCC_Clasificar/controller.js');
  });
});

describe('telemetrySafeComparisonUrl', () => {
  it('elimina key y fileName de la URL enviada a PostHog', () => {
    const url =
      'chrome-extension://abc/code/code.html?nav=comparator&type=Aura&key=Foo%2Fbar.js&fileName=bar.js';
    const safe = telemetrySafeComparisonUrl(url);
    expect(safe).toContain('nav=comparator');
    expect(safe).not.toContain('key=');
    expect(safe).not.toContain('%2F');
  });
});

describe('usageEntryToPosthogEvent', () => {
  it('mapea comparison_run con identidad del elemento y métricas', () => {
    const ev = usageEntryToPosthogEvent(
      {
        kind: 'codeComparison',
        artifactType: 'ApexClass',
        phase: 'render',
        leftOrgId: '00Dsecret000001',
        rightOrgId: '00Dsecret000002',
        viaRetrieveZip: true,
        leftFilesCount: 2,
        diffLines: 15,
        ok: true,
        descriptor: {
          name: 'SecretClass',
          key: 'SecretClass',
          testLevel: 'RunSpecifiedTests',
          testsConfigured: 3,
          names: ['A', 'B']
        },
        comparisonUrl:
          'chrome-extension://x/code/code.html?nav=comparator&op=Comparator&type=ApexClass&key=SecretClass'
      },
      { extensionVersion: '2.6', uiLanguage: 'es' }
    );
    expect(ev?.name).toBe('comparison_run');
    expect(ev?.properties.artifact_type).toBe('ApexClass');
    expect(ev?.properties.element_name).toBe('SecretClass');
    expect(ev?.properties.metadata_key).toBe('SecretClass');
    expect(ev?.properties.item_key).toBe('SecretClass');
    expect(ev?.properties.element_compared).toBe('SecretClass');
    expect(ev?.properties.item_type).toBe('ApexClass');
    expect(ev?.properties.left_files_count).toBe(2);
    expect(ev?.properties.diff_lines).toBe(15);
    expect(ev?.properties.ok).toBe(1);
    expect(ev?.properties.via_retrieve_zip).toBe(1);
    expect(ev?.properties.desc_class_names_count).toBe(2);
    expect(ev?.properties.desc_name).toBe('SecretClass');
    expect(ev?.properties.extension_version).toBe('2.6');
  });

  it('mapea extension_failure operacional', () => {
    const ev = usageEntryToPosthogEvent({
      kind: 'extension_failure',
      artifactType: 'ApexTests',
      phase: 'run',
      ok: false,
      reason: 'NO_SID',
      error: 'No session'
    });
    expect(ev?.name).toBe('extension_failure');
    expect(ev?.properties.ok).toBe(0);
    expect(ev?.properties.result_reason).toBe('NO_SID');
  });

  it('mapea DependencyExplorer analyze como comparison_run', () => {
    const ev = usageEntryToPosthogEvent({
      kind: 'codeComparison',
      action: 'dependencyExplorerAnalyze',
      artifactType: 'DependencyExplorer',
      phase: 'analyze',
      leftOrgId: '00Dleft',
      rowCount: 42,
      typesCount: 5,
      success: true,
      descriptor: {
        name: 'ApexClass',
        resourceType: 'apexClass',
        section: 'single',
        queryDirection: 'transitive',
        source: 'standard'
      },
      comparisonUrl: 'chrome-extension://abc/code/code.html?nav=monitoring&op=DependencyExplorer'
    });
    expect(ev?.name).toBe('comparison_run');
    expect(ev?.properties.artifact_type).toBe('DependencyExplorer');
    expect(ev?.properties.action).toBe('dependencyExplorerAnalyze');
    expect(ev?.properties.row_count).toBe(42);
    expect(ev?.properties.types_count).toBe(5);
    expect(ev?.properties.desc_resourceType).toBe('apexClass');
    expect(ev?.properties.desc_queryDirection).toBe('transitive');
    expect(ev?.properties.app_mode).toBe('monitoring/DependencyExplorer');
  });

  it('incluye solo sf_user_label cuando el entry lo trae', () => {
    const ev = usageEntryToPosthogEvent({
      kind: 'codeComparison',
      artifactType: 'ApexClass',
      sfUserLabel: 'Alice (Acme)',
      sfUsername: 'user@x.com',
      sfUserName: 'Alice',
      sfOrgDisplayName: 'Acme'
    });
    expect(ev?.properties.sf_user_label).toBe('Alice (Acme)');
    expect(ev?.properties.sf_username).toBeUndefined();
    expect(ev?.properties.sf_user_name).toBeUndefined();
    expect(ev?.properties.sf_org_display_name).toBeUndefined();
  });

  it('incluye nombre de compañía y URLs de sandbox', () => {
    const ev = usageEntryToPosthogEvent({
      kind: 'codeComparison',
      artifactType: 'ApexClass',
      leftOrgId: 'L',
      rightOrgId: 'R',
      leftCompanyName: 'Acme DEV',
      rightCompanyName: 'Acme UAT',
      leftInstanceUrl: 'https://caixa--dev.sandbox.my.salesforce.com',
      rightInstanceUrl: 'https://caixa--uat.sandbox.my.salesforce.com',
      leftIsSandbox: true,
      rightIsSandbox: true
    });
    expect(ev?.properties.left_company_name).toBe('Acme DEV');
    expect(ev?.properties.right_company_name).toBe('Acme UAT');
    expect(ev?.properties.left_sandbox_url).toBe('https://caixa--dev.sandbox.my.salesforce.com');
    expect(ev?.properties.right_sandbox_url).toBe('https://caixa--uat.sandbox.my.salesforce.com');
    expect(ev?.properties.left_is_sandbox).toBe(1);
    expect(ev?.properties.right_is_sandbox).toBe(1);
  });

  it('element_compared con / cuando key viene codificada en descriptor', () => {
    const ev = usageEntryToPosthogEvent({
      kind: 'codeComparison',
      artifactType: 'Aura',
      descriptor: { key: 'CC_OTP%2Fcontroller.js', fileName: 'controller.js' },
      comparisonUrl:
        'chrome-extension://x/code/code.html?type=Aura&key=CC_OTP%2Fcontroller.js'
    });
    expect(ev?.properties.item_key).toBe('CC_OTP/controller.js');
    expect(ev?.properties.element_compared).toBe('CC_OTP/controller.js');
    expect(ev?.properties.metadata_key).toBe('CC_OTP/controller.js');
  });

  it('devuelve null sin kind ni artifactType', () => {
    expect(usageEntryToPosthogEvent({})).toBeNull();
  });
});

describe('telemetryEnabledPosthogEvent', () => {
  it('consentimiento por defecto → telemetry_enabled', () => {
    const ev = telemetryEnabledPosthogEvent({ extensionVersion: '2.6' }, 'default');
    expect(ev.name).toBe('telemetry_enabled');
    expect(ev.properties.telemetry_enabled).toBe(1);
    expect(ev.properties.preference_source).toBe('default');
  });

  it('reactivación en Ajustes → telemetry_opt_in', () => {
    const ev = telemetryEnabledPosthogEvent({ uiLanguage: 'es' }, 'settings');
    expect(ev.name).toBe('telemetry_opt_in');
    expect(ev.properties.preference_source).toBe('settings');
  });
});

describe('extensionLifecyclePosthogEvent', () => {
  it('extension_installed', () => {
    const ev = extensionLifecyclePosthogEvent('extension_installed', { extensionVersion: '2.7' }, {
      install_reason: 'install'
    });
    expect(ev.name).toBe('extension_installed');
    expect(ev.properties.install_reason).toBe('install');
  });

  it('extension_active', () => {
    const ev = extensionLifecyclePosthogEvent('extension_active', {}, { active_source: 'alarm' });
    expect(ev.name).toBe('extension_active');
    expect(ev.properties.active_source).toBe('alarm');
  });

  it('first_org_connected', () => {
    const ev = extensionLifecyclePosthogEvent('first_org_connected', { extensionVersion: '2.7' }, {
      org_connection_source: 'popup',
      org_company_name: 'Acme',
      sf_user_label: 'Jane Doe (Acme)'
    });
    expect(ev.name).toBe('first_org_connected');
    expect(ev.properties.org_connection_source).toBe('popup');
    expect(ev.properties.org_company_name).toBe('Acme');
    expect(ev.properties.sf_user_label).toBe('Jane Doe (Acme)');
  });
});

describe('telemetryOptOutPosthogEvent', () => {
  it('nombre fijo telemetry_opt_out', () => {
    const ev = telemetryOptOutPosthogEvent({ extensionVersion: '2.6' });
    expect(ev.name).toBe('telemetry_opt_out');
    expect(ev.properties.sfoc_source).toBe('extension');
    expect(ev.properties.telemetry_enabled).toBe(0);
    expect(ev.properties.preference_source).toBe('settings');
  });
});
