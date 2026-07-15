/** Vitest setup (extension modules without chrome in node). */

import { beforeEach } from 'vitest';

const storageLocal = new Map();
const storageSync = new Map();
const storageSession = new Map();

function makeStorageArea(store) {
  return {
    get: async (keys) => {
      if (keys == null) {
        const out = {};
        for (const [k, v] of store) out[k] = v;
        return out;
      }
      const keyList = Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const k of keyList) {
        if (store.has(k)) out[k] = store.get(k);
      }
      return out;
    },
    set: async (items) => {
      for (const [k, v] of Object.entries(items || {})) store.set(k, v);
    },
    remove: async (keys) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      for (const k of keyList) store.delete(k);
    },
    clear: async () => store.clear()
  };
}

globalThis.chrome = {
  storage: {
    local: makeStorageArea(storageLocal),
    sync: makeStorageArea(storageSync),
    session: makeStorageArea(storageSession),
    onChanged: { addListener: () => {}, removeListener: () => {} }
  },
  runtime: {
    id: 'test-extension-id',
    sendMessage: async () => ({}),
    onMessage: { addListener: () => {}, removeListener: () => {} },
    getManifest: () => ({ version: '3.0.1', name: 'Salesforce Org Compare Test' })
  },
  tabs: {
    query: async () => [],
    get: async () => null
  },
  cookies: {
    getAll: async () => []
  }
};

/** @param {Array<{ url?: string | RegExp, method?: string, response: Response | (() => Response | Promise<Response>) }>} routes */
export function mockFetch(routes = []) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(typeof input === 'string' ? input : input?.url || '');
    const method = String(init.method || 'GET').toUpperCase();
    for (const route of routes) {
      const urlMatch =
        route.url instanceof RegExp ? route.url.test(url) : url.includes(String(route.url || ''));
      const methodMatch = !route.method || route.method.toUpperCase() === method;
      if (urlMatch && methodMatch) {
        const res =
          typeof route.response === 'function' ? await route.response() : route.response;
        return res;
      }
    }
    if (original) return original(input, init);
    throw new Error(`Unmocked fetch: ${method} ${url}`);
  };
  return () => {
    globalThis.fetch = original;
  };
}

/** Reset chrome storage between tests. */
export function resetChromeStorage() {
  storageLocal.clear();
  storageSync.clear();
  storageSession.clear();
}

beforeEach(() => {
  resetChromeStorage();
});
