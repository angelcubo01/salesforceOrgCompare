import { state } from '../core/state.js';
import { saveItemsToStorage, isPinned, togglePin, pinKey, savePinnedKeys } from '../core/persistence.js';
import { updateOrgSelectorsLockedState } from './viewerChrome.js';
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

/** Indentación del árbol: un paso = columna del chevron (como VS Code). */
function setTreeDepth(el, depth) {
  const d = Math.max(0, Math.min(Number(depth) || 0, 6));
  for (let i = 0; i <= 6; i++) el.classList.remove(`tree-depth-${i}`);
  el.classList.add(`tree-depth-${d}`);
  el.setAttribute('data-tree-depth', String(d));
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

/** @typedef {'pinned' | 'scroll'} BundleCollapseScope */

/** @param {BundleCollapseScope} scope @param {string} bundleKey */
function bundleCollapseStorageKey(scope, bundleKey) {
  return `${scope}:${bundleKey}`;
}

/** @param {BundleCollapseScope} scope @param {Record<string, boolean>} bundleCollapsed @param {string} bundleKey @param {string} query */
function isBundleCollapsed(scope, bundleCollapsed, bundleKey, query) {
  if (scope === 'pinned') return false;
  if (query) return false;
  const k = bundleCollapseStorageKey(scope, bundleKey);
  if (Object.prototype.hasOwnProperty.call(bundleCollapsed, k)) {
    return bundleCollapsed[k] !== false;
  }
  if (scope === 'scroll' && Object.prototype.hasOwnProperty.call(bundleCollapsed, bundleKey)) {
    return bundleCollapsed[bundleKey] !== false;
  }
  return true;
}

/** @param {BundleCollapseScope} scope @param {Record<string, boolean>} bundleCollapsed @param {string} bundleKey */
function toggleBundleCollapsed(scope, bundleCollapsed, bundleKey) {
  if (scope === 'pinned') return;
  const k = bundleCollapseStorageKey(scope, bundleKey);
  const collapsed = isBundleCollapsed(scope, bundleCollapsed, bundleKey, '');
  bundleCollapsed[k] = !collapsed;
  state.bundleCollapsed = bundleCollapsed;
}

/** Limpia colapso en fijados y en lista principal (p. ej. tras un retrieve nuevo). */
export function clearBundleCollapsedForKey(bundleKey) {
  state.bundleCollapsed = state.bundleCollapsed || {};
  for (const scope of /** @type {const} */ (['pinned', 'scroll'])) {
    delete state.bundleCollapsed[bundleCollapseStorageKey(scope, bundleKey)];
  }
  delete state.bundleCollapsed[bundleKey];
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
  if (!opts.extraClass?.includes('tree-depth-')) setTreeDepth(header, 0);
  return header;
}

/** Cabecera `package.xml` tras retrieve: icono de fichero, sin contador; clic selecciona el manifiesto. */
function createPackageRetrieveRootHeader({ parentItem, bundleKey, collapsed, onToggle, onSelect }) {
  const header = document.createElement('li');
  header.className = 'bundle-header package-xml-root-header';
  header.setAttribute('data-bundle-key', bundleKey);
  header.setAttribute('data-package-rz-header', parentItem.key);

  const chevron = document.createElement('span');
  chevron.className = 'bundle-chevron' + (collapsed ? ' is-collapsed' : '');
  chevron.addEventListener('click', (e) => {
    e.stopPropagation();
    onToggle(e);
  });

  const label = document.createElement('span');
  label.className = 'bundle-label';
  const title = parentItem.descriptor?.originalFileName || 'package.xml';
  label.textContent = title;
  label.title = title;

  header.appendChild(chevron);
  header.appendChild(createTreeIcon('xml'));
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
    removeBundleFromList(bundleKey);
  });
  actions.appendChild(removeButton);
  actions.addEventListener('click', (e) => e.stopPropagation());
  header.appendChild(actions);

  header.addEventListener('click', (e) => {
    if (e.target.closest('.bundle-chevron') || e.target.closest('.list-item-actions')) return;
    onSelect();
  });
  setTreeDepth(header, 0);
  return header;
}

/** @returns {{ files: Array<{ ch: object, name: string }>, dirs: Map<string, { files: object[], dirs: Map<string, object> }> }} */
function createPackageRetrieveDirNode() {
  return { files: [], dirs: new Map() };
}

/** @param {Array<{ descriptor?: { relativePath?: string } }>} children */
function buildPackageRetrieveTree(children) {
  const root = createPackageRetrieveDirNode();
  for (const ch of children) {
    const rp = String(ch.descriptor?.relativePath || '').replace(/\\/g, '/');
    const parts = rp.split('/').filter(Boolean);
    if (!parts.length) continue;
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (!node.dirs.has(seg)) node.dirs.set(seg, createPackageRetrieveDirNode());
      node = node.dirs.get(seg);
    }
    node.files.push({ ch, name: parts[parts.length - 1] });
  }
  return root;
}

function packageDirCollapseKey(parentItemKey, dirPath) {
  return `PackageXmlRZ:${parentItemKey}:dir:${dirPath}`;
}

/** @param {ReturnType<typeof createPackageRetrieveDirNode>} node */
function packageTreeMatchesFilter(node, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  for (const { ch, name } of node.files) {
    if (itemMatchesFilter(ch, query) || name.toLowerCase().includes(q)) return true;
  }
  for (const [dirName, child] of node.dirs) {
    if (dirName.toLowerCase().includes(q)) return true;
    if (packageTreeMatchesFilter(child, query)) return true;
  }
  return false;
}

/**
 * Contenido bajo una carpeta de primer nivel (nivel 2 respecto a package.xml).
 * Subcarpetas también en nivel 2, como hijos del bundle LWC.
 * @returns {number}
 */
function appendPackageFolderContentsToList(
  listEl,
  node,
  pathPrefix,
  parentItemKey,
  bundleKey,
  bundleCollapsed,
  query,
  collapseScope
) {
  let added = 0;
  const dirNames = [...node.dirs.keys()].sort((a, b) => a.localeCompare(b));
  const sortedFiles = [...node.files].sort((a, b) => a.name.localeCompare(b.name));

  for (const dirName of dirNames) {
    const childNode = node.dirs.get(dirName);
    const dirPath = pathPrefix ? `${pathPrefix}/${dirName}` : dirName;
    if (!packageTreeMatchesFilter(childNode, query)) continue;

    const dirKey = packageDirCollapseKey(parentItemKey, dirPath);
    const dirCollapsed = isBundleCollapsed(collapseScope, bundleCollapsed, dirKey, query);
    const dirHdr = createBundleHeader({
      bundleKey: dirKey,
      typeLabel: 'Dir',
      title: dirName,
      collapsed: dirCollapsed,
      extraClass: 'package-rz-folder tree-depth-2',
      onToggle: (e) => {
        e.stopPropagation();
        toggleBundleCollapsed(collapseScope, bundleCollapsed, dirKey);
        renderSavedItems(true);
      }
    });
    setTreeDepth(dirHdr, 2);
    dirHdr.setAttribute('data-package-rz-dir', dirPath);
    listEl.appendChild(dirHdr);
    added++;

    if (!dirCollapsed) {
      added += appendPackageFolderContentsToList(
        listEl,
        childNode,
        dirPath,
        parentItemKey,
        bundleKey,
        bundleCollapsed,
        query,
        collapseScope
      );
    }
  }

  for (const { ch, name } of sortedFiles) {
    if (query && !itemMatchesFilter(ch, query) && !name.toLowerCase().includes(query)) continue;
    const idx = state.savedItems.indexOf(ch);
    const cli = createListItem(ch, idx);
    cli.setAttribute('data-bundle-key', bundleKey);
    setTreeDepth(cli, 2);
    const nameEl = cli.querySelector('.list-item-name');
    if (nameEl) {
      nameEl.textContent = name;
      nameEl.title = ch.descriptor?.relativePath || name;
    }
    listEl.appendChild(cli);
    added++;
  }

  return added;
}

/**
 * Árbol package.xml: nivel 0 = package.xml, 1 = carpetas raíz del ZIP, 2 = su contenido.
 * @returns {number}
 */
function appendPackageRetrieveTreeToList(
  listEl,
  rootNode,
  parentItemKey,
  bundleKey,
  bundleCollapsed,
  query,
  collapseScope
) {
  let added = 0;
  const dirNames = [...rootNode.dirs.keys()].sort((a, b) => a.localeCompare(b));
  const rootFiles = [...rootNode.files].sort((a, b) => a.name.localeCompare(b.name));

  for (const dirName of dirNames) {
    const childNode = rootNode.dirs.get(dirName);
    if (!packageTreeMatchesFilter(childNode, query)) continue;

    const dirKey = packageDirCollapseKey(parentItemKey, dirName);
    const dirCollapsed = isBundleCollapsed(collapseScope, bundleCollapsed, dirKey, query);
    const dirHdr = createBundleHeader({
      bundleKey: dirKey,
      typeLabel: 'Dir',
      title: dirName,
      collapsed: dirCollapsed,
      extraClass: 'package-rz-folder tree-depth-1',
      onToggle: (e) => {
        e.stopPropagation();
        toggleBundleCollapsed(collapseScope, bundleCollapsed, dirKey);
        renderSavedItems(true);
      }
    });
    setTreeDepth(dirHdr, 1);
    dirHdr.setAttribute('data-package-rz-dir', dirName);
    listEl.appendChild(dirHdr);
    added++;

    if (!dirCollapsed) {
      added += appendPackageFolderContentsToList(
        listEl,
        childNode,
        dirName,
        parentItemKey,
        bundleKey,
        bundleCollapsed,
        query,
        collapseScope
      );
    }
  }

  for (const { ch, name } of rootFiles) {
    if (query && !itemMatchesFilter(ch, query) && !name.toLowerCase().includes(query)) continue;
    const idx = state.savedItems.indexOf(ch);
    const cli = createListItem(ch, idx);
    cli.setAttribute('data-bundle-key', bundleKey);
    setTreeDepth(cli, 1);
    const nameEl = cli.querySelector('.list-item-name');
    if (nameEl) {
      nameEl.textContent = name;
      nameEl.title = ch.descriptor?.relativePath || name;
    }
    listEl.appendChild(cli);
    added++;
  }

  return added;
}

/** Muestra «Filtrar lista…» siempre que el panel de lista lateral esté activo. */
export function syncCompareListToolbarVisibility() {
  const toolbar = document.getElementById('compareListToolbar');
  const body = document.getElementById('compareListBody');
  if (!toolbar) return;

  const listVisible = body && !body.classList.contains('hidden');
  toolbar.classList.toggle('hidden', !listVisible);
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

/** @param {import('../core/state.js').state.savedItems[0]} item */
function getLwcAuraBundleKey(item) {
  if (
    (item.type === 'LWC' || item.type === 'Aura') &&
    item.fileName &&
    typeof item.key === 'string' &&
    item.key.includes('/')
  ) {
    const bundleName = item.key.split('/')[0];
    return `${item.type}:${bundleName}`;
  }
  return null;
}

/**
 * Cabecera de bundle LWC/Aura + hijos en un contenedor de lista.
 * @param {HTMLElement} listEl
 * @param {string} bundleKey
 * @param {import('../core/state.js').state.savedItems} bundleItems
 * @param {Record<string, boolean>} bundleCollapsed
 * @param {string} query
 * @param {{ markPinnedLeaves?: boolean }} [opts]
 * @returns {number} filas visibles añadidas
 */
function appendLwcAuraBundleToList(listEl, bundleKey, bundleItems, bundleCollapsed, query, opts = {}) {
  const collapseScope = opts.collapseScope === 'pinned' ? 'pinned' : 'scroll';
  const colon = bundleKey.indexOf(':');
  const type = bundleKey.slice(0, colon);
  const bundleName = bundleKey.slice(colon + 1);
  const entries = bundleItems.map((item) => ({ item }));

  if (!bundleEntriesMatchFilter(entries, query) && !bundleNameMatchesFilter(bundleName, query)) {
    return 0;
  }

  const alwaysExpanded = collapseScope === 'pinned';
  const collapsed = alwaysExpanded
    ? false
    : isBundleCollapsed(collapseScope, bundleCollapsed, bundleKey, query);
  const header = createBundleHeader({
    bundleKey,
    typeLabel: getTypeShortLabel(type),
    title: bundleName,
    fileCount: entries.length,
    collapsed,
    extraClass: alwaysExpanded ? 'bundle-header--pinned-expanded' : '',
    onToggle: alwaysExpanded
      ? () => {}
      : () => {
          toggleBundleCollapsed(collapseScope, bundleCollapsed, bundleKey);
          renderSavedItems(true);
        }
  });
  setTreeDepth(header, 0);
  listEl.appendChild(header);

  let added = 1;
  if (!collapsed) {
    const sorted = sortBundleFileEntries(entries);
    for (const { item } of sorted) {
      if (!itemMatchesFilter(item, query)) continue;
      const li = createListItem(item, savedItemIndex(item));
      setTreeDepth(li, 1);
      li.setAttribute('data-bundle-key', bundleKey);
      if (opts.markPinnedLeaves && isPinned(item)) {
        li.classList.add('pinned-item');
      }
      listEl.appendChild(li);
      added++;
    }
  }
  return added;
}

/** Una sola fila activa (la que se muestra en el editor). */
export function syncListActiveHighlight() {
  const { pinned, scroll } = getCompareListElements();
  for (const root of [pinned, scroll]) {
    if (!root) continue;
    for (const el of root.querySelectorAll('li[data-item-index], li.package-xml-root-header')) {
      el.classList.remove('active');
    }
  }
  const sel = state.selectedItem;
  if (!sel) return;

  if (
    sel.type === 'PackageXml' &&
    sel.descriptor?.source === 'localFile' &&
    state.packageRetrieveZipCache[sel.key]
  ) {
    for (const root of [pinned, scroll]) {
      root?.querySelector(`[data-package-rz-header="${CSS.escape(sel.key)}"]`)?.classList.add('active');
    }
    return;
  }

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

  /** @type {Map<string, import('../core/state.js').state.savedItems>} */
  const pinnedBundles = new Map();
  const pinnedStandalone = [];
  for (const item of pinnedItems) {
    const bundleKey = getLwcAuraBundleKey(item);
    if (bundleKey) {
      if (!pinnedBundles.has(bundleKey)) pinnedBundles.set(bundleKey, []);
      pinnedBundles.get(bundleKey).push(item);
    } else {
      pinnedStandalone.push(item);
    }
  }

  const bundleCollapsed = state.bundleCollapsed || {};

  if (pinnedList && (pinnedStandalone.length > 0 || pinnedBundles.size > 0)) {
    pinnedList.classList.add('compare-tree');
    let anyPinnedVisible = false;

    for (const item of pinnedStandalone) {
      if (!itemMatchesFilter(item, query)) continue;
      anyPinnedVisible = true;
      const li = createListItem(item, savedItemIndex(item));
      setTreeDepth(li, 0);
      li.classList.add('pinned-item');
      pinnedList.appendChild(li);
      visibleCount++;
    }

    for (const [bundleKey, bundleItems] of pinnedBundles) {
      const added = appendLwcAuraBundleToList(
        pinnedList,
        bundleKey,
        bundleItems,
        bundleCollapsed,
        query,
        { markPinnedLeaves: true, collapseScope: 'pinned' }
      );
      if (added > 0) {
        anyPinnedVisible = true;
        visibleCount += added;
      }
    }

    pinnedList.classList.toggle('hidden', !anyPinnedVisible);
  } else if (pinnedList) {
    pinnedList.classList.add('hidden');
  }

  itemsToRender = unpinnedItems;

  const bundles = new Map();
  const nonBundleItems = [];

  itemsToRender.forEach((item) => {
    if (item.descriptor?.source === 'retrieveZipFile') {
      return;
    }
    const lwcAuraBundleKey = getLwcAuraBundleKey(item);
    if (lwcAuraBundleKey) {
      if (!bundles.has(lwcAuraBundleKey)) bundles.set(lwcAuraBundleKey, []);
      bundles.get(lwcAuraBundleKey).push({ item });
    } else {
      nonBundleItems.push({ item });
    }
  });

  for (const { item } of nonBundleItems) {
    if (
      item.type === 'PackageXml' &&
      item.descriptor?.source === 'localFile' &&
      !state.packageXmlLocalContent[item.key]
    ) {
      continue;
    }

    const isPackageXmlTree =
      item.type === 'PackageXml' &&
      item.descriptor?.source === 'localFile' &&
      state.packageRetrieveZipCache[item.key];

    if (isPackageXmlTree && query) {
      const children = state.savedItems.filter(
        (s) => s.descriptor?.source === 'retrieveZipFile' && s.descriptor?.parentKey === item.key
      );
      const labelHay = 'package.xml';
      const showPkg =
        itemMatchesFilter(item, query) ||
        children.some((ch) => itemMatchesFilter(ch, query)) ||
        labelHay.includes(query);
      if (!showPkg) continue;
    } else if (!isPackageXmlTree && !itemMatchesFilter(item, query)) {
      continue;
    }

    if (!isPackageXmlTree) {
      const li = createListItem(item, savedItemIndex(item));
      setTreeDepth(li, 0);
      list.appendChild(li);
      visibleCount++;
    }

    if (isPackageXmlTree) {
      const bundleKey = `PackageXmlRZ:${item.key}`;
      const children = state.savedItems.filter(
        (s) => s.descriptor?.source === 'retrieveZipFile' && s.descriptor?.parentKey === item.key
      );

      const collapsed = isBundleCollapsed('scroll', bundleCollapsed, bundleKey, query);

      const hdr = createPackageRetrieveRootHeader({
        parentItem: item,
        bundleKey,
        collapsed,
        onToggle: () => {
          toggleBundleCollapsed('scroll', bundleCollapsed, bundleKey);
          renderSavedItems(true);
        },
        onSelect: () => {
          if (state.selectedItem) {
            saveScrollPosition(state.selectedItem, state.leftOrgId, state.rightOrgId);
          }
          state.selectedItem = item;
          syncListActiveHighlight();
          updateDocumentTitle();
          syncCompareUrlFromState(state);
          renderEditor();
        }
      });
      list.appendChild(hdr);
      visibleCount++;

      if (!collapsed) {
        const tree = buildPackageRetrieveTree(children);
        visibleCount += appendPackageRetrieveTreeToList(
          list,
          tree,
          item.key,
          bundleKey,
          bundleCollapsed,
          query,
          'scroll'
        );
      }
    }
  }

  for (const [bundleKey, entries] of bundles.entries()) {
    const bundleItems = entries.map(({ item }) => item);
    visibleCount += appendLwcAuraBundleToList(list, bundleKey, bundleItems, bundleCollapsed, query, {
      collapseScope: 'scroll'
    });
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
    const rp = item.descriptor.relativePath;
    const filename = rp.includes('/') ? rp.split('/').pop() : rp;
    textSpan.textContent = filename;
    textSpan.title = rp;
    const ext = getFileExtension(filename);
    li.setAttribute('data-filetype', ext);
    li.appendChild(createTreeIcon(treeIconKindFromExtension(ext)));
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

  if (item.type === 'PackageXml') {
    actions.append(downloadButton, removeButton);
  } else {
    actions.append(downloadButton, removeButton, pinButton);
  }
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
        const rp = String(item.descriptor?.relativePath || '').replace(/\\/g, '/');
        if (rp === folder || rp.startsWith(`${folder}/`)) return false;
        return true;
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
