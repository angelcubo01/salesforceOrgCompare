/**
 * @typedef {object} LogiUsageUiDeps
 * @property {(key: string, vars?: Record<string, unknown>) => string} t
 * @property {() => number} getIteration
 * @property {() => number} getMaxIterations
 * @property {() => { remainingToday?: number, maxToday?: number } | null} getUsageHint
 * @property {(hint: { remainingToday?: number, maxToday?: number } | null) => void} [setUsageHint]
 */

/**
 * @param {{ remaining?: { today?: number }, max?: { today?: number, maxChatsPerDay?: number }, usage?: { chatsToday?: number } }} [usageRes]
 * @returns {{ remainingToday?: number, maxToday?: number } | null}
 */
export function parseUsageHint(usageRes) {
  if (usageRes?.remaining?.today != null) {
    return {
      remainingToday: Number(usageRes.remaining.today),
      maxToday: Number(usageRes.max?.today)
    };
  }
  if (usageRes?.usage && usageRes?.max) {
    const maxToday = Number(usageRes.max.today ?? usageRes.max.maxChatsPerDay);
    const used = Number(usageRes.usage.chatsToday);
    if (Number.isFinite(maxToday) && Number.isFinite(used)) {
      return { remainingToday: Math.max(0, maxToday - used), maxToday };
    }
  }
  return null;
}

/**
 * @param {{ remainingToday?: number, maxToday?: number } | null} usageHint
 * @param {(key: string, vars?: Record<string, unknown>) => string} t
 */
export function formatUsageTooltip(usageHint, t) {
  if (!usageHint || !Number.isFinite(usageHint.remainingToday)) return '';
  if (Number.isFinite(usageHint.maxToday)) {
    return t('apexLogViewer.logi.usageTooltip', {
      remaining: usageHint.remainingToday,
      max: usageHint.maxToday
    });
  }
  return t('apexLogViewer.logi.chatsRemaining', { remaining: usageHint.remainingToday });
}

/**
 * @param {HTMLElement} modal
 * @param {LogiUsageUiDeps} deps
 */
export function updateIterationsLabel(modal, deps) {
  const el = modal.querySelector('#logiAdvisorIterations');
  const remEl = modal.querySelector('#logiAdvisorChatsRemaining');
  const max = deps.getMaxIterations();
  const iteration = deps.getIteration();
  const usageHint = deps.getUsageHint();

  if (el) {
    el.textContent = deps.t('apexLogViewer.logi.iterations', {
      current: Math.min(iteration, max),
      max
    });
    const tip = formatUsageTooltip(usageHint, deps.t);
    if (tip) {
      el.title = tip;
    } else {
      el.removeAttribute('title');
    }
  }
  if (remEl) {
    if (usageHint && Number.isFinite(usageHint.remainingToday)) {
      remEl.hidden = false;
      remEl.textContent = deps.t('apexLogViewer.logi.chatsRemaining', {
        remaining: usageHint.remainingToday
      });
    } else {
      remEl.hidden = true;
      remEl.textContent = '';
    }
  }
}

/**
 * @param {HTMLElement} modal
 * @param {object} [usageRes]
 * @param {LogiUsageUiDeps} deps
 */
export function applyUsageHint(modal, usageRes, deps) {
  const hint = parseUsageHint(usageRes);
  deps.setUsageHint?.(hint);
  updateIterationsLabel(modal, deps);
}
