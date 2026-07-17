import { isLogiQuickActionId } from './apexLogAiContext.js';

export const LOGI_SESSION_STORAGE_KEY = 'sfocLogiAdvisorSessions';

/** @typedef {{ role: string, content?: string, quickActionId?: string, displayText?: string, lineRef?: { startLine: number, endLine: number, logId: string }, quoteRef?: { content: string }, tool_calls?: object[], tool_call_id?: string, name?: string }} LogiChatMessage */

/**
 * @typedef {object} LogiAdvisorSession
 * @property {LogiChatMessage[]} messages
 * @property {number} iteration
 * @property {boolean} isNewChat
 * @property {number} updatedAt
 * @property {boolean} [pending]
 * @property {string} [thinkingStatus]
 * @property {number} [queuedCount]
 * @property {string} [usageLimitReason]
 */

const MAX_SESSIONS = 40;

/**
 * @param {object} payload
 * @returns {string}
 */
export function buildLogiSessionKey(payload) {
  const orgId = String(payload?.orgId || '').trim() || '_';
  const logId = String(payload?.logId || '').trim();
  if (logId) return `${orgId}::${logId}`;

  const title = String(payload?.title || '').trim();
  const instanceUrl = String(payload?.instanceUrl || '').trim();
  if (title || instanceUrl) {
    return `${orgId}::local::${hashShort(`${instanceUrl}::${title}`)}`;
  }
  return `${orgId}::__anonymous__`;
}

/**
 * @param {string} key
 * @returns {Promise<LogiAdvisorSession | null>}
 */
export async function readLogiSession(key) {
  if (!key) return null;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const bag = await chrome.storage.local.get(LOGI_SESSION_STORAGE_KEY);
      const store = bag[LOGI_SESSION_STORAGE_KEY];
      if (store && typeof store === 'object' && store[key]) {
        return normalizeSession(store[key]);
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {string} key
 * @param {LogiAdvisorSession} session
 */
export async function writeLogiSession(key, session) {
  if (!key) return;
  const normalized = normalizeSession(session);
  if (!normalized) return;

  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const bag = await chrome.storage.local.get(LOGI_SESSION_STORAGE_KEY);
      const store =
        bag[LOGI_SESSION_STORAGE_KEY] && typeof bag[LOGI_SESSION_STORAGE_KEY] === 'object'
          ? { ...bag[LOGI_SESSION_STORAGE_KEY] }
          : {};

      store[key] = { ...normalized, updatedAt: Date.now() };
      pruneSessions(store);
      await chrome.storage.local.set({ [LOGI_SESSION_STORAGE_KEY]: store });
    }
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} key
 */
export async function clearLogiSession(key) {
  if (!key) return;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const bag = await chrome.storage.local.get(LOGI_SESSION_STORAGE_KEY);
      const store = bag[LOGI_SESSION_STORAGE_KEY];
      if (!store || typeof store !== 'object' || !store[key]) return;
      const next = { ...store };
      delete next[key];
      await chrome.storage.local.set({ [LOGI_SESSION_STORAGE_KEY]: next });
    }
  } catch {
    /* ignore */
  }
}

/**
 * @param {unknown} raw
 * @returns {LogiAdvisorSession | null}
 */
function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const messages = Array.isArray(o.messages)
    ? o.messages
        .filter((m) => m && typeof m === 'object')
        .map((m) => {
          const msg = /** @type {Record<string, unknown>} */ (m);
          const role = String(msg.role || '');
          if (!role) return null;
          /** @type {LogiChatMessage} */
          const out = { role };
          if (msg.content != null) out.content = String(msg.content);
          if (msg.quickActionId != null && isLogiQuickActionId(String(msg.quickActionId))) {
            out.quickActionId = String(msg.quickActionId);
          }
          if (msg.displayText != null && String(msg.displayText).trim()) {
            out.displayText = String(msg.displayText).trim();
          }
          if (msg.lineRef && typeof msg.lineRef === 'object') {
            const lr = /** @type {Record<string, unknown>} */ (msg.lineRef);
            const startLine = Math.floor(Number(lr.startLine));
            const endLine = Math.floor(Number(lr.endLine));
            if (Number.isFinite(startLine) && Number.isFinite(endLine) && startLine >= 1 && endLine >= 1) {
              out.lineRef = {
                startLine: Math.min(startLine, endLine),
                endLine: Math.max(startLine, endLine),
                logId: String(lr.logId || 'log').trim().slice(0, 64) || 'log'
              };
            }
          }
          if (msg.quoteRef && typeof msg.quoteRef === 'object') {
            const content = String(
              /** @type {Record<string, unknown>} */ (msg.quoteRef).content || ''
            ).trim();
            if (content) out.quoteRef = { content };
          }
          if (Array.isArray(msg.tool_calls)) out.tool_calls = msg.tool_calls;
          if (msg.tool_call_id != null) out.tool_call_id = String(msg.tool_call_id);
          if (msg.name != null) out.name = String(msg.name);
          return out;
        })
        .filter(Boolean)
    : [];

  const iteration = Number.isFinite(Number(o.iteration)) ? Math.max(0, Math.floor(Number(o.iteration))) : 0;
  const hasUserTurn = messages.some((m) => m.role === 'user');
  const isNewChat = hasUserTurn ? false : o.isNewChat !== false;
  const updatedAt = Number.isFinite(Number(o.updatedAt)) ? Number(o.updatedAt) : Date.now();
  const pending = o.pending === true;
  const thinkingStatus = o.thinkingStatus != null ? String(o.thinkingStatus) : '';
  const queuedCount = Number.isFinite(Number(o.queuedCount))
    ? Math.max(0, Math.floor(Number(o.queuedCount)))
    : 0;
  const usageLimitReason =
    typeof o.usageLimitReason === 'string' && o.usageLimitReason.trim()
      ? o.usageLimitReason.trim()
      : undefined;

  return {
    messages,
    iteration,
    isNewChat,
    updatedAt,
    pending,
    thinkingStatus,
    queuedCount,
    usageLimitReason
  };
}

/**
 * @param {Record<string, LogiAdvisorSession>} store
 */
function pruneSessions(store) {
  const keys = Object.keys(store);
  if (keys.length <= MAX_SESSIONS) return;
  keys
    .sort((a, b) => (store[a]?.updatedAt || 0) - (store[b]?.updatedAt || 0))
    .slice(0, keys.length - MAX_SESSIONS)
    .forEach((key) => {
      delete store[key];
    });
}

/**
 * @param {string} key
 */
export function describeLogiSessionKey(key) {
  const parts = String(key || '').split('::');
  if (parts.length >= 2) {
    const logPart = parts[1];
    if (logPart && logPart !== '__anonymous__') {
      if (logPart === 'local' && parts[2]) return `local:${parts[2]}`;
      return logPart;
    }
  }
  return String(key || '').slice(0, 48);
}

/**
 * @param {{ orgId?: string, limit?: number }} [opts]
 * @returns {Promise<Array<{ key: string, session: LogiAdvisorSession, label: string }>>}
 */
export async function listLogiSessions(opts = {}) {
  const limit = Math.max(1, Math.min(40, Number(opts.limit) || 20));
  const orgId = String(opts.orgId || '').trim();
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const bag = await chrome.storage.local.get(LOGI_SESSION_STORAGE_KEY);
      const store = bag[LOGI_SESSION_STORAGE_KEY];
      if (!store || typeof store !== 'object') return [];
      /** @type {Array<{ key: string, session: LogiAdvisorSession, label: string }>} */
      const entries = [];
      for (const [key, raw] of Object.entries(store)) {
        const session = normalizeSession(raw);
        if (!session) continue;
        if (orgId && !key.startsWith(`${orgId}::`) && !key.startsWith('_::')) continue;
        entries.push({
          key,
          session,
          label: describeLogiSessionKey(key)
        });
      }
      entries.sort((a, b) => (b.session.updatedAt || 0) - (a.session.updatedAt || 0));
      return entries.slice(0, limit);
    }
  } catch {
    /* ignore */
  }
  return [];
}

/**
 * @param {string} text
 */
function hashShort(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/** Para tests. */
export async function resetLogiSessionsForTests() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.remove(LOGI_SESSION_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}
