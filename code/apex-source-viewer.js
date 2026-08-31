import '../shared/installEarlyExceptionCapture.js';
import { loadMonaco, createSingleEditor } from './editor/monaco.js';
import { loadLang, t } from '../shared/i18n.js';
import { loadExtensionSettings, applyUiThemeToDocument } from '../shared/extensionSettings.js';
import { bg } from './core/bridge.js';
import { apexViewerIdbTake } from './lib/apexViewerIdb.js';
import { ApexSourceWorkspace } from './lib/apexSourceWorkspace.js';
import { renderStandaloneViewerState } from '../shared/standaloneViewerState.js';
import { findApexSymbolAt, inferApexCallOwner } from '../shared/apexSourceDefinitions.js';

function sanitizeDownloadFilename(raw) {
  const value = String(raw || 'apex-source').replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 200);
  return value || 'apex-source';
}
function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function classNameFrom(source, title) { return String(source || '').match(/\bclass\s+([A-Za-z_][A-Za-z0-9_]*)/)?.[1] || String(title || '').replace(/^Apex Class\s*[·.]\s*/i, '').replace(/\.cls$/i, '').trim() || 'Apex'; }
function viewerOrgLabel(payload) { try { return String(payload?.orgLabel || '').trim() || new URL(String(payload?.instanceUrl || '')).hostname; } catch { return ''; } }
function renderViewerOrg(el, payload) { const label = viewerOrgLabel(payload); el.hidden = !label; el.textContent = label ? t('apexSourceViewer.environment', { environment: label }) : ''; el.title = label; }
function errorText(reason) {
  const key = { NOT_FOUND: 'apexSourceViewer.errorNotFound', SOURCE_UNAVAILABLE: 'apexSourceViewer.sourceUnavailable', NO_SID: 'apexSourceViewer.errorNoSession', ORG_NOT_SAVED: 'apexSourceViewer.errorNoOrg' }[reason];
  return t(key || 'apexSourceViewer.errorSalesforce');
}
function getQueryKeys() {
  const q = new URLSearchParams(window.location.search || ''); const line = Number(q.get('line')); const column = Number(q.get('column'));
  return { sid: q.get('staged') || q.get('sid') || '', k: q.get('k') || '', idb: q.get('idb') || '', line: line > 0 ? Math.floor(line) : 0, column: column > 0 ? Math.floor(column) : 1 };
}
async function loadPayload(sid, k, idb) {
  if (sid) { const res = await bg({ type: 'apexViewer:take', id: sid }); return res?.ok ? res : null; }
  if (idb) { try { return await apexViewerIdbTake(idb); } catch { return null; } }
  if (k && chrome?.storage?.local) { try { const bag = await chrome.storage.local.get(k); await chrome.storage.local.remove(k); return bag[k] || null; } catch { return null; } }
  return null;
}
async function chooseDefinition(candidates) {
  if (!candidates?.length) return null;
  return new Promise((resolve) => {
    const root = document.createElement('div'); root.className = 'apex-src-definition-picker';
    const label = document.createElement('label'); label.textContent = t('apexSourceViewer.chooseOverload');
    const select = document.createElement('select');
    candidates.forEach((candidate, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = candidate.signature || `${candidate.methodName} (${candidate.lineNumber})`; select.appendChild(option); });
    const open = document.createElement('button'); open.type = 'button'; open.textContent = t('apexSourceViewer.open');
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = t('apexSourceViewer.cancel');
    const done = (value) => { root.remove(); resolve(value); }; open.onclick = () => done(candidates[Number(select.value)]); cancel.onclick = () => done(null); root.append(label, select, open, cancel); document.body.append(root); select.focus();
  });
}

async function main() {
  await loadLang(); await loadExtensionSettings(); applyUiThemeToDocument(document);
  const backBtn = document.getElementById('apexSrcViewerBack'); const downloadBtn = document.getElementById('apexSrcViewerDownload');
  const titleEl = document.getElementById('apexSrcViewerTitle'); const orgEl = document.getElementById('apexSrcViewerOrg'); const mount = document.getElementById('apexSrcViewerMount');
  const tabsEl = document.getElementById('apexSrcViewerTabs'); const emptyEl = document.getElementById('apexSrcViewerEmpty'); const liveEl = document.getElementById('apexSrcViewerLive'); const errorEl = document.getElementById('apexSrcViewerError');
  document.querySelectorAll('[data-i18n]').forEach((el) => { const key = el.getAttribute('data-i18n'); if (key) el.textContent = t(key); });
  const { sid, k, idb, line, column } = getQueryKeys(); const payload = await loadPayload(sid, k, idb);
  if (!payload || !mount) {
    titleEl.textContent = t('apexLogViewer.missingPayload'); downloadBtn.disabled = true;
    renderStandaloneViewerState(mount, { kind: 'error', title: t('apexLogViewer.missingPayload'), description: t('state.error.description') }); return;
  }
  let monaco; let editor;
  try { monaco = await loadMonaco(); editor = createSingleEditor(monaco, mount); } catch {
    titleEl.textContent = t('apexLogViewer.monacoError'); downloadBtn.disabled = true;
    renderStandaloneViewerState(mount, { kind: 'error', title: t('apexLogViewer.monacoError'), description: t('state.error.description') }); return;
  }
  let workspace; let navDecorations = []; let hover = null;
  const render = ({ tabs, activeId }) => {
    tabsEl.replaceChildren(); emptyEl.hidden = tabs.length !== 0; mount.hidden = tabs.length === 0;
    const active = tabs.find((tab) => tab.tabId === activeId);
    if (active) {
      titleEl.textContent = `${active.className}.cls`; document.title = `${active.className}.cls`;
      renderViewerOrg(orgEl, active); downloadBtn.disabled = active.state !== 'ready';
    } else { titleEl.textContent = t('docTitle.apexSource'); downloadBtn.disabled = true; orgEl.hidden = true; }
    errorEl.hidden = active?.state !== 'error'; errorEl.textContent = active?.state === 'error' ? errorText(active.error) : '';
    for (const tab of tabs) {
      const wrap = document.createElement('div'); wrap.className = 'apex-src-tab-wrap';
      const button = document.createElement('button'); button.type = 'button'; button.className = `apex-src-tab${tab.tabId === activeId ? ' is-active' : ''}${tab.state === 'error' ? ' is-error' : ''}`;
      button.id = `apex-src-tab-${tab.tabId}`; button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', 'apexSrcViewerMount'); button.setAttribute('aria-selected', String(tab.tabId === activeId)); button.tabIndex = tab.tabId === activeId ? 0 : -1; button.title = `${tab.className}.cls`;
      const name = document.createElement('span'); name.className = 'apex-src-tab-name'; name.textContent = `${tab.className}.cls`;
      button.append(name);
      if (tab.state === 'loading') { const spin = document.createElement('span'); spin.className = 'apex-src-tab-spinner'; spin.setAttribute('aria-label', t('apexSourceViewer.loading')); const loading = document.createElement('span'); loading.className = 'apex-src-tab-loading'; loading.textContent = t('apexSourceViewer.loading'); button.append(spin, loading); }
      if (tab.pendingNavigation) { const pending = document.createElement('span'); pending.className = 'apex-src-tab-pending'; pending.textContent = '•'; pending.title = t('apexSourceViewer.pendingNavigation'); button.append(pending); }
      if (tab.state === 'error') { const error = document.createElement('span'); error.className = 'apex-src-tab-error'; error.textContent = '!'; error.title = errorText(tab.error); button.append(error); }
      const close = document.createElement('button'); close.type = 'button'; close.className = 'apex-src-tab-close'; close.textContent = '×'; close.setAttribute('aria-label', t('apexSourceViewer.closeTab', { name: `${tab.className}.cls` }));
      close.onclick = (event) => { event.stopPropagation(); workspace.close(tab.tabId); }; close.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); workspace.close(tab.tabId); } };
      if (tab.state === 'error') { const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'apex-src-tab-retry'; retry.textContent = t('apexSourceViewer.retry'); retry.onclick = (event) => { event.stopPropagation(); if (tab.loadRequest) startDefinitionLoad(tab, tab.loadRequest, tab.navigationSymbol); }; wrap.append(retry); }
      button.onclick = () => workspace.activate(tab.tabId); button.onauxclick = (event) => { if (event.button === 1) { event.preventDefault(); workspace.close(tab.tabId); } };
      button.onkeydown = (event) => tabKeyDown(event, tab.tabId); wrap.append(button, close); tabsEl.append(wrap);
    }
    if (activeId) document.getElementById(`apex-src-tab-${activeId}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (active?.state === 'loading') liveEl.textContent = `${active.className}.cls: ${t('apexSourceViewer.loading')}`;
    else if (active?.state === 'error') liveEl.textContent = errorText(active.error); else liveEl.textContent = '';
  };
  const reveal = (tab, nav) => {
    const model = tab.model; if (!model || editor.getModel() !== model) return;
    const ln = Math.min(Math.max(1, Number(nav.lineNumber) || 1), model.getLineCount()); const col = Math.min(Math.max(1, Number(nav.column) || 1), model.getLineMaxColumn(ln));
    editor.revealLineInCenter(ln); editor.setPosition({ lineNumber: ln, column: col }); editor.setSelection(new monaco.Selection(ln, col, ln, Math.min(model.getLineMaxColumn(ln), col + (nav.methodName?.length || 0)))); editor.focus();
    if (nav.addToHistory) workspace.history.push({ tabId: tab.tabId, lineNumber: ln, column: col, selection: editor.getSelection?.(), scrollTop: editor.getScrollTop?.() || 0 });
    navDecorations = editor.deltaDecorations(navDecorations, [{ range: new monaco.Range(ln, 1, ln, 1), options: { isWholeLine: true, className: 'apex-src-line-highlight' } }]);
    setTimeout(() => { if (workspace.activeTab?.tabId === tab.tabId && editor.getModel() === model) navDecorations = editor.deltaDecorations(navDecorations, []); }, 2500);
  };
  workspace = new ApexSourceWorkspace({ monaco, editor, onChange: render, onReveal: reveal });
  const initialContent = String(payload.content || ''); const initialName = classNameFrom(initialContent, payload.title);
  workspace.registerInitial({ orgId: payload.orgId || '', orgLabel: payload.orgLabel || '', instanceUrl: payload.instanceUrl || '', className: initialName, content: initialContent, downloadFileName: payload.downloadFileName || `${initialName}.cls`, pendingNavigation: line ? { lineNumber: line, column } : null });
  const currentLocation = () => { const tab = workspace.activeTab; const pos = editor.getPosition?.() || { lineNumber: 1, column: 1 }; return tab ? { tabId: tab.tabId, lineNumber: pos.lineNumber, column: pos.column, selection: editor.getSelection?.(), scrollTop: editor.getScrollTop?.() || 0 } : null; };
  const openDefinition = (owner, symbol, sourceTab) => {
    const pendingNavigation = symbol.kind === 'class' ? { lineNumber: 1, column: 1, addToHistory: true } : { methodName: symbol.name, lineNumber: 1, column: 1, addToHistory: true };
    const result = workspace.open({ orgId: sourceTab.orgId, orgLabel: sourceTab.orgLabel, instanceUrl: sourceTab.instanceUrl, className: owner }, { activate: true, loading: true });
    if (!result.created && symbol.kind === 'class' && result.tab.state === 'ready') return result.tab;
    result.tab.pendingNavigation = pendingNavigation;
    const source = sourceTab.model.getValue();
    result.tab.loadRequest = { type: 'apexSource:resolveDefinition', orgId: sourceTab.orgId, currentClassName: sourceTab.className, source, lineNumber: symbol.lineNumber, column: symbol.column };
    result.tab.navigationSymbol = symbol;
    startDefinitionLoad(result.tab, result.tab.loadRequest, symbol);
    return result.tab;
  };
  function startDefinitionLoad(tab, request, symbol) {
    const run = workspace.beginLoad(tab.tabId);
    if (!run) return;
    void bg(request).then(async (response) => {
      if (!workspace.getTab(tab.tabId) || !run) return;
      if (response?.reason === 'AMBIGUOUS') {
        const selected = await chooseDefinition(response.candidates);
        if (!selected) { workspace.failLoad(tab.tabId, run.generation, 'NOT_FOUND'); return; }
        response = { ok: true, definition: selected };
      }
      const definition = response?.definition;
      if (definition) {
        const current = workspace.getTab(tab.tabId);
        if (current) current.pendingNavigation = { ...definition, methodName: symbol.name, addToHistory: true };
        workspace.completeLoad(tab.tabId, run.generation, { ok: true, ...definition, body: definition.body });
      } else workspace.failLoad(tab.tabId, run.generation, response?.reason || response?.error);
    }).catch(() => workspace.failLoad(tab.tabId, run.generation, 'SALESFORCE_ERROR'));
  }
  const resolveAt = async (position) => {
    if (!position) return; const sourceTab = workspace.activeTab; const source = sourceTab?.model?.getValue();
    if (!sourceTab || !source) return;
    const symbol = findApexSymbolAt(source, position.lineNumber, position.column); if (!symbol) return;
    const owner = inferApexCallOwner(source, sourceTab.className, symbol, position.lineNumber, position.column);
    if (!owner) return;
    const from = currentLocation(); if (from) workspace.history.push(from);
    if (owner === sourceTab.className && symbol.kind !== 'class') {
      const response = await bg({ type: 'apexSource:resolveDefinition', orgId: sourceTab.orgId, currentClassName: sourceTab.className, source, lineNumber: position.lineNumber, column: position.column });
      if (response?.ok && response.definition) reveal(sourceTab, { ...response.definition, addToHistory: true });
      return;
    }
    if (!sourceTab.orgId) return;
    openDefinition(owner, symbol, sourceTab);
  };
  const clearHint = () => { navDecorations = editor.deltaDecorations(navDecorations, []); editor.updateOptions({ mouseStyle: 'text' }); editor.getDomNode()?.removeAttribute('title'); hover = null; };
  editor.onMouseMove((event) => { const e = event?.event; const pos = event?.target?.position; const tab = workspace.activeTab; if ((!e?.ctrlKey && !e?.metaKey) || !pos || !tab?.model) return clearHint(); const symbol = findApexSymbolAt(tab.model.getValue(), pos.lineNumber, pos.column); if (!symbol) return clearHint(); hover = { symbol, pos }; navDecorations = editor.deltaDecorations(navDecorations, [{ range: new monaco.Range(symbol.lineNumber, symbol.column, symbol.lineNumber, symbol.column + symbol.name.length), options: { inlineClassName: 'apex-src-nav-symbol', inlineClassNameAffectsLetterSpacing: true, hoverMessage: { value: t(symbol.kind === 'class' ? 'apexSourceViewer.openClassHint' : 'apexSourceViewer.openMethodHint') } } }]); editor.updateOptions({ mouseStyle: 'pointer' }); editor.getDomNode()?.setAttribute('title', t(symbol.kind === 'class' ? 'apexSourceViewer.openClassHint' : 'apexSourceViewer.openMethodHint')); });
  editor.onMouseLeave(clearHint);
  editor.onMouseDown((event) => { if (!event?.event?.ctrlKey && !event?.event?.metaKey) return; const pos = event?.target?.position; if (!pos) return; event.event.preventDefault?.(); event.event.stopPropagation?.(); void resolveAt(pos); });
  function tabKeyDown(event, tabId) { const index = workspace.order.indexOf(tabId); if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const next = workspace.order[(index + (event.key === 'ArrowRight' ? 1 : -1) + workspace.order.length) % workspace.order.length]; document.getElementById(`apex-src-tab-${next}`)?.focus(); } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); workspace.activate(tabId); } }
  document.addEventListener('keydown', (event) => {
    const inside = document.activeElement?.closest?.('#apexSrcViewerMount, #apexSrcViewerTabs'); if (!inside) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'w') { event.preventDefault(); workspace.close(workspace.activeId); }
    else if (event.ctrlKey && event.key === 'Tab') { event.preventDefault(); const ids = workspace.order; if (ids.length) workspace.activate(ids[(ids.indexOf(workspace.activeId) + (event.shiftKey ? -1 : 1) + ids.length) % ids.length]); }
    else if (event.altKey && /^Arrow(Left|Right)$/.test(event.key)) { event.preventDefault(); const target = event.key === 'ArrowLeft' ? workspace.history.back() : workspace.history.forward(); if (target && workspace.getTab(target.tabId)) { workspace.activate(target.tabId); reveal(workspace.getTab(target.tabId), target); } }
    else if (event.altKey && /^[1-9]$/.test(event.key)) workspace.activate(workspace.order[Number(event.key) - 1]);
  });
  downloadBtn.addEventListener('click', () => { const tab = workspace.activeTab; if (tab?.state === 'ready') downloadTextFile(tab.model.getValue(), sanitizeDownloadFilename(`${tab.className}.cls`)); });
  const goBack = () => { if (window.opener && !window.opener.closed) window.close(); else if (window.history.length > 1) window.history.back(); else window.close(); };
  backBtn.addEventListener('click', goBack); document.getElementById('apexSrcViewerEmptyBack').addEventListener('click', goBack);
  window.addEventListener('beforeunload', () => workspace.dispose(), { once: true });
}
void main();
