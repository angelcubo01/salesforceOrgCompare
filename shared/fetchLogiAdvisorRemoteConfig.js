import { LOGI_ADVISOR_FLAG } from './apexLogAiAdvisorConfig.js';

/**
 * @param {string} proxyUrl
 * @returns {string}
 */
export function buildLogiAdvisorConfigUrl(proxyUrl) {
  const raw = String(proxyUrl || '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  if (/\/v1\/advisor-config$/i.test(raw)) return raw;
  const base = raw.replace(/\/v1\/chat$/i, '');
  return `${base}/v1/advisor-config`;
}

/**
 * Obtiene el payload remoto desencriptado vía logi-proxy (PostHog personal API key en servidor).
 * @param {{ proxyUrl: string, proxyAuthToken?: string, installId?: string, bootstrap?: boolean, signal?: AbortSignal }} opts
 * @returns {Promise<unknown>}
 */
export async function fetchLogiAdvisorRemoteConfig(opts) {
  const url = buildLogiAdvisorConfigUrl(opts.proxyUrl);
  const token = String(opts.proxyAuthToken || '').trim();
  const installId = String(opts.installId || '').trim();
  const bootstrap = opts.bootstrap === true || !token;
  if (!url) {
    throw new Error('LOGI_CONFIG_FETCH_NO_PROXY');
  }
  if (!token && !installId) {
    throw new Error('LOGI_CONFIG_FETCH_NO_AUTH');
  }

  const headers = {
    Accept: 'application/json',
    ...(installId ? { 'X-SFOC-Install-Id': installId } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const res = await fetch(url, {
    method: 'GET',
    headers,
    signal: opts.signal
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`LOGI_CONFIG_FETCH_PARSE: ${text.slice(0, 120)}`);
  }

  if (!res.ok) {
    const msg = data?.error || data?.message || res.statusText;
    throw new Error(`LOGI_CONFIG_FETCH_HTTP_${res.status}: ${msg}`);
  }

  if (data?.ok === false) {
    throw new Error(String(data.error || 'LOGI_CONFIG_FETCH_FAILED'));
  }

  const payload = data?.payload ?? data?.config ?? data;
  if (payload == null) {
    throw new Error('LOGI_CONFIG_FETCH_EMPTY');
  }
  if (typeof payload === 'object' && payload.key === LOGI_ADVISOR_FLAG && payload.payload != null) {
    return payload.payload;
  }
  return payload;
}
