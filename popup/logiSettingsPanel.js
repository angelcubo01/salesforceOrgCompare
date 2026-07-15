import { formatLogiModelLabel } from '../shared/logiModelLabels.js';
import { LOGI_ADVISOR_READY_EVENT } from '../shared/posthogLogiAdvisorFlag.js';

/** @type {Record<string, unknown> | null} */
let lastConfig = null;

function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

function t(key) {
  return typeof window.__settingsT === 'function' ? window.__settingsT(key) : key;
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
  const userMode = config.userSettings?.logiMode || config.logiMode || 'free';

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
  const modelsSel = document.getElementById('settingsLogiByokModels');
  if (!modelsSel) return;
  modelsSel.innerHTML = '';
  const allowed = config.modes?.byok?.allowedModels || [];
  const selected = new Set(config.userSettings?.logiByokModels || allowed);
  for (const id of allowed) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = formatLogiModelLabel(id);
    opt.selected = selected.has(id);
    modelsSel.appendChild(opt);
  }
}

/**
 * @param {Record<string, unknown>} config
 */
function applyLogiConfig(config) {
  lastConfig = config;
  const section = document.getElementById('settingsLogi');
  if (!section) return;
  const visible = config.showLogiSettings === true && config.enabled === true;
  section.hidden = !visible;
  if (!visible) return;
  renderModeCards(config);
  renderByokPanel(config);
}

export async function refreshLogiSettingsPanel() {
  try {
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

  document.getElementById('settingsLogiSave')?.addEventListener('click', async () => {
    const status = document.getElementById('settingsLogiStatus');
    const modeInput = document.querySelector('input[name="settingsLogiMode"]:checked');
    const mode = modeInput?.value || 'free';
    const keyInput = document.getElementById('settingsLogiByokKey');
    const modelsSel = document.getElementById('settingsLogiByokModels');

    /** @type {Record<string, unknown>} */
    const patch = { logiMode: mode };
    if (keyInput?.value?.trim()) patch.logiByokOpenRouterKey = keyInput.value.trim();
    if (modelsSel) {
      patch.logiByokModels = Array.from(modelsSel.selectedOptions).map((o) => o.value);
    }

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
