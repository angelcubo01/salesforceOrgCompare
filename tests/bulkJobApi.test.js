import { describe, expect, it } from 'vitest';
import {
  buildBulk2JobPath,
  buildBulk2ResultRows,
  buildBulkJobPath,
  bulk1VersionsToTry,
  isBulk1UnknownVersionError,
  normalizeBulkApiVersion,
  normalizeBulkBatch,
  normalizeBulkJob
} from '../shared/bulkJobApi.js';

describe('bulkJobApi', () => {
  it('normalizes api version from org settings', () => {
    expect(normalizeBulkApiVersion('v67.0')).toBe('67.0');
    expect(normalizeBulkApiVersion('67')).toBe('67.0');
    expect(normalizeBulkApiVersion('59.0')).toBe('59.0');
  });

  it('normalizes job and batch rows', () => {
    expect(
      normalizeBulkJob({ id: '750x', state: 'Completed', numberRecordsProcessed: '3' }).state
    ).toBe('Completed');
    expect(normalizeBulkBatch({ id: '751x', state: 'Completed', numberRecordsProcessed: 2 }).id).toBe(
      '751x'
    );
  });

  it('builds bulk job paths', () => {
    expect(buildBulkJobPath('59.0', '750ABC')).toBe('/services/async/59.0/job/750ABC');
    expect(buildBulkJobPath('v67.0', '750ABC')).toBe('/services/async/67.0/job/750ABC');
    expect(buildBulkJobPath('67', '750ABC', 'batch')).toBe('/services/async/67.0/job/750ABC/batch');
    expect(buildBulk2JobPath('ingest', '67.0', '750ABC')).toBe(
      '/services/data/v67.0/jobs/ingest/750ABC'
    );
    expect(buildBulk2JobPath('ingest', '67', '750ABC')).toBe(
      '/services/data/v67.0/jobs/ingest/750ABC'
    );
    expect(buildBulk2JobPath('query', '67.0', '750ABC', 'results')).toBe(
      '/services/data/v67.0/jobs/query/750ABC/results'
    );
  });

  it('detects bulk1 unknown version errors', () => {
    expect(
      isBulk1UnknownVersionError({
        status: 400,
        text: '<exceptionCode>InvalidUrl</exceptionCode><exceptionMessage>unknown version: v67.0</exceptionMessage>'
      })
    ).toBe(true);
    expect(isBulk1UnknownVersionError({ status: 404, text: 'not found' })).toBe(false);
  });

  it('builds bulk2 result rows and version fallbacks', () => {
    expect(buildBulk2ResultRows('bulk2-ingest')).toHaveLength(3);
    expect(buildBulk2ResultRows('bulk2-query')[0].id).toBe('results');
    expect(bulk1VersionsToTry('67.0')[0]).toBe('67.0');
    expect(bulk1VersionsToTry('67.0')).toContain('66.0');
  });
});
