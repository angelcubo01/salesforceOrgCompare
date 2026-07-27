/**
 * JWT session cache for logi-proxy (extension client).
 * Lease local 2h en chrome.storage.local (tipo cookie) para no spamear /v1/session.
 */

export const LOGI_REMOTE_LEASE_MS = 2 * 60 * 60 * 1000;
export const SESSION_STORAGE_KEY = 'sfocLogiProxyJwtByBase';
const RENEW_BEFORE_MS = 60_000;

/**
 * @typedef {{
 *   token?: string,
 *   expiresAt?: number,
 *   lastSessionAt?: number,
 *   sessionBackoffUntil?: number
 * }} ProxyJwtEntry
 */

/** @type {Map<string, ProxyJwtEntry>} */
const memoryByBase = new Map();

/** @type {Map<string, Promise<string>>} */
const acquireInFlight = new Map();

/**
 * @param {string} proxyUrl
 * @returns {string}
 */
export function resolveProxyBaseUrl(proxyUrl) {
  return String(proxyUrl || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v1\/chat$/i, '')
    .replace(/\/v1\/advisor-config$/i, '')
    .replace(/\/v1\/session$/i, '');
}

/**
 * @param {string} proxyUrl
 * @returns {string}
 */
export function buildLogiProxySessionUrl(proxyUrl) {
  const base = resolveProxyBaseUrl(proxyUrl);
  if (!base) return '';
  return `${base}/v1/session`;
}

/**
 * @param {unknown} raw
 * @returns {ProxyJwtEntry | null}
 */
function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  /** @type {ProxyJwtEntry} */
  const entry = {};

  const token = String(o.token || '').trim();
  const expiresAt = Number(o.expiresAt);
  if (token && Number.isFinite(expiresAt) && expiresAt > Date.now()) {
    entry.token = token;
    entry.expiresAt = expiresAt;
  }

  const lastSessionAt = Number(o.lastSessionAt);
  if (Number.isFinite(lastSessionAt) && lastSessionAt > 0) entry.lastSessionAt = lastSessionAt;

  const sessionBackoffUntil = Number(o.sessionBackoffUntil);
  if (Number.isFinite(sessionBackoffUntil) && sessionBackoffUntil > Date.now()) {
    entry.sessionBackoffUntil = sessionBackoffUntil;
  }

  if (!entry.token && !entry.sessionBackoffUntil && !entry.lastSessionAt) return null;
  return entry;
}

/**
 * @returns {Promise<Record<string, ProxyJwtEntry>>}
 */
async function readLocalMap() {
  /** @type {Record<string, ProxyJwtEntry>} */
  const out = {};
  try {
    const local = typeof chrome !== 'undefined' ? chrome.storage?.local : null;
    if (local) {
      const data = await local.get(SESSION_STORAGE_KEY);
      const map = data?.[SESSION_STORAGE_KEY];
      if (map && typeof map === 'object' && !Array.isArray(map)) {
        for (const [k, v] of Object.entries(map)) {
          const n = normalizeEntry(v);
          if (n) out[k] = n;
        }
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const sess = typeof chrome !== 'undefined' ? chrome.storage?.session : null;
    if (sess) {
      const data = await sess.get(SESSION_STORAGE_KEY);
      const map = data?.[SESSION_STORAGE_KEY];
      if (map && typeof map === 'object' && !Array.isArray(map)) {
        let migrated = false;
        for (const [k, v] of Object.entries(map)) {
          if (out[k]) continue;
          const n = normalizeEntry(v);
          if (!n) continue;
          out[k] = n;
          migrated = true;
        }
        if (migrated) {
          const local = typeof chrome !== 'undefined' ? chrome.storage?.local : null;
          if (local) await local.set({ [SESSION_STORAGE_KEY]: out });
          await sess.remove(SESSION_STORAGE_KEY);
        }
      }
    }
  } catch {
    /* ignore */
  }

  return out;
}

/**
 * @param {string} baseUrl
 * @returns {Promise<ProxyJwtEntry | null>}
 */
async function readCachedSession(baseUrl) {
  const base = resolveProxyBaseUrl(baseUrl);
  const mem = memoryByBase.get(base);
  if (mem) {
    const stillValidToken = mem.token && Number(mem.expiresAt) > Date.now();
    const stillBackoff = Number(mem.sessionBackoffUntil) > Date.now();
    if (stillValidToken || stillBackoff || mem.lastSessionAt) return mem;
  }

  const map = await readLocalMap();
  const entry = map[base] || null;
  if (!entry) return null;
  memoryByBase.set(base, entry);
  return entry;
}

/**
 * @param {string} baseUrl
 * @param {ProxyJwtEntry} entry
 */
async function writeCachedSession(baseUrl, entry) {
  const base = resolveProxyBaseUrl(baseUrl);
  memoryByBase.set(base, entry);
  try {
    const local = typeof chrome !== 'undefined' ? chrome.storage?.local : null;
    if (!local) return;
    const map = await readLocalMap();
    map[base] = entry;
    await local.set({ [SESSION_STORAGE_KEY]: map });
  } catch {
    /* ignore */
  }
}

/**
 * @param {ProxyJwtEntry | null | undefined} entry
 * @returns {boolean}
 */
export function isProxyJwtLeaseFresh(entry) {
  if (!entry?.token || !(Number(entry.expiresAt) > Date.now() + RENEW_BEFORE_MS)) return false;
  const last = Number(entry.lastSessionAt);
  if (Number.isFinite(last) && last > 0) {
    return Date.now() - last < LOGI_REMOTE_LEASE_MS;
  }
  return Number(entry.expiresAt) - Date.now() > RENEW_BEFORE_MS;
}

/**
 * @param {string} baseUrl
 * @param {number} untilMs
 */
async function writeSessionBackoff(baseUrl, untilMs) {
  const prev = (await readCachedSession(baseUrl)) || {};
  /** @type {ProxyJwtEntry} */
  const entry = {
    ...prev,
    sessionBackoffUntil: untilMs
  };
  await writeCachedSession(baseUrl, entry);
}

/**
 * @param {string} proxyUrl
 * @param {string} installId
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<string>}
 */
async function acquireProxyJwtOnce(proxyUrl, installId, opts = {}) {
  const sessionUrl = buildLogiProxySessionUrl(proxyUrl);
  const id = String(installId || '').trim();
  if (!sessionUrl || !id) {
    throw new Error('LOGI_NO_PROXY_SESSION');
  }

  const existing = await readCachedSession(proxyUrl);
  const backoffUntil = Number(existing?.sessionBackoffUntil);
  if (Number.isFinite(backoffUntil) && backoffUntil > Date.now()) {
    if (existing?.token && Number(existing.expiresAt) > Date.now()) {
      return /** @type {string} */ (existing.token);
    }
    throw new Error('LOGI_PROXY_SESSION_HTTP_429: Session rate limit exceeded (local backoff)');
  }

  const res = await fetch(sessionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ installId: id }),
    signal: opts.signal
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`LOGI_PROXY_SESSION_PARSE: ${text.slice(0, 120)}`);
  }

  if (!res.ok) {
    const code = data?.code || '';
    const msg = data?.error || data?.message || res.statusText;
    if (res.status === 429 || code === 'SESSION_RATE_LIMIT') {
      await writeSessionBackoff(proxyUrl, Date.now() + LOGI_REMOTE_LEASE_MS);
    }
    throw new Error(`LOGI_PROXY_SESSION_HTTP_${res.status}: ${msg}`);
  }

  const token = String(data?.token || '').trim();
  const expiresAt = Number(data?.expiresAt);
  if (!token) {
    throw new Error('LOGI_PROXY_SESSION_EMPTY');
  }
  const exp = Number.isFinite(expiresAt) ? expiresAt : Date.now() + LOGI_REMOTE_LEASE_MS;
  const now = Date.now();
  await writeCachedSession(proxyUrl, {
    token,
    expiresAt: exp,
    lastSessionAt: now
  });
  return token;
}

/**
 * @param {string} proxyUrl
 * @param {string} installId
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<string>}
 */
export async function acquireProxyJwt(proxyUrl, installId, opts = {}) {
  const base = resolveProxyBaseUrl(proxyUrl);
  const existing = acquireInFlight.get(base);
  if (existing) return existing;

  const p = acquireProxyJwtOnce(proxyUrl, installId, opts).finally(() => {
    acquireInFlight.delete(base);
  });
  acquireInFlight.set(base, p);
  return p;
}

/**
 * @param {string} proxyUrl
 * @param {string} installId
 * @param {{ signal?: AbortSignal, forceRenew?: boolean }} [opts]
 * @returns {Promise<string>}
 */
export async function getProxyJwt(proxyUrl, installId, opts = {}) {
  if (!opts.forceRenew) {
    const cached = await readCachedSession(proxyUrl);
    if (cached?.token && isProxyJwtLeaseFresh(cached)) {
      return cached.token;
    }
    if (cached?.token && Number(cached.expiresAt) > Date.now() + RENEW_BEFORE_MS) {
      return cached.token;
    }
  }
  return acquireProxyJwt(proxyUrl, installId, opts);
}

/** Para tests. */
export function resetLogiProxySessionForTests() {
  memoryByBase.clear();
  acquireInFlight.clear();
}
