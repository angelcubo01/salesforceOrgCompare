/**
 * Pestañas de diff del comparador: modelos, viewState y metadatos por tabId.
 * Un único diffEditor compartido cambia de modelos al activar otra pestaña.
 */

/** @typedef {import('../core/state.js').state.savedItems[0]} CompareItem */

const DEFAULT_MAX_TABS = 12;

/**
 * @typedef {object} DiffWorkbenchTabEntry
 * @property {CompareItem} item
 * @property {import('monaco-editor').editor.ITextModel | null} originalModel
 * @property {import('monaco-editor').editor.ITextModel | null} modifiedModel
 * @property {import('monaco-editor').editor.IDiffEditorViewState | null} viewState
 * @property {HTMLElement | null} mountEl
 */

export class DiffWorkbench {
  /**
   * @param {{ maxTabs?: number }} [options]
   */
  constructor(options = {}) {
    this.maxTabs = options.maxTabs ?? DEFAULT_MAX_TABS;
    /** @type {import('monaco-editor').editor.IStandaloneDiffEditor | null} */
    this.diffEditor = null;
    /** @type {import('monaco-editor')} */
    this.monaco = null;
    /** @type {string | null} */
    this.activeTabId = null;
    /** @type {Map<string, DiffWorkbenchTabEntry>} */
    this.tabs = new Map();
    /** @type {string[]} */
    this.tabOrder = [];
  }

  /** @param {string} tabId */
  #key(tabId) {
    return String(tabId);
  }

  /** @returns {string[]} */
  getTabIds() {
    return [...this.tabOrder];
  }

  /**
   * @param {string} tabId
   * @param {CompareItem} item
   */
  upsertTab(tabId, item) {
    const key = this.#key(tabId);
    const existing = this.tabs.get(key);
    if (existing) {
      existing.item = item;
      return existing;
    }
    while (this.tabOrder.length >= this.maxTabs) {
      const evict = this.tabOrder[0];
      if (evict === key) break;
      this.closeTab(evict);
    }
    const entry = {
      item,
      originalModel: null,
      modifiedModel: null,
      viewState: null,
      mountEl: null
    };
    this.tabs.set(key, entry);
    if (!this.tabOrder.includes(key)) this.tabOrder.push(key);
    return entry;
  }

  /** @param {string} tabId */
  hasTab(tabId) {
    return this.tabs.has(this.#key(tabId));
  }

  /** @param {string} tabId */
  getItem(tabId) {
    return this.tabs.get(this.#key(tabId))?.item ?? null;
  }

  /**
   * @param {string} tabId
   * @param {HTMLElement | null} mountEl
   */
  setMount(tabId, mountEl) {
    const entry = this.tabs.get(this.#key(tabId));
    if (entry) entry.mountEl = mountEl;
  }

  /**
   * @param {string} tabId
   * @param {import('monaco-editor').editor.ITextModel} original
   * @param {import('monaco-editor').editor.ITextModel} modified
   */
  setModels(tabId, original, modified) {
    const entry = this.tabs.get(this.#key(tabId));
    if (!entry) return;
    entry.originalModel = original;
    entry.modifiedModel = modified;
  }

  /**
   * @param {string} tabId
   * @returns {boolean}
   */
  switchTab(tabId) {
    const key = this.#key(tabId);
    if (this.activeTabId === key) return false;
    const ed = this.diffEditor;
    if (!ed) return false;

    if (this.activeTabId && this.tabs.has(this.activeTabId)) {
      const current = this.tabs.get(this.activeTabId);
      current.viewState = ed.saveViewState();
    }

    const next = this.tabs.get(key);
    if (!next?.originalModel || !next.modifiedModel) return false;

    try {
      ed.setModel({ original: next.originalModel, modified: next.modifiedModel });
      if (next.viewState) {
        ed.restoreViewState(next.viewState);
      }
    } catch {
      try {
        ed.setModel({ original: next.originalModel, modified: next.modifiedModel });
      } catch {
        return false;
      }
    }
    this.activeTabId = key;
    return true;
  }

  /** @param {string} tabId */
  closeTab(tabId) {
    const key = this.#key(tabId);
    const entry = this.tabs.get(key);
    if (!entry) return;

    if (this.diffEditor) {
      const model = this.diffEditor.getModel();
      if (model?.original === entry.originalModel || model?.modified === entry.modifiedModel) {
        try {
          this.diffEditor.setModel(null);
        } catch {
          /* ignore */
        }
      }
    }

    try {
      entry.originalModel?.dispose();
    } catch {
      /* ignore */
    }
    try {
      entry.modifiedModel?.dispose();
    } catch {
      /* ignore */
    }

    this.tabs.delete(key);
    this.tabOrder = this.tabOrder.filter((id) => id !== key);
    if (this.activeTabId === key) this.activeTabId = null;
  }

  disposeAll() {
    for (const id of [...this.tabOrder]) {
      this.closeTab(id);
    }
    this.activeTabId = null;
    this.diffEditor = null;
    this.monaco = null;
  }

  /**
   * @param {string} tabId
   * @param {string} [afterId]
   */
  moveTabAfter(tabId, afterId) {
    const key = this.#key(tabId);
    this.tabOrder = this.tabOrder.filter((id) => id !== key);
    if (afterId) {
      const idx = this.tabOrder.indexOf(this.#key(afterId));
      if (idx >= 0) {
        this.tabOrder.splice(idx + 1, 0, key);
        return;
      }
    }
    this.tabOrder.push(key);
  }
}
