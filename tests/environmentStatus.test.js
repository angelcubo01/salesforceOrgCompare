import { describe, expect, it } from 'vitest';
import { buildSessionDetailPayload } from '../shared/sessionInfoApi.js';
import { clearDescribeCachesForOrg, describeGlobalCache, describeSobjectCache } from '../background/caches.js';

describe('environmentStatus session detail', () => {
  it('buildSessionDetailPayload works without live API', () => {
    const detail = buildSessionDetailPayload(
      { userId: '005', username: 'u@test.com', name: 'U' },
      null,
      { id: '00D', instanceUrl: 'https://test.salesforce.com', apiVersion: '60.0' },
      null
    );
    expect(detail.session.savedApiVersion).toBe('60.0');
    expect(detail.session.effectiveApiVersion).toBe('60.0');
  });
});

describe('clearDescribeCachesForOrg', () => {
  it('removes org-prefixed cache keys', () => {
    describeGlobalCache.set('org1:global', { sobjects: [] });
    describeSobjectCache.set('org1:Account', { fields: [] });
    describeGlobalCache.set('org2:global', { sobjects: [] });
    clearDescribeCachesForOrg('org1');
    expect(describeGlobalCache.get('org1:global')).toBeUndefined();
    expect(describeSobjectCache.get('org1:Account')).toBeUndefined();
    expect(describeGlobalCache.get('org2:global')).toBeDefined();
    describeGlobalCache.clear();
    describeSobjectCache.clear();
  });
});
