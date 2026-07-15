import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  extractCohortIdFromFlag,
  isDistinctIdInCohort,
  isLogiAdvisorFlagEnabledForDistinctId,
  LOGI_FLAG_DISABLED,
  fetchAdvisorConfigPayload
} from '../services/logi-proxy/src/posthog.js';

const FLAG_WITH_COHORT = {
  active: true,
  filters: {
    groups: [
      {
        properties: [
          {
            type: 'cohort',
            operator: 'in',
            value: 180098,
            cohort_name: 'beta-ai-advisor'
          }
        ],
        rollout_percentage: 100
      }
    ]
  }
};

describe('extractCohortIdFromFlag', () => {
  it('reads cohort id from release conditions', () => {
    expect(extractCohortIdFromFlag(FLAG_WITH_COHORT)).toBe(180098);
  });
});

describe('isDistinctIdInCohort', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when person belongs to cohort', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const u = String(url);
        if (u.includes('/persons/?distinct_id=')) {
          return {
            ok: true,
            json: async () => ({ results: [{ uuid: 'person-uuid-1' }] })
          };
        }
        if (u.includes('/persons/cohorts/?person_id=person-uuid-1')) {
          return {
            ok: true,
            json: async () => ({ results: [{ id: 180098, name: 'beta-ai-advisor' }] })
          };
        }
        throw new Error(`unexpected fetch: ${u}`);
      })
    );

    const enabled = await isDistinctIdInCohort(
      { POSTHOG_PERSONAL_API_KEY: 'phx_test', POSTHOG_PROJECT_ID: '191202' },
      '9f714351-1446-4c09-8a72-37aec34a91f1',
      180098
    );
    expect(enabled).toBe(true);
  });

  it('accepts install id that equals person uuid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const u = String(url);
        if (u.includes('/persons/?distinct_id=')) {
          return { ok: true, json: async () => ({ results: [] }) };
        }
        if (u.includes('/persons/cohorts/?person_id=54d7961f-7abf-5228-ae43-1b7bde6f8bf0')) {
          return {
            ok: true,
            json: async () => ({ results: [{ id: 180098, name: 'beta-ai-advisor' }] })
          };
        }
        throw new Error(`unexpected fetch: ${u}`);
      })
    );

    const enabled = await isDistinctIdInCohort(
      { POSTHOG_PERSONAL_API_KEY: 'phx_test', POSTHOG_PROJECT_ID: '191202' },
      '54d7961f-7abf-5228-ae43-1b7bde6f8bf0',
      180098
    );
    expect(enabled).toBe(true);
  });
});

describe('isLogiAdvisorFlagEnabledForDistinctId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses cohort membership for remote config flags', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const u = String(url);
        if (u.includes('/persons/?distinct_id=')) {
          return {
            ok: true,
            json: async () => ({ results: [{ uuid: 'person-uuid-1' }] })
          };
        }
        if (u.includes('/persons/cohorts/?person_id=person-uuid-1')) {
          return {
            ok: true,
            json: async () => ({ results: [{ id: 180098, name: 'beta-ai-advisor' }] })
          };
        }
        throw new Error(`unexpected fetch: ${u}`);
      })
    );

    const enabled = await isLogiAdvisorFlagEnabledForDistinctId(
      { POSTHOG_PERSONAL_API_KEY: 'phx_test', POSTHOG_PROJECT_ID: '191202' },
      '9f714351-1446-4c09-8a72-37aec34a91f1',
      FLAG_WITH_COHORT
    );
    expect(enabled).toBe(true);
  });
});

describe('fetchAdvisorConfigPayload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns LOGI_FLAG_DISABLED without fetching remote config when user is out of cohort', async () => {
    const fetchMock = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('/feature_flags/?search=')) {
        return {
          ok: true,
          json: async () => ({ results: [{ key: 'sfoc_apex_log_ai_advisor', active: true, ...FLAG_WITH_COHORT }] })
        };
      }
      if (u.includes('/persons/?distinct_id=')) {
        return { ok: true, json: async () => ({ results: [] }) };
      }
      if (u.includes('/persons/cohorts/?person_id=')) {
        return { ok: true, json: async () => ({ results: [] }) };
      }
      throw new Error(`unexpected fetch: ${u}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchAdvisorConfigPayload(
      {
        POSTHOG_PERSONAL_API_KEY: 'phx_test',
        POSTHOG_PROJECT_ID: '191202'
      },
      { distinctId: '00000000-0000-4000-8000-000000000099' }
    );

    expect(result).toBe(LOGI_FLAG_DISABLED);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/persons/?distinct_id='))).toBe(true);
  });
});
