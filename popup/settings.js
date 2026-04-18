import {
  loadLang,
  setLang,
  getCurrentLang,
  t,
  getAvailableLanguages
} from '../shared/i18n.js';
import { UPDATE_PAGE_URL, PRIVACY_POLICY_URL } from '../code/core/constants.js';
import {
  loadExtensionSettings,
  saveExtensionSettings,
  resetExtensionSettings,
  EXTENSION_ADVANCED_FIELD_KEYS,
  EXTENSION_FIELD_BOUNDS
} from '../shared/extensionSettings.js';

async function bg(message) {
  return chrome.runtime.sendMessage(message);
}

function applyStaticTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((elem) => {
    elem.textContent = t(elem.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((elem) => {
    elem.title = t(elem.getAttribute('data-i18n-title'));
  });
}

function advFieldStep(key) {
  if (key === 'apexTestsPollIntervalMs') return 500;
  if (key === 'apexTestsMaxTrackedJobs') return 1;
  if (key === 'maxAlignedBufferChars') return 500_000;
  return 10_000;
}

function refreshAdvancedFieldI18n() {
  for (const key of EXTENSION_ADVANCED_FIELD_KEYS) {
    const lb = document.getElementById(`adv_${key}_label`);
    const hi = document.getElementById(`adv_${key}_hint`);
    if (lb) lb.textContent = t(`settings.adv.${key}.label`);
    if (hi) hi.textContent = t(`settings.adv.${key}.hint`);
  }
}

function refreshGeneralTraceFieldI18n() {
  const lb = document.getElementById('settingsApexTraceDebugLevel_label');
  const hi = document.getElementById('settingsApexTraceDebugLevel_hint');
  if (lb) lb.textContent = t('settings.general.apexTestsTraceDebugLevel.label');
  if (hi) hi.textContent = t('settings.general.apexTestsTraceDebugLevel.hint');
  const lbCov = document.getElementById('settingsApexCoverageMinPercent_label');
  const hiCov = document.getElementById('settingsApexCoverageMinPercent_hint');
  if (lbCov) lbCov.textContent = t('settings.general.apexTestsCoverageMinPercent.label');
  if (hiCov) hiCov.textContent = t('settings.general.apexTestsCoverageMinPercent.hint');
}

function wireGeneralTraceSettings() {
  const inp = document.getElementById('settingsApexTraceDebugLevel');
  const inpCov = document.getElementById('settingsApexCoverageMinPercent');
  const btn = document.getElementById('settingsGeneralTraceSave');
  const statusEl = document.getElementById('settingsGeneralTraceStatus');
  void loadExtensionSettings().then((cfg) => {
    if (inp) inp.value = String(cfg.apexTestsTraceDebugLevel ?? '');
    if (inpCov) inpCov.value = String(cfg.apexTestsCoverageMinPercent ?? '');
  });
  refreshGeneralTraceFieldI18n();
  btn?.addEventListener('click', async () => {
    if (statusEl) statusEl.textContent = '';
    const partial = {
      apexTestsTraceDebugLevel: inp?.value ?? '',
      apexTestsCoverageMinPercent: inpCov?.value ?? ''
    };
    const cfg = await saveExtensionSettings(partial);
    if (inp) inp.value = String(cfg.apexTestsTraceDebugLevel ?? '');
    if (inpCov) inpCov.value = String(cfg.apexTestsCoverageMinPercent ?? '');
    if (statusEl) {
      statusEl.textContent = t('settings.advancedSaved');
      statusEl.style.color = '#94a3b8';
    }
  });
}

function fillAdvancedInputsFromConfig(cfg) {
  for (const key of EXTENSION_ADVANCED_FIELD_KEYS) {
    const el = document.getElementById(`adv_${key}`);
    if (el) el.value = String(cfg[key]);
  }
}

function wireAdvancedPanel() {
  const host = document.getElementById('settingsAdvancedFields');
  if (!host) return;

  void loadExtensionSettings().then((cfg) => {
    host.innerHTML = '';
    for (const key of EXTENSION_ADVANCED_FIELD_KEYS) {
      const wrap = document.createElement('div');
      wrap.className = 'settings-adv-field';
      const lb = document.createElement('label');
      lb.className = 'settings-label';
      lb.id = `adv_${key}_label`;
      lb.htmlFor = `adv_${key}`;
      lb.textContent = t(`settings.adv.${key}.label`);
      const inp = document.createElement('input');
      const b = EXTENSION_FIELD_BOUNDS[key];
      if (b) {
        inp.type = 'number';
        inp.className = 'settings-number settings-number--wide';
        inp.min = String(b.min);
        inp.max = String(b.max);
        inp.step = String(advFieldStep(key));
      } else {
        inp.type = 'text';
        inp.className = 'settings-text settings-text--wide';
        inp.autocomplete = 'off';
        inp.spellcheck = false;
      }
      inp.id = `adv_${key}`;
      inp.value = String(cfg[key] ?? '');
      const hint = document.createElement('p');
      hint.className = 'settings-hint settings-hint--field';
      hint.id = `adv_${key}_hint`;
      hint.textContent = t(`settings.adv.${key}.hint`);
      wrap.appendChild(lb);
      wrap.appendChild(inp);
      wrap.appendChild(hint);
      host.appendChild(wrap);
    }
  });

  const statusEl = document.getElementById('settingsAdvancedStatus');

  document.getElementById('settingsAdvancedSave')?.addEventListener('click', async () => {
    if (statusEl) statusEl.textContent = '';
    const partial = {};
    for (const key of EXTENSION_ADVANCED_FIELD_KEYS) {
      const el = document.getElementById(`adv_${key}`);
      if (el) partial[key] = el.value;
    }
    const cfg = await saveExtensionSettings(partial);
    fillAdvancedInputsFromConfig(cfg);
    if (statusEl) {
      statusEl.textContent = t('settings.advancedSaved');
      statusEl.style.color = '#94a3b8';
    }
  });

  document.getElementById('settingsAdvancedReset')?.addEventListener('click', async () => {
    if (statusEl) statusEl.textContent = '';
    const cfg = await resetExtensionSettings();
    fillAdvancedInputsFromConfig(cfg);
    if (statusEl) {
      statusEl.textContent = t('settings.advancedSaved');
      statusEl.style.color = '#94a3b8';
    }
  });
}

function wireLanguageSelect() {
  const sel = document.getElementById('settingsLang');
  if (!sel) return;
  sel.innerHTML = '';
  for (const { code, label } of getAvailableLanguages()) {
    const o = document.createElement('option');
    o.value = code;
    o.textContent = label;
    sel.appendChild(o);
  }
  sel.value = getCurrentLang();
  sel.addEventListener('change', () => {
    setLang(sel.value);
    document.documentElement.lang = sel.value === 'en' ? 'en' : 'es';
    applyStaticTranslations();
    document.title = t('settings.pageTitle');
    refreshAdvancedFieldI18n();
    refreshGeneralTraceFieldI18n();
  });
}

function wireOrgsBackup() {
  const statusEl = document.getElementById('settingsOrgsStatus');
  const fileInput = document.getElementById('settingsOrgsFile');
  let importReplace = false;

  const setStatus = (msg, isError) => {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.style.color = isError ? '#f87171' : '#94a3b8';
  };

  document.getElementById('settingsExportOrgs')?.addEventListener('click', async () => {
    setStatus('');
    const res = await bg({ type: 'orgs:exportConfig' });
    if (!res?.ok || !res.payload) {
      setStatus(t('settings.orgsExportError'), true);
      return;
    }
    const blob = new Blob([JSON.stringify(res.payload, null, 2)], {
      type: 'application/json;charset=utf-8'
    });
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = URL.createObjectURL(blob);
    a.download = `sfoc-orgs-${stamp}.json`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('settingsImportMerge')?.addEventListener('click', () => {
    importReplace = false;
    fileInput?.click();
  });

  document.getElementById('settingsImportReplace')?.addEventListener('click', () => {
    if (!confirm(t('settings.orgsImportReplaceConfirm'))) return;
    importReplace = true;
    fileInput?.click();
  });

  fileInput?.addEventListener('change', async () => {
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!f) return;
    setStatus('');
    let data;
    try {
      data = JSON.parse(await f.text());
    } catch {
      setStatus(t('settings.orgsImportError'), true);
      return;
    }
    const res = await bg({ type: 'orgs:importConfig', data, replace: importReplace });
    if (!res?.ok) {
      setStatus(t('settings.orgsImportError'), true);
      return;
    }
    setStatus(t('settings.orgsImportOk', { count: res.count ?? 0 }), false);
  });
}

async function main() {
  await loadLang();
  await loadExtensionSettings();
  document.documentElement.lang = getCurrentLang() === 'en' ? 'en' : 'es';
  document.title = t('settings.pageTitle');
  applyStaticTranslations();
  wireLanguageSelect();
  wireGeneralTraceSettings();
  wireAdvancedPanel();
  wireOrgsBackup();

  const manifest = chrome.runtime.getManifest();
  const verEl = document.getElementById('settingsVersion');
  if (verEl) verEl.textContent = `v${manifest.version}`;

  const home = document.getElementById('settingsHomeLink');
  if (home && UPDATE_PAGE_URL) home.href = UPDATE_PAGE_URL;
  const priv = document.getElementById('settingsPrivacyLink');
  if (priv && PRIVACY_POLICY_URL) priv.href = PRIVACY_POLICY_URL;

  document.getElementById('settingsOpenCompare')?.addEventListener('click', async () => {
    const url = chrome.runtime.getURL('code/code.html');
    await chrome.tabs.create({ url });
  });
}

void main();
