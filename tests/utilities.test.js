import { describe, it, expect } from 'vitest';
import { normalizeUiTheme, normalizeMonacoThemeId, MONACO_THEME_IDS } from '../shared/extensionSettings.js';
import { buildOrgPicklistLabel, sameGroupKey } from '../shared/orgPrefs.js';
import { extractApexTestRunJobId } from '../shared/extractApexTestRunJobId.js';
import { isTestSetupApexTestResult } from '../shared/apexTestMakeDataMethod.js';
import {
  getFileExtension,
  getItemKey,
  getFileKey,
  getDisplayFileName
} from '../code/lib/itemLabels.js';
import { normalizeRetrieveZipPath, readU16, readU32 } from '../code/lib/zipBinary.js';
import { diffLines } from '../vendor/jsdiff/diffLines.mjs';

describe('extensionSettings', () => {
  it('normaliza tema UI', () => {
    expect(normalizeUiTheme('light')).toBe('light');
    expect(normalizeUiTheme('dark')).toBe('dark');
    expect(normalizeUiTheme('other')).toBe('dark');
  });

  it('normaliza tema Monaco', () => {
    expect(normalizeMonacoThemeId('vs-dark')).toBe('vs-dark');
    expect(normalizeMonacoThemeId('invalid')).toBe('sfoc-editor-dark');
    expect(MONACO_THEME_IDS).toContain('sfoc-editor-light');
  });
});

describe('orgPrefs', () => {
  it('formatea etiqueta con grupo y alias', () => {
    const label = buildOrgPicklistLabel(
      { id: '1', instanceUrl: 'https://x.my.salesforce.com' },
      { aliases: { 1: 'UAT' }, groups: { 1: 'CC' } }
    );
    expect(label).toBe('[CC] · UAT');
  });

  it('sameGroupKey compara grupos', () => {
    expect(sameGroupKey('A', 'A')).toBe(true);
    expect(sameGroupKey('', undefined)).toBe(true);
    expect(sameGroupKey('a', 'b')).toBe(false);
  });
});

describe('extractApexTestRunJobId', () => {
  it('extrae id de objeto', () => {
    expect(extractApexTestRunJobId({ id: '707xx0000000001' })).toBe('707xx0000000001');
    expect(extractApexTestRunJobId({ testRunId: '707xx0000000002' })).toBe('707xx0000000002');
  });

  it('extrae id de string JSON', () => {
    expect(extractApexTestRunJobId('707xx0000000003')).toBe('707xx0000000003');
  });

  it('anida body y arrays', () => {
    expect(extractApexTestRunJobId({ body: { asyncApexJobId: '707xx0000000004' } })).toBe('707xx0000000004');
    expect(extractApexTestRunJobId([{ jobId: '707xx0000000005' }])).toBe('707xx0000000005');
  });

  it('devuelve vacío si no hay id', () => {
    expect(extractApexTestRunJobId({})).toBe('');
    expect(extractApexTestRunJobId(null)).toBe('');
  });
});

describe('isTestSetupApexTestResult', () => {
  it('detecta IsTestSetup', () => {
    expect(isTestSetupApexTestResult({ IsTestSetup: true })).toBe(true);
    expect(isTestSetupApexTestResult({ IsTestSetup: 'true' })).toBe(true);
    expect(isTestSetupApexTestResult({})).toBe(false);
  });
});

describe('itemLabels', () => {
  const item = { type: 'ApexClass', key: 'Foo', fileName: 'Foo.cls' };

  it('getFileExtension', () => {
    expect(getFileExtension('Bar.cls')).toBe('cls');
  });

  it('getItemKey y getFileKey', () => {
    expect(getItemKey(item)).toBe('ApexClass:Foo:Foo.cls');
    expect(getFileKey(item, 'left', 'right')).toBe('ApexClass:Foo:Foo.cls:left|right');
  });

  it('getDisplayFileName para Apex y LWC', () => {
    expect(getDisplayFileName(item)).toBe('Foo.cls');
    expect(
      getDisplayFileName({
        type: 'LWC',
        key: 'c',
        fileName: 'lwc/foo/foo.js-meta.xml'
      })
    ).toBe('foo.xml');
  });
});

describe('zipBinary', () => {
  it('lee enteros little-endian', () => {
    const bytes = new Uint8Array([0x34, 0x12, 0x78, 0x56, 0xbc, 0x9a, 0, 0]);
    expect(readU16(bytes, 0)).toBe(0x1234);
    expect(readU32(bytes, 0)).toBe(0x56781234);
    expect(readU32(bytes, 4)).toBe(0x9abc);
  });

  it('normalizeRetrieveZipPath quita unpackaged/', () => {
    expect(normalizeRetrieveZipPath('unpackaged/classes/Foo.cls')).toBe('classes/Foo.cls');
    expect(normalizeRetrieveZipPath('unpackage/lwc/x.js')).toBe('lwc/x.js');
  });
});

describe('diffLines.mjs', () => {
  it('produce partes added/removed/equal', () => {
    const parts = diffLines('a\nb', 'a\nc');
    const hasRemoved = parts.some((p) => p.removed);
    const hasAdded = parts.some((p) => p.added);
    expect(hasRemoved).toBe(true);
    expect(hasAdded).toBe(true);
  });
});
