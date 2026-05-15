import { state } from '../core/state.js';
import { saveItemsToStorage, isPinned, togglePin, pinKey, savePinnedKeys } from '../core/persistence.js';
import { retrieveZipContentEqual, updateOrgSelectorsLockedState } from './viewerChrome.js';
import { saveScrollPosition } from './scrollRestore.js';
import { updateDocumentTitle } from './documentMeta.js';
import { getFileExtension } from '../lib/itemLabels.js';
import { downloadFile } from '../flows/fileActions.js';
import { showToast } from './toast.js';
import { renderEditor } from '../editor/editorRender.js';
import { syncCompareUrlFromState } from '../lib/compareDeepLink.js';
import { t } from '../../shared/i18n.js';

let listFilterQuery = '';

const TYPE_SHORT_LABEL = {
  ApexClass: 'Apex',
  ApexTrigger: 'Trig',
  ApexPage: 'VF',
  ApexComponent: 'VF',
  LWC: 'LWC',
  Aura: 'Aura',
  PermissionSet: 'Perm',
  Profile: 'Prof',
  FlexiPage: 'Flexi',
  PackageXml: 'Pkg'
};

/** @param {string} type */
function getTypeShortLabel(type) {
  return TYPE_SHORT_LABEL[type] || type;
}

function getListFilterQuery() {
  return listFilterQuery.trim().toLowerCase();
}

/** @param {import('../core/state.js').state.savedItems[0]} item */
function itemSearchHaystack(item) {
  const parts = [item.type, item.key, item.fileName || ''];
  if (item.descriptor?.relativePath) parts.push(item.descriptor.relativePath);
  if (item.descriptor?.name) parts.push(item.descriptor.name);
  if (item.descriptor?.originalFileName) parts.push(item.descriptor.originalFileName);
  return parts.join(' ').toLowerCase();
}

/** @param {import('../core/state.js').state.savedItems[0]} item */
function itemMatchesFilter(item, query) {
  if (!query) return true;
  return itemSearchHaystack(item).includes(query);
}

function bundleNameMatchesFilter(bundleName, query) {
  return bundleName.toLowerCase().includes(query);
}

/**
 * @param {{ item: import('../core/state.js').state.savedItems[0] }[]} entries
 */
function bundleEntriesMatchFilter(entries, query) {
  if (!query) return true;
  return entries.some(({ item }) => itemMatchesFilter(item, query));
}

/** Hueco de chevron en hojas raíz (misma columna que carpetas). */
function createChevronSpacer() {
  const span = document.createElement('span');
  span.className = 'bundle-chevron bundle-chevron--spacer';
  span.setAttribute('aria-hidden', 'true');
  return span;
}

/** Mapea extensión de fichero LWC/Aura al tipo de icono del árbol. */
function treeIconKindFromExtension(ext) {
  const e = String(ext || '').toLowerCase();
  if (e === 'auradoc') return 'auradoc';
  if (['js', 'html', 'css', 'cmp', 'xml', 'cls', 'trigger', 'page', 'component'].includes(e)) return e;
  return 'file';
}

/** Icono de árbol estilo VS Code (Seti-like). */
function createTreeIcon(kind) {
  const span = document.createElement('span');
  span.className = `list-tree-icon list-tree-icon--${String(kind || 'file').toLowerCase()}`;
  span.setAttribute('aria-hidden', 'true');
  return span;
}

function treeIconKindFromItemType(type) {
  switch (type) {
    case 'ApexClass':
      return 'cls';
    case 'ApexTrigger':
      return 'trigger';
    case 'ApexPage':
      return 'page';
    case 'ApexComponent':
      return 'component';
    case 'PermissionSet':
      return 'permset';
    case 'Profile':
      return 'profile';
    case 'FlexiPage':
      return 'flexipage';
    default:
      return 'file';
  }
}

function getCompareListElements() {
  return {
    pinned: document.getElementById('leftListPinned'),
    scroll: document.getElementById('leftList'),
    body: document.getElementById('compareListBody')
  };
}

/** @param {HTMLElement | null} root */
function queryListItemByIndex(root, idx) {
  if (!root || idx < 0) return null;
  return root.querySelector(`li[data-item-index="${idx}"]`);
}

/**
 * @param {{
 *   bundleKey: string,
 *   typeLabel: string,
 *   title: string,
 *   fileCount?: number,
 *   collapsed: boolean,
 *   extraClass?: string,
 *   onToggle: (ev: Event) => void
 * }} opts
 */
function createBundleHeader(opts) {
  const header = document.createElement('li');
  header.className = ['bundle-header', opts.extraClass || ''].filter(Boolean).join(' ');
  header.setAttribute('data-bundle-key', opts.bundleKey);

  const chevron = document.createElement('span');
  chevron.className = 'bundle-chevron' + (opts.collapsed ? ' is-collapsed' : '');

  const folderIcon = createTreeIcon('folder');
  const label = document.createElement('span');
  label.className = 'bundle-label';
  label.textContent = opts.title;
  label.title = opts.title;

  header.appendChild(chevron);
  header.appendChild(folderIcon);
  header.appendChild(label);

  const actions = document.createElement('div');
  actions.className = 'list-item-actions list-item-actions--bundle';
  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'action-button remove-button';
  removeButton.textContent = '−';
  removeButton.title = t('list.removeBundleFromList');
  removeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    removeBundleFromList(opts.bundleKey);
  });
  actions.appendChild(removeButton);
  actions.addEventListener('click', (e) => e.stopPropagation());
  header.appendChild(actions);

  header.addEventListener('click', opts.onToggle);
  return header;
}

/** Muestra «Filtrar lista…» cuando el panel de lista está activo y hay elementos. */
export function syncCompareListToolbarVisibility() {
  const toolbar = document.getElementById('compareListToolbar');
  const body = document.getElementById('compareListBody');
  if (!toolbar) return;

  const listVisible = body && !body.classList.contains('hidden');
  const hasItems = (state.savedItems || []).length > 0;
  toolbar.classList.toggle('hidden', !(listVisible && hasItems));
}

export function setupCompareListToolbar() {
  const filter = /** @type {HTMLInputElement | null} */ (document.getElementById('compareListFilter'));

  filter?.addEventListener('input', () => {
    listFilterQuery = filter.value;
    renderSavedItems(true);
  });
}

function sortBundleFileEntries(entries) {
  const getOrder = (fileName) => {
    const name = String(fileName || '').toLowerCase();
    if (name.endsWith('renderer.js')) return 4;
    if (name.endsWith('.js')) return 1;
    if (name.endsWith('.html') || name.endsWith('.cmp')) return 2;
    if (name.endsWith('.css')) return 3;
    return 5;
  };
  return [...entries].sort((a, b) => {
    const fa = a.item.fileName || '';
    const fb = b.item.fileName || '';
    const oa = getOrder(fa);
    const ob = getOrder(fb);
    if (oa !== ob) return oa - ob;
    return fa.localeCompare(fb);
  });
}

function appendFilterEmptyState(list) {
  const li = document.createElement('li');
  li.className = 'compare-list-empty';
  li.textContent = t('list.noFilterResults');
  list.appendChild(li);
}

function savedItemIndex(item) {
  return state.savedItems.indexOf(item);
}

/** Una sola fila activa (la que se muestra en el editor). */
export function syncListActiveHighlight() {
  const { pinned, scroll } = getCompareListElements();
  for (const root of [pinned, scroll]) {
    if (!root) continue;
    for (const el of root.querySelectorAll('li[data-item-index]')) {
      el.classList.remove('active');
    }
  }
  const sel = state.selectedItem;
  if (!sel) return;
  const idx = state.savedItems.findIndex(
    (s) =>
      s.type === sel.type &&
      s.key === sel.key &&
      (s.fileName || '') === (sel.fileName || '')
  );
  if (idx >= 0) {
    queryListItemByIndex(pinned, idx)?.classList.add('active');
    queryListItemByIndex(scroll, idx)?.classList.add('active');
  }
}

export function renderSavedItems(preserveOrder = true) {
  const { pinned: pinnedList, scroll: list } = getCompareListElements();
  if (!list) return;
  list.classList.add('compare-tree');
  list.innerHTML = '';
  if (pinnedList) {
    pinnedList.innerHTML = '';
    pinnedList.classList.remove('compare-tree');
  }

  const query = getListFilterQuery();
  let visibleCount = 0;

  let itemsToRender = state.savedItems;
  if (!preserveOrder) {
    itemsToRender = [...state.savedItems];
  }

  const pinnedItems = [];
  const unpinnedItems = [];
  for (const item of itemsToRender) {
    if (isPinned(item)) pinnedItems.push(item);
    else unpinnedItems.push(item);
  }

  if (pinnedList && pinnedItems.length > 0) {
    pinnedList.classList.add('compare-tree');
    let anyPinnedVisible = false;
    for (const item of pinnedItems) {
      if (!itemMatchesFilter(item, query)) continue;
      anyPinnedVisible = true;
      const idx = state.savedItems.indexOf(item);
      const li = createListItem(item, idx);
      li.classList.add('pinned-item');
      pinnedList.appendChild(li);
      visibleCount++;
    }
    pinnedList.classList.toggle('hidden', !anyPinnedVisible);
  } else if (pinnedList) {
    pinnedList.classList.add('hidden');
  }

  itemsToRender = unpinnedItems;

  const bundleCollapsed = state.bundleCollapsed || {};
  const bundles = new Map();
  const nonBundleItems = [];

  itemsToRender.forEach((item) => {
    if (item.descriptor?.source === 'retrieveZipFile') {
      return;
    }
    if (
      (item.type === 'LWC' || item.type === 'Aura') &&
      item.fileName &&
      typeof item.key === 'string' &&
      item.key.includes('/')
    ) {
      const bundleName = item.key.split('/')[0];
      const bundleKey = `${item.type}:${bundleName}`;
      if (!bundles.has(bundleKey)) bundles.set(bundleKey, []);
      bundles.get(bundleKey).push({ item });
    } else {
      nonBundleItems.push({ item });
    }
  });

  for (const { item } of nonBundleItems) {
    const isPackageXmlTree =
      item.type === 'PackageXml' &&
      item.descriptor?.source === 'localFile' &&
      state.packageRetrieveZipCache[item.key];

    if (isPackageXmlTree && query) {
      const children = state.savedItems.filter(
        (s) => s.descriptor?.source === 'retrieveZipFile' && s.descriptor?.parentKey === item.key
      );
      const labelHay = t('list.packageXmlFiles', {
        count: state.packageRetrieveZipCache[item.key]?.paths?.length || 0
      }).toLowerCase();
      const showPkg =
        itemMatchesFilter(item, query) ||
        children.some((ch) => itemMatchesFilter(ch, query)) ||
        labelHay.includes(query);
      if (!showPkg) continue;
    } else if (!itemMatchesFilter(item, query)) {
      continue;
    }

    const li = createListItem(item, savedItemIndex(item));
    list.appendChild(li);
    visibleCount++;

    if (isPackageXmlTree) {
      const cache = state.packageRetrieveZipCache[item.key];
      const bundleKey = `PackageXmlRZ:${item.key}`;
      const children = state.savedItems.filter(
        (s) => s.descriptor?.source === 'retrieveZipFile' && s.descriptor?.parentKey === item.key
      );

      const collapsed = query ? false : bundleCollapsed[bundleKey] !== false;

      const hdr = createBundleHeader({
        bundleKey,
        typeLabel: 'Pkg',
        title: t('list.packageXmlFiles', { count: cache.paths?.length || 0 }),
        fileCount: children.length,
        collapsed,
        extraClass: 'bundle-child',
        onToggle: (e) => {
          e.stopPropagation();
          const isCollapsed = bundleCollapsed[bundleKey] !== false;
          bundleCollapsed[bundleKey] = !isCollapsed;
          state.bundleCollapsed = bundleCollapsed;
          renderSavedItems(true);
        }
      });
      hdr.setAttribute('data-package-rz-header', item.key);
      list.appendChild(hdr);

      if (!collapsed) {
        children.sort((a, b) =>
          String(a.descriptor?.relativePath || '').localeCompare(String(b.descriptor?.relativePath || ''))
        );

        const ROOT_KEY = '__root__';
        const groups = new Map();
        for (const ch of children) {
          const rp = String(ch.descriptor?.relativePath || '');
          const parts = rp.split('/').filter(Boolean);
          let folderKey;
          let labelInGroup;
          if (parts.length <= 1) {
            folderKey = ROOT_KEY;
            labelInGroup = parts[0] || rp;
          } else {
            folderKey = parts[0];
            labelInGroup = parts.slice(1).join('/');
          }
          if (!groups.has(folderKey)) groups.set(folderKey, []);
          groups.get(folderKey).push({ ch, labelInGroup });
        }

        const folderOrder = [...groups.keys()].sort((a, b) => {
          if (a === ROOT_KEY) return 1;
          if (b === ROOT_KEY) return -1;
          return a.localeCompare(b);
        });

        function appendRetrieveZipRow(ch, labelInGroup, deep) {
          if (!itemMatchesFilter(ch, query)) return;
          const idx = state.savedItems.indexOf(ch);
          const cli = createListItem(ch, idx);
          cli.classList.add('bundle-child');
          if (deep) cli.classList.add('bundle-child-deep');
          cli.setAttribute('data-bundle-key', bundleKey);
          const nameEl = cli.querySelector('.list-item-name');
          if (nameEl) {
            const eq = retrieveZipContentEqual(item.key, ch.descriptor.relativePath);
            const prefix = eq === null ? '' : eq ? t('list.equalPrefix') : t('list.differentPrefix');
            nameEl.textContent = prefix + labelInGroup;
            nameEl.title =
              (eq === null ? '' : eq ? t('list.equalTooltip') : t('list.differentTooltip')) +
              ' — ' +
              ch.descriptor.relativePath;
            cli.classList.remove('retrieve-zip-equal', 'retrieve-zip-diff');
            if (eq !== null) cli.classList.add(eq ? 'retrieve-zip-equal' : 'retrieve-zip-diff');
          }
          list.appendChild(cli);
          visibleCount++;
        }

        for (const folderKey of folderOrder) {
          const entries = groups.get(folderKey) || [];
          entries.sort((a, b) =>
            String(a.ch.descriptor?.relativePath || '').localeCompare(String(b.ch.descriptor?.relativePath || ''))
          );

          const folderEntriesMatch =
            !query ||
            folderKey.toLowerCase().includes(query) ||
            entries.some(({ ch }) => itemMatchesFilter(ch, query));

          if (!folderEntriesMatch) continue;

          if (folderKey !== ROOT_KEY) {
            const dirKey = `PackageXmlRZ:${item.key}:dir:${folderKey}`;
            const dirCollapsed = query ? false : bundleCollapsed[dirKey] !== false;
            const dirHdr = createBundleHeader({
              bundleKey: dirKey,
              typeLabel: 'Dir',
              title: folderKey,
              fileCount: entries.length,
              collapsed: dirCollapsed,
              extraClass: 'bundle-child package-rz-folder',
              onToggle: (e) => {
                e.stopPropagation();
                const isDirCollapsed = bundleCollapsed[dirKey] !== false;
                bundleCollapsed[dirKey] = !isDirCollapsed;
                state.bundleCollapsed = bundleCollapsed;
                renderSavedItems(true);
              }
            });
            dirHdr.setAttribute('data-package-rz-dir', folderKey);
            list.appendChild(dirHdr);

            if (!dirCollapsed) {
              for (const { ch, labelInGroup } of entries) {
                appendRetrieveZipRow(ch, labelInGroup, true);
              }
            }
          } else {
            for (const { ch, labelInGroup } of entries) {
              appendRetrieveZipRow(ch, labelInGroup, false);
            }
          }
        }
      }
    }
  }

  for (const [bundleKey, entries] of bundles.entries()) {
    const [type, bundleName] = bundleKey.split(':');
    if (!bundleEntriesMatchFilter(entries, query) && !bundleNameMatchesFilter(bundleName, query)) {
      continue;
    }

    const collapsed = query ? false : bundleCollapsed[bundleKey] !== false;

    const header = createBundleHeader({
      bundleKey,
      typeLabel: getTypeShortLabel(type),
      title: bundleName,
      fileCount: entries.length,
      collapsed,
      onToggle: () => {
        const isCollapsed = bundleCollapsed[bundleKey] !== false;
        bundleCollapsed[bundleKey] = !isCollapsed;
        state.bundleCollapsed = bundleCollapsed;
        renderSavedItems(true);
      }
    });

    list.appendChild(header);

    if (!collapsed) {
      const sorted = sortBundleFileEntries(entries);
      for (const { item } of sorted) {
        if (!itemMatchesFilter(item, query)) continue;
        const li = createListItem(item, savedItemIndex(item));
        li.classList.add('bundle-child');
        li.setAttribute('data-bundle-key', bundleKey);
        list.appendChild(li);
        visibleCount++;
      }
    }
  }

  if (query && visibleCount === 0 && (state.savedItems || []).length > 0) {
    appendFilterEmptyState(list);
  }

  syncCompareListToolbarVisibility();
  syncListActiveHighlight();
}

export function createListItem(item, displayIndex) {
  const li = document.createElement('li');
  li.draggable = true;
  li.setAttribute('data-item-index', displayIndex);
  li.appendChild(createChevronSpacer());

  const textSpan = document.createElement('span');
  textSpan.className = 'list-item-name';

  if (item.type === 'PackageXml' && item.descriptor?.source === 'retrieveZipFile' && item.descriptor?.relativePath) {
    const eq = retrieveZipContentEqual(item.descriptor.parentKey, item.descriptor.relativePath);
    const prefix = eq === null ? '' : eq ? t('list.equalPrefix') : t('list.differentPrefix');
    textSpan.textContent = prefix + item.descriptor.relativePath;
    textSpan.title =
      (eq === null ? '' : eq ? t('list.equalTooltip') : t('list.differentTooltip')) +
      ' — ' +
      item.descriptor.relativePath;
    if (eq !== null) li.classList.add(eq ? 'retrieve-zip-equal' : 'retrieve-zip-diff');
    li.appendChild(createTreeIcon('xml'));
  } else if ((item.type === 'LWC' || item.type === 'Aura') && item.fileName) {
    let filename = item.fileName;
    if (filename.includes('/')) {
      filename = filename.split('/').pop();
    }
    if (filename.endsWith('.js-meta.xml')) {
      filename = filename.replace('.js-meta.xml', '.xml');
    } else if (filename.endsWith('.html-meta.xml')) {
      filename = filename.replace('.html-meta.xml', '.xml');
    } else if (filename.endsWith('.css-meta.xml')) {
      filename = filename.replace('.css-meta.xml', '.xml');
    } else if (filename.endsWith('.xml-meta.xml')) {
      filename = filename.replace('.xml-meta.xml', '.xml');
    }
    textSpan.textContent = filename;
    textSpan.title = filename;
    const ext = getFileExtension(filename);
    li.setAttribute('data-filetype', ext);
    li.appendChild(createTreeIcon(treeIconKindFromExtension(ext)));
  } else {
    let displayName = item.key;
    if (item.type === 'PackageXml') {
      displayName = item.descriptor?.originalFileName || item.descriptor?.name || item.key;
    }
    if (displayName.toLowerCase().endsWith('-meta.xml')) {
      displayName = displayName.slice(0, -9);
    }
    textSpan.textContent = displayName;
    textSpan.title = displayName;
    li.appendChild(createTreeIcon(treeIconKindFromItemType(item.type)));
  }

  li.appendChild(textSpan);

  const pinSvgOutline =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3.5L5 21V5z"/></svg>';
  const pinSvgFilled =
    '<svg class="list-pin-svg--on" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3.5L5 21V5z"/></svg>';

  const actions = document.createElement('div');
  actions.className = 'list-item-actions';

  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.className = 'action-button download-button';
  downloadButton.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
  downloadButton.title = t('list.downloadFile');

  downloadButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    await downloadFile(item);
  });

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'action-button remove-button';
  removeButton.textContent = '−';
  removeButton.title = t('list.removeFromList');
  removeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    removeItemFromList(item);
  });

  const pinButton = document.createElement('button');
  pinButton.type = 'button';
  pinButton.className = 'action-button pin-button' + (isPinned(item) ? ' pinned' : '');
  pinButton.innerHTML = isPinned(item) ? pinSvgFilled : pinSvgOutline;
  pinButton.title = isPinned(item) ? t('list.unpinItem') : t('list.pinItem');
  pinButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const result = togglePin(item);
    if (result === null) {
      showToast(t('list.pinLimitReached'), 'warn');
      return;
    }
    renderSavedItems(true);
  });

  actions.append(downloadButton, removeButton, pinButton);
  li.appendChild(actions);
  li.setAttribute('data-type', item.type);
  li.setAttribute('data-key', item.key);
  if (item.fileName) li.setAttribute('data-file-name', item.fileName);

  li.addEventListener('click', () => {
    if (state.selectedItem) {
      saveScrollPosition(state.selectedItem, state.leftOrgId, state.rightOrgId);
    }
    state.selectedItem = item;
    syncListActiveHighlight();
    updateDocumentTitle();
    syncCompareUrlFromState(state);
    renderEditor();
  });

  return li;
}

/** @param {string} bundleKey — `LWC:nombre`, `Aura:nombre`, `PackageXmlRZ:…` o subcarpeta `…:dir:…` */
export function removeBundleFromList(bundleKey) {
  const sel = state.selectedItem;
  const before = state.savedItems.length;

  if (bundleKey.startsWith('PackageXmlRZ:')) {
    const dirMarker = ':dir:';
    const dirIdx = bundleKey.indexOf(dirMarker);
    if (dirIdx !== -1) {
      const parentKey = bundleKey.slice('PackageXmlRZ:'.length, dirIdx);
      const folder = bundleKey.slice(dirIdx + dirMarker.length);
      state.savedItems = state.savedItems.filter((item) => {
        if (item.descriptor?.source !== 'retrieveZipFile' || item.descriptor?.parentKey !== parentKey) {
          return true;
        }
        const rp = String(item.descriptor?.relativePath || '');
        const parts = rp.split('/').filter(Boolean);
        if (folder === '__root__') {
          return parts.length > 1;
        }
        if (parts[0] !== folder) return true;
        return false;
      });
    } else {
      const parentKey = bundleKey.slice('PackageXmlRZ:'.length);
      try {
        delete state.packageXmlLocalContent[parentKey];
        delete state.packageRetrieveZipCache[parentKey];
      } catch {
        /* ignore */
      }
      state.savedItems = state.savedItems.filter(
        (s) =>
          !(s.type === 'PackageXml' && s.key === parentKey) &&
          !(s.descriptor?.source === 'retrieveZipFile' && s.descriptor?.parentKey === parentKey)
      );
    }
  } else {
    const colon = bundleKey.indexOf(':');
    if (colon <= 0) return;
    const type = bundleKey.slice(0, colon);
    const bundleName = bundleKey.slice(colon + 1);
    const prefix = `${bundleName}/`;
    state.savedItems = state.savedItems.filter(
      (item) =>
        !(item.type === type && typeof item.key === 'string' && item.key.startsWith(prefix))
    );
  }

  if (state.savedItems.length === before) return;

  const remainingPinKeys = new Set(state.savedItems.map((i) => pinKey(i)));
  const nextPinned = state.pinnedKeys.filter((pk) => remainingPinKeys.has(pk));
  if (nextPinned.length !== state.pinnedKeys.length) {
    state.pinnedKeys = nextPinned;
    savePinnedKeys();
  }

  if (sel) {
    const stillThere = state.savedItems.some(
      (s) =>
        s.type === sel.type &&
        s.key === sel.key &&
        (s.fileName || '') === (sel.fileName || '')
    );
    if (!stillThere) {
      state.selectedItem = null;
      updateDocumentTitle();
      syncCompareUrlFromState(state);
    }
  }

  saveItemsToStorage();
  renderSavedItems();
  updateOrgSelectorsLockedState();
  if (!state.selectedItem) {
    renderEditor();
  }
}

export function removeItemFromList(item) {
  if (item.type === 'PackageXml' && item.descriptor?.source === 'localFile' && item.key) {
    try {
      delete state.packageXmlLocalContent[item.key];
      delete state.packageRetrieveZipCache[item.key];
    } catch {
      /* ignore */
    }
    const pk = item.key;
    state.savedItems = state.savedItems.filter(
      (s) => !(s.descriptor?.source === 'retrieveZipFile' && s.descriptor?.parentKey === pk)
    );
  }

  const index = state.savedItems.findIndex((saved) => saved.type === item.type && saved.key === item.key);

  if (index !== -1) {
    state.savedItems.splice(index, 1);
    saveItemsToStorage();
    renderSavedItems();

    if (
      state.selectedItem &&
      state.selectedItem.type === item.type &&
      state.selectedItem.key === item.key
    ) {
      state.selectedItem = null;
      updateDocumentTitle();
      syncCompareUrlFromState(state);
    }
  }
  updateOrgSelectorsLockedState();
}

/** Fijados y hijos de package.xml fijado no se borran con la papelera del buscador. */
function shouldKeepItemWhenClearingAll(item, allItems) {
  if (isPinned(item)) return true;
  const parentKey = item.descriptor?.parentKey;
  if (!parentKey) return false;
  const parent = allItems.find((s) => s.type === 'PackageXml' && s.key === parentKey);
  return !!(parent && isPinned(parent));
}

export function removeAllItems() {
  if (!state.savedItems || state.savedItems.length === 0) {
    showToast(t('toast.noFilesToRemove'), 'warn');
    return;
  }

  const before = state.savedItems.length;
  const kept = state.savedItems.filter((item) => shouldKeepItemWhenClearingAll(item, state.savedItems));
  const removedCount = before - kept.length;

  if (removedCount === 0) {
    showToast(t('toast.noUnpinnedFilesToRemove'), 'warn');
    return;
  }

  const keptPackageKeys = new Set(
    kept.filter((i) => i.type === 'PackageXml' && i.descriptor?.source === 'localFile').map((i) => i.key)
  );
  for (const key of Object.keys(state.packageXmlLocalContent)) {
    if (!keptPackageKeys.has(key)) delete state.packageXmlLocalContent[key];
  }
  for (const key of Object.keys(state.packageRetrieveZipCache)) {
    if (!keptPackageKeys.has(key)) delete state.packageRetrieveZipCache[key];
  }

  const sel = state.selectedItem;
  state.savedItems = kept;
  listFilterQuery = '';
  const filter = /** @type {HTMLInputElement | null} */ (document.getElementById('compareListFilter'));
  if (filter) filter.value = '';
  saveItemsToStorage();
  renderSavedItems();

  if (sel) {
    const stillThere = kept.some(
      (s) =>
        s.type === sel.type &&
        s.key === sel.key &&
        (s.fileName || '') === (sel.fileName || '')
    );
    if (!stillThere) {
      state.selectedItem = null;
      updateDocumentTitle();
      syncCompareUrlFromState(state);
      renderEditor();
    }
  }

  updateOrgSelectorsLockedState();

  if (kept.length === 0) {
    showToast(t('toast.allFilesRemoved'), 'info');
  } else {
    showToast(t('toast.filesRemovedKeepingPinned', { count: removedCount }), 'info');
  }
}
