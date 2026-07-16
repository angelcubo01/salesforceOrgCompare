/**
 * Créditos extra de cuota Logi por usuario (person properties PostHog).
 * Se suman a los límites base del flag; el resultado no baja de 0.
 */

export const QUOTA_BONUS_PERSON_PROPS = Object.freeze({
  day: 'sfoc_quota_bonus_day',
  month: 'sfoc_quota_bonus_month',
  user: 'sfoc_quota_bonus_user',
  iterations: 'sfoc_quota_bonus_iterations'
});

/** @typedef {{ day: number, month: number, user: number, iterations: number }} LogiQuotaBonus */

export const ZERO_QUOTA_BONUS = Object.freeze({
  day: 0,
  month: 0,
  user: 0,
  iterations: 0
});

const BONUS_ABS_MAX = 100_000;

/**
 * @param {unknown} value
 * @returns {number}
 */
function parseBonusInt(value) {
  if (value == null || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return 0;
  const truncated = Math.trunc(n);
  if (truncated > BONUS_ABS_MAX) return BONUS_ABS_MAX;
  if (truncated < -BONUS_ABS_MAX) return -BONUS_ABS_MAX;
  return truncated;
}

/**
 * @param {unknown} raw
 * @returns {LogiQuotaBonus}
 */
export function parseQuotaBonus(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...ZERO_QUOTA_BONUS };
  }
  const o = /** @type {Record<string, unknown>} */ (raw);
  return {
    day: parseBonusInt(o.day ?? o.maxChatsPerDay),
    month: parseBonusInt(o.month ?? o.maxChatsPerMonth),
    user: parseBonusInt(o.user ?? o.maxChatsPerUser),
    iterations: parseBonusInt(o.iterations ?? o.maxIterationsPerChat)
  };
}

/**
 * Lee bonus desde person properties de PostHog.
 * @param {Record<string, unknown> | null | undefined} personProperties
 * @returns {LogiQuotaBonus}
 */
export function parseQuotaBonusFromPersonProperties(personProperties) {
  if (!personProperties || typeof personProperties !== 'object') {
    return { ...ZERO_QUOTA_BONUS };
  }
  return parseQuotaBonus({
    day: personProperties[QUOTA_BONUS_PERSON_PROPS.day],
    month: personProperties[QUOTA_BONUS_PERSON_PROPS.month],
    user: personProperties[QUOTA_BONUS_PERSON_PROPS.user],
    iterations: personProperties[QUOTA_BONUS_PERSON_PROPS.iterations]
  });
}

/**
 * @param {number} base
 * @param {number} bonus
 * @returns {number}
 */
export function effectiveQuotaLimit(base, bonus) {
  const b = Number(base);
  const extra = Number(bonus);
  const baseN = Number.isFinite(b) ? b : 0;
  const bonusN = Number.isFinite(extra) ? extra : 0;
  return Math.max(0, baseN + bonusN);
}

/**
 * @param {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig} config
 * @param {unknown} bonusRaw
 * @returns {import('./apexLogAiAdvisorConfig.js').LogiAdvisorConfig}
 */
export function applyQuotaBonuses(config, bonusRaw) {
  const bonus = parseQuotaBonus(bonusRaw);
  if (
    bonus.day === 0 &&
    bonus.month === 0 &&
    bonus.user === 0 &&
    bonus.iterations === 0
  ) {
    return config;
  }
  return {
    ...config,
    maxChatsPerDay: effectiveQuotaLimit(config.maxChatsPerDay, bonus.day),
    maxChatsPerMonth: effectiveQuotaLimit(config.maxChatsPerMonth, bonus.month),
    maxChatsPerUser: effectiveQuotaLimit(config.maxChatsPerUser, bonus.user),
    maxIterationsPerChat: effectiveQuotaLimit(config.maxIterationsPerChat, bonus.iterations)
  };
}

/**
 * True si algún bonus es distinto de cero.
 * @param {LogiQuotaBonus} bonus
 */
export function hasNonZeroQuotaBonus(bonus) {
  const b = parseQuotaBonus(bonus);
  return b.day !== 0 || b.month !== 0 || b.user !== 0 || b.iterations !== 0;
}
