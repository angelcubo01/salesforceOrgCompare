import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { loadMonaco, resolveMonacoThemeId, createStandaloneEditorSafe } from '../editor/monaco.js';
import { MonacoWorkbench } from '../editor/monacoWorkbench.js';
import { getSelectedArtifactType } from './artifactTypeUi.js';
import { t } from '../../shared/i18n.js';
import { showToast } from './toast.js';
import { openApexLogViewerWithPayload } from '../lib/openApexLogViewer.js';
import { applyArtifactTypeUi } from './artifactTypeUi.js';
import { navigateToModeAndTool } from './appModeNav.js';
import { buildOrgPicklistLabel } from '../../shared/orgPrefs.js';
import { guardToolAction } from './featureControlsUi.js';
import { handleToolError } from '../../shared/reportToolError.js';
import { renderVscodeTabBar } from './vscodeTabs.js';
import { bindRunShortcut } from './runShortcut.js';

import {
  createTabId,
  isTabContentDirty,
  loadCodeEditorSession,
  saveCodeEditorSession,
  setupCodeEditorSessionPersistence,
  scheduleCodeEditorSessionPersist,
  codeEditorSessionOrgMismatch,
  hasStoredCodeEditorTabs,
  getMaxCodeEditorTabs,
  trimTabsToLimit
} from '../lib/codeEditorSession.js';

const ANON_EDITOR_CACHE_KEY = 'sfoc_anon_apex_editor_text';
const ANON_SAVED_SCRIPTS_KEY = 'sfoc_anon_apex_saved_scripts';
const anonWorkbench = new MonacoWorkbench({
  uriScheme: 'sfoc-anon',
  onContentChange: () => {
    scheduleCodeEditorSessionPersist('AnonymousApex', persistSession);
    renderDocTabs();
  }
});
let lastAnonLogs = [];
let selectedSavedScriptId = '';
let logPickerResolve = null;
let sessionRestored = false;

/**
 * @typedef {object} AnonScriptTab
 * @property {string} id
 * @property {string} label
 * @property {string} [savedScriptId]
 * @property {string} content
 * @property {string} originalContent
 */

/** @type {{ activeTabId: string | null, tabs: AnonScriptTab[] }} */
let editorSession = { activeTabId: null, tabs: [] };
/** @type {string | null} */
let renamingTabId = null;

function defaultTabLabel() {
  return t('codeEditor.newTab');
}

function displayTabLabel(tab) {
  const label = String(tab?.label || '').trim();
  return label || defaultTabLabel();
}

function isDefaultTabLabel(label) {
  return !String(label || '').trim() || label === defaultTabLabel();
}

function getActiveTab() {
  return editorSession.tabs.find((tab) => tab.id === editorSession.activeTabId) || null;
}

function defaultScriptContent() {
  try {
    return localStorage.getItem(ANON_EDITOR_CACHE_KEY) || "System.debug('Hello from Salesforce Org Compare');";
  } catch {
    return "System.debug('Hello from Salesforce Org Compare');";
  }
}

function persistActiveTabContent() {
  const tab = getActiveTab();
  if (!tab || !anonWorkbench.hasTab(tab.id)) return;
  tab.content = anonWorkbench.getValue(tab.id);
}

async function persistSession() {
  persistActiveTabContent();
  await saveCodeEditorSession(
    'AnonymousApex',
    editorSession.tabs.length
      ? {
          activeTabId: editorSession.activeTabId,
          tabs: editorSession.tabs
        }
      : null
  );
}

function renderDocTabs() {
  const tabsEl = document.getElementById('anonymousApexDocTabs');
  renderVscodeTabBar(tabsEl, {
    tabs: editorSession.tabs.map((tab) => ({
      id: tab.id,
      label: displayTabLabel(tab),
      isActive: tab.id === editorSession.activeTabId,
      isModified: false,
      iconKind: 'script',
      renameValue: isDefaultTabLabel(tab.label) ? '' : tab.label
    })),
    showAddButton: true,
    addDisabled: editorSession.tabs.length >= getMaxCodeEditorTabs(),
    renamingTabId,
    onSelect: (id) => void switchToTab(id),
    onClose: (id) => void closeTab(id),
    onAdd: () => void createNewTab({ blank: true }),
    onRenameStart: startRenameTab,
    onRenameFinish: (id, val) => void finishRenameTab(id, val),
    onRenameCancel: cancelRenameTab
  });
}

function startRenameTab(tabId) {
  const tab = editorSession.tabs.find((x) => x.id === tabId);
  if (!tab) return;
  if (editorSession.activeTabId !== tabId) {
    void switchToTab(tabId).then(() => {
      renamingTabId = tabId;
      renderDocTabs();
    });
    return;
  }
  renamingTabId = tabId;
  renderDocTabs();
}

function cancelRenameTab() {
  renamingTabId = null;
  renderDocTabs();
}

async function finishRenameTab(tabId, rawName) {
  if (renamingTabId !== tabId) return;
  renamingTabId = null;

  const tab = editorSession.tabs.find((x) => x.id === tabId);
  if (!tab) {
    renderDocTabs();
    return;
  }

  const trimmed = String(rawName || '').trim();
  const nextLabel = trimmed || defaultTabLabel();

  if (tab.savedScriptId && trimmed) {
    const list = readSavedScripts();
    const ix = list.findIndex((x) => x.id === tab.savedScriptId);
    if (ix >= 0) {
      const duplicate = list.some(
        (x) =>
          x.id !== tab.savedScriptId &&
          String(x?.name || '')
            .trim()
            .toLocaleLowerCase() === trimmed.toLocaleLowerCase()
      );
      if (duplicate) {
        showToast(t('anonymousApex.scriptNameDuplicate'), 'warn');
        renderDocTabs();
        startRenameTab(tabId);
        return;
      }
      list[ix] = { ...list[ix], name: trimmed, updatedAt: Date.now() };
      writeSavedScripts(list);
      refreshSavedScriptsUi();
    }
  }

  tab.label = nextLabel;

  if (tab.id === editorSession.activeTabId) {
    const inp = document.getElementById('anonymousApexScriptNameInput');
    if (inp) {
      inp.value = isDefaultTabLabel(nextLabel) ? '' : nextLabel;
    }
    syncSaveButtonLabel();
  }

  renderDocTabs();
  await persistSession();
}

async function switchToTab(tabId, options = {}) {
  const skipPersist = options.skipPersist === true;
  const forceReload = options.forceReload === true;

  if (renamingTabId && renamingTabId !== tabId) {
    renamingTabId = null;
  }
  if (!skipPersist) {
    persistActiveTabContent();
  }

  const tab = editorSession.tabs.find((x) => x.id === tabId);
  if (!tab) return;

  const sameTab = editorSession.activeTabId === tabId && !forceReload;
  editorSession.activeTabId = tabId;
  selectedSavedScriptId = tab.savedScriptId || '';

  await ensureEditor(false);
  anonWorkbench.ensureTab({
    tabId: tab.id,
    content: tab.content ?? '',
    language: 'apex',
    forceReload: forceReload || !anonWorkbench.hasTab(tab.id)
  });
  anonWorkbench.syncSavedBaseline(tab.id, tab.originalContent);
  if (!sameTab || forceReload) {
    anonWorkbench.switchTab(tab.id);
  }

  const inp = document.getElementById('anonymousApexScriptNameInput');
  if (inp) {
    if (tab.savedScriptId) {
      const saved = readSavedScripts().find((s) => s.id === tab.savedScriptId);
      inp.value = saved?.name || (isDefaultTabLabel(tab.label) ? '' : tab.label);
    } else {
      inp.value = isDefaultTabLabel(tab.label) ? '' : tab.label;
    }
  }

  renderDocTabs();
  syncSaveButtonLabel();
  if (!sameTab || forceReload) void persistSession();
}

async function closeTab(tabId) {
  persistActiveTabContent();

  const tabIndex = editorSession.tabs.findIndex((x) => x.id === tabId);
  const tab = editorSession.tabs[tabIndex];
  if (!tab) return;

  if (isTabContentDirty(
    anonWorkbench.hasTab(tab.id) ? anonWorkbench.getValue(tab.id) : tab.content,
    tab.originalContent
  )) {
    if (!window.confirm(t('codeEditor.unsavedTab'))) return;
  }

  if (renamingTabId === tabId) renamingTabId = null;

  const wasActive = editorSession.activeTabId === tabId;
  const nextActiveId = wasActive
    ? editorSession.tabs[tabIndex + 1]?.id ?? editorSession.tabs[tabIndex - 1]?.id ?? null
    : editorSession.activeTabId;

  editorSession.tabs = editorSession.tabs.filter((x) => x.id !== tabId);
  anonWorkbench.closeTab(tabId);

  if (editorSession.tabs.length === 0) {
    editorSession.activeTabId = null;
    await createNewTab({ blank: true });
    return;
  }

  if (wasActive && nextActiveId) {
    await switchToTab(nextActiveId, { skipPersist: true, forceReload: true });
  } else {
    renderDocTabs();
    void persistSession();
  }
}

async function createNewTab(options = {}) {
  persistActiveTabContent();

  if (editorSession.tabs.length >= getMaxCodeEditorTabs()) {
    showToast(t('codeEditor.maxTabs'), 'warn');
    return null;
  }

  const blank = options.blank === true;
  const body = blank ? '' : options.content ?? defaultScriptContent();
  const tab = {
    id: createTabId('script'),
    label: defaultTabLabel(),
    content: body,
    originalContent: body
  };

  editorSession.tabs = trimTabsToLimit([...editorSession.tabs, tab]);
  selectedSavedScriptId = '';

  await switchToTab(tab.id, { skipPersist: true, forceReload: true });
  anonWorkbench.getEditor()?.focus();
  return tab;
}

async function restoreSessionFromStorage() {
  if (sessionRestored) return;
  sessionRestored = true;

  const stored = await loadCodeEditorSession('AnonymousApex');
  if (hasStoredCodeEditorTabs(stored)) {
    editorSession = {
      activeTabId: stored.activeTabId ? String(stored.activeTabId) : null,
      tabs: stored.tabs.map((tab) => ({
        id: String(tab.id),
        label: String(tab.label || t('codeEditor.newTab')),
        savedScriptId: tab.savedScriptId ? String(tab.savedScriptId) : undefined,
        content: String(tab.content ?? ''),
        originalContent: String(tab.originalContent ?? tab.content ?? '')
      }))
    };
    if (!editorSession.activeTabId || !editorSession.tabs.some((t) => t.id === editorSession.activeTabId)) {
      editorSession.activeTabId = editorSession.tabs[0]?.id || null;
    }
    if (editorSession.activeTabId) {
      await switchToTab(editorSession.activeTabId);
    }
    return;
  }

  await createNewTab();
}

async function openScriptInTab(s, { activateOnly = false } = {}) {
  if (!s) return false;
  persistActiveTabContent();

  const body = String(s.body || '');
  const existing = editorSession.tabs.find((tab) => tab.savedScriptId === s.id);
  if (existing) {
    await switchToTab(existing.id);
    closeScriptsModal();
    return true;
  }
  if (activateOnly) return false;

  if (editorSession.tabs.length >= getMaxCodeEditorTabs()) {
    showToast(t('codeEditor.maxTabs'), 'warn');
    return false;
  }

  const tab = {
    id: createTabId('script'),
    label: String(s.name || 'script'),
    savedScriptId: s.id,
    content: body,
    originalContent: body
  };
  editorSession.tabs = trimTabsToLimit([...editorSession.tabs, tab]);
  editorSession.activeTabId = tab.id;
  selectedSavedScriptId = s.id;
  renamingTabId = null;

  await ensureEditor(false);
  anonWorkbench.ensureTab({ tabId: tab.id, content: body, language: 'apex', forceReload: true });
  anonWorkbench.syncSavedBaseline(tab.id, body);
  anonWorkbench.switchTab(tab.id);
  anonWorkbench.getEditor()?.focus();

  const inp = document.getElementById('anonymousApexScriptNameInput');
  if (inp) inp.value = String(s.name || '');

  renderDocTabs();
  syncSaveButtonLabel();
  void persistSession();
  closeScriptsModal();
  return true;
}

function updateActiveTabAfterSave(name, body, scriptId) {
  const tab = getActiveTab();
  if (!tab) return;
  tab.label = name || defaultTabLabel();
  tab.savedScriptId = scriptId;
  tab.content = body;
  tab.originalContent = body;
  if (anonWorkbench.hasTab(tab.id)) {
    anonWorkbench.setValue(tab.id, body);
    anonWorkbench.markClean(tab.id);
  }
  renderDocTabs();
  void persistSession();
}

function isAnonymousApexPanelActive() {
  if (getSelectedArtifactType() !== 'AnonymousApex') return false;
  const panel = document.getElementById('anonymousApexPanel');
  return !!panel && !panel.classList.contains('hidden');
}

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

function setExecStatus(text, tone = '') {
  const el = document.getElementById('anonymousApexExecStatus');
  if (!el) return;
  el.textContent = text || '';
  el.classList.remove('is-error', 'is-success');
  if (tone === 'error') el.classList.add('is-error');
  if (tone === 'success') el.classList.add('is-success');
}

function clearAnonymousApexOutput() {
  setExecStatus('');
  const resultWrap = document.getElementById('anonymousApexResultWrap');
  const combined = document.getElementById('anonymousApexResultCombined');
  if (resultWrap) resultWrap.classList.add('hidden');
  if (combined) combined.textContent = '';
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
  const body = String(anonWorkbench.getActiveValue() || '');
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
      updateActiveTabAfterSave(n, body, list[ix].id);
      refreshSavedScriptsUi();
      showToast(t('anonymousApex.scriptUpdated'), 'info');
      syncSaveButtonLabel();
      return true;
    }
  }
  selectedSavedScriptId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  list.unshift({ id: selectedSavedScriptId, name: n, body, updatedAt: Date.now() });
  writeSavedScripts(list.slice(0, 100));
  updateActiveTabAfterSave(n, body, selectedSavedScriptId);
  refreshSavedScriptsUi();
  showToast(t('anonymousApex.scriptSaved'), 'info');
  syncSaveButtonLabel();
  return true;
}

async function quickSaveCurrentScript() {
  await ensureEditor();
  const body = String(anonWorkbench.getActiveValue() || '');
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
      updateActiveTabAfterSave(byId.name, body, byId.id);
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
      void openScriptInTab(s);
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
      for (const tab of editorSession.tabs) {
        if (tab.savedScriptId === s.id) tab.label = nextName;
      }
      renderDocTabs();
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
      for (const tab of editorSession.tabs) {
        if (tab.savedScriptId === s.id) {
          tab.savedScriptId = undefined;
        }
      }
      if (selectedSavedScriptId === s.id) {
        selectedSavedScriptId = '';
      }
      renderDocTabs();
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

async function ensureEditor(restoreIfNeeded = true) {
  if (restoreIfNeeded && !sessionRestored) {
    await restoreSessionFromStorage();
  }

  const mount = document.getElementById('anonymousApexEditorMount');
  if (!mount) return null;

  const editor = await anonWorkbench.ensureEditor(
    mount,
    {
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
    createStandaloneEditorSafe,
    async () => {
      const monaco = state.monaco || (await loadMonaco());
      state.monaco = monaco;
      return monaco;
    },
    anonWorkbench.getEditor()
  );

  for (const tab of editorSession.tabs) {
    anonWorkbench.ensureTab({
      tabId: tab.id,
      content: tab.content ?? '',
      language: 'apex'
    });
    anonWorkbench.syncSavedBaseline(tab.id, tab.originalContent);
  }

  if (editorSession.activeTabId && anonWorkbench.hasTab(editorSession.activeTabId)) {
    if (anonWorkbench.activeTabId !== editorSession.activeTabId) {
      anonWorkbench.switchTab(editorSession.activeTabId);
    }
  } else if (editorSession.tabs.length === 0) {
    editor?.setModel(null);
  }

  if (editor) {
    window.requestAnimationFrame(() => {
      try {
        editor.layout();
      } catch {
        /* ignore */
      }
    });
  }

  return editor;
}

async function runAnonymousApex() {
  if (guardToolAction('anonymous_apex_execute')) return;
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
    void handleToolError(e, { artifact_type: 'AnonymousApex', phase: 'execute' });
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

  await navigateToModeAndTool('development', 'AnonymousApex', { userInitiated: true });
  sessionRestored = true;

  const ok = await openScriptInTab(s);
  if (!ok) return false;

  const ed = await ensureEditor(false);
  if (!ed) return false;

  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

  try {
    ed.layout();
  } catch {
    /* ignore */
  }
  ed.focus();
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
    renderDocTabs();
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
  const closeOutputBtn = document.getElementById('anonymousApexCloseOutputBtn');
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
  if (closeOutputBtn) closeOutputBtn.addEventListener('click', () => clearAnonymousApexOutput());
  if (scriptsBackdrop) scriptsBackdrop.addEventListener('click', () => closeScriptsModal());
  if (scriptsCloseBtn) scriptsCloseBtn.addEventListener('click', () => closeScriptsModal());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F2' && isAnonymousApexPanelActive()) {
      const scriptsModal = document.getElementById('anonymousApexScriptsModal');
      if (scriptsModal && !scriptsModal.classList.contains('hidden')) return;
      const tab = getActiveTab();
      if (tab) {
        e.preventDefault();
        startRenameTab(tab.id);
      }
      return;
    }
    if (e.key !== 'Escape') return;
    if (renamingTabId) {
      e.preventDefault();
      cancelRenameTab();
      return;
    }
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
  clearAnonymousApexOutput();
  if (logBtn) {
    logBtn.classList.add('hidden');
    logBtn.disabled = true;
  }
  setupCodeEditorSessionPersistence('AnonymousApex', persistSession);
  refreshSavedScriptsUi();
  syncSaveButtonLabel();
  bindRunShortcut('AnonymousApex', () => void runAnonymousApex(), { allowInMonaco: true });
}

/** Aplica el tema Monaco guardado en ajustes (p. ej. tras cambiar desde Ajustes con esta pantalla abierta). */
export function refreshAnonymousApexEditorTheme() {
  const editor = anonWorkbench.getEditor();
  if (!editor) return;
  try {
    editor.updateOptions({ theme: resolveMonacoThemeId() });
  } catch {
    /* ignore */
  }
}

