/** Utilidades puras y espacio de documentos para el visor de fuentes Apex. */

export function normalizeApexClassName(value) {
  return String(value || '').trim().toLowerCase();
}

export function apexDocumentKey({ orgId, classId, className }) {
  const org = String(orgId || 'unknown-org');
  return classId ? `${org}:${classId}` : `${org}:name:${normalizeApexClassName(className)}`;
}

export function nextTabAfterClose(order, activeId, closedId, recentIds = []) {
  if (activeId !== closedId) return activeId;
  const remaining = order.filter((id) => id !== closedId);
  for (const id of recentIds) if (remaining.includes(id)) return id;
  const index = order.indexOf(closedId);
  return remaining[index] || remaining[index - 1] || null;
}

function sameLocation(a, b) {
  return a && b && a.tabId === b.tabId && a.lineNumber === b.lineNumber && a.column === b.column;
}

export class ApexNavigationHistory {
  constructor() { this.entries = []; this.index = -1; }

  push(location) {
    if (sameLocation(this.entries[this.index], location)) return;
    this.entries.splice(this.index + 1);
    this.entries.push({ ...location });
    this.index = this.entries.length - 1;
  }

  back() { if (this.index <= 0) return null; this.index -= 1; return this.entries[this.index]; }
  forward() { if (this.index >= this.entries.length - 1) return null; this.index += 1; return this.entries[this.index]; }
}

/**
 * Registro de documentos que mantiene un modelo Monaco por clase. No conoce el DOM
 * de las pestañas: el visor se limita a renderizar el estado emitido por onChange.
 */
export class ApexSourceWorkspace {
  constructor({ monaco, editor, onChange = () => {}, onReveal = () => {} }) {
    this.monaco = monaco;
    this.editor = editor;
    this.onChange = onChange;
    this.onReveal = onReveal;
    this.tabs = new Map();
    this.keys = new Map();
    this.order = [];
    this.activeId = null;
    this.recentIds = [];
    this.sequence = 0;
    this.history = new ApexNavigationHistory();
  }

  snapshot() { return { tabs: this.order.map((id) => this.tabs.get(id)).filter(Boolean), activeId: this.activeId }; }
  emit() { this.onChange(this.snapshot()); }
  get activeTab() { return this.tabs.get(this.activeId) || null; }
  getTab(id) { return this.tabs.get(id) || null; }

  createModel(tab) {
    const safeOrg = encodeURIComponent(String(tab.orgId || 'unknown-org'));
    const safeClass = encodeURIComponent(String(tab.classId || tab.className || tab.tabId));
    tab.modelUri = this.monaco.Uri.parse(`sfoc-apex://${safeOrg}/${safeClass}.cls`);
    tab.model = this.monaco.editor.createModel(tab.content || '', 'apex', tab.modelUri);
  }

  open(input, { activate = true, loading = false } = {}) {
    const desiredKey = apexDocumentKey(input);
    let tab = this.tabs.get(this.keys.get(desiredKey));
    if (!tab && input.classId) {
      const fallback = apexDocumentKey({ ...input, classId: '' });
      tab = this.tabs.get(this.keys.get(fallback));
    }
    if (tab) {
      if (input.pendingNavigation) tab.pendingNavigation = input.pendingNavigation;
      if (activate) this.activate(tab.tabId);
      else this.emit();
      return { tab, created: false };
    }
    const tabId = `apex-${++this.sequence}`;
    tab = {
      tabId, orgId: input.orgId || '', orgLabel: input.orgLabel || '', instanceUrl: input.instanceUrl || '',
      classId: input.classId || '', className: input.className || 'Apex', content: input.content || '',
      downloadFileName: input.downloadFileName || `${input.className || 'Apex'}.cls`,
      state: loading ? 'loading' : 'ready', error: '', model: null, modelUri: null, viewState: null,
      pendingNavigation: input.pendingNavigation || null, generation: 0, abortController: null,
      cursor: null, selection: null, visibleLine: 1, scrollTop: 0, lastUsed: 0, decorationIds: []
    };
    this.createModel(tab);
    this.tabs.set(tabId, tab);
    this.keys.set(desiredKey, tabId);
    this.order.push(tabId);
    if (activate) this.activate(tabId); else this.emit();
    return { tab, created: true };
  }

  registerInitial(input) { return this.open(input, { activate: true, loading: false }).tab; }

  activate(tabId) {
    const target = this.tabs.get(tabId);
    if (!target) return false;
    const outgoing = this.activeTab;
    if (outgoing && outgoing.tabId !== target.tabId) {
      try {
        outgoing.viewState = this.editor.saveViewState();
        outgoing.cursor = this.editor.getPosition?.() || outgoing.cursor;
        outgoing.selection = this.editor.getSelection?.() || outgoing.selection;
        outgoing.scrollTop = this.editor.getScrollTop?.() || 0;
        outgoing.visibleLine = this.editor.getPosition?.()?.lineNumber || outgoing.visibleLine;
      } catch { /* Monaco no disponible */ }
    }
    const changed = this.activeId !== target.tabId;
    this.activeId = target.tabId;
    target.lastUsed = Date.now();
    this.recentIds = [target.tabId, ...this.recentIds.filter((id) => id !== target.tabId)];
    try {
      if (this.editor.getModel() !== target.model) this.editor.setModel(target.model);
      if (target.viewState) this.editor.restoreViewState(target.viewState);
      this.editor.layout();
    } catch { /* el estado sigue siendo utilizable en pruebas sin Monaco completo */ }
    if (target.state === 'ready' && target.pendingNavigation) this.consumePendingNavigation(target);
    this.emit();
    return changed;
  }

  beginLoad(tabId) {
    const tab = this.tabs.get(tabId);
    if (!tab) return null;
    try { tab.abortController?.abort(); } catch { /* ignore */ }
    tab.abortController = typeof AbortController === 'undefined' ? null : new AbortController();
    tab.generation += 1;
    tab.state = 'loading'; tab.error = '';
    this.emit();
    return { generation: tab.generation, signal: tab.abortController?.signal };
  }

  reconcileIdentity(tab, response) {
    const oldNameKey = apexDocumentKey({ ...tab, classId: '' });
    const newClassId = String(response.classId || tab.classId || '');
    const newName = String(response.className || tab.className || '');
    const newKey = apexDocumentKey({ ...tab, classId: newClassId, className: newName });
    const collisionId = this.keys.get(newKey);
    if (collisionId && collisionId !== tab.tabId) return this.tabs.get(collisionId);
    this.keys.delete(oldNameKey);
    this.keys.set(newKey, tab.tabId);
    tab.classId = newClassId; tab.className = newName;
    return tab;
  }

  completeLoad(tabId, generation, response) {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.generation !== generation || tab.abortController?.signal?.aborted) return false;
    const destination = this.reconcileIdentity(tab, response || {});
    if (destination !== tab) return false;
    if (!response?.ok || !String(response.body || '').trim()) {
      this.failLoad(tabId, generation, response?.reason || response?.error || 'SALESFORCE_ERROR');
      return false;
    }
    tab.content = String(response.body);
    tab.downloadFileName = `${tab.className}.cls`;
    tab.state = 'ready'; tab.error = ''; tab.abortController = null;
    try { if (!tab.model.isDisposed?.()) tab.model.setValue(tab.content); } catch { return false; }
    if (this.activeId === tabId && tab.pendingNavigation) this.consumePendingNavigation(tab);
    this.emit();
    return true;
  }

  failLoad(tabId, generation, reason) {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.generation !== generation || tab.abortController?.signal?.aborted) return false;
    tab.state = 'error'; tab.error = String(reason || 'SALESFORCE_ERROR'); tab.abortController = null;
    this.emit();
    return true;
  }

  consumePendingNavigation(tab) {
    const navigation = tab.pendingNavigation;
    if (!navigation || tab.state !== 'ready' || this.activeId !== tab.tabId) return false;
    tab.pendingNavigation = null;
    this.onReveal(tab, navigation);
    return true;
  }

  close(tabId) {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;
    const wasActive = this.activeId === tabId;
    const next = wasActive ? nextTabAfterClose(this.order, this.activeId, tabId, this.recentIds.filter((id) => id !== tabId)) : null;
    try { tab.abortController?.abort(); } catch { /* ignore */ }
    try { if (tab.model && !tab.model.isDisposed?.()) tab.model.dispose(); } catch { /* ignore */ }
    this.tabs.delete(tabId);
    for (const [key, value] of this.keys) if (value === tabId) this.keys.delete(key);
    this.order = this.order.filter((id) => id !== tabId);
    this.recentIds = this.recentIds.filter((id) => id !== tabId);
    if (wasActive) {
      this.activeId = null;
      if (next) this.activate(next); else { try { this.editor.setModel(null); } catch {} this.emit(); }
    } else this.emit();
    return true;
  }

  dispose() { for (const id of [...this.order]) this.close(id); }
}
