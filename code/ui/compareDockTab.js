import { compareItemIconKind, createCompareItemIcon } from '../lib/compareItemIcons.js';

const CLOSE_ICON_SVG =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.707L7.293 8l-3.647 3.646.707.708L8 8.707z"/></svg>';

/** Pestaña Dockview estilo IDE con icono de tipo + etiqueta. */
export class CompareDiffTabRenderer {
  constructor() {
    this._element = document.createElement('div');
    this._element.className = 'sfoc-dock-tab';

    this._iconHost = document.createElement('span');
    this._iconHost.className = 'sfoc-dock-tab__icon';
    this._iconEl = createCompareItemIcon('file');

    this._label = document.createElement('span');
    this._label.className = 'sfoc-dock-tab__label';

    this._close = document.createElement('button');
    this._close.type = 'button';
    this._close.className = 'sfoc-dock-tab__close';
    this._close.setAttribute('aria-label', 'Close');
    this._close.innerHTML = CLOSE_ICON_SVG;

    this._iconHost.appendChild(this._iconEl);
    this._element.append(this._iconHost, this._label, this._close);

    /** @type {import('../core/state.js').state.savedItems[0] | null} */
    this._item = null;
    /** @type {string} */
    this._title = '';
    /** @type {Array<() => void>} */
    this._disposables = [];
  }

  get element() {
    return this._element;
  }

  /**
   * @param {{ title?: string, params?: { item?: import('../core/state.js').state.savedItems[0] }, api?: { onDidTitleChange: (fn: (e: { title: string }) => void) => { dispose: () => void }, close: () => void } }} params
   */
  init(params) {
    this._item = params.params?.item || null;
    this._title = params.title || '';
    this._render();

    if (!params.api) return;

    const titleSub = params.api.onDidTitleChange((event) => {
      this._title = event.title || '';
      this._render();
    });
    this._disposables.push(() => titleSub.dispose());

    const onPointerDown = (ev) => ev.preventDefault();
    const onCloseClick = (ev) => {
      if (ev.defaultPrevented) return;
      ev.preventDefault();
      params.api.close();
    };
    this._close.addEventListener('pointerdown', onPointerDown);
    this._close.addEventListener('click', onCloseClick);
    this._disposables.push(() => this._close.removeEventListener('pointerdown', onPointerDown));
    this._disposables.push(() => this._close.removeEventListener('click', onCloseClick));
  }

  /** @param {{ title?: string, params?: { item?: import('../core/state.js').state.savedItems[0] } }} [event] */
  update(event) {
    if (event?.title) this._title = event.title;
    if (event?.params?.item) this._item = event.params.item;
    this._render();
  }

  dispose() {
    for (const d of this._disposables) d();
    this._disposables = [];
  }

  _render() {
    const kind = compareItemIconKind(this._item);
    this._iconEl.className = `list-tree-icon list-tree-icon--${kind}`;
    const label = this._title || '';
    this._label.textContent = label;
    this._label.title = label;
  }
}

/**
 * @param {{ name: string }} options
 */
export function createCompareDockTabComponent(options) {
  if (options.name === 'compare-diff-tab') {
    return new CompareDiffTabRenderer();
  }
  return undefined;
}
