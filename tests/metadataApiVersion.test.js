import { describe, expect, it } from 'vitest';
import {
  buildDeployApiVersionWindow,
  clampApiVersion,
  formatMetadataApiVersion,
  isApiVersionInRange,
  sortApiVersionLabels
} from '../shared/metadataApiVersion.js';

describe('metadataApiVersion', () => {
  it('formats numeric and dotted versions', () => {
    expect(formatMetadataApiVersion('67')).toBe('67.0');
    expect(formatMetadataApiVersion('v62.0')).toBe('62.0');
    expect(formatMetadataApiVersion(59)).toBe('59.0');
    expect(formatMetadataApiVersion('')).toBe('60.0');
  });

  it('sorts and deduplicates version labels descending', () => {
    expect(sortApiVersionLabels([{ version: '59.0' }, { version: '67' }, { version: '66.0' }, { version: '67.0' }])).toEqual([
      '67.0',
      '66.0',
      '59.0'
    ]);
  });

  it('defaults to org max and allows the last 20 numeric versions', () => {
    const versions = Array.from({ length: 25 }, (_, i) => `${40 + i}.0`);
    const win = buildDeployApiVersionWindow(versions, 20);
    expect(win.editable).toBe(true);
    expect(win.maxVersion).toBe('64.0');
    expect(win.minVersion).toBe('44.0');
    expect(win.defaultVersion).toBe('64.0');
    expect(win.options[0]).toBe('64.0');
    expect(win.options[win.options.length - 1]).toBe('44.0');
    expect(isApiVersionInRange('39.0', win.minVersion, win.maxVersion)).toBe(false);
    expect(isApiVersionInRange('40.0', '40.0', '60.0')).toBe(true);
  });

  it('uses 60.0 default with 40.0–60.0 window when org max is 60.0', () => {
    const versions = Array.from({ length: 21 }, (_, i) => `${40 + i}.0`);
    const win = buildDeployApiVersionWindow(versions, 20);
    expect(win.maxVersion).toBe('60.0');
    expect(win.minVersion).toBe('40.0');
    expect(win.defaultVersion).toBe('60.0');
    expect(clampApiVersion('39', '40.0', '60.0')).toBe('40.0');
    expect(clampApiVersion('61', '40.0', '60.0')).toBe('60.0');
  });

  it('locks editing when org does not expose 20 versions below max', () => {
    const win = buildDeployApiVersionWindow(['60.0', '59.0', '58.0', '50.0'], 20);
    expect(win.editable).toBe(false);
    expect(win.maxVersion).toBe('60.0');
    expect(win.defaultVersion).toBe('60.0');
    expect(win.options).toEqual(['60.0']);
  });

  it('clamps values to deploy window', () => {
    expect(clampApiVersion('80', '40.0', '60.0')).toBe('60.0');
    expect(clampApiVersion('39', '40.0', '60.0')).toBe('40.0');
    expect(isApiVersionInRange('55.0', '40.0', '60.0')).toBe(true);
    expect(isApiVersionInRange('39.0', '40.0', '60.0')).toBe(false);
  });
});
