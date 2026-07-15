import { describe, expect, it } from 'vitest';
import { isLogiAdvisorFlagEnabled } from '../shared/posthogLogiAdvisorFlag.js';

describe('isLogiAdvisorFlagEnabled', () => {
  it('returns false without posthog client', () => {
    expect(isLogiAdvisorFlagEnabled(null)).toBe(false);
    expect(isLogiAdvisorFlagEnabled(undefined)).toBe(false);
  });

  it('returns false when isFeatureEnabled is false even with encrypted payload hint', () => {
    const ph = {
      isFeatureEnabled: () => false,
      getFeatureFlag: () => false,
      getFeatureFlagPayload: () => '******** (encrypted)'
    };
    expect(isLogiAdvisorFlagEnabled(ph)).toBe(false);
  });

  it('returns true when isFeatureEnabled is true', () => {
    const ph = {
      isFeatureEnabled: (key) => key === 'sfoc_apex_log_ai_advisor',
      getFeatureFlag: () => false
    };
    expect(isLogiAdvisorFlagEnabled(ph)).toBe(true);
  });
});
