import { readLogiAdvisorCache } from '../shared/logiAdvisorCache.js';

const USAGE_STORAGE_KEY = 'sfocAiAdvisorUsage';

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
}

/**
 * @param {number} iteration
 * @param {import('../shared/apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 */
export function isIterationAllowed(iteration, config) {
  return iteration <= config.maxIterationsPerChat;
}
