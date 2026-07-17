import { describe, expect, it } from 'vitest';
import { DEFAULT_LOGI_ADVISOR_CONFIG } from '../shared/logi/apexLogAiAdvisorConfig.js';
import {
  applyQuotaBonuses,
  effectiveQuotaLimit,
  parseQuotaBonus,
  parseQuotaBonusFromPersonProperties,
  QUOTA_BONUS_PERSON_PROPS,
  ZERO_QUOTA_BONUS
} from '../shared/logi/logiQuotaBonus.js';

describe('parseQuotaBonus', () => {
  it('returns zeros for invalid input', () => {
    expect(parseQuotaBonus(null)).toEqual(ZERO_QUOTA_BONUS);
    expect(parseQuotaBonus(undefined)).toEqual(ZERO_QUOTA_BONUS);
    expect(parseQuotaBonus('x')).toEqual(ZERO_QUOTA_BONUS);
  });

  it('parses signed integers and aliases', () => {
    expect(
      parseQuotaBonus({
        day: 10,
        month: -5,
        user: '20',
        iterations: 3.9
      })
    ).toEqual({ day: 10, month: -5, user: 20, iterations: 3 });

    expect(
      parseQuotaBonus({
        maxChatsPerDay: 7,
        maxChatsPerMonth: -2,
        maxChatsPerUser: 1,
        maxIterationsPerChat: -1
      })
    ).toEqual({ day: 7, month: -2, user: 1, iterations: -1 });
  });

  it('clamps extreme values', () => {
    expect(parseQuotaBonus({ day: 999999, month: -999999 }).day).toBe(100000);
    expect(parseQuotaBonus({ day: 999999, month: -999999 }).month).toBe(-100000);
  });
});

describe('parseQuotaBonusFromPersonProperties', () => {
  it('maps PostHog person property keys', () => {
    expect(
      parseQuotaBonusFromPersonProperties({
        [QUOTA_BONUS_PERSON_PROPS.day]: 10,
        [QUOTA_BONUS_PERSON_PROPS.month]: -5,
        [QUOTA_BONUS_PERSON_PROPS.user]: 100,
        [QUOTA_BONUS_PERSON_PROPS.iterations]: 5
      })
    ).toEqual({ day: 10, month: -5, user: 100, iterations: 5 });
  });
});

describe('effectiveQuotaLimit / applyQuotaBonuses', () => {
  it('floors at 0', () => {
    expect(effectiveQuotaLimit(5, -10)).toBe(0);
    expect(effectiveQuotaLimit(50, 10)).toBe(60);
    expect(effectiveQuotaLimit(50, -5)).toBe(45);
  });

  it('applies bonuses to config limits', () => {
    const base = {
      ...DEFAULT_LOGI_ADVISOR_CONFIG,
      maxChatsPerDay: 50,
      maxChatsPerMonth: 200,
      maxChatsPerUser: 100,
      maxIterationsPerChat: 10
    };
    const out = applyQuotaBonuses(base, {
      day: 10,
      month: -5,
      user: 0,
      iterations: 5
    });
    expect(out.maxChatsPerDay).toBe(60);
    expect(out.maxChatsPerMonth).toBe(195);
    expect(out.maxChatsPerUser).toBe(100);
    expect(out.maxIterationsPerChat).toBe(15);
  });

  it('can zero out a limit with a large negative bonus', () => {
    const out = applyQuotaBonuses(
      { ...DEFAULT_LOGI_ADVISOR_CONFIG, maxChatsPerDay: 5 },
      { day: -10 }
    );
    expect(out.maxChatsPerDay).toBe(0);
  });

  it('returns same object when all bonuses are zero', () => {
    const base = { ...DEFAULT_LOGI_ADVISOR_CONFIG };
    expect(applyQuotaBonuses(base, ZERO_QUOTA_BONUS)).toBe(base);
  });
});
