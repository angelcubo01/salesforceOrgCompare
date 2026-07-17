import { LOGI_ADVISOR_FLAG } from './apexLogAiAdvisorConfig.js';
import { getProxyJwt } from './logiProxySession.js';
import { parseQuotaBonus, ZERO_QUOTA_BONUS } from './logiQuotaBonus.js';

export class LogiFlagDisabledError extends Error {
  constructor() {
    super('LOGI_FLAG_DISABLED');
    this.name = 'LogiFlagDisabledError';
  }
}

/**
 * @typedef {{ payload: unknown, quotaBonus: import('./logiQuotaBonus.js').LogiQuotaBonus }} LogiRemoteConfigResult
 */

/**
 * @param {string} proxyUrl
 * @returns {string}
 */
export function buildLogiAdvisorConfigUrl(proxyUrl) {
  const raw = String(proxyUrl || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  if (/\/v1\/advisor-config$/i.test(raw)) return raw;
  const base = raw.replace(/\/v1\/chat$/i, '').replace(/\/v1\/session$/i, '');
  return `${base}/v1/advisor-config`;
}

/**
 * @param {unknown} data
 * @returns {unknown}
 */
function unwrapAdvisorPayload(data) {
  const payload = data?.payload ?? data?.config ?? data;
  if (payload == null) {
    throw new Error('LOGI_CONFIG_FETCH_EMPTY');
  }
  if (typeof payload === 'object' && payload.key === LOGI_ADVISOR_FLAG && payload.payload != null) {
    return payload.payload;
  }
  return payload;
}

/**
 * Obtiene el payload remoto desencriptado vía logi-proxy (PostHog personal API key en servidor).
 * Incluye quotaBonus por person properties cuando el proxy lo envía.
 * @param {{ proxyUrl: string, installId: string, jwtToken?: string, signal?: AbortSignal }} opts
 * @returns {Promise<LogiRemoteConfigResult>}
 */
export async function fetchLogiAdvisorRemoteConfig(opts) {
  const url = buildLogiAdvisorConfigUrl(opts.proxyUrl);
  const installId = String(opts.installId || '').trim();
  if (!url) {
    throw new Error('LOGI_CONFIG_FETCH_NO_PROXY');
  }
  if (!installId) {
    throw new Error('LOGI_CONFIG_FETCH_NO_AUTH');
  }

  let jwt = String(opts.jwtToken || '').trim();
  if (!jwt) {
    jwt = await getProxyJwt(opts.proxyUrl, installId, { signal: opts.signal });
  }

  const fetchOnce = async (token) => {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'X-SFOC-Install-Id': installId
      },
      signal: opts.signal
    });
    return res;
  };

  let res = await fetchOnce(jwt);
  if (res.status === 401) {
    jwt = await getProxyJwt(opts.proxyUrl, installId, { signal: opts.signal, forceRenew: true });
    res = await fetchOnce(jwt);
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`LOGI_CONFIG_FETCH_PARSE: ${text.slice(0, 120)}`);
  }

  if (!res.ok) {
    if (res.status === 403 && data?.error === 'flag_disabled') {
      throw new LogiFlagDisabledError();
    }
    const msg = data?.error || data?.message || res.statusText;
    throw new Error(`LOGI_CONFIG_FETCH_HTTP_${res.status}: ${msg}`);
  }

  if (data?.ok === false) {
    throw new Error(String(data.error || 'LOGI_CONFIG_FETCH_FAILED'));
  }

  const payload = unwrapAdvisorPayload(data);
  const quotaBonus = parseQuotaBonus(data?.quotaBonus);
  return { payload, quotaBonus };
}

/**
 * Compat: solo el payload (sin bonus). Preferir fetchLogiAdvisorRemoteConfig.
 * @param {{ proxyUrl: string, installId: string, jwtToken?: string, signal?: AbortSignal }} opts
 */
export async function fetchLogiAdvisorRemotePayload(opts) {
  const { payload } = await fetchLogiAdvisorRemoteConfig(opts);
  return payload;
}

export { ZERO_QUOTA_BONUS };
