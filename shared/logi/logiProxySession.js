/**
 * JWT session cache for logi-proxy (extension client).
 */

const SESSION_STORAGE_KEY = 'sfocLogiProxyJwtByBase';
const RENEW_BEFORE_MS = 60_000;

/** @type {Map<string, { token: string, expiresAt: number }>} */
const memoryByBase = new Map();

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
 * @param {string} baseUrl
 * @returns {Promise<{ token: string, expiresAt: number } | null>}
 */
async function readCachedSession(baseUrl) {
  const base = resolveProxyBaseUrl(baseUrl);
  const mem = memoryByBase.get(base);
  if (mem?.token && mem.expiresAt > Date.now()) return mem;

  try {
    const store = typeof chrome !== 'undefined' ? chrome.storage?.session : null;
    if (!store) return null;
    const data = await store.get(SESSION_STORAGE_KEY);
    const map = data?.[SESSION_STORAGE_KEY];
    if (!map || typeof map !== 'object') return null;
    const entry = map[base];
    if (!entry || typeof entry !== 'object') return null;
    const token = String(entry.token || '').trim();
    const expiresAt = Number(entry.expiresAt);
    if (!token || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    const cached = { token, expiresAt };
    memoryByBase.set(base, cached);
    return cached;
  } catch {
    return null;
  }
}

/**
 * @param {string} baseUrl
 * @param {string} token
 * @param {number} expiresAt
 */
async function writeCachedSession(baseUrl, token, expiresAt) {
  const base = resolveProxyBaseUrl(baseUrl);
  const entry = { token, expiresAt };
  memoryByBase.set(base, entry);
  try {
    const store = typeof chrome !== 'undefined' ? chrome.storage?.session : null;
    if (!store) return;
    const data = await store.get(SESSION_STORAGE_KEY);
    const prev = data?.[SESSION_STORAGE_KEY];
    const map = prev && typeof prev === 'object' && !Array.isArray(prev) ? { ...prev } : {};
    map[base] = entry;
    await store.set({ [SESSION_STORAGE_KEY]: map });
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} proxyUrl
 * @param {string} installId
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<string>}
 */
export async function acquireProxyJwt(proxyUrl, installId, opts = {}) {
  const sessionUrl = buildLogiProxySessionUrl(proxyUrl);
  const id = String(installId || '').trim();
  if (!sessionUrl || !id) {
    throw new Error('LOGI_NO_PROXY_SESSION');
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
    const msg = data?.error || data?.message || res.statusText;
    throw new Error(`LOGI_PROXY_SESSION_HTTP_${res.status}: ${msg}`);
  }

  const token = String(data?.token || '').trim();
  const expiresAt = Number(data?.expiresAt);
  if (!token) {
    throw new Error('LOGI_PROXY_SESSION_EMPTY');
  }
  const exp = Number.isFinite(expiresAt) ? expiresAt : Date.now() + 3_600_000;
  await writeCachedSession(proxyUrl, token, exp);
  return token;
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
    if (cached?.token && cached.expiresAt > Date.now() + RENEW_BEFORE_MS) {
      return cached.token;
    }
  }
  return acquireProxyJwt(proxyUrl, installId, opts);
}

/** Para tests. */
export function resetLogiProxySessionForTests() {
  memoryByBase.clear();
}
