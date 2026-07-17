import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOGI_ADVISOR_CONFIG,
  isLogiAdvisorOperational,
  parseLogiAdvisorConfig
} from '../shared/logi/apexLogAiAdvisorConfig.js';

describe('parseLogiAdvisorConfig', () => {
  it('returns defaults for invalid input', () => {
    const cfg = parseLogiAdvisorConfig(null);
    expect(cfg.enabled).toBe(false);
    expect(cfg.personaName).toBe('Logi');
    expect(cfg.maxIterationsPerChat).toBe(10);
  });

  it('parses enabled beta config with API key', () => {
    const cfg = parseLogiAdvisorConfig({
      enabled: true,
      showButton: true,
      openRouterApiKey: 'sk-test',
      maxIterationsPerChat: 15
    });
    expect(cfg.enabled).toBe(true);
    expect(cfg.showButton).toBe(true);
    expect(cfg.openRouterApiKey).toBe('sk-test');
    expect(cfg.maxIterationsPerChat).toBe(15);
  });

  it('clamps iteration limits al tope ampliado (base + bonus)', () => {
    const cfg = parseLogiAdvisorConfig({ maxIterationsPerChat: 999_999 });
    expect(cfg.maxIterationsPerChat).toBe(200_000);
  });

  it('permite 0 en límites (cuota efectiva tras bonus negativo)', () => {
    const cfg = parseLogiAdvisorConfig({
      maxIterationsPerChat: 0,
      maxChatsPerDay: 0,
      maxChatsPerMonth: 0,
      maxChatsPerUser: 0
    });
    expect(cfg.maxIterationsPerChat).toBe(0);
    expect(cfg.maxChatsPerDay).toBe(0);
    expect(cfg.maxChatsPerMonth).toBe(0);
    expect(cfg.maxChatsPerUser).toBe(0);
  });

  it('acepta límites altos del servidor sin recortarlos', () => {
    const cfg = parseLogiAdvisorConfig({
      maxIterationsPerChat: 100,
      maxChatsPerUser: 99999,
      maxChatsPerDay: 500,
      maxChatsPerMonth: 5000
    });
    expect(cfg.maxIterationsPerChat).toBe(100);
    expect(cfg.maxChatsPerUser).toBe(99999);
    expect(cfg.maxChatsPerDay).toBe(500);
    expect(cfg.maxChatsPerMonth).toBe(5000);
  });

  it('filters unknown quick actions', () => {
    const cfg = parseLogiAdvisorConfig({
      quickActions: ['debug_errors', 'unknown_action']
    });
    expect(cfg.quickActions).toEqual(['debug_errors']);
  });

  it('parses proxy transport config', () => {
    const cfg = parseLogiAdvisorConfig({
      transport: 'proxy',
      proxyUrl: 'https://api.example.com/v1/chat',
      proxyAuthToken: 'secret'
    });
    expect(cfg.transport).toBe('proxy');
    expect(cfg.proxyUrl).toBe('https://api.example.com/v1/chat');
    expect(cfg.proxyAuthToken).toBe(null);
  });
});

describe('isLogiAdvisorOperational', () => {
  it('requires API key for direct transport', () => {
    expect(
      isLogiAdvisorOperational({
        ...DEFAULT_LOGI_ADVISOR_CONFIG,
        enabled: true,
        showButton: true,
        openRouterApiKey: null
      })
    ).toBe(false);
    expect(
      isLogiAdvisorOperational({
        ...DEFAULT_LOGI_ADVISOR_CONFIG,
        enabled: true,
        showButton: true,
        openRouterApiKey: 'sk-test'
      })
    ).toBe(true);
  });

  it('requires proxy URL for proxy transport', () => {
    expect(
      isLogiAdvisorOperational({
        ...DEFAULT_LOGI_ADVISOR_CONFIG,
        enabled: true,
        showButton: true,
        transport: 'proxy',
        proxyUrl: null,
        proxyAuthToken: null
      })
    ).toBe(false);
    expect(
      isLogiAdvisorOperational({
        ...DEFAULT_LOGI_ADVISOR_CONFIG,
        enabled: true,
        showButton: true,
        transport: 'proxy',
        proxyUrl: 'https://api.example.com/chat',
        proxyAuthToken: null
      })
    ).toBe(true);
  });
});
