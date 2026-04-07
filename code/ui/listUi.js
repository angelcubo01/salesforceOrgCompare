import { state } from '../core/state.js';
import { saveItemsToStorage, isPinned, togglePin, pinKey } from '../core/persistence.js';
import { retrieveZipContentEqual, updateOrgSelectorsLockedState } from './viewerChrome.js';
import { saveScrollPosition } from './scrollRestore.js';
import { updateDocumentTitle } from './documentMeta.js';
import { getFileExtension } from '../lib/itemLabels.js';
import { downloadFile } from '../flows/fileActions.js';
import { showToast } from './toast.js';
import { renderEditor } from '../editor/editorRender.js';
import { t } from '../../shared/i18n.js';

export function renderSavedItems(preserveOrder = true) {
  const list = document.getElementById('leftList');
  list.innerHTML = '';
  
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

  if (pinnedItems.length > 0) {
    for (const item of pinnedItems) {
      const idx = state.savedItems.indexOf(item);
      const li = createListItem(item, idx);
      li.classList.add('pinned-item');
      list.appendChild(li);
    }
    const sep = document.createElement('li');
    sep.className = 'pinned-separator';
    list.appendChild(sep);
  }

  itemsToRender = unpinnedItems;

  const bundleCollapsed = state.bundleCollapsed || {};
  const bundles = new Map();
  const nonBundleItems = [];

  itemsToRender.forEach((item, index) => {
    if (item.descriptor?.source === 'retrieveZipFile') {
      return;
    }
    if ((item.type === 'LWC' || item.type === 'Aura') &&
        item.fileName &&
        typeof item.key === 'string' &&
        item.key.includes('/')) {
      const bundleName = item.key.split('/')[0];
      const bundleKey = `${item.type}:${bundleName}`;
      if (!bundles.has(bundleKey)) bundles.set(bundleKey, []);
      bundles.get(bundleKey).push({ item, index });
    } else {
      nonBundleItems.push({ item, index });
    }
  });

  // Render non-bundle items first (hijos de retrieve package.xml se pintan bajo el padre)
  for (const { item, index } of nonBundleItems) {
    const li = createListItem(item, index);
    list.appendChild(li);

    if (
      item.type === 'PackageXml' &&
      item.descriptor?.source === 'localFile' &&
      state.packageRetrieveZipCache[item.key]
    ) {
      const cache = state.packageRetrieveZipCache[item.key];
      const bundleKey = `PackageXmlRZ:${item.key}`;
      const collapsed = bundleCollapsed[bundleKey] !== false;

      const hdr = document.createElement('li');
      hdr.className = 'bundle-header bundle-child';
      hdr.setAttribute('data-package-rz-header', item.key);
      const arrow = document.createElement('span');
      arrow.className = 'bundle-arrow';
      arrow.textContent = collapsed ? '▶' : '▼';
      const label = document.createElement('span');
      label.className = 'bundle-label';
      label.textContent = t('list.packageXmlFiles', { count: cache.paths?.length || 0 });
      hdr.appendChild(arrow);
      hdr.appendChild(label);
      hdr.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCollapsed = bundleCollapsed[bundleKey] !== false;
        bundleCollapsed[bundleKey] = !isCollapsed;
        state.bundleCollapsed = bundleCollapsed;
        renderSavedItems(true);
      });
      list.appendChild(hdr);

      if (!collapsed) {
        const children = state.savedItems.filter(
          (s) => s.descriptor?.source === 'retrieveZipFile' && s.descriptor?.parentKey === item.key
        );
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
          const idx = state.savedItems.indexOf(ch);
          const cli = createListItem(ch, idx);
          cli.classList.add('bundle-child');
          if (deep) cli.classList.add('bundle-child-deep');
          cli.setAttribute('data-bundle-key', bundleKey);
          const ts = cli.querySelector('span');
          if (ts) {
            const eq = retrieveZipContentEqual(item.key, ch.descriptor.relativePath);
            const prefix = eq === null ? '' : eq ? t('list.equalPrefix') : t('list.differentPrefix');
            ts.textContent = prefix + labelInGroup;
            ts.title =
              (eq === null ? '' : eq ? t('list.equalTooltip') : t('list.differentTooltip')) +
              ' — ' +
              ch.descriptor.relativePath;
            cli.classList.remove('retrieve-zip-equal', 'retrieve-zip-diff');
            if (eq !== null) cli.classList.add(eq ? 'retrieve-zip-equal' : 'retrieve-zip-diff');
          }
          list.appendChild(cli);
        }

        for (const folderKey of folderOrder) {
          const entries = groups.get(folderKey) || [];
          entries.sort((a, b) =>
            String(a.ch.descriptor?.relativePath || '').localeCompare(String(b.ch.descriptor?.relativePath || ''))
          );

          if (folderKey !== ROOT_KEY) {
            const dirKey = `PackageXmlRZ:${item.key}:dir:${folderKey}`;
            const dirCollapsed = bundleCollapsed[dirKey] !== false;
            const dirHdr = document.createElement('li');
            dirHdr.className = 'bundle-header bundle-child package-rz-folder';
            dirHdr.setAttribute('data-package-rz-dir', folderKey);
            const dArrow = document.createElement('span');
            dArrow.className = 'bundle-arrow';
            dArrow.textContent = dirCollapsed ? '▶' : '▼';
            const dLbl = document.createElement('span');
            dLbl.className = 'bundle-label';
            dLbl.textContent = folderKey;
            dirHdr.appendChild(dArrow);
            dirHdr.appendChild(dLbl);
            dirHdr.addEventListener('click', (e) => {
              e.stopPropagation();
              const isDirCollapsed = bundleCollapsed[dirKey] !== false;
              bundleCollapsed[dirKey] = !isDirCollapsed;
              state.bundleCollapsed = bundleCollapsed;
              renderSavedItems(true);
            });
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

  // Render grouped bundles (LWC / Aura)
  for (const [bundleKey, entries] of bundles.entries()) {
    const [type, bundleName] = bundleKey.split(':');
    const header = document.createElement('li');
    header.className = 'bundle-header';
    header.setAttribute('data-bundle-key', bundleKey);

    const arrow = document.createElement('span');
    arrow.className = 'bundle-arrow';
    const collapsed = bundleCollapsed[bundleKey] !== false; // default collapsed
    arrow.textContent = collapsed ? '▶' : '▼';

    const label = document.createElement('span');
    label.className = 'bundle-label';
    label.textContent = bundleName;

    header.appendChild(arrow);
    header.appendChild(label);

    header.addEventListener('click', () => {
      const isCollapsed = bundleCollapsed[bundleKey] !== false;
      bundleCollapsed[bundleKey] = !isCollapsed;
      state.bundleCollapsed = bundleCollapsed;
      renderSavedItems(true);
    });

    list.appendChild(header);

    if (!collapsed) {
      // Sort files within bundle with priority:
      // 1) *.js (except renderer.js)
      // 2) *.html or *.cmp
      // 3) *.css
      // 4) renderer.js
      // 5) others (xml, meta, etc.)
      const getOrder = (fileName) => {
        const name = String(fileName || '').toLowerCase();
        if (name.endsWith('renderer.js')) return 4;
        if (name.endsWith('.js')) return 1;
        if (name.endsWith('.html') || name.endsWith('.cmp')) return 2;
        if (name.endsWith('.css')) return 3;
        return 5;
      };

      const sorted = [...entries].sort((a, b) => {
        const fa = a.item.fileName || '';
        const fb = b.item.fileName || '';
        const oa = getOrder(fa);
        const ob = getOrder(fb);
        if (oa !== ob) return oa - ob;
        return fa.localeCompare(fb);
      });

      for (const { item, index } of sorted) {
        const li = createListItem(item, index);
        li.classList.add('bundle-child');
        li.setAttribute('data-bundle-key', bundleKey);
        list.appendChild(li);
      }
    }
  }
}

export function createListItem(item, displayIndex) {
  const li = document.createElement('li');
  li.draggable = true;
  li.setAttribute('data-item-index', displayIndex);
  
  // Create text content
  const textSpan = document.createElement('span');
  
  // Ficheros del retrieve por package.xml (árbol bajo el padre)
  if (item.type === 'PackageXml' && item.descriptor?.source === 'retrieveZipFile' && item.descriptor?.relativePath) {
    const eq = retrieveZipContentEqual(item.descriptor.parentKey, item.descriptor.relativePath);
    const prefix = eq === null ? '' : eq ? t('list.equalPrefix') : t('list.differentPrefix');
    textSpan.textContent = prefix + item.descriptor.relativePath;
    textSpan.title =
      (eq === null ? '' : eq ? t('list.equalTooltip') : t('list.differentTooltip')) +
      ' — ' +
      item.descriptor.relativePath;
    if (eq !== null) li.classList.add(eq ? 'retrieve-zip-equal' : 'retrieve-zip-diff');
  } else if ((item.type === 'LWC' || item.type === 'Aura') && item.fileName) {
    // Extract just the filename without path and .meta.xml
    let filename = item.fileName;
    
    if (filename.includes('/')) {
      filename = filename.split('/').pop();
    }
    
    // Handle meta.xml files - these are XML metadata files, not the actual source files
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
    li.setAttribute('data-filetype', getFileExtension(filename));
  } else {
    let displayName = item.key;
    if (item.type === 'PackageXml') {
      displayName = item.descriptor?.originalFileName || item.descriptor?.name || item.key;
    }
    if (displayName.toLowerCase().endsWith('-meta.xml')) {
      displayName = displayName.slice(0, -9);
    }
    textSpan.textContent = displayName;
  }
  
  const pinSvgOutline =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3.5L5 21V5z"/></svg>';
  const pinSvgFilled =
    '<svg class="list-pin-svg--on" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3.5L5 21V5z"/></svg>';

  const pinWrap = document.createElement('div');
  pinWrap.className = 'list-item-pin';
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
  pinWrap.appendChild(pinButton);

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'item-action-buttons';

  const downloadButton = document.createElement('button');
  downloadButton.className = 'action-button download-button';
  downloadButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
  downloadButton.title = t('list.downloadFile');

  downloadButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    await downloadFile(item);
  });

  const removeButton = document.createElement('button');
  removeButton.className = 'action-button remove-button';
  removeButton.textContent = '−';
  removeButton.title = t('list.removeFromList');

  removeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    removeItemFromList(item);
  });

  buttonContainer.appendChild(downloadButton);
  buttonContainer.appendChild(removeButton);

  li.appendChild(textSpan);
  li.appendChild(pinWrap);
  li.appendChild(buttonContainer);
  li.setAttribute('data-type', item.type);
  li.setAttribute('data-key', item.key);
  
  li.addEventListener('click', () => {
    // Save scroll position of currently selected item before switching
    if (state.selectedItem) {
      saveScrollPosition(state.selectedItem, state.leftOrgId, state.rightOrgId);
    }
    
    const list = document.getElementById('leftList');
    for (const el of list.children) el.classList.remove('active');
    li.classList.add('active');
    state.selectedItem = item;
    updateDocumentTitle();
    renderEditor();
  });
  
  return li;
}

export function removeItemFromList(item) {
  if (item.type === 'PackageXml' && item.descriptor?.source === 'localFile' && item.key) {
    try {
      delete state.packageXmlLocalContent[item.key];
      delete state.packageRetrieveZipCache[item.key];
    } catch {}
    const pk = item.key;
    state.savedItems = state.savedItems.filter(
      (s) => !(s.descriptor?.source === 'retrieveZipFile' && s.descriptor?.parentKey === pk)
    );
  }

  const index = state.savedItems.findIndex(
    (saved) => saved.type === item.type && saved.key === item.key
  );

  if (index !== -1) {
    state.savedItems.splice(index, 1);
    saveItemsToStorage();
    renderSavedItems();
    
    // Clear selection if the removed item was selected
    if (state.selectedItem && 
        state.selectedItem.type === item.type && 
        state.selectedItem.key === item.key) {
      state.selectedItem = null;
      updateDocumentTitle();
    }
  }
  updateOrgSelectorsLockedState();
}

export function removeAllItems() {
  if (!state.savedItems || state.savedItems.length === 0) {
    showToast(t('toast.noFilesToRemove'), 'warn');
    return;
  }
  
  // Clear all items
  state.savedItems = [];
  state.packageXmlLocalContent = {};
  state.packageRetrieveZipCache = {};
  saveItemsToStorage();
  renderSavedItems();
  
  // Clear selection
  state.selectedItem = null;
  updateDocumentTitle();
  updateOrgSelectorsLockedState();

  showToast(t('toast.allFilesRemoved'), 'info');
}
