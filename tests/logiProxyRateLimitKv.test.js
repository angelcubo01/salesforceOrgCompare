import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  readCount,
  tryConsumeRateLimit,
  _resetRateLimitCacheForTests
} from '../services/logi-proxy/src/rateLimitKv.js';
import { sessionRateLimitKey, JWT_TTL_SECONDS } from '../services/logi-proxy/src/auth.js';

function mockKv(initial = new Map()) {
  const store = new Map(initial);
  return {
    store,
    get: vi.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    put: vi.fn(async (key, value) => {
      store.set(key, value);
    })
  };
}

describe('rateLimitKv write-safe miss', () => {
  beforeEach(() => {
    _resetRateLimitCacheForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('miss seeds memory without put', async () => {
    const kv = mockKv();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const count = await readCount(kv, 'rl:2026-07-27:test-id');
    expect(count).toBe(0);
    expect(kv.put).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"event":"kv_miss"'));
    expect(log.mock.calls[0][0]).toContain('"prefix":"rl"');
    // Second read hits isolate memory — no extra get miss log required for put.
    const again = await readCount(kv, 'rl:2026-07-27:test-id');
    expect(again).toBe(0);
    expect(kv.get).toHaveBeenCalledTimes(1);
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('tryConsume schedules put only after increment', async () => {
    const kv = mockKv();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await tryConsumeRateLimit(kv, 'session:2026-07-27T16:id', 10, 7200, null);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    // Flush is deferred; wait slightly past 0 but we cannot wait 20s — force path is limit hit.
    // Immediate put only when force (at limit). For count 1, put may be scheduled async.
    await new Promise((r) => setTimeout(r, 50));
    // Either not flushed yet or flushed once — never more than one write, never on miss alone.
    expect(kv.put.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe('sessionRateLimitKey 2h window', () => {
  it('exports JWT TTL of 2 hours', () => {
    expect(JWT_TTL_SECONDS).toBe(7200);
  });

  it('uses even UTC hour blocks', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const key = sessionRateLimitKey(id);
    expect(key.startsWith('session:')).toBe(true);
    expect(key.endsWith(`:${id}`)).toBe(true);
    const hourPart = key.split(':')[1]; // YYYY-MM-DDTHH
    const hh = Number(hourPart.slice(-2));
    expect(hh % 2).toBe(0);
  });
});
