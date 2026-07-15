import { describe, expect, it } from 'vitest';
import {
  buildApexTestRunProfilesExport,
  mergeApexTestRunProfiles,
  normalizeApexTestRunProfile,
  parseApexTestRunProfilesImport
} from '../shared/apexTestRunProfilesCore.js';

const sampleBody = {
  testLevel: 'RunSpecifiedTests',
  tests: [{ className: 'Foo', testMethods: ['bar'] }]
};

describe('apexTestRunProfilesCore', () => {
  it('normalizes valid profile', () => {
    const p = normalizeApexTestRunProfile({
      name: ' Smoke ',
      runBody: sampleBody
    });
    expect(p?.name).toBe('Smoke');
    expect(p?.runBody.testLevel).toBe('RunSpecifiedTests');
  });

  it('parses wrapped export JSON', () => {
    const payload = buildApexTestRunProfilesExport([
      { id: 'p1', name: 'A', runBody: sampleBody }
    ]);
    const r = parseApexTestRunProfilesImport(JSON.stringify(payload));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.profiles[0].name).toBe('A');
  });

  it('merge replaces by name', () => {
    const a = { id: '1', name: 'Same', runBody: sampleBody };
    const b = {
      id: '2',
      name: 'Same',
      runBody: { ...sampleBody, testLevel: 'RunLocalTests' }
    };
    const merged = mergeApexTestRunProfiles([a], [b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].runBody.testLevel).toBe('RunLocalTests');
  });
});
