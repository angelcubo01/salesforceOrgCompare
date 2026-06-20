import { t } from '../../shared/i18n.js';

/**
 * @typedef {object} VscodeTabActionMeta
 * @property {number} [tabIndex]
 * @property {string} [sourceOrgId]
 */

/**
 * @typedef {object} VscodeTabItem
 * @property {string} id
 * @property {string} label
 * @property {boolean} [isActive]
 * @property {boolean} [isModified]
 * @property {boolean} [isAuthExpired]
 * @property {string} [prefix]
 * @property {string} [iconKind]
 * @property {string} [title]
 * @property {boolean} [showClose]
 * @property {string} [renameValue]
 * @property {string} [sourceOrgId]
 */

/**
 * @typedef {object} VscodeTabFilePickerItem
 * @property {string} id
 * @property {string} label
 * @property {string} [prefix]
 * @property {string} [iconKind]
 * @property {boolean} [isModified]
 * @property {string} [title]
 */

/**
 * @typedef {object} VscodeTabFilePicker
 * @property {string} activeFileId
 * @property {VscodeTabFilePickerItem[]} files
 * @property {(fileId: string) => void} onSelect
 */

/**
 * @typedef {object} VscodeTabBarOptions
 * @property {VscodeTabItem[]} tabs
 * @property {boolean} [hidden]
 * @property {boolean} [showAddButton]
 * @property {boolean} [addDisabled]
 * @property {string} [addTitle]
 * @property {string} [variant]
 * @property {(tabId: string, event: MouseEvent, meta?: VscodeTabActionMeta) => void} onSelect
 * @property {(tabId: string, event: MouseEvent, meta?: VscodeTabActionMeta) => void} onClose
 * @property {() => void} [onAdd]
 * @property {(tabId: string) => void} [onRenameStart]
 * @property {(tabId: string, value: string) => void} [onRenameFinish]
 * @property {() => void} [onRenameCancel]
 * @property {string | null} [renamingTabId]
 * @property {(tabId: string) => VscodeTabFilePicker | null | undefined} [getFilePicker]
 */

/** Icono de cierre estilo Codicon (VS Code). */
const CLOSE_ICON_SVG =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.707.707L7.293 8l-3.647 3.646.707.708L8 8.707z"/></svg>';

const CHEVRON_DOWN_SVG =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4.427 6.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 6H4.604a.25.25 0 00-.177.427z"/></svg>';

/** @type {ResizeObserver | null} */
let tabLabelTooltipObserver = null;
/** @type {HTMLElement | null} */
let tabLabelTooltipObserverTarget = null;

/**
 * Texto del tooltip de etiqueta según truncado y pista de renombrado.
 * @param {string} fullLabel
 * @param {boolean} isTruncated
 * @param {string} [renameHint]
 */
export function resolveVscodeTabLabelTitle(fullLabel, isTruncated, renameHint = '') {
  if (isTruncated && fullLabel) return fullLabel;
  if (renameHint) return renameHint;
  return '';
}

/**
 * @param {VscodeTabItem} tab
 */
function buildTabLabelTooltip(tab) {
  const label = String(tab.label || '');
  const prefix = String(tab.prefix || '').trim();
  return prefix ? `${prefix} · ${label}` : label;
}

/**
 * @param {HTMLElement} labelEl
 */
function syncTabLabelTooltip(labelEl) {
  const fullLabel = labelEl.dataset.fullLabel || labelEl.textContent || '';
  const renameHint = labelEl.dataset.renameHint || '';
  const truncated = labelEl.scrollWidth > labelEl.clientWidth + 1;
  const title = resolveVscodeTabLabelTitle(fullLabel, truncated, renameHint);
  if (title) {
    labelEl.title = title;
  } else {
    labelEl.removeAttribute('title');
  }
}

/**
 * @param {ParentNode | null} root
 */
export function syncVscodeTabLabelTooltips(root) {
  if (!root) return;
  for (const label of root.querySelectorAll('.vscode-tab__label')) {
    syncTabLabelTooltip(/** @type {HTMLElement} */ (label));
  }
}

/**
 * @param {HTMLElement | null} scrollEl
 */
function observeTabLabelTooltips(scrollEl) {
  if (tabLabelTooltipObserver && tabLabelTooltipObserverTarget === scrollEl) {
    syncVscodeTabLabelTooltips(scrollEl);
    return;
  }
  tabLabelTooltipObserver?.disconnect();
  tabLabelTooltipObserverTarget = scrollEl;
  if (!scrollEl || typeof ResizeObserver === 'undefined') {
    tabLabelTooltipObserver = null;
    syncVscodeTabLabelTooltips(scrollEl);
    return;
  }
  tabLabelTooltipObserver = new ResizeObserver(() => {
    syncVscodeTabLabelTooltips(scrollEl);
  });
  tabLabelTooltipObserver.observe(scrollEl);
  syncVscodeTabLabelTooltips(scrollEl);
}

/** @type {HTMLElement | null} */
let openFilePickerMenuEl = null;
/** @type {(() => void) | null} */
let filePickerOutsideListener = null;

export function closeVscodeTabFilePicker() {
  if (filePickerOutsideListener) {
    document.removeEventListener('mousedown', filePickerOutsideListener, true);
    filePickerOutsideListener = null;
  }
  if (openFilePickerMenuEl) {
    openFilePickerMenuEl.remove();
    openFilePickerMenuEl = null;
  }
}

/**
 * @param {HTMLElement} anchor
 * @param {VscodeTabFilePicker} picker
 * @param {string} tabId
 */
function openFilePickerMenu(anchor, picker, tabId) {
  closeVscodeTabFilePicker();

  const menu = document.createElement('div');
  menu.className = 'vscode-tab-file-menu';
  menu.setAttribute('role', 'menu');
  menu.dataset.anchorTabId = tabId;

  for (const file of picker.files) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `vscode-tab-file-menu__item${file.iconKind ? ` vscode-tab-file-menu__item--${file.iconKind}` : ''}`;
    item.setAttribute('role', 'menuitem');
    if (file.id === picker.activeFileId) {
      item.classList.add('is-active');
      item.setAttribute('aria-checked', 'true');
    }
    if (file.isModified) item.classList.add('is-modified');
    if (file.title) item.title = file.title;

    if (file.prefix) {
      const prefix = document.createElement('span');
      prefix.className = 'vscode-tab-file-menu__prefix';
      prefix.textContent = file.prefix;
      item.appendChild(prefix);
    }

    const label = document.createElement('span');
    label.className = 'vscode-tab-file-menu__label';
    label.textContent = file.label;
    item.appendChild(label);

    if (file.isModified) {
      const dirty = document.createElement('span');
      dirty.className = 'vscode-tab-file-menu__dirty';
      dirty.setAttribute('aria-hidden', 'true');
      item.appendChild(dirty);
    }

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      closeVscodeTabFilePicker();
      if (file.id !== picker.activeFileId) {
        picker.onSelect(file.id);
      }
    });
    menu.appendChild(item);
  }

  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.left = `${rect.left}px`;
  menu.style.top = `${rect.bottom}px`;
  menu.style.minWidth = `${Math.max(rect.width, 200)}px`;
  menu.style.zIndex = '600';

  openFilePickerMenuEl = menu;

  filePickerOutsideListener = (e) => {
    const target = /** @type {Node | null} */ (e.target);
    if (menu.contains(target) || anchor.contains(target)) return;
    closeVscodeTabFilePicker();
  };
  window.requestAnimationFrame(() => {
    document.addEventListener('mousedown', filePickerOutsideListener, true);
  });

  const onEscape = (e) => {
    if (e.key === 'Escape') {
      closeVscodeTabFilePicker();
      document.removeEventListener('keydown', onEscape, true);
    }
  };
  document.addEventListener('keydown', onEscape, true);
}

/**
 * @param {HTMLElement} anchor
 * @param {VscodeTabItem} tab
 * @param {VscodeTabFilePicker} picker
 */
function appendFilePickerTrigger(anchor, tab, picker) {
  const activeFile = picker.files.find((f) => f.id === picker.activeFileId);
  const trigger = document.createElement('span');
  trigger.className = 'vscode-tab__file-picker';
  trigger.setAttribute('role', 'button');
  trigger.tabIndex = 0;
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', t('codeEditor.bundleFilePicker'));

  const badge = document.createElement('span');
  badge.className = `vscode-tab__file-picker-badge${activeFile?.iconKind ? ` vscode-tab__file-picker-badge--${activeFile.iconKind}` : ''}`;
  badge.textContent = activeFile?.prefix || 'FILE';

  const chevron = document.createElement('span');
  chevron.className = 'vscode-tab__file-picker-chevron';
  chevron.innerHTML = CHEVRON_DOWN_SVG;

  trigger.append(badge, chevron);
  trigger.addEventListener('mousedown', (e) => e.stopPropagation());
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = openFilePickerMenuEl?.dataset.anchorTabId === tab.id;
    if (isOpen) {
      closeVscodeTabFilePicker();
      trigger.setAttribute('aria-expanded', 'false');
    } else {
      openFilePickerMenu(trigger, picker, tab.id);
      trigger.setAttribute('aria-expanded', 'true');
    }
  });
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      trigger.click();
    }
  });

  const closeBtn = anchor.querySelector('.vscode-tab__close');
  if (closeBtn) {
    anchor.insertBefore(trigger, closeBtn);
  } else {
    anchor.appendChild(trigger);
  }
}

/**
 * @param {string} tabId
 * @param {number} tabIndex
 * @param {VscodeTabItem} tab
 * @param {(tabId: string, event: MouseEvent, meta?: VscodeTabActionMeta) => void} onClose
 */
function createCloseButton(tabId, tabIndex, tab, onClose) {
  const close = document.createElement('span');
  close.className = 'vscode-tab__close';
  close.setAttribute('role', 'button');
  close.setAttribute('aria-label', t('codeEditor.closeTab'));
  close.innerHTML = CLOSE_ICON_SVG;
  close.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
  });
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    onClose?.(tabId, e, { tabIndex, sourceOrgId: tab.sourceOrgId });
  });
  return close;
}

/**
 * @param {HTMLElement} tabEl
 * @param {string} tabId
 * @param {number} tabIndex
 * @param {VscodeTabItem} tab
 * @param {(tabId: string, event: MouseEvent, meta?: VscodeTabActionMeta) => void} onSelect
 * @param {(tabId: string, event: MouseEvent, meta?: VscodeTabActionMeta) => void} onClose
 */
function wireTabSelectHandlers(tabEl, tabId, tabIndex, tab, onSelect, onClose) {
  const meta = { tabIndex, sourceOrgId: tab.sourceOrgId };
  tabEl.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement | null} */ (e.target instanceof Element ? e.target : null);
    if (target?.closest('.vscode-tab__close, .vscode-tab__file-picker')) return;
    onSelect(tabId, e, meta);
  });
  tabEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(tabId, e, meta);
    }
  });
  tabEl.addEventListener('auxclick', (e) => {
    if (e.button === 1) {
      e.preventDefault();
      onClose?.(tabId, e, meta);
    }
  });
}

/**
 * @param {VscodeTabItem} tab
 * @param {number} tabIndex
 * @param {VscodeTabBarOptions} options
 */
function createTabElement(tab, tabIndex, options) {
  const { onSelect, onClose, onRenameStart, onRenameFinish, onRenameCancel, renamingTabId, getFilePicker } =
    options;

  const el = document.createElement('div');
  el.className = 'vscode-tab';
  el.setAttribute('role', 'tab');
  el.tabIndex = tab.isActive ? 0 : -1;
  el.dataset.tabId = tab.id;
  el.dataset.tabIndex = String(tabIndex);
  if (tab.sourceOrgId) el.dataset.sourceOrgId = String(tab.sourceOrgId);

  if (tab.iconKind) el.classList.add(`vscode-tab--${tab.iconKind}`);
  if (tab.isActive) {
    el.classList.add('is-active');
    el.setAttribute('aria-selected', 'true');
  } else {
    el.setAttribute('aria-selected', 'false');
  }
  if (tab.isModified) el.classList.add('is-modified');
  if (tab.isAuthExpired) el.classList.add('vscode-tab--auth-expired');
  if (renamingTabId === tab.id) el.classList.add('is-renaming');
  if (tab.title) el.title = tab.title;

  if (renamingTabId === tab.id) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'vscode-tab__rename-input';
    input.value = tab.renameValue ?? tab.label;
    input.setAttribute('aria-label', t('codeEditor.renameTab'));
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onRenameCancel?.();
      }
    });
    input.addEventListener('blur', () => onRenameFinish?.(tab.id, input.value));

    if (tab.showClose !== false) {
      el.append(input, createCloseButton(tab.id, tabIndex, tab, onClose));
    } else {
      el.appendChild(input);
    }
    el.addEventListener('click', (e) => e.stopPropagation());
    window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
    return el;
  }

  if (tab.isModified) {
    const dirty = document.createElement('span');
    dirty.className = 'vscode-tab__dirty';
    dirty.setAttribute('aria-hidden', 'true');
    el.appendChild(dirty);
  }

  if (tab.prefix) {
    const prefix = document.createElement('span');
    prefix.className = 'vscode-tab__prefix';
    prefix.textContent = tab.prefix;
    el.appendChild(prefix);
  }

  const label = document.createElement('span');
  label.className = 'vscode-tab__label';
  label.textContent = tab.label;
  label.dataset.fullLabel = buildTabLabelTooltip(tab);
  if (onRenameStart) {
    label.dataset.renameHint = t('codeEditor.renameTabHint');
    label.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onRenameStart(tab.id);
    });
  }
  el.appendChild(label);

  if (tab.isActive && getFilePicker) {
    const picker = getFilePicker(tab.id);
    if (picker?.files?.length) {
      appendFilePickerTrigger(el, tab, picker);
    }
  }

  if (tab.showClose !== false) {
    el.appendChild(createCloseButton(tab.id, tabIndex, tab, onClose));
  }

  wireTabSelectHandlers(el, tab.id, tabIndex, tab, onSelect, onClose);

  return el;
}

/**
 * Renderiza una barra de pestañas estilo VS Code.
 * @param {HTMLElement | null} container
 * @param {VscodeTabBarOptions} options
 */
export function renderVscodeTabBar(container, options) {
  if (!container) return;

  closeVscodeTabFilePicker();

  const {
    tabs,
    hidden = false,
    showAddButton = false,
    addDisabled = false,
    addTitle,
    variant = '',
    onSelect,
    onClose,
    onAdd
  } = options;

  const variantClass = variant ? ` vscode-tabs--${variant}` : '';
  container.className = `vscode-tabs${variantClass}`;
  container.setAttribute('role', 'tablist');

  if (hidden || (tabs.length === 0 && !showAddButton)) {
    tabLabelTooltipObserver?.disconnect();
    tabLabelTooltipObserver = null;
    tabLabelTooltipObserverTarget = null;
    container.innerHTML = '';
    container.hidden = true;
    return;
  }

  container.hidden = false;
  container.innerHTML = '';

  const scroll = document.createElement('div');
  scroll.className = 'vscode-tabs__scroll';

  const list = document.createElement('div');
  list.className = 'vscode-tabs__list';

  /** @type {HTMLElement | null} */
  let activeTabEl = null;

  for (const [tabIndex, tab] of tabs.entries()) {
    const el = createTabElement(tab, tabIndex, options);
    if (tab.isActive) activeTabEl = el;
    list.appendChild(el);
  }

  if (showAddButton) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'vscode-tabs__action vscode-tabs__action--new';
    addBtn.setAttribute('aria-label', addTitle || t('codeEditor.newTab'));
    addBtn.title = addDisabled ? t('codeEditor.maxTabs') : addTitle || t('codeEditor.newTab');
    addBtn.textContent = '+';
    addBtn.disabled = !!addDisabled;
    addBtn.addEventListener('click', () => onAdd?.());
    list.appendChild(addBtn);
  }

  scroll.appendChild(list);
  container.appendChild(scroll);

  window.requestAnimationFrame(() => {
    observeTabLabelTooltips(scroll);
  });

  scroll.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        scroll.scrollLeft += e.deltaY;
      }
    },
    { passive: false }
  );

  if (activeTabEl) {
    window.requestAnimationFrame(() => {
      activeTabEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }
}
