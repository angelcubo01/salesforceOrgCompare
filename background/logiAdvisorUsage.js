import { readLogiAdvisorCache } from '../shared/logiAdvisorCache.js';

const USAGE_STORAGE_KEY = 'sfocAiAdvisorUsage';
const SESSION_ITERATIONS_KEY = 'sfocLogiSessionIterations';
const MAX_SESSION_ITERATION_ENTRIES = 80;

/**
 * @typedef {object} LogiUsageState
 * @property {number} chatsTotal
 * @property {number} chatsToday
 * @property {number} chatsMonth
 * @property {number} llmCallsTotal
 * @property {string} dayKey
 * @property {string} monthKey
 */

/**
 * @returns {string}
 */
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * @returns {string}
 */
function monthKey() {
  return new Date().toISOString().slice(0, 7);
}

/**
 * @returns {Promise<LogiUsageState>}
 */
async function readUsage() {
  try {
    const bag = await chrome.storage.local.get(USAGE_STORAGE_KEY);
    const raw = bag[USAGE_STORAGE_KEY];
    if (raw && typeof raw === 'object') {
      return /** @type {LogiUsageState} */ (raw);
    }
  } catch {
    /* ignore */
  }
  return {
    chatsTotal: 0,
    chatsToday: 0,
    chatsMonth: 0,
    llmCallsTotal: 0,
    dayKey: todayKey(),
    monthKey: monthKey()
  };
}

/**
 * @param {LogiUsageState} state
 */
async function writeUsage(state) {
  await chrome.storage.local.set({ [USAGE_STORAGE_KEY]: state });
}

/**
 * @param {LogiUsageState} state
 * @returns {LogiUsageState}
 */
function normalizeUsage(state) {
  const day = todayKey();
  const month = monthKey();
  if (state.dayKey !== day) {
    state.chatsToday = 0;
    state.dayKey = day;
  }
  if (state.monthKey !== month) {
    state.chatsMonth = 0;
    state.monthKey = month;
  }
  return state;
}

/**
 * @param {{ isNewChat?: boolean }} [opts]
 * @returns {Promise<{ ok: true, usage: LogiUsageState } | { ok: false, reason: string }>}
 */
export async function checkLogiUsageLimits(opts = {}) {
  const config = await readLogiAdvisorCache();
  let usage = normalizeUsage(await readUsage());

  if (opts.isNewChat) {
    if (usage.chatsTotal >= config.maxChatsPerUser) {
      return { ok: false, reason: 'MAX_CHATS_USER' };
    }
    if (usage.chatsToday >= config.maxChatsPerDay) {
      return { ok: false, reason: 'MAX_CHATS_DAY' };
    }
    if (usage.chatsMonth >= config.maxChatsPerMonth) {
      return { ok: false, reason: 'MAX_CHATS_MONTH' };
    }
  }

  return { ok: true, usage };
}

/**
 * @param {{ isNewChat?: boolean, llmCalls?: number }} [opts]
 */
export async function recordLogiUsage(opts = {}) {
  const usage = normalizeUsage(await readUsage());
  if (opts.isNewChat) {
    usage.chatsTotal += 1;
    usage.chatsToday += 1;
    usage.chatsMonth += 1;
  }
  if (opts.llmCalls) {
    usage.llmCallsTotal += opts.llmCalls;
  }
  await writeUsage(usage);
  return usage;
}

/** Para tests. */
export async function resetLogiUsageForTests() {
  await chrome.storage.local.remove(USAGE_STORAGE_KEY);
  await chrome.storage.local.remove(SESSION_ITERATIONS_KEY);
}

/**
 * @param {number} iteration
 * @param {import('../shared/apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 */
export function isIterationAllowed(iteration, config) {
  const max = config?.maxIterationsPerChat ?? 10;
  const n = Number(iteration);
  if (!Number.isFinite(n) || n < 1) return false;
  return n <= max;
}

/**
 * @param {string} orgId
 * @param {string} logId
 */
export function buildLogiIterationSessionKey(orgId, logId) {
  const org = String(orgId || '').trim() || '_';
  const log = String(logId || '').trim() || '_anonymous_';
  return `${org}::${log}`;
}

/**
 * @param {string} sessionKey
 * @returns {Promise<number>}
 */
export async function readSessionIterationByKey(sessionKey) {
  const key = String(sessionKey || '').trim() || '_::__anonymous__';
  try {
    const bag = await chrome.storage.local.get(SESSION_ITERATIONS_KEY);
    const store = bag[SESSION_ITERATIONS_KEY];
    if (store && typeof store === 'object') {
      const n = Number(store[key]);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

/**
 * @param {string} orgId
 * @param {string} logId
 * @returns {Promise<number>}
 * @deprecated Usar readSessionIterationByKey con buildLogiSessionKey
 */
export async function readSessionIteration(orgId, logId) {
  return readSessionIterationByKey(buildLogiIterationSessionKey(orgId, logId));
}

/**
 * @param {string} sessionKey
 * @param {number} maxIterations
 * @returns {Promise<
 *   | { ok: true, iteration: number, iterationsRemaining: number }
 *   | { ok: false, reason: 'MAX_ITERATIONS', iteration: number, iterationsRemaining: 0 }
 * >}
 */
export async function reserveSessionIterationByKey(sessionKey, maxIterations) {
  const key = String(sessionKey || '').trim() || '_::__anonymous__';
  const max = Math.max(1, Math.floor(Number(maxIterations) || 10));
  const bag = await chrome.storage.local.get(SESSION_ITERATIONS_KEY);
  const store =
    bag[SESSION_ITERATIONS_KEY] && typeof bag[SESSION_ITERATIONS_KEY] === 'object'
      ? { ...bag[SESSION_ITERATIONS_KEY] }
      : {};
  const current = Number(store[key]);
  const used = Number.isFinite(current) && current > 0 ? Math.floor(current) : 0;

  if (used >= max) {
    return { ok: false, reason: 'MAX_ITERATIONS', iteration: used, iterationsRemaining: 0 };
  }

  const next = used + 1;
  store[key] = next;
  pruneSessionIterations(store);
  await chrome.storage.local.set({ [SESSION_ITERATIONS_KEY]: store });
  return { ok: true, iteration: next, iterationsRemaining: Math.max(0, max - next) };
}

/**
 * @param {string} orgId
 * @param {string} logId
 * @param {number} maxIterations
 * @deprecated Usar reserveSessionIterationByKey con buildLogiSessionKey
 */
export async function reserveSessionIteration(orgId, logId, maxIterations) {
  return reserveSessionIterationByKey(buildLogiIterationSessionKey(orgId, logId), maxIterations);
}

/**
 * @param {Record<string, number>} store
 */
function pruneSessionIterations(store) {
  const keys = Object.keys(store);
  if (keys.length <= MAX_SESSION_ITERATION_ENTRIES) return;
  keys
    .sort((a, b) => (store[a] || 0) - (store[b] || 0))
    .slice(0, keys.length - MAX_SESSION_ITERATION_ENTRIES)
    .forEach((key) => {
      delete store[key];
    });
}
