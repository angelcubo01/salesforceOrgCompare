import { state } from '../core/state.js';
import { saveItemsToStorage } from '../core/persistence.js';
import { saveScrollPosition } from '../ui/scrollRestore.js';
import { updateDocumentTitle } from '../ui/documentMeta.js';
import { renderEditor } from '../editor/editorRender.js';
import { renderSavedItems, syncListActiveHighlight } from '../ui/listUi.js';
import { bg } from '../core/bridge.js';
import { showToast } from '../ui/toast.js';
import { t } from '../../shared/i18n.js';
import { syncCompareUrlFromState } from '../lib/compareDeepLink.js';

export function addSelected(item) {
  // Save scroll position of currently selected item before switching
  if (state.selectedItem) {
    saveScrollPosition(state.selectedItem, state.leftOrgId, state.rightOrgId);
  }
  
  // Check if item already exists
  const existingIndex = state.savedItems.findIndex(saved => 
    saved.type === item.type && saved.key === item.key
  );
  
  let selected = null;
  if (existingIndex === -1) {
    // Add new item
    state.savedItems.push(item);
    saveItemsToStorage();
    selected = item;
  } else {
    selected = state.savedItems[existingIndex];
  }
  
  renderSavedItems();
  state.selectedItem = selected;
  syncListActiveHighlight();

  // Update document title and open in editor
  updateDocumentTitle();
  syncCompareUrlFromState(state);
  renderEditor();
}

export async function addBundleFiles(type, bundleItem) {
  // Save scroll position of currently selected item before switching
  if (state.selectedItem) {
    saveScrollPosition(state.selectedItem, state.leftOrgId, state.rightOrgId);
  }
  
  // Fetch file list from LEFT org to populate sidebar entries
  const orgId = state.leftOrgId;
  if (!orgId) return;
  const descriptor = { bundleId: bundleItem.id, bundleDeveloperName: bundleItem.developerName };
  const res = await bg({ type: 'fetchSource', orgId, artifactType: type, descriptor, listOnly: true });
  if (!res.ok) { showToast(t('toast.fetchFailed'), 'warn'); return; }
  const files = res.files || [];
  if (!files.length) return;
  
  // Add bundle files to saved items
  for (const f of files) {
    const item = { type, key: `${bundleItem.developerName}/${f.fileName}`, descriptor, fileName: f.fileName };
    
    // Check if item already exists
    const existingIndex = state.savedItems.findIndex(saved => 
      saved.type === item.type && saved.key === item.key
    );
    
    if (existingIndex === -1) {
      state.savedItems.push(item);
    }
  }

  // Reposition the entire bundle to the bottom to ensure grouping at end
  try {
    const prefix = `${bundleItem.developerName}/`;
    const current = state.savedItems;
    const bundleSet = new Map();
    for (const it of current) {
      if (it.type === type && typeof it.key === 'string' && it.key.startsWith(prefix)) {
        const name = it.key.slice(prefix.length);
        bundleSet.set(name, it);
      }
    }

    if (bundleSet.size > 0) {
      // Remove all bundle items from current list
      const remaining = current.filter(it => !(it.type === type && typeof it.key === 'string' && it.key.startsWith(prefix)));

      // Order bundle items by file type priority (js > html > css > xml > others)
      const getFileTypeOrder = (fileName) => {
        if (fileName.endsWith('.js')) return 1;
        if (fileName.endsWith('.html')) return 2;
        if (fileName.endsWith('.css')) return 3;
        if (fileName.endsWith('.xml') || fileName.endsWith('.js-meta.xml') || fileName.endsWith('.html-meta.xml') || fileName.endsWith('.css-meta.xml')) return 4;
        return 5;
      };

      // Sort files by type priority, then by name for same type
      const sortedFiles = [...files].sort((a, b) => {
        const aOrder = getFileTypeOrder(a.fileName);
        const bOrder = getFileTypeOrder(b.fileName);
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.fileName.localeCompare(b.fileName);
      });

      const ordered = [];
      for (const f of sortedFiles) {
        const it = bundleSet.get(f.fileName);
        if (it) {
          ordered.push(it);
          bundleSet.delete(f.fileName);
        }
      }
      // Append any bundle items not present in latest files list (edge cases)
      for (const [, it] of bundleSet) ordered.push(it);

      state.savedItems = [...remaining, ...ordered];
    }
  } catch {}

  saveItemsToStorage();
  renderSavedItems();

  // Prefer opening a sensible default file from the bundle (js > html > css > first)
  try {
    const names = files.map(f => f.fileName);
    const preferred = 
      names.find(n => n.endsWith('.js')) ||
      names.find(n => n.endsWith('.html')) ||
      names.find(n => n.endsWith('.css')) ||
      names[0];
    if (preferred) {
      const selectedKey = `${bundleItem.developerName}/${preferred}`;
      const saved = state.savedItems.find(s => s.type === type && s.key === selectedKey);
      const selected = saved || { type, key: selectedKey, descriptor, fileName: preferred };
      state.selectedItem = selected;
      syncListActiveHighlight();
      updateDocumentTitle();
      renderEditor();
    }
  } catch {}
}
