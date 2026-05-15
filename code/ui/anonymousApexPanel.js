import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { loadMonaco, resolveMonacoThemeId, createStandaloneEditorSafe } from '../editor/monaco.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { t } from '../../shared/i18n.js';
import { showToast } from './toast.js';
import { apexViewerIdbPut } from '../lib/apexViewerIdb.js';
import { applyArtifactTypeUi } from './artifactTypeUi.js';
import { navigateToModeAndTool } from './appModeNav.js';
import { buildOrgPicklistLabel } from '../../shared/orgPrefs.js';

const ANON_EDITOR_CACHE_KEY = 'sfoc_anon_apex_editor_text';
const ANON_SAVED_SCRIPTS_KEY = 'sfoc_anon_apex_saved_scripts';
let anonEditor = null;
/** @type {Promise<import('monaco-editor').editor.IStandaloneCodeEditor | null> | null} */
let anonEditorInit = null;
let lastAnonLogs = [];
let selectedSavedScriptId = '';
let logPickerResolve = null;

function getOrgLabelById(orgId) {
  const org = (state.orgsList || []).find((o) => o.id === orgId);
  if (!org) return String(orgId || 'Org');
  try {
    if (typeof buildOrgPicklistLabel === 'function') {
      return buildOrgPicklistLabel(org);
    }
  } catch {
    /* fallback */
  }
  return org.label || org.displayName || String(org.id || 'Org');
}

function sanitizeApexViewerDownloadFileName(name) {
  const s = String(name || '')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return s || 'file';
}

async function openApexLogViewerWithPayload(title, content, viewerOpts = {}) {
  const initialLine =
    viewerOpts.initialLine != null && Number.isFinite(Number(viewerOpts.initialLine))
      ? Math.max(1, Math.floor(Number(viewerOpts.initialLine)))
      : undefined;
  const downloadFileName =
    viewerOpts.downloadFileName != null && String(viewerOpts.downloadFileName).trim()
      ? sanitizeApexViewerDownloadFileName(viewerOpts.downloadFileName)
      : undefined;
  const lineQs = initialLine != null ? `&line=${encodeURIComponent(String(initialLine))}` : '';
  const staged = await bg({
    type: 'apexViewer:stage',
    title,
    content,
    ...(initialLine != null ? { initialLine } : {}),
    ...(downloadFileName ? { downloadFileName } : {})
  });
  if (staged.ok && staged.id) {
    window.open(
      chrome.runtime.getURL(`code/apex-log-viewer.html?sid=${encodeURIComponent(staged.id)}${lineQs}`),
      '_blank'
    );
    return true;
  }
  const storageKey = `sfoc_aa_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  try {
    await chrome.storage.local.set({
      [storageKey]: {
        title,
        content,
        ...(initialLine != null ? { initialLine } : {}),
        ...(downloadFileName ? { downloadFileName } : {})
      }
    });
    window.open(
      chrome.runtime.getURL(`code/apex-log-viewer.html?k=${encodeURIComponent(storageKey)}${lineQs}`),
      '_blank'
    );
    return true;
  } catch {
    /* storage fallback */
  }
  try {
    const idbId = `idb_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
    await apexViewerIdbPut(idbId, {
      title,
      content,
      ...(initialLine != null ? { initialLine } : {}),
      ...(downloadFileName ? { downloadFileName } : {})
    });
    window.open(
      chrome.runtime.getURL(`code/apex-log-viewer.html?idb=${encodeURIComponent(idbId)}${lineQs}`),
      '_blank'
    );
    return true;
  } catch {
    return false;
  }
}

function setExecStatus(text, tone = '') {
  const el = document.getElementById('anonymousApexExecStatus');
  if (!el) return;
  el.textContent = text || '';
  el.classList.remove('is-error', 'is-success');
  if (tone === 'error') el.classList.add('is-error');
  if (tone === 'success') el.classList.add('is-success');
}

function readSavedScripts() {
  try {
    const raw = localStorage.getItem(ANON_SAVED_SCRIPTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeSavedScripts(list) {
  try {
    localStorage.setItem(ANON_SAVED_SCRIPTS_KEY, JSON.stringify(Array.isArray(list) ? list : []));
  } catch {
    /* ignore */
  }
}

function findScriptByName(name) {
  const n = String(name || '').trim().toLocaleLowerCase();
  if (!n) return null;
  const list = readSavedScripts();
  return list.find((x) => String(x?.name || '').trim().toLocaleLowerCase() === n) || null;
}

function syncSaveButtonLabel() {
  const saveBtn = document.getElementById('anonymousApexSaveScriptBtn');
  const quickBtn = document.getElementById('anonymousApexQuickSaveBtn');
  const inp = document.getElementById('anonymousApexScriptNameInput');
  if (!inp) return;
  const hasExisting = !!findScriptByName(inp.value);
  const quickHasTarget =
    !!selectedSavedScriptId && readSavedScripts().some((x) => x.id === selectedSavedScriptId);
  const keyModal = hasExisting ? 'anonymousApex.updateScript' : 'anonymousApex.saveScript';
  const keyQuick = quickHasTarget ? 'anonymousApex.updateScript' : 'anonymousApex.saveScript';
  if (saveBtn) saveBtn.textContent = t(keyModal);
  if (quickBtn) quickBtn.textContent = t(keyQuick);
}

async function persistScriptWithName(name) {
  await ensureEditor();
  const n = String(name || '').trim();
  const body = String(anonEditor?.getValue() || '');
  if (!n) {
    showToast(t('anonymousApex.scriptNameRequired'), 'warn');
    return false;
  }
  if (!body.trim()) {
    showToast(t('anonymousApex.emptyBody'), 'warn');
    return false;
  }
  const list = readSavedScripts();
  const existing = findScriptByName(n);
  if (existing) {
    const ix = list.findIndex((x) => x.id === existing.id);
    if (ix >= 0) {
      list[ix] = { ...list[ix], name: n, body, updatedAt: Date.now() };
      selectedSavedScriptId = list[ix].id;
      writeSavedScripts(list);
      refreshSavedScriptsUi();
      showToast(t('anonymousApex.scriptUpdated'), 'info');
      syncSaveButtonLabel();
      return true;
    }
  }
  selectedSavedScriptId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  list.unshift({ id: selectedSavedScriptId, name: n, body, updatedAt: Date.now() });
  writeSavedScripts(list.slice(0, 100));
  refreshSavedScriptsUi();
  showToast(t('anonymousApex.scriptSaved'), 'info');
  syncSaveButtonLabel();
  return true;
}

async function quickSaveCurrentScript() {
  await ensureEditor();
  const body = String(anonEditor?.getValue() || '');
  if (!body.trim()) {
    showToast(t('anonymousApex.emptyBody'), 'warn');
    return;
  }
  const list = readSavedScripts();
  const byId =
    selectedSavedScriptId && list.find((x) => x.id === selectedSavedScriptId);
  if (byId) {
    const ix = list.findIndex((x) => x.id === byId.id);
    if (ix >= 0) {
      list[ix] = { ...list[ix], body, updatedAt: Date.now() };
      writeSavedScripts(list);
      refreshSavedScriptsUi();
      showToast(t('anonymousApex.scriptUpdated'), 'info');
      syncSaveButtonLabel();
      return;
    }
  }
  const nameRaw = window.prompt(t('anonymousApex.quickSaveNamePrompt'), '');
  if (nameRaw == null) return;
  const name = String(nameRaw).trim();
  if (!name) {
    showToast(t('anonymousApex.scriptNameRequired'), 'warn');
    return;
  }
  const ok = await persistScriptWithName(name);
  if (ok) {
    const inp = document.getElementById('anonymousApexScriptNameInput');
    if (inp) inp.value = name;
  }
}

function closeScriptsModal() {
  const modal = document.getElementById('anonymousApexScriptsModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function openScriptsModal() {
  const modal = document.getElementById('anonymousApexScriptsModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }
  refreshSavedScriptsUi();
  syncSaveButtonLabel();
  document.getElementById('anonymousApexScriptNameInput')?.focus();
}

async function logAnonymousApexUsage(payload = {}) {
  try {
    await bg({
      type: 'usage:log',
      entry: {
        kind: 'codeComparison',
        artifactType: 'AnonymousApex',
        descriptor: {
          name: 'AnonymousApex'
        },
        leftOrgId: payload.leftOrgId != null ? String(payload.leftOrgId) : '',
        rightOrgId: payload.rightOrgId != null ? String(payload.rightOrgId) : '',
        comparisonUrl: typeof window !== 'undefined' ? window.location.href : ''
      }
    });
  } catch {
    /* ignore usage log failures */
  }
}

function refreshSavedScriptsUi() {
  const wrap = document.getElementById('anonymousApexSavedScriptsList');
  if (!wrap) return;
  const scripts = readSavedScripts();
  wrap.innerHTML = '';
  for (const s of scripts) {
    const row = document.createElement('div');
    row.className = 'anonymous-apex-script-item-row';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `anonymous-apex-script-item${selectedSavedScriptId === s.id ? ' active' : ''}`;
    btn.textContent = s.name || 'script';
    btn.addEventListener('click', () => {
      selectedSavedScriptId = s.id;
      if (anonEditor) anonEditor.setValue(String(s.body || ''));
      const inp = document.getElementById('anonymousApexScriptNameInput');
      if (inp) inp.value = String(s.name || '');
      syncSaveButtonLabel();
      refreshSavedScriptsUi();
    });
    const actions = document.createElement('div');
    actions.className = 'anonymous-apex-script-item-actions';

    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'anonymous-apex-script-rename-btn';
    rename.title = t('anonymousApex.renameScript');
    rename.textContent = '✎';
    rename.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const nextNameRaw = window.prompt(t('anonymousApex.renamePrompt'), String(s.name || ''));
      if (nextNameRaw == null) return;
      const nextName = String(nextNameRaw).trim();
      if (!nextName) {
        showToast(t('anonymousApex.scriptNameRequired'), 'warn');
        return;
      }
      const currentLower = String(s.name || '').trim().toLocaleLowerCase();
      const nextLower = nextName.toLocaleLowerCase();
      if (currentLower !== nextLower) {
        const duplicated = readSavedScripts().some(
          (x) =>
            x.id !== s.id &&
            String(x?.name || '').trim().toLocaleLowerCase() === nextLower
        );
        if (duplicated) {
          showToast(t('anonymousApex.scriptNameDuplicate'), 'warn');
          return;
        }
      }
      const list = readSavedScripts();
      const ix = list.findIndex((x) => x.id === s.id);
      if (ix < 0) return;
      list[ix] = { ...list[ix], name: nextName, updatedAt: Date.now() };
      writeSavedScripts(list);
      if (selectedSavedScriptId === s.id) {
        const inp = document.getElementById('anonymousApexScriptNameInput');
        if (inp) inp.value = nextName;
      }
      syncSaveButtonLabel();
      refreshSavedScriptsUi();
      showToast(t('anonymousApex.scriptUpdated'), 'info');
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'anonymous-apex-script-delete-btn';
    del.title = t('anonymousApex.deleteScript');
    del.textContent = 'X';
    del.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const ok = window.confirm(t('anonymousApex.confirmDeleteScript', { name: String(s.name || '') }));
      if (!ok) return;
      const list = readSavedScripts().filter((x) => x.id !== s.id);
      writeSavedScripts(list);
      if (selectedSavedScriptId === s.id) {
        selectedSavedScriptId = '';
      }
      syncSaveButtonLabel();
      refreshSavedScriptsUi();
    });
    actions.appendChild(rename);
    actions.appendChild(del);
    row.appendChild(btn);
    row.appendChild(actions);
    wrap.appendChild(row);
  }
}

function renderResult(resultByOrg) {
  const resultWrap = document.getElementById('anonymousApexResultWrap');
  const combined = document.getElementById('anonymousApexResultCombined');
  const logBtn = document.getElementById('anonymousApexOpenLogBtn');
  if (!resultWrap || !combined || !logBtn) return;
  const entries = Object.entries(resultByOrg || {});
  const errorLines = [];
  for (const [orgId, result] of entries) {
    const label = getOrgLabelById(orgId);
    const re = result?.requestError ? String(result.requestError).trim() : '';
    const cp = result?.compileProblem ? String(result.compileProblem).trim() : '';
    const em = result?.exceptionMessage ? String(result.exceptionMessage).trim() : '';
    const es = result?.exceptionStackTrace ? String(result.exceptionStackTrace).trim() : '';
    if (re) errorLines.push(`[${label}] requestError:\n${re}`);
    if (cp) errorLines.push(`[${label}] compileProblem:\n${cp}`);
    if (em) errorLines.push(`[${label}] exceptionMessage:\n${em}`);
    if (es) errorLines.push(`[${label}] exceptionStackTrace:\n${es}`);
  }
  if (!errorLines.length) {
    combined.textContent = '';
    resultWrap.classList.add('hidden');
  } else {
    combined.textContent = errorLines.join('\n\n');
    resultWrap.classList.remove('hidden');
  }
  logBtn.classList.remove('hidden');
  logBtn.disabled = !lastAnonLogs.length;
}

async function ensureEditor() {
  const mount = document.getElementById('anonymousApexEditorMount');
  if (!mount) return null;
  if (anonEditor) {
    try {
      if (anonEditor.getContainerDomNode() === mount) return anonEditor;
    } catch {
      anonEditor = null;
    }
  }
  if (anonEditorInit) return anonEditorInit;

  anonEditorInit = (async () => {
    const monaco = state.monaco || (await loadMonaco());
    state.monaco = monaco;
    anonEditor = createStandaloneEditorSafe(
      monaco,
      mount,
      {
        value:
          localStorage.getItem(ANON_EDITOR_CACHE_KEY) ||
          "System.debug('Hello from Salesforce Org Compare');",
        language: 'apex',
        readOnly: false,
        automaticLayout: true,
        minimap: { enabled: false },
        wordWrap: state.wordWrapEnabled ? 'on' : 'off',
        theme: resolveMonacoThemeId(),
        fontSize: 13,
        lineHeight: 20,
        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
        scrollbar: { useShadows: false, vertical: 'auto', horizontal: 'auto' }
      },
      anonEditor
    );
    anonEditor.onDidChangeModelContent(() => {
      try {
        localStorage.setItem(ANON_EDITOR_CACHE_KEY, anonEditor.getValue());
      } catch {
        /* ignore */
      }
    });
    return anonEditor;
  })();

  try {
    return await anonEditorInit;
  } finally {
    anonEditorInit = null;
  }
}

async function runAnonymousApex() {
  const runBtn = document.getElementById('anonymousApexRunBtn');
  const logBtn = document.getElementById('anonymousApexOpenLogBtn');
  if (!state.leftOrgId) {
    showToast(t('anonymousApex.selectOrg'), 'warn');
    return;
  }
  const ed = await ensureEditor();
  const script = String(ed?.getValue() || '');
  if (!script.trim()) {
    showToast(t('anonymousApex.emptyBody'), 'warn');
    return;
  }
  if (runBtn) runBtn.disabled = true;
  if (logBtn) {
    logBtn.disabled = true;
    logBtn.classList.add('hidden');
  }
  setExecStatus(t('anonymousApex.running'));
  const targetOrgIds = state.anonymousApexCompareMode
    ? [state.leftOrgId, state.rightOrgId].filter(Boolean)
    : [state.leftOrgId].filter(Boolean);
  const usageBase = {
    leftOrgId: state.leftOrgId || '',
    rightOrgId: state.anonymousApexCompareMode ? state.rightOrgId || '' : ''
  };
  if (state.anonymousApexCompareMode && !state.rightOrgId) {
    setExecStatus(t('anonymousApex.selectRightOrg'), 'error');
    if (runBtn) runBtn.disabled = false;
    void logAnonymousApexUsage({
      ...usageBase
    });
    return;
  }
  try {
    const execResults = await Promise.all(
      targetOrgIds.map(async (orgId) => ({
        orgId,
        res: await bg({
          type: 'anonymousApex:execute',
          orgId,
          anonymousBody: script
        })
      }))
    );
    const resultsByOrg = {};
    lastAnonLogs = [];
    const requestErrors = [];
    let hasCompileErrorOrRuntime = false;
    for (const { orgId, res } of execResults) {
      if (!res?.ok) {
        const errMsg =
          res?.reason === 'NO_SID'
            ? t('toast.noSession')
            : String(res?.error || t('anonymousApex.runError'));
        requestErrors.push(`[${getOrgLabelById(orgId)}] ${errMsg}`);
        resultsByOrg[orgId] = { requestError: errMsg };
        continue;
      }
      const result = res.result || {};
      resultsByOrg[orgId] = result;
      if (!(result.compiled === true && result.success === true)) hasCompileErrorOrRuntime = true;
      const inlineLogs = result.logs ? String(result.logs) : '';
      const logId = res.logId ? String(res.logId) : '';
      // Solo ejecuciones compiladas pueden tener log útil.
      if (result.compiled === true && (inlineLogs || logId)) {
        lastAnonLogs.push({ orgId, label: getOrgLabelById(orgId), inlineLogs, logId });
      }
    }
    if (requestErrors.length) {
      setExecStatus(`${t('anonymousApex.runError')}\n${requestErrors.join('\n')}`, 'error');
    } else if (hasCompileErrorOrRuntime) {
      setExecStatus(t('anonymousApex.runRuntimeError'), 'error');
    } else {
      setExecStatus(t('anonymousApex.runOk'), 'success');
    }
    renderResult(resultsByOrg);
    void logAnonymousApexUsage(usageBase);
  } catch (e) {
    setExecStatus(`${t('anonymousApex.runError')}\n${String(e?.message || e)}`, 'error');
    if (logBtn) {
      logBtn.classList.remove('hidden');
      logBtn.disabled = true;
    }
    void logAnonymousApexUsage({
      ...usageBase
    });
  } finally {
    if (runBtn) runBtn.disabled = false;
  }
}

async function openAnonymousApexLog() {
  const btn = document.getElementById('anonymousApexOpenLogBtn');
  if (!btn) return;
  const available = (lastAnonLogs || []).filter((x) => x && (x.inlineLogs || x.logId));
  if (!available.length) {
    showToast(t('anonymousApex.logMissing'), 'warn');
    return;
  }
  let picked = available[0];
  let usedPicker = false;
  if (available.length > 1) {
    const selected = await openLogPickerModal(available);
    if (!selected) return;
    picked = selected;
    usedPicker = true;
  }
  let content = picked.inlineLogs || '';
  if (!content && picked.logId && picked.orgId) {
    const bodyRes = await bg({
      type: 'anonymousApex:getLogBody',
      orgId: picked.orgId,
      logId: picked.logId
    });
    if (bodyRes?.ok && bodyRes.body != null) content = String(bodyRes.body);
  }
  if (!content) {
    showToast(t('anonymousApex.logMissing'), 'warn');
    return;
  }
  const ok = await openApexLogViewerWithPayload(
    `${t('anonymousApex.title')} · ${picked.label} · ${t('docTitle.apexLog')}`,
    content,
    { downloadFileName: 'anonymous-apex.log' }
  );
  if (!ok) {
    showToast(t('anonymousApex.logOpenError'), 'error');
    return;
  }
  if (usedPicker) closeLogPickerModal();
}

function closeLogPickerModal() {
  const modal = document.getElementById('anonymousApexLogPickerModal');
  const body = document.getElementById('anonymousApexLogPickerBody');
  if (body) body.innerHTML = '';
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function openLogPickerModal(options) {
  return new Promise((resolve) => {
    const modal = document.getElementById('anonymousApexLogPickerModal');
    const body = document.getElementById('anonymousApexLogPickerBody');
    const cancelBtn = document.getElementById('anonymousApexLogPickerCancelBtn');
    if (!modal || !body || !cancelBtn) {
      resolve(options[0] || null);
      return;
    }
    closeLogPickerModal();
    logPickerResolve = resolve;
    for (const op of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'anonymous-apex-log-picker-option';
      btn.textContent = op.label;
      btn.addEventListener('click', () => {
        const r = logPickerResolve;
        logPickerResolve = null;
        r?.(op);
      });
      body.appendChild(btn);
    }
    cancelBtn.onclick = () => {
      const r = logPickerResolve;
      logPickerResolve = null;
      closeLogPickerModal();
      r?.(null);
    };
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  });
}

/** Índice local para Quick Open (scripts Apex anónimo guardados). */
export function getAnonymousApexSavedScriptsIndex() {
  return readSavedScripts().map((s) => ({
    id: String(s.id || ''),
    name: String(s.name || 'script'),
    searchHay: String(s.name || 'script')
      .trim()
      .toLowerCase()
  }));
}

/** Abre Anonymous Apex y carga un script guardado por id en el editor. */
export async function openAnonymousApexSavedScript(scriptId) {
  const s = readSavedScripts().find((x) => x.id === scriptId);
  if (!s) return false;

  const body = String(s.body || '');
  selectedSavedScriptId = s.id;

  try {
    localStorage.setItem(ANON_EDITOR_CACHE_KEY, body);
  } catch {
    /* ignore */
  }

  await navigateToModeAndTool('development', 'AnonymousApex', { userInitiated: true });

  const ed = await ensureEditor();
  if (!ed) return false;

  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

  ed.setValue(body);
  try {
    ed.layout();
  } catch {
    /* ignore */
  }
  ed.focus();

  const inp = document.getElementById('anonymousApexScriptNameInput');
  if (inp) inp.value = String(s.name || '');
  syncSaveButtonLabel();
  refreshSavedScriptsUi();
  return true;
}

export async function refreshAnonymousApexPanel() {
  const orgStatus = document.getElementById('anonymousApexOrgStatus');
  const toggle = document.getElementById('anonymousApexCompareToggle');
  if (!orgStatus) return;
  if (toggle) toggle.checked = !!state.anonymousApexCompareMode;
  if (!state.leftOrgId) {
    orgStatus.textContent = t('anonymousApex.selectOrg');
    return;
  }
  orgStatus.textContent = '';
  if (getSelectedArtifactType() === 'AnonymousApex') {
    await ensureEditor();
  }
  refreshSavedScriptsUi();
}

export function setupAnonymousApexPanel() {
  const runBtn = document.getElementById('anonymousApexRunBtn');
  const logBtn = document.getElementById('anonymousApexOpenLogBtn');
  const toggle = document.getElementById('anonymousApexCompareToggle');
  const saveScriptBtn = document.getElementById('anonymousApexSaveScriptBtn');
  const openScriptsBtn = document.getElementById('anonymousApexOpenScriptsModalBtn');
  const quickSaveBtn = document.getElementById('anonymousApexQuickSaveBtn');
  const scriptNameInput = document.getElementById('anonymousApexScriptNameInput');
  const resultWrap = document.getElementById('anonymousApexResultWrap');
  const pickerBackdrop = document.querySelector('#anonymousApexLogPickerModal .anonymous-apex-log-picker-backdrop');
  const scriptsBackdrop = document.querySelector('#anonymousApexScriptsModal [data-anonymous-scripts-backdrop="1"]');
  const scriptsCloseBtn = document.getElementById('anonymousApexScriptsModalCloseBtn');
  if (runBtn) runBtn.addEventListener('click', () => void runAnonymousApex());
  if (logBtn) logBtn.addEventListener('click', () => void openAnonymousApexLog());
  if (saveScriptBtn) {
    saveScriptBtn.addEventListener('click', () => {
      const inp = document.getElementById('anonymousApexScriptNameInput');
      void persistScriptWithName(inp?.value || '');
    });
  }
  if (openScriptsBtn) openScriptsBtn.addEventListener('click', () => openScriptsModal());
  if (quickSaveBtn) quickSaveBtn.addEventListener('click', () => void quickSaveCurrentScript());
  if (scriptsBackdrop) scriptsBackdrop.addEventListener('click', () => closeScriptsModal());
  if (scriptsCloseBtn) scriptsCloseBtn.addEventListener('click', () => closeScriptsModal());
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const scriptsModal = document.getElementById('anonymousApexScriptsModal');
    if (scriptsModal && !scriptsModal.classList.contains('hidden')) {
      e.preventDefault();
      closeScriptsModal();
    }
  });
  if (scriptNameInput) {
    scriptNameInput.addEventListener('input', () => {
      syncSaveButtonLabel();
    });
  }
  if (toggle) {
    toggle.checked = !!state.anonymousApexCompareMode;
    toggle.addEventListener('change', () => {
      state.anonymousApexCompareMode = !!toggle.checked;
      applyArtifactTypeUi();
      void refreshAnonymousApexPanel();
    });
  }
  if (pickerBackdrop) {
    pickerBackdrop.addEventListener('click', () => {
      const r = logPickerResolve;
      logPickerResolve = null;
      closeLogPickerModal();
      r?.(null);
    });
  }
  if (resultWrap) resultWrap.classList.add('hidden');
  if (logBtn) {
    logBtn.classList.add('hidden');
    logBtn.disabled = true;
  }
  refreshSavedScriptsUi();
  syncSaveButtonLabel();
}

/** Aplica el tema Monaco guardado en ajustes (p. ej. tras cambiar desde Ajustes con esta pantalla abierta). */
export function refreshAnonymousApexEditorTheme() {
  if (!anonEditor) return;
  try {
    anonEditor.updateOptions({ theme: resolveMonacoThemeId() });
  } catch {
    /* ignore */
  }
}

