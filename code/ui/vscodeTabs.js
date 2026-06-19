import { t } from '../../shared/i18n.js';

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
 * @property {(tabId: string) => void} onSelect
 * @property {(tabId: string, event: MouseEvent) => void} onClose
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
 * @param {HTMLButtonElement} btn
 * @param {VscodeTabItem} tab
 * @param {VscodeTabFilePicker} picker
 */
function appendFilePickerTrigger(btn, tab, picker) {
  const activeFile = picker.files.find((f) => f.id === picker.activeFileId);
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'vscode-tab__file-picker';
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

  const closeBtn = btn.querySelector('.vscode-tab__close');
  if (closeBtn) {
    btn.insertBefore(trigger, closeBtn);
  } else {
    btn.appendChild(trigger);
  }
}

/**
 * @param {string} tabId
 * @param {(tabId: string, event: MouseEvent) => void} onClose
 */
function createCloseButton(tabId, onClose) {
  const close = document.createElement('span');
  close.className = 'vscode-tab__close';
  close.setAttribute('role', 'button');
  close.setAttribute('aria-label', t('codeEditor.closeTab'));
  close.innerHTML = CLOSE_ICON_SVG;
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    onClose?.(tabId, e);
  });
  return close;
}

/**
 * @param {VscodeTabItem} tab
 * @param {VscodeTabBarOptions} options
 */
function createTabElement(tab, options) {
  const { onSelect, onClose, onRenameStart, onRenameFinish, onRenameCancel, renamingTabId, getFilePicker } =
    options;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'vscode-tab';
  btn.setAttribute('role', 'tab');
  btn.dataset.tabId = tab.id;

  if (tab.iconKind) btn.classList.add(`vscode-tab--${tab.iconKind}`);
  if (tab.isActive) {
    btn.classList.add('is-active');
    btn.setAttribute('aria-selected', 'true');
  } else {
    btn.setAttribute('aria-selected', 'false');
  }
  if (tab.isModified) btn.classList.add('is-modified');
  if (tab.isAuthExpired) btn.classList.add('vscode-tab--auth-expired');
  if (renamingTabId === tab.id) btn.classList.add('is-renaming');
  if (tab.title) btn.title = tab.title;

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
      btn.append(input, createCloseButton(tab.id, onClose));
    } else {
      btn.appendChild(input);
    }
    btn.addEventListener('click', (e) => e.stopPropagation());
    window.requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
    return btn;
  }

  if (tab.isModified) {
    const dirty = document.createElement('span');
    dirty.className = 'vscode-tab__dirty';
    dirty.setAttribute('aria-hidden', 'true');
    btn.appendChild(dirty);
  }

  if (tab.prefix) {
    const prefix = document.createElement('span');
    prefix.className = 'vscode-tab__prefix';
    prefix.textContent = tab.prefix;
    btn.appendChild(prefix);
  }

  const label = document.createElement('span');
  label.className = 'vscode-tab__label';
  label.textContent = tab.label;
  if (onRenameStart) {
    label.title = t('codeEditor.renameTabHint');
    label.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onRenameStart(tab.id);
    });
  }
  btn.appendChild(label);

  if (tab.isActive && getFilePicker) {
    const picker = getFilePicker(tab.id);
    if (picker?.files?.length) {
      appendFilePickerTrigger(btn, tab, picker);
    }
  }

  if (tab.showClose !== false) {
    btn.appendChild(createCloseButton(tab.id, onClose));
  }

  btn.addEventListener('click', () => onSelect(tab.id));
  btn.addEventListener('auxclick', (e) => {
    if (e.button === 1) {
      e.preventDefault();
      onClose?.(tab.id, e);
    }
  });

  return btn;
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

  for (const tab of tabs) {
    const el = createTabElement(tab, options);
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
