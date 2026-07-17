import { describe, expect, it, beforeEach } from 'vitest';
import {
  canSkipLogiAdvisorRemoteFetch,
  isLogiAdvisorCacheFresh,
  LOGI_ADVISOR_CACHE_TTL_MS,
  resetLogiAdvisorCacheForTests,
  setLogiAdvisorMemoryCache,
  unwrapCacheRaw,
  readLogiAdvisorCacheEntry
} from '../shared/logi/logiAdvisorCache.js';
import { DEFAULT_LOGI_ADVISOR_CONFIG } from '../shared/logi/apexLogAiAdvisorConfig.js';

describe('logiAdvisorCache', () => {
  beforeEach(() => {
    resetLogiAdvisorCacheForTests();
  });

  it('does not skip remote fetch on first run / empty cache', () => {
    const empty = unwrapCacheRaw(null);
    expect(empty.fromRemote).toBe(false);
    expect(canSkipLogiAdvisorRemoteFetch(empty)).toBe(false);
  });

  it('does not skip when cached config is disabled (avoids locking Logi out)', () => {
    const entry = unwrapCacheRaw({
      config: { ...DEFAULT_LOGI_ADVISOR_CONFIG, enabled: false },
      cachedAt: Date.now(),
      fromRemote: true
    });
    expect(canSkipLogiAdvisorRemoteFetch(entry)).toBe(false);
  });

  it('promotes legacy operational flat cache so Logi keeps working', () => {
    const entry = unwrapCacheRaw({
      ...DEFAULT_LOGI_ADVISOR_CONFIG,
      enabled: true,
      showButton: true,
      transport: 'proxy',
      proxyUrl: 'https://proxy.example/v1/chat',
      modes: {
        free: { enabled: true, default: true },
        byok: { enabled: false, allowedModels: [], maxModelsInChain: 1, allowCustomModelId: false, allowModelPickerInChat: false }
      }
    });
    expect(entry.fromRemote).toBe(true);
    expect(canSkipLogiAdvisorRemoteFetch(entry)).toBe(true);
  });

  it('skips remote fetch for operational fromRemote cache (until force refresh)', () => {
    const at = Date.now() - 1000;
    const entry = unwrapCacheRaw({
      config: {
        ...DEFAULT_LOGI_ADVISOR_CONFIG,
        enabled: true,
        showButton: true,
        transport: 'proxy',
        proxyUrl: 'https://proxy.example/v1/chat',
        modes: {
          free: { enabled: true, default: true },
          byok: {
            enabled: false,
            allowedModels: [],
            maxModelsInChain: 1,
            allowCustomModelId: false,
            allowModelPickerInChat: false
          }
        }
      },
      cachedAt: at,
      fromRemote: true
    });
    expect(isLogiAdvisorCacheFresh(entry.cachedAt)).toBe(true);
    expect(canSkipLogiAdvisorRemoteFetch(entry)).toBe(true);
  });

  it('still skips when TTL expired if cache is operational (refresh only on force)', () => {
    const at = Date.now() - LOGI_ADVISOR_CACHE_TTL_MS - 1000;
    expect(
      canSkipLogiAdvisorRemoteFetch({
        config: {
          ...DEFAULT_LOGI_ADVISOR_CONFIG,
          enabled: true,
          showButton: true,
          transport: 'proxy',
          proxyUrl: 'https://x'
        },
        cachedAt: at,
        fromRemote: true
      })
    ).toBe(true);
  });

  it('keeps memory entry with fromRemote after set', async () => {
    setLogiAdvisorMemoryCache(
      {
        ...DEFAULT_LOGI_ADVISOR_CONFIG,
        enabled: true,
        showButton: true,
        transport: 'proxy',
        proxyUrl: 'https://x',
        modes: {
          free: { enabled: true, default: true },
          byok: {
            enabled: false,
            allowedModels: [],
            maxModelsInChain: 1,
            allowCustomModelId: false,
            allowModelPickerInChat: false
          }
        }
      },
      Date.now(),
      true
    );
    const entry = await readLogiAdvisorCacheEntry();
    expect(entry.fromRemote).toBe(true);
    expect(canSkipLogiAdvisorRemoteFetch(entry)).toBe(true);
  });
});
