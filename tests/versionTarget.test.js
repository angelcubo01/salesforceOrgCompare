import { describe, it, expect } from 'vitest';
import {
  compareExtensionVersions,
  parseVersionTarget,
  matchesVersionTarget,
  hasVersionTargetFields
} from '../shared/versionTarget.js';

describe('compareExtensionVersions', () => {
  it('compara segmentos numéricos', () => {
    expect(compareExtensionVersions('2.13', '2.14')).toBe(-1);
    expect(compareExtensionVersions('2.14', '2.13')).toBe(1);
    expect(compareExtensionVersions('2.13', '2.13')).toBe(0);
    expect(compareExtensionVersions('2.13.1', '2.13')).toBe(1);
  });
});

describe('parseVersionTarget', () => {
  it('acepta alias minExtensionVersion / maxExtensionVersion', () => {
    const t = parseVersionTarget({ minExtensionVersion: '2.14', maxExtensionVersion: '2.20' });
    expect(t).toEqual({ minVersion: '2.14', maxVersion: '2.20' });
  });

  it('devuelve null sin restricciones', () => {
    expect(parseVersionTarget({})).toBeNull();
    expect(parseVersionTarget({ hidden: true })).toBeNull();
  });
});

describe('matchesVersionTarget', () => {
  it('sin target aplica siempre', () => {
    expect(matchesVersionTarget(null, '2.10')).toBe(true);
  });

  it('respeta minVersion y maxVersion', () => {
    const t = parseVersionTarget({ minVersion: '2.14', maxVersion: '2.16' });
    expect(matchesVersionTarget(t, '2.13')).toBe(false);
    expect(matchesVersionTarget(t, '2.14')).toBe(true);
    expect(matchesVersionTarget(t, '2.15')).toBe(true);
    expect(matchesVersionTarget(t, '2.17')).toBe(false);
  });

  it('respeta lista versions', () => {
    const t = parseVersionTarget({ versions: ['2.14', '2.16'] });
    expect(matchesVersionTarget(t, '2.14')).toBe(true);
    expect(matchesVersionTarget(t, '2.15')).toBe(false);
  });

  it('respeta excludeVersions', () => {
    const t = parseVersionTarget({ excludeVersions: ['2.13', '2.14'] });
    expect(matchesVersionTarget(t, '2.13')).toBe(false);
    expect(matchesVersionTarget(t, '2.15')).toBe(true);
  });
});

describe('hasVersionTargetFields', () => {
  it('detecta campos de versión', () => {
    expect(hasVersionTargetFields({ minVersion: '2.14' })).toBe(true);
    expect(hasVersionTargetFields({ tools: {} })).toBe(false);
  });
});
