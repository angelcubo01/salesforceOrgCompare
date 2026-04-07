/**
 * Cachés en memoria para el service worker: expiración por tiempo (TTL)
 * y descarte por capacidad (LRU). Incluye utilidad de debounce para UI.
 */

/** @param {number} [defaultTtlMs] */
export function ttlExpiryCache(defaultTtlMs = 60 * 1000) {
  /** @type {Map<string, { value: unknown, expiresAt: number }>} */
  const entries = new Map();

  return {
    get(key) {
      const row = entries.get(key);
      if (!row) return undefined;
      if (row.expiresAt > 0 && Date.now() > row.expiresAt) {
        entries.delete(key);
        return undefined;
      }
      return row.value;
    },
    set(key, value, ttlMs = defaultTtlMs) {
      const expiresAt = ttlMs > 0 ? Date.now() + ttlMs : 0;
      entries.set(key, { value, expiresAt });
    },
    del(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    }
  };
}

/** @param {number} [maxKeys] */
export function lruEvictionCache(maxKeys = 100) {
  /** @type {Map<string, unknown>} */
  const order = new Map();

  return {
    get(key) {
      if (!order.has(key)) return undefined;
      const val = order.get(key);
      order.delete(key);
      order.set(key, val);
      return val;
    },
    set(key, value) {
      if (order.has(key)) order.delete(key);
      order.set(key, value);
      if (order.size > maxKeys) {
        const oldest = order.keys().next().value;
        order.delete(oldest);
      }
    },
    del(key) {
      order.delete(key);
    },
    clear() {
      order.clear();
    }
  };
}

/** Agrupa llamadas consecutivas al mismo callback tras un silencio de `delayMs`. */
export function debounce(fn, delayMs = 300) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  };
}
