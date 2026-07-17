import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOGI_ADVISOR_CONFIG,
  parseLogiAdvisorConfig,
  resolveLogiRuntime,
  resolveAllowedLogiModes,
  validateLogiSelectedModel,
  coerceLogiUserMode
} from '../shared/logi/apexLogAiAdvisorConfig.js';
import {
  normalizeLogiUserSettings,
  sanitizeLogiUserSettingsForUi
} from '../shared/logi/logiUserSettings.js';

describe('resolveAllowedLogiModes', () => {
  it('returns free only by default payload', () => {
    const cfg = parseLogiAdvisorConfig({
      ...DEFAULT_LOGI_ADVISOR_CONFIG,
      enabled: true,
      modes: {
        free: { enabled: true, default: true },
        byok: { enabled: false }
      }
    });
    expect(resolveAllowedLogiModes(cfg)).toEqual(['free']);
  });

  it('includes free and byok when both enabled', () => {
    const cfg = parseLogiAdvisorConfig({
      modes: {
        free: { enabled: true, default: true },
        byok: { enabled: true }
      }
    });
    expect(resolveAllowedLogiModes(cfg)).toEqual(['free', 'byok']);
  });
});

describe('resolveLogiRuntime', () => {
  const baseConfig = parseLogiAdvisorConfig({
    enabled: true,
    showButton: true,
    transport: 'proxy',
    proxyUrl: 'https://example.workers.dev/v1/chat',
    proxyAuthToken: 'secret',
    modes: {
      free: { enabled: true, default: true },
      byok: { enabled: true, allowedModels: ['openai/gpt-4o'] }
    }
  });

  it('byok without key falls back to free', () => {
    const user = normalizeLogiUserSettings({ logiMode: 'byok' });
    const rt = resolveLogiRuntime(baseConfig, user);
    expect(rt.mode).toBe('free');
    expect(rt.modeFallback).toBe(true);
    expect(rt.fallbackReason).toBe('BYOK_NO_KEY');
    expect(rt.models.some((m) => m.includes(':free'))).toBe(true);
  });

  it('byok uses user key and selected models', () => {
    const user = normalizeLogiUserSettings({
      logiMode: 'byok',
      logiByokOpenRouterKey: 'sk-or-test',
      logiByokModels: ['openai/gpt-4o']
    });
    const rt = resolveLogiRuntime(baseConfig, user);
    expect(rt.mode).toBe('byok');
    expect(rt.byokActive).toBe(true);
    expect(rt.apiKeySource).toBe('user');
    expect(rt.openRouterApiKey).toBe('sk-or-test');
  });

  it('reads legacy logiSelectedPremiumModel as byok model', () => {
    const user = normalizeLogiUserSettings({
      logiMode: 'byok',
      logiByokOpenRouterKey: 'sk-or-test',
      logiSelectedPremiumModel: 'openai/gpt-4o'
    });
    const rt = resolveLogiRuntime(baseConfig, user);
    expect(rt.selectedModel).toBe('openai/gpt-4o');
  });

  it('coerces disallowed user mode', () => {
    const cfg = parseLogiAdvisorConfig({
      modes: {
        free: { enabled: true, default: true },
        byok: { enabled: false }
      }
    });
    expect(coerceLogiUserMode(cfg, 'byok')).toBe('free');
    expect(coerceLogiUserMode(cfg, 'payg')).toBe('free');
  });
});

describe('validateLogiSelectedModel', () => {
  const cfg = parseLogiAdvisorConfig({
    modes: {
      byok: { enabled: true, allowedModels: ['anthropic/claude-sonnet-4'] }
    }
  });

  it('rejects unknown byok model', () => {
    expect(validateLogiSelectedModel(cfg, 'unknown/model')).toBeNull();
  });

  it('accepts allowed byok model', () => {
    expect(validateLogiSelectedModel(cfg, 'anthropic/claude-sonnet-4')).toBe(
      'anthropic/claude-sonnet-4'
    );
  });
});

describe('sanitizeLogiUserSettingsForUi', () => {
  it('never exposes api key', () => {
    const s = sanitizeLogiUserSettingsForUi(
      normalizeLogiUserSettings({ logiByokOpenRouterKey: 'sk-or-secret' })
    );
    expect(s.hasByokKey).toBe(true);
    expect(JSON.stringify(s)).not.toContain('sk-or-secret');
  });
});
