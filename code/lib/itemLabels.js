export function getFileExtension(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return ext;
}

export function getItemKey(item) {
  if (!item) return '';
  return `${item.type}:${item.key}:${(item.fileName || '')}`;
}

export function getFileKey(item, leftOrgId, rightOrgId) {
  // Create a unique key for a file based on item and org IDs
  const orgKey = rightOrgId ? `${leftOrgId}|${rightOrgId}` : leftOrgId || '';
  return `${item.type}:${item.key}:${item.fileName || ''}:${orgKey}`;
}
export function getDisplayFileName(item) {
  if (!item) return 'Salesforce Org Compare';
  
  // Show only filename for LWC files
  if (item.type === 'LWC' && item.fileName) {
    let filename = item.fileName;
    
    if (filename.includes('/')) {
      filename = filename.split('/').pop();
    }
    
    // Handle meta.xml files
    if (filename.endsWith('.js-meta.xml')) {
      filename = filename.replace('.js-meta.xml', '.xml');
    } else if (filename.endsWith('.html-meta.xml')) {
      filename = filename.replace('.html-meta.xml', '.xml');
    } else if (filename.endsWith('.css-meta.xml')) {
      filename = filename.replace('.css-meta.xml', '.xml');
    } else if (filename.endsWith('.xml-meta.xml')) {
      filename = filename.replace('.xml-meta.xml', '.xml');
    }
    
    return filename;
  }
  
  // Handle Apex files
  if (item.type === 'ApexClass') {
    return `${item.key}.cls`;
  } else if (item.type === 'ApexTrigger') {
    return `${item.key}.trigger`;
  } else if (item.type === 'ApexPage') {
    return `${item.key}.page`;
  } else if (item.type === 'ApexComponent') {
    return `${item.key}.component`;
  } else if (item.type === 'PermissionSet') {
    return `${item.key}.permissionset-meta.xml`;
  } else if (item.type === 'PackageXml' && item.descriptor?.source === 'retrieveZipFile') {
    return item.descriptor?.relativePath || item.key;
  } else if (item.type === 'PackageXml') {
    return item.descriptor?.originalFileName || item.descriptor?.name || item.key;
  }

  // Default fallback
  return `${item.type}: ${item.key}`;
}
