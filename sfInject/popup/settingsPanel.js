/**
 * Panel de ajustes Salesforce UI Integration (generado desde el registro).
 */
import { SF_INJECT_SHIPPED } from '../lib/registry.js';
import { loadSfInjectSettings, saveSfInjectSettings } from '../lib/settings.js';

/**
 * @param {(key: string) => string} translate
 */
export function renderSfInjectSettingsPanel(translate) {
  const container = document.getElementById('settingsSfInjectIntegrations');
  if (!container) return;

  container.replaceChildren();

  for (const item of SF_INJECT_SHIPPED) {
    const label = document.createElement('label');
    label.className = 'settings-checkbox-row settings-checkbox-row--nested';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `settingsSfInject_${item.id}`;
    input.setAttribute('data-sf-inject-integration', item.id);

    const title = document.createElement('span');
    title.textContent = translate(item.settingsLabelKey);

    label.append(input, title);
    container.appendChild(label);

    const hint = document.createElement('p');
    hint.className = 'settings-hint settings-hint--nested';
    hint.textContent = translate(item.settingsHintKey);
    container.appendChild(hint);
  }
}

/**
 * @param {(key: string) => string} translate
 */
export function wireSfInjectSettings(translate) {
  renderSfInjectSettingsPanel(translate);

  const enabledCb = document.getElementById('settingsSfInjectEnabled');
  const statusEl = document.getElementById('settingsSfInjectStatus');
  /** @type {HTMLInputElement[]} */
  const integrationCbs = [
    ...document.querySelectorAll('input[data-sf-inject-integration]')
  ];

  const setStatus = (msg) => {
    if (statusEl) statusEl.textContent = msg || '';
  };

  const collectIntegrations = () => {
    /** @type {Record<string, boolean>} */
    const integrations = {};
    for (const cb of integrationCbs) {
      const id = cb.getAttribute('data-sf-inject-integration');
      if (id) integrations[id] = !!cb.checked;
    }
    return integrations;
  };

  const syncMasterFromChildren = () => {
    if (!enabledCb || !integrationCbs.length) return;
    const onCount = integrationCbs.filter((cb) => cb.checked).length;
    const allOn = onCount === integrationCbs.length;
    const allOff = onCount === 0;
    enabledCb.indeterminate = !allOn && !allOff;
    enabledCb.checked = allOn || (!allOff && onCount > 0);
  };

  const persist = async () => {
    const integrations = collectIntegrations();
    const anyOn = Object.values(integrations).some(Boolean);
    const cfg = await saveSfInjectSettings({
      enabled: anyOn,
      integrations
    });
    setStatus(translate('settings.sfInjectSaved'));
    return cfg;
  };

  const applyConfig = (cfg) => {
    for (const cb of integrationCbs) {
      const id = cb.getAttribute('data-sf-inject-integration');
      if (!id) continue;
      const integrationOn = cfg.integrations?.[id] !== false;
      cb.checked = cfg.enabled === true && integrationOn;
    }
    syncMasterFromChildren();
  };

  void loadSfInjectSettings().then((cfg) => applyConfig(cfg));

  enabledCb?.addEventListener('change', () => {
    const on = !!enabledCb.checked;
    enabledCb.indeterminate = false;
    for (const cb of integrationCbs) cb.checked = on;
    void persist();
  });

  for (const cb of integrationCbs) {
    cb.addEventListener('change', () => {
      syncMasterFromChildren();
      void persist();
    });
  }
}
