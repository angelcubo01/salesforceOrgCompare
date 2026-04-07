import { DEBUG_LOGS, USAGE_LOG_ENDPOINT } from './config.js';

export function escapeSoqlLiteral(value) {
  const s = String(value == null ? '' : value);
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function appendUsageLog(entry) {
  if (!USAGE_LOG_ENDPOINT) return;
  try {
    const now = new Date().toISOString();
    const manifest = chrome.runtime.getManifest();
    const payload = {
      timestamp: now,
      extensionVersion: manifest.version,
      ...entry,
      userAgent: navigator.userAgent || ''
    };

    let sent = false;
    try {
      if (DEBUG_LOGS) console.log('[usage:log] sending (json string)', { endpoint: USAGE_LOG_ENDPOINT });
      const res = await fetch(USAGE_LOG_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload),
        keepalive: true
      });
      sent = !!res.ok;
      if (sent) return;
      if (DEBUG_LOGS) console.warn('[usage:log] HTTP error (json string)', { status: res.status, statusText: res.statusText });
    } catch {
      // fallback below
    }

    try {
      if (DEBUG_LOGS) console.log('[usage:log] sending (form fallback)', { endpoint: USAGE_LOG_ENDPOINT });
      const form = new URLSearchParams();
      form.set('payload', JSON.stringify(payload));
      const res = await fetch(USAGE_LOG_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: form.toString(),
        keepalive: true
      });
      if (!res.ok && DEBUG_LOGS) {
        console.warn('[usage:log] HTTP error (form fallback)', { status: res.status, statusText: res.statusText });
      }
    } catch (e2) {
      if (DEBUG_LOGS) console.warn('[usage:log] failed', String(e2 || 'unknown'));
    }
  } catch {
    // no-op
  }
}
