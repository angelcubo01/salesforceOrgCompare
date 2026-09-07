import { bg } from '../core/bridge.js';
import {
  calculateSalesforceClockOffset,
  hasMeaningfulSalesforceClockOffset,
  serverNowFromOffset
} from '../../shared/salesforceTime.js';

const STORAGE_KEY = 'sfocSalesforceClockByOrg';
const memory = new Map();

async function readClock(orgId) {
  const key = String(orgId || '');
  if (!key) return null;
  if (memory.has(key)) return memory.get(key);
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const entry = result[STORAGE_KEY] && result[STORAGE_KEY][key];
    if (entry && Number.isFinite(Number(entry.offsetMs))) {
      memory.set(key, entry);
      return entry;
    }
  } catch {
    /* Sin storage se mantiene el fallback de memoria. */
  }
  return null;
}

async function writeClock(orgId, entry) {
  const key = String(orgId || '');
  if (!key) return;
  memory.set(key, entry);
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    await chrome.storage.local.set({
      [STORAGE_KEY]: { ...(result[STORAGE_KEY] || {}), [key]: entry }
    });
  } catch {
    /* La hora sigue disponible durante la sesión. */
  }
}

export async function syncSalesforceServerClock(orgId) {
  const requestStartedMs = Date.now();
  const result = await bg({ type: 'salesforce:serverTime', orgId });
  const responseReceivedMs = Date.now();
  if (!result?.ok || !Number.isFinite(Number(result.serverNowMs))) {
    return { ok: false, entry: await readClock(orgId), reason: result?.reason || result?.error || 'UNAVAILABLE' };
  }
  const offsetMs = calculateSalesforceClockOffset(
    Number(result.serverNowMs),
    requestStartedMs,
    responseReceivedMs
  );
  const entry = {
    offsetMs: offsetMs || 0,
    syncedAt: responseReceivedMs,
    serverNowIso: String(result.serverNowIso || new Date(Number(result.serverNowMs)).toISOString())
  };
  await writeClock(orgId, entry);
  return { ok: true, entry };
}

export async function getSalesforceNow(orgId, opts = {}) {
  const refresh = opts.refresh === true;
  let entry = await readClock(orgId);
  if (refresh || !entry) {
    const synced = await syncSalesforceServerClock(orgId).catch(() => ({ ok: false, entry }));
    entry = synced.entry || entry;
  }
  if (!entry) {
    return { nowMs: Date.now(), serverAvailable: false, clockOffsetMs: null, warning: false };
  }
  return {
    nowMs: serverNowFromOffset(entry.offsetMs),
    serverAvailable: true,
    clockOffsetMs: Number(entry.offsetMs) || 0,
    warning: hasMeaningfulSalesforceClockOffset(entry.offsetMs)
  };
}
