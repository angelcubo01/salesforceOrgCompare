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
  EXTENSION_FIELD_BOUNDS,
  EXTENSION_CONFIG_KEY,
  MONACO_THEME_IDS,
  normalizeMonacoThemeId,
  applyUiThemeToDocument
} from '../shared/extensionSettings.js';

const MONACO_THEME_I18N_KEYS = {
  'sfoc-editor-dark': 'settings.monacoThemeSfocDark',
  'sfoc-editor-light': 'settings.monacoThemeSfocLight',
  'vs-dark': 'settings.monacoThemeVsDark',
  vs: 'settings.monacoThemeVs',
  'hc-black': 'settings.monacoThemeHcBlack',
  'hc-light': 'settings.monacoThemeHcLight'
};

function refreshAppearanceSelectLabels() {
  const uiSel = document.getElementById('settingsUiTheme');
  if (uiSel) {
    for (const o of Array.from(uiSel.options)) {
      o.textContent = t(o.value === 'light' ? 'settings.uiThemeLight' : 'settings.uiThemeDark');
    }
  }
  const monSel = document.getElementById('settingsMonacoTheme');
  if (monSel) {
    for (const o of Array.from(monSel.options)) {
      const k = MONACO_THEME_I18N_KEYS[o.value];
      o.textContent = k ? t(k) : o.value;
    }
  }
}

function wireAppearanceSettings() {
  const uiSel = document.getElementById('settingsUiTheme');
  const monSel = document.getElementById('settingsMonacoTheme');
  if (uiSel) {
    uiSel.innerHTML = '';
    for (const val of ['dark', 'light']) {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = t(val === 'light' ? 'settings.uiThemeLight' : 'settings.uiThemeDark');
      uiSel.appendChild(o);
    }
  }
  if (monSel) {
    monSel.innerHTML = '';
    for (const id of MONACO_THEME_IDS) {
      const o = document.createElement('option');
      o.value = id;
      const k = MONACO_THEME_I18N_KEYS[id];
      o.textContent = k ? t(k) : id;
      monSel.appendChild(o);
    }
  }
  void loadExtensionSettings().then((cfg) => {
    if (uiSel) uiSel.value = cfg.uiTheme === 'light' ? 'light' : 'dark';
    if (monSel) monSel.value = normalizeMonacoThemeId(cfg.monacoTheme);
  });
  uiSel?.addEventListener('change', async () => {
    const v = uiSel.value === 'light' ? 'light' : 'dark';
    await saveExtensionSettings({ uiTheme: v });
    applyUiThemeToDocument(document);
  });
  monSel?.addEventListener('change', async () => {
    await saveExtensionSettings({ monacoTheme: normalizeMonacoThemeId(monSel.value) });
  });
}

async function bg(message) {
  return chrome.runtime.sendMessage(message);
}

const ANON_SAVED_SCRIPTS_KEY = 'sfoc_anon_apex_saved_scripts';

function scriptItemKey(item) {
  return `${String(item?.type || '')}:${String(item?.key || '')}`;
}

function mergeSavedCodeItems(current, incoming) {
  const out = Array.isArray(current) ? [...current] : [];
  const seen = new Set(out.map(scriptItemKey));
  for (const x of Array.isArray(incoming) ? incoming : []) {
    const k = scriptItemKey(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function readLocalAnonScripts() {
  try {
    const raw = localStorage.getItem(ANON_SAVED_SCRIPTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeLocalAnonScripts(list) {
  try {
    localStorage.setItem(ANON_SAVED_SCRIPTS_KEY, JSON.stringify(Array.isArray(list) ? list : []));
  } catch {
    /* ignore */
  }
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
  if (key === 'apexTestsExpandedMethodsPollIntervalMs') return 500;
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
    refreshAppearanceSelectLabels();
  });
}

function wireOrgsBackup() {
  const statusEl = document.getElementById('settingsOrgsStatus');
  const fileInput = document.getElementById('settingsOrgsFile');
  const importReplace = true;

  const setStatus = (msg, isError) => {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.style.color = isError ? '#f87171' : '#94a3b8';
  };

  document.getElementById('settingsExportOrgs')?.addEventListener('click', async () => {
    setStatus('');
    const [res, local] = await Promise.all([
      bg({ type: 'orgs:exportConfig' }),
      chrome.storage.local.get([EXTENSION_CONFIG_KEY, 'savedCodeItems', 'pinnedKeys'])
    ]);
    if (!res?.ok || !res.payload) {
      setStatus(t('settings.backupExportError'), true);
      return;
    }
    const payload = {
      formatVersion: 2,
      exportedAt: new Date().toISOString(),
      orgConfig: res.payload,
      localConfig: {
        extensionSettings: local?.[EXTENSION_CONFIG_KEY] || null,
        savedCodeItems: Array.isArray(local?.savedCodeItems) ? local.savedCodeItems : [],
        pinnedKeys: Array.isArray(local?.pinnedKeys) ? local.pinnedKeys : [],
        anonymousApexScripts: readLocalAnonScripts()
      }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8'
    });
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = URL.createObjectURL(blob);
    a.download = `sfoc-backup-${stamp}.json`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('settingsImportReplace')?.addEventListener('click', () => {
    if (!confirm(t('settings.backupImportReplaceConfirm'))) return;
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
      setStatus(t('settings.backupImportError'), true);
      return;
    }
    // Compatibilidad: formato antiguo (solo orgs)
    const isLegacyOrgs = data && typeof data === 'object' && data.orgs && typeof data.orgs === 'object';
    if (isLegacyOrgs) {
      const resLegacy = await bg({ type: 'orgs:importConfig', data, replace: importReplace });
      if (!resLegacy?.ok) {
        setStatus(t('settings.backupImportError'), true);
        return;
      }
      setStatus(t('settings.backupImportOk', { count: resLegacy.count ?? 0 }), false);
      return;
    }
    if (!data || typeof data !== 'object' || !data.orgConfig || !data.localConfig) {
      setStatus(t('settings.backupImportError'), true);
      return;
    }
    const res = await bg({ type: 'orgs:importConfig', data: data.orgConfig, replace: importReplace });
    if (!res?.ok) {
      setStatus(t('settings.backupImportError'), true);
      return;
    }

    const incomingSettings = data.localConfig.extensionSettings ?? null;
    const incomingSavedItems = Array.isArray(data.localConfig.savedCodeItems)
      ? data.localConfig.savedCodeItems
      : [];
    const incomingPinnedKeys = Array.isArray(data.localConfig.pinnedKeys) ? data.localConfig.pinnedKeys : [];
    const incomingAnonScripts = Array.isArray(data.localConfig.anonymousApexScripts)
      ? data.localConfig.anonymousApexScripts
      : [];

    if (importReplace) {
      const replacePayload = {
        savedCodeItems: incomingSavedItems,
        pinnedKeys: incomingPinnedKeys
      };
      if (incomingSettings && typeof incomingSettings === 'object') {
        replacePayload[EXTENSION_CONFIG_KEY] = incomingSettings;
        await chrome.storage.local.set(replacePayload);
      } else {
        await chrome.storage.local.remove(EXTENSION_CONFIG_KEY);
        await chrome.storage.local.set(replacePayload);
      }
      writeLocalAnonScripts(incomingAnonScripts);
    } else {
      const current = await chrome.storage.local.get([EXTENSION_CONFIG_KEY, 'savedCodeItems', 'pinnedKeys']);
      const mergedSettings = {
        ...(current?.[EXTENSION_CONFIG_KEY] || {}),
        ...(incomingSettings || {})
      };
      const mergedSavedItems = mergeSavedCodeItems(current?.savedCodeItems, incomingSavedItems);
      const mergedPinned = [...new Set([...(current?.pinnedKeys || []), ...incomingPinnedKeys])].slice(0, 5);
      await chrome.storage.local.set({
        [EXTENSION_CONFIG_KEY]: mergedSettings,
        savedCodeItems: mergedSavedItems,
        pinnedKeys: mergedPinned
      });
      const currentScripts = readLocalAnonScripts();
      const seenNames = new Set(currentScripts.map((s) => String(s?.name || '').trim().toLocaleLowerCase()));
      const mergedScripts = [...currentScripts];
      for (const s of incomingAnonScripts) {
        const nm = String(s?.name || '').trim().toLocaleLowerCase();
        if (!nm || seenNames.has(nm)) continue;
        seenNames.add(nm);
        mergedScripts.push(s);
      }
      writeLocalAnonScripts(mergedScripts);
    }

    setStatus(t('settings.backupImportOk', { count: res.count ?? 0 }), false);
  });
}

async function main() {
  await loadLang();
  await loadExtensionSettings();
  applyUiThemeToDocument(document);
  document.documentElement.lang = getCurrentLang() === 'en' ? 'en' : 'es';
  document.title = t('settings.pageTitle');
  applyStaticTranslations();
  wireLanguageSelect();
  wireAppearanceSettings();
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
