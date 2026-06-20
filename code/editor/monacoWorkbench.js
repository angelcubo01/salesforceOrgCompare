/**
 * Gestión de pestañas al estilo VS Code: un editor Monaco, un ITextModel por documento,
 * saveViewState/restoreViewState al cambiar de pestaña y pila de undo independiente por modelo.
 */

import { isMonacoCanceledError } from '../../shared/errorTelemetryPolicy.js';

/**
 * @typedef {object} MonacoWorkbenchTabEntry
 * @property {import('monaco-editor').editor.ITextModel} model
 * @property {import('monaco-editor').editor.ICodeEditorViewState | null} viewState
 * @property {string} language
 * @property {number} savedVersionId
 */

/**
 * @param {string} bundleTabId
 * @param {string} fileName
 */
export function compositeDocumentId(bundleTabId, fileName) {
  return `${String(bundleTabId)}::${String(fileName)}`;
}

export class MonacoWorkbench {
  /**
   * @param {{ uriScheme?: string, onContentChange?: (tabId: string) => void }} [options]
   */
  constructor(options = {}) {
    this.uriScheme = options.uriScheme ?? 'sfoc';
    /** @type {import('monaco-editor').editor.IStandaloneCodeEditor | null} */
    this.editor = null;
    /** @type {import('monaco-editor')} */
    this.monaco = null;
    /** @type {string | null} */
    this.activeTabId = null;
    /** @type {Map<string, MonacoWorkbenchTabEntry>} */
    this.tabs = new Map();
    this.onContentChange = options.onContentChange ?? null;
    /** @type {Promise<import('monaco-editor').editor.IStandaloneCodeEditor | null> | null} */
    this._initPromise = null;
  }

  /** @param {string} tabId */
  #key(tabId) {
    return String(tabId);
  }

  /**
   * Ruta URI segura para modelos (evita `::` en la authority, que rompe tsMode).
   * @param {string} tabId
   * @param {string} [suffix]
   */
  makeUri(tabId, suffix = '') {
    const id = this.#key(tabId);
    const segments = id.includes('::') ? id.split('::') : [id];
    if (suffix) segments.push(suffix);
    const path = `/${segments.map((s) => encodeURIComponent(s)).join('/')}`;
    return this.monaco.Uri.parse(`${this.uriScheme}://file${path}`);
  }

  /**
   * @param {HTMLElement} mount
   * @param {import('monaco-editor').editor.IStandaloneEditorConstructionOptions} editorOptions
   * @param {(monaco: import('monaco-editor'), mount: HTMLElement, options: import('monaco-editor').editor.IStandaloneEditorConstructionOptions, cached: import('monaco-editor').editor.IStandaloneCodeEditor | null) => import('monaco-editor').editor.IStandaloneCodeEditor} createEditor
   * @param {() => Promise<import('monaco-editor')>} loadMonaco
   * @param {import('monaco-editor').editor.IStandaloneCodeEditor | null} [cachedEditor]
   */
  async ensureEditor(mount, editorOptions, createEditor, loadMonaco, cachedEditor = null) {
    if (this.editor) {
      try {
        if (this.editor.getContainerDomNode() === mount) return this.editor;
      } catch {
        this.editor = null;
      }
    }
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      this.monaco = await loadMonaco();
      const { value: _drop, model: _dropModel, ...rest } = editorOptions;
      this.editor = createEditor(this.monaco, mount, rest, cachedEditor);
      return this.editor;
    })();

    try {
      return await this._initPromise;
    } finally {
      this._initPromise = null;
    }
  }

  /** @param {string} tabId */
  hasTab(tabId) {
    return this.tabs.has(this.#key(tabId));
  }

  /**
   * @param {{ tabId: string, content?: string, language?: string, forceReload?: boolean }} opts
   */
  ensureTab({ tabId, content = '', language = 'plaintext', forceReload = false }) {
    if (!this.monaco) throw new Error('MonacoWorkbench: call ensureEditor first');
    const key = this.#key(tabId);
    let entry = this.tabs.get(key);

    if (!entry) {
      const uri = this.makeUri(key);
      const model = this.monaco.editor.createModel(content, language, uri);
      entry = {
        model,
        viewState: null,
        language,
        savedVersionId: model.getAlternativeVersionId()
      };
      this.tabs.set(key, entry);
      model.onDidChangeContent(() => {
        this.onContentChange?.(key);
      });
      return entry;
    }

    if (language && entry.language !== language) {
      try {
        this.monaco.editor.setModelLanguage(entry.model, language);
        entry.language = language;
      } catch (err) {
        if (!isMonacoCanceledError(err)) throw err;
      }
    }
    if (forceReload && entry.model.getValue() !== content) {
      try {
        entry.model.setValue(content);
      } catch (err) {
        if (!isMonacoCanceledError(err)) throw err;
      }
    }
    return entry;
  }

  /**
   * Marca el documento como guardado (sin cambios respecto al baseline).
   * @param {string} tabId
   */
  markClean(tabId) {
    const entry = this.tabs.get(this.#key(tabId));
    if (entry) entry.savedVersionId = entry.model.getAlternativeVersionId();
  }

  /**
   * Alinea el baseline de "guardado" con el contenido original persistido.
   * @param {string} tabId
   * @param {string} originalContent
   */
  syncSavedBaseline(tabId, originalContent) {
    const entry = this.tabs.get(this.#key(tabId));
    if (!entry) return;
    if (entry.model.getValue() === originalContent) {
      entry.savedVersionId = entry.model.getAlternativeVersionId();
    }
  }

  /**
   * Marca el documento como limpio con el contenido actual del modelo (p. ej. tras cargar desde org).
   * @param {string} tabId
   * @returns {string}
   */
  markLoadedAsClean(tabId) {
    const entry = this.tabs.get(this.#key(tabId));
    if (!entry) return '';
    entry.savedVersionId = entry.model.getAlternativeVersionId();
    return entry.model.getValue();
  }

  /**
   * @param {string} tabId
   * @param {string} [originalContent]
   */
  isDirty(tabId, originalContent) {
    const entry = this.tabs.get(this.#key(tabId));
    if (!entry) return false;
    if (originalContent !== undefined) {
      return entry.model.getValue() !== originalContent;
    }
    return entry.model.getAlternativeVersionId() !== entry.savedVersionId;
  }

  /** @param {string} tabId */
  getValue(tabId) {
    return this.tabs.get(this.#key(tabId))?.model.getValue() ?? '';
  }

  /**
   * @param {string} tabId
   * @param {string} content
   */
  setValue(tabId, content) {
    const entry = this.tabs.get(this.#key(tabId));
    if (entry) entry.model.setValue(content);
  }

  /**
   * @param {string} tabId
   * @param {string} language
   */
  setLanguage(tabId, language) {
    if (!this.monaco) return;
    const entry = this.tabs.get(this.#key(tabId));
    if (!entry || entry.language === language) return;
    this.monaco.editor.setModelLanguage(entry.model, language);
    entry.language = language;
  }

  /**
   * Cambia al modelo de la pestaña indicada (patrón VS Code).
   * @param {string} tabId
   * @returns {boolean} true si hubo cambio de pestaña activa
   */
  switchTab(tabId) {
    const key = this.#key(tabId);
    if (this.activeTabId === key) return false;

    const ed = this.editor;
    if (!ed) return false;

    if (this.activeTabId && this.tabs.has(this.activeTabId)) {
      const current = this.tabs.get(this.activeTabId);
      current.viewState = ed.saveViewState();
    }

    const next = this.tabs.get(key);
    if (!next) return false;

    try {
      ed.setModel(next.model);
      if (next.viewState) {
        ed.restoreViewState(next.viewState);
      } else {
        ed.setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
        ed.setPosition({ lineNumber: 1, column: 1 });
      }
    } catch (err) {
      if (!isMonacoCanceledError(err)) throw err;
      try {
        ed.setModel(next.model);
      } catch {
        /* ignore */
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

    try {
      if (this.editor?.getModel() === entry.model) {
        this.editor.setModel(null);
      }
    } catch {
      /* editor disposed */
    }
    entry.model.dispose();
    this.tabs.delete(key);
    if (this.activeTabId === key) this.activeTabId = null;
  }

  /**
   * Cierra modelos del bundle indicado (id exacto o id::fichero).
   * @param {string} prefix
   */
  closeTabsWithPrefix(prefix) {
    const p = String(prefix);
    const docPrefix = `${p}::`;
    for (const key of [...this.tabs.keys()]) {
      if (key === p || key.startsWith(docPrefix)) {
        this.closeTab(key);
      }
    }
  }

  disposeAll() {
    for (const key of [...this.tabs.keys()]) {
      this.closeTab(key);
    }
    this.activeTabId = null;
  }

  getEditor() {
    return this.editor;
  }

  getActiveValue() {
    if (!this.activeTabId) return '';
    return this.getValue(this.activeTabId);
  }
}
