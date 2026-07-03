import { getFileExtension } from './itemLabels.js';

/** @param {string} ext */
export function treeIconKindFromExtension(ext) {
  const e = String(ext || '').toLowerCase();
  if (e === 'auradoc') return 'auradoc';
  if (['js', 'html', 'css', 'cmp', 'xml', 'cls', 'trigger', 'page', 'component'].includes(e)) return e;
  return 'file';
}

/** @param {string} type */
export function treeIconKindFromItemType(type) {
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
    case 'LWC':
      return 'js';
    case 'Aura':
      return 'cmp';
    case 'PackageXml':
      return 'xml';
    default:
      return 'file';
  }
}

/** @param {import('../core/state.js').state.savedItems[0] | null | undefined} item */
export function compareItemIconKind(item) {
  if (!item) return 'file';
  if ((item.type === 'LWC' || item.type === 'Aura') && item.fileName) {
    let filename = item.fileName;
    if (filename.includes('/')) filename = filename.split('/').pop();
    if (filename.endsWith('.js-meta.xml')) filename = 'file.js';
    else if (filename.endsWith('.html-meta.xml')) filename = 'file.html';
    else if (filename.endsWith('.css-meta.xml')) filename = 'file.css';
    return treeIconKindFromExtension(getFileExtension(filename));
  }
  return treeIconKindFromItemType(item.type);
}

/** @param {string} kind */
export function createCompareItemIcon(kind) {
  const span = document.createElement('span');
  span.className = `list-tree-icon list-tree-icon--${String(kind || 'file').toLowerCase()}`;
  span.setAttribute('aria-hidden', 'true');
  return span;
}
