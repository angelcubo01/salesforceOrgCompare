import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ttlExpiryCache, lruEvictionCache, debounce } from '../shared/cache.js';

describe('ttlExpiryCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('guarda y recupera valores', () => {
    const c = ttlExpiryCache(1000);
    c.set('k', 'v');
    expect(c.get('k')).toBe('v');
  });

  it('expira tras el TTL', () => {
    const c = ttlExpiryCache(1000);
    c.set('k', 'v');
    vi.advanceTimersByTime(1001);
    expect(c.get('k')).toBeUndefined();
  });

  it('clear vacía la caché', () => {
    const c = ttlExpiryCache(1000);
    c.set('a', 1);
    c.clear();
    expect(c.get('a')).toBeUndefined();
  });
});

describe('lruEvictionCache', () => {
  it('evicta la entrada más antigua al superar maxKeys', () => {
    const c = lruEvictionCache(2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe(2);
    expect(c.get('c')).toBe(3);
  });

  it('get actualiza orden LRU', () => {
    const c = lruEvictionCache(2);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a');
    c.set('c', 3);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe(1);
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('agrupa llamadas hasta el delay', () => {
    const fn = vi.fn();
    const d = debounce(fn, 200);
    d(1);
    d(2);
    d(3);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });
});
