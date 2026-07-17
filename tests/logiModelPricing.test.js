import { describe, expect, it } from 'vitest';
import {
  formatLogiModelPricingLabel,
  formatUsdPer1M,
  openRouterPerTokenToPer1M,
  parseOpenRouterModelsPricing,
  resolveLogiModelPricing
} from '../shared/logi/logiModelPricing.js';

describe('logiModelPricing', () => {
  it('converts OpenRouter per-token strings to per-1M', () => {
    expect(openRouterPerTokenToPer1M('0.000003')).toBeCloseTo(3, 6);
    expect(openRouterPerTokenToPer1M('0.000015')).toBeCloseTo(15, 6);
  });

  it('formats usd per 1M', () => {
    expect(formatUsdPer1M(0)).toBe('$0');
    expect(formatUsdPer1M(0.15)).toBe('$0.15');
    expect(formatUsdPer1M(3)).toBe('$3.00');
  });

  it('formats pricing label', () => {
    expect(
      formatLogiModelPricingLabel({ promptPer1M: 3, completionPer1M: 15, source: 'live' })
    ).toBe('In $3.00 · Out $15.00 /1M');
    expect(
      formatLogiModelPricingLabel({ promptPer1M: 0, completionPer1M: 0, source: 'live' }, { freeLabel: 'Gratis' })
    ).toBe('Gratis');
  });

  it('parses OpenRouter models payload', () => {
    const map = parseOpenRouterModelsPricing({
      data: [
        {
          id: 'openai/gpt-4o-mini',
          pricing: { prompt: '0.00000015', completion: '0.0000006' }
        }
      ]
    });
    expect(map['openai/gpt-4o-mini'].promptPer1M).toBeCloseTo(0.15, 6);
    expect(map['openai/gpt-4o-mini'].completionPer1M).toBeCloseTo(0.6, 6);
  });

  it('falls back when live map misses an id', () => {
    const p = resolveLogiModelPricing('anthropic/claude-sonnet-4', {});
    expect(p?.source).toBe('fallback');
    expect(p?.promptPer1M).toBe(3);
  });
});
