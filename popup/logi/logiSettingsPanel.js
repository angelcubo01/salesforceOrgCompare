import { formatLogiModelLabel } from '../../shared/logi/logiModelLabels.js';
import { formatLogiModelPricingLabel } from '../../shared/logi/logiModelPricing.js';
import {
  DEFAULT_LOGI_LANGUAGE,
  formatLogiLanguageLabel,
  LOGI_LANGUAGES,
  normalizeLogiLanguage
} from '../../shared/logi/logiLanguages.js';
import { LOGI_ADVISOR_READY_EVENT } from '../../shared/logi/posthogLogiAdvisorFlag.js';

function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

function t(key) {
  return typeof window.__settingsT === 'function' ? window.__settingsT(key) : key;
}

/** @type {string[]} */
let preferredModels = [];
/** @type {string[]} */
let allowedModels = [];
/** @type {Record<string, { promptPer1M: number, completionPer1M: number, source?: string, label?: string }> | null} */
let modelPricingMap = null;
/** True only when OpenRouter live catalog was fetched successfully. */
let pricingLive = false;

/**
 * @param {boolean} visible
 */
function setPricingHintVisible(visible) {
  const el = document.getElementById('settingsLogiByokModelsPricingHint');
  if (el) el.hidden = !visible;
}

/**
 * @param {string} modelId
 * @returns {string}
 */
function priceLabelForModel(modelId) {
  if (!pricingLive) return '';
  const live = modelPricingMap?.[modelId];
  if (!live || live.source === 'fallback') return '';
  if (live.label) return live.label;
  return formatLogiModelPricingLabel(
    {
      promptPer1M: Number(live.promptPer1M),
      completionPer1M: Number(live.completionPer1M),
      source: 'live'
    },
    { freeLabel: t('settings.logi.modelPriceFree') }
  );
}

/**
 * @param {Record<string, unknown>} config
 */
function renderLanguageSelect(config) {
  const sel = document.getElementById('settingsLogiLanguage');
  if (!sel) return;
  const current = normalizeLogiLanguage(
    config.userSettings?.logiLanguage || config.logiLanguage || DEFAULT_LOGI_LANGUAGE
  );
  sel.innerHTML = '';
  for (const lang of LOGI_LANGUAGES) {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = formatLogiLanguageLabel(lang);
    opt.selected = lang.code === current;
    sel.appendChild(opt);
  }
}

/**
 * @param {Record<string, unknown>} config
 */
function renderModeCards(config) {
  const wrap = document.getElementById('settingsLogiModes');
  if (!wrap) return;
  wrap.innerHTML = '';
  const modes = /** @type {Record<string, Record<string, unknown>>} */ (config.modes || {});
  const allowed = /** @type {string[]} */ (config.allowedModes || []);
  let userMode = config.userSettings?.logiMode || config.logiMode || 'free';
  // If a key is already saved but mode stayed on Free, pre-select BYOK so Save unlocks the picker.
  if (
    userMode === 'free' &&
    config.userSettings?.hasByokKey === true &&
    modes.byok?.enabled === true &&
    allowed.includes('byok')
  ) {
    userMode = 'byok';
  }

  for (const modeId of allowed) {
    const modeCfg = modes[modeId] || {};
    if (modeCfg.enabled === false) continue;
    const label =
      modeId === 'free' ? t('settings.logi.modeFree') : t('settings.logi.modeByok');
    const card = document.createElement('label');
    card.className = 'settings-logi-mode-card';
    card.innerHTML = `
      <input type="radio" name="settingsLogiMode" value="${modeId}" ${userMode === modeId ? 'checked' : ''} />
      <span class="settings-logi-mode-title">${label}</span>
      <span class="settings-logi-mode-desc">${t(`settings.logi.mode${modeId.charAt(0).toUpperCase()}${modeId.slice(1)}Desc`)}</span>`;
    wrap.appendChild(card);
  }
}

function renderPreferredModelsList() {
  const list = document.getElementById('settingsLogiByokModelsList');
  if (!list) return;
  list.innerHTML = '';
  preferredModels.forEach((id, index) => {
    const row = document.createElement('div');
    row.className = 'settings-logi-model-row';
    row.setAttribute('role', 'listitem');
    row.dataset.modelId = id;
    const price = priceLabelForModel(id);
    row.innerHTML = `
      <span class="settings-logi-model-rank" aria-hidden="true">${index + 1}</span>
      <span class="settings-logi-model-main">
        <span class="settings-logi-model-name">${formatLogiModelLabel(id)}</span>
        ${
          price
            ? `<span class="settings-logi-model-price" title="${t('settings.logi.modelPriceTitle')}">${price}</span>`
            : ''
        }
      </span>
      <span class="settings-logi-model-actions">
        <button type="button" class="settings-logi-model-btn" data-act="up" data-index="${index}" aria-label="${t('settings.logi.byokModelUp')}" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="settings-logi-model-btn" data-act="down" data-index="${index}" aria-label="${t('settings.logi.byokModelDown')}" ${index >= preferredModels.length - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="settings-logi-model-btn settings-logi-model-btn--danger" data-act="remove" data-index="${index}" aria-label="${t('settings.logi.byokModelRemove')}">×</button>
      </span>`;
    list.appendChild(row);
  });
  if (!preferredModels.length) {
    const empty = document.createElement('p');
    empty.className = 'settings-hint settings-hint--nomargin';
    empty.textContent = t('settings.logi.byokModelsEmpty');
    list.appendChild(empty);
  }
  refreshAddModelSelect();
}

function refreshAddModelSelect() {
  const addSel = document.getElementById('settingsLogiByokModelAdd');
  const addBtn = document.getElementById('settingsLogiByokModelAddBtn');
  if (!addSel) return;
  const remaining = allowedModels.filter((id) => !preferredModels.includes(id));
  addSel.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = t('settings.logi.byokModelsAddPlaceholder');
  addSel.appendChild(placeholder);
  for (const id of remaining) {
    const opt = document.createElement('option');
    opt.value = id;
    const price = priceLabelForModel(id);
    opt.textContent = price ? `${formatLogiModelLabel(id)} · ${price}` : formatLogiModelLabel(id);
    addSel.appendChild(opt);
  }
  addSel.disabled = remaining.length === 0;
  if (addBtn) addBtn.disabled = remaining.length === 0;
  addSel.setAttribute('aria-label', t('settings.logi.byokModelsAdd'));
}

/**
 * @param {number} index
 * @param {'up' | 'down' | 'remove'} act
 */
function movePreferredModel(index, act) {
  if (index < 0 || index >= preferredModels.length) return;
  if (act === 'remove') {
    preferredModels.splice(index, 1);
  } else if (act === 'up' && index > 0) {
    const tmp = preferredModels[index - 1];
    preferredModels[index - 1] = preferredModels[index];
    preferredModels[index] = tmp;
  } else if (act === 'down' && index < preferredModels.length - 1) {
    const tmp = preferredModels[index + 1];
    preferredModels[index + 1] = preferredModels[index];
    preferredModels[index] = tmp;
  }
  renderPreferredModelsList();
}

/**
 * @param {Record<string, unknown>} config
 */
function renderByokPanel(config) {
  const panel = document.getElementById('settingsLogiByokPanel');
  if (!panel) return;
  const show = config.modes?.byok?.enabled === true;
  panel.hidden = !show;
  if (!show) return;
  const keyInput = document.getElementById('settingsLogiByokKey');
  if (keyInput && config.userSettings?.hasByokKey) {
    keyInput.placeholder = t('settings.logi.byokKeySaved');
  }
  allowedModels = [...(config.modes?.byok?.allowedModels || [])];
  const saved = /** @type {string[] | undefined} */ (config.userSettings?.logiByokModels);
  const fromSaved = Array.isArray(saved)
    ? saved.map((id) => String(id || '').trim()).filter((id) => id && allowedModels.includes(id))
    : [];
  preferredModels = fromSaved.length ? fromSaved : [...allowedModels];
  pricingLive = false;
  modelPricingMap = null;
  setPricingHintVisible(false);
  renderPreferredModelsList();
  void refreshModelPricing();
}

async function refreshModelPricing() {
  const ids = [...new Set([...preferredModels, ...allowedModels])];
  if (!ids.length) {
    pricingLive = false;
    modelPricingMap = null;
    setPricingHintVisible(false);
    return;
  }
  try {
    const res = await send('aiAdvisor:getModelPricing', { modelIds: ids });
    if (res?.ok && res.live === true && res.pricing && typeof res.pricing === 'object') {
      modelPricingMap = res.pricing;
      pricingLive = Object.keys(res.pricing).length > 0;
    } else {
      modelPricingMap = null;
      pricingLive = false;
    }
  } catch {
    modelPricingMap = null;
    pricingLive = false;
  }
  setPricingHintVisible(pricingLive);
  renderPreferredModelsList();
}

/**
 * @param {number} used
 * @param {number} max
 */
function usagePercent(used, max) {
  const m = Math.max(0, Number(max) || 0);
  if (m <= 0) return 0;
  return Math.min(100, Math.round((Math.max(0, Number(used) || 0) / m) * 100));
}

/**
 * @param {{ usage?: Record<string, number>, max?: Record<string, number> } | null} usageRes
 */
function renderUsageBars(usageRes) {
  const section = document.getElementById('settingsLogiUsage');
  const list = document.getElementById('settingsLogiUsageList');
  if (!section || !list) return;

  const max = usageRes?.max || {};
  const usage = usageRes?.usage || {};
  const rows = [
    {
      key: 'today',
      label: t('settings.logi.usageDay'),
      used: Number(usage.chatsToday) || 0,
      max: Number(max.today) || 0
    },
    {
      key: 'month',
      label: t('settings.logi.usageMonth'),
      used: Number(usage.chatsMonth) || 0,
      max: Number(max.month) || 0
    },
    {
      key: 'user',
      label: t('settings.logi.usageUser'),
      used: Number(usage.chatsTotal) || 0,
      max: Number(max.user) || 0
    }
  ].filter((row) => row.max > 0);

  if (!rows.length) {
    section.hidden = true;
    list.innerHTML = '';
    return;
  }

  section.hidden = false;
  list.innerHTML = rows
    .map((row) => {
      const pct = usagePercent(row.used, row.max);
      const fillClass =
        pct >= 100
          ? 'settings-logi-usage-fill settings-logi-usage-fill--full'
          : pct >= 80
            ? 'settings-logi-usage-fill settings-logi-usage-fill--warn'
            : 'settings-logi-usage-fill';
      return `<div class="settings-logi-usage-row" data-usage="${row.key}">
        <div class="settings-logi-usage-meta">
          <span>${row.label}: ${row.used} / ${row.max}</span>
          <span class="settings-logi-usage-pct">${pct}%</span>
        </div>
        <div class="settings-logi-usage-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${row.label}">
          <div class="${fillClass}" style="width:${pct}%"></div>
        </div>
      </div>`;
    })
    .join('');
}

/**
 * @param {Record<string, unknown>} config
 */
function applyLogiConfig(config) {
  const section = document.getElementById('settingsLogi');
  if (!section) return;
  const visible = config.showLogiSettings === true && config.enabled === true;
  section.hidden = !visible;
  if (!visible) {
    const usageSection = document.getElementById('settingsLogiUsage');
    if (usageSection) usageSection.hidden = true;
    return;
  }
  renderLanguageSelect(config);
  renderModeCards(config);
  renderByokPanel(config);
  void refreshLogiUsageBars();
}

async function refreshLogiUsageBars() {
  try {
    const res = await send('aiAdvisor:checkUsageLimits');
    if (res?.usage && res?.max) {
      renderUsageBars(res);
    } else {
      renderUsageBars(null);
    }
  } catch {
    renderUsageBars(null);
  }
}

export async function refreshLogiSettingsPanel() {
  try {
    // Force advisor-config on every settings entry; cache serves chat/usage until next entry.
    await send('aiAdvisor:bootstrap', { force: true });
    const res = await send('aiAdvisor:getConfig');
    if (res?.ok && res.config) applyLogiConfig(res.config);
  } catch {
    /* ignore */
  }
}

export function mountLogiSettingsPanel(translateFn) {
  window.__settingsT = translateFn;

  document.addEventListener(LOGI_ADVISOR_READY_EVENT, () => {
    void refreshLogiSettingsPanel();
  });

  void refreshLogiSettingsPanel();

  document.getElementById('settingsLogiByokModelsList')?.addEventListener('click', (e) => {
    const btn = e.target instanceof HTMLElement ? e.target.closest('button[data-act]') : null;
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    const index = Number(btn.getAttribute('data-index'));
    if (act === 'up' || act === 'down' || act === 'remove') {
      movePreferredModel(index, act);
    }
  });

  document.getElementById('settingsLogiByokModelAddBtn')?.addEventListener('click', () => {
    const addSel = document.getElementById('settingsLogiByokModelAdd');
    const id = addSel?.value?.trim();
    if (!id || preferredModels.includes(id)) return;
    preferredModels.push(id);
    renderPreferredModelsList();
    if (addSel) addSel.value = '';
  });

  document.getElementById('settingsLogiSave')?.addEventListener('click', async () => {
    const status = document.getElementById('settingsLogiStatus');
    const modeInput = document.querySelector('input[name="settingsLogiMode"]:checked');
    let mode = modeInput?.value || 'free';
    const langSel = document.getElementById('settingsLogiLanguage');
    const keyInput = document.getElementById('settingsLogiByokKey');
    const keyTrim = keyInput?.value?.trim() || '';
    // Pasting a key always activates BYOK (even if Free radio is still selected).
    if (keyTrim) mode = 'byok';

    /** @type {Record<string, unknown>} */
    const patch = {
      logiMode: mode,
      logiLanguage: normalizeLogiLanguage(langSel?.value || DEFAULT_LOGI_LANGUAGE),
      logiByokModels: [...preferredModels]
    };
    if (keyTrim) patch.logiByokOpenRouterKey = keyTrim;

    try {
      const res = await send('aiAdvisor:saveSettings', patch);
      if (res?.ok) {
        if (status) status.textContent = t('settings.logi.saved');
        if (keyInput?.value) keyInput.value = '';
        applyLogiConfig(res.config);
      } else if (status) {
        status.textContent = t('settings.logi.saveFailed');
      }
    } catch {
      if (status) status.textContent = t('settings.logi.saveFailed');
    }
  });

  document.getElementById('settingsLogiTestByok')?.addEventListener('click', async () => {
    const status = document.getElementById('settingsLogiStatus');
    const keyInput = document.getElementById('settingsLogiByokKey');
    try {
      const res = await send('aiAdvisor:testByok', {
        apiKey: keyInput?.value?.trim() || undefined
      });
      if (status) {
        status.textContent = res?.ok ? t('settings.logi.byokOk') : t('settings.logi.byokFailed');
      }
    } catch {
      if (status) status.textContent = t('settings.logi.byokFailed');
    }
  });
}
