import { state } from '../core/state.js';
import { bg } from '../core/bridge.js';
import { showToast } from '../ui/toast.js';
import { getDisplayFileName } from '../lib/itemLabels.js';
import { descriptorForFetchSource } from '../lib/sourceDescriptor.js';
import { t } from '../../shared/i18n.js';

export async function openFileInNewTab(item) {
  try {
    const baseUrl = chrome.runtime.getURL('code/code.html');
    
    // Encode item information as URL parameters
    const params = new URLSearchParams();
    params.set('type', item.type);
    params.set('key', item.key);
    if (item.fileName) {
      params.set('fileName', item.fileName);
    }
    // Include descriptor if it exists (needed for LWC bundles)
    if (item.descriptor) {
      params.set('descriptor', JSON.stringify(item.descriptor));
    }
    // Include org ID if one is selected
    if (state.leftOrgId) {
      params.set('orgId', state.leftOrgId);
    }
    
    const url = `${baseUrl}?${params.toString()}`;
    await chrome.tabs.create({ url });
  } catch (err) {
    showToast(t('toast.fileNotInTab'), 'error');
  }
}

export async function copyFileName(item) {
  const fileName = getDisplayFileName(item);
  try {
    await navigator.clipboard.writeText(fileName);
    showToast(t('toast.copied', { name: fileName }), 'info');
  } catch (err) {
    const textArea = document.createElement('textarea');
    textArea.value = fileName;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showToast(t('toast.copied', { name: fileName }), 'info');
    } catch (e) {
      showToast(t('toast.copyFailed'), 'error');
    }
    document.body.removeChild(textArea);
  }
}

export async function copyAllFileNames() {
  if (!state.savedItems || state.savedItems.length === 0) {
    showToast(t('toast.noFilesToCopy'), 'warn');
    return;
  }

  try {
    // Get all file names and join with newlines
    const fileNames = state.savedItems.map(item => getDisplayFileName(item));
    const fileNamesText = fileNames.join('\n');
    
    try {
      await navigator.clipboard.writeText(fileNamesText);
      showToast(t('toast.copiedFiles', { count: fileNames.length }), 'info');
    } catch (err) {
      const textArea = document.createElement('textarea');
      textArea.value = fileNamesText;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        showToast(t('toast.copiedFiles', { count: fileNames.length }), 'info');
      } catch (e) {
        showToast(t('toast.copyFilesFailed'), 'error');
      }
      document.body.removeChild(textArea);
    }
  } catch (err) {
    showToast(t('toast.copyFilesFailed'), 'error');
  }
}

export async function downloadFile(item) {
  if (item.type === 'PackageXml' && item.descriptor?.source === 'localFile') {
    const entry = state.packageXmlLocalContent[item.key];
    if (!entry || entry.content == null) {
      showToast(t('toast.noLocalContent'), 'warn');
      return;
    }
    try {
      const name = entry.fileName || 'package.xml';
      const blob = new Blob([entry.content], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(t('toast.downloaded', { name }), 'info');
    } catch {
      showToast(t('toast.downloadError'), 'error');
    }
    return;
  }

  if (item.type === 'PackageXml' && item.descriptor?.source === 'retrieveZipFile') {
    const cache = state.packageRetrieveZipCache[item.descriptor.parentKey];
    const path = item.descriptor.relativePath;
    if (!cache || !path) {
      showToast(t('toast.noCacheContent'), 'warn');
      return;
    }
    const content = cache.leftByPath[path] ?? '';
    const base = path.includes('/') ? path.split('/').pop() : path;
    try {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = base || 'file.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(t('toast.downloaded', { name: base }), 'info');
    } catch {
      showToast(t('toast.downloadError'), 'error');
    }
    return;
  }

  const orgId = state.leftOrgId;
  if (!orgId) {
    showToast(t('toast.selectOrgFirst'), 'warn');
    return;
  }

  try {
    // Special handling for PermissionSet: retrieve real Metadata ZIP instead of using Tooling
    if (item.type === 'PermissionSet') {
      // Get org name from dropdown for file prefix
      const leftOrgSelect = document.getElementById('leftOrg');
      const selectedOption = leftOrgSelect.options[leftOrgSelect.selectedIndex];
      const orgName = selectedOption ? selectedOption.textContent : 'Org';

      // Show initial progress message
      showToast(t('toast.launchingRetrieve'), 'info');

       // After unos segundos, si sigue en curso, mostramos otro mensaje informativo
       let progressToastTimer = setTimeout(() => {
         showToast(t('toast.retrieveInProgress'), 'info');
       }, 7000);

      const res = await bg({
        type: 'metadata:retrievePermissionSet',
        orgId,
        permSetName: item.key
      });

      // Ya tenemos respuesta, cancelamos el toast de progreso diferido
      clearTimeout(progressToastTimer);

      if (!res.ok || !res.zipBase64) {
        const msg =
          (res && (res.error || res.reason)) ||
          t('toast.permSetRetrieveFailed');
        showToast(msg, 'error');
        return;
      }

      const fileName = res.fileName || `${item.key}_permissionset.zip`;
      const prefixedFileName = `${orgName}_${fileName}`;

      // res.zipBase64 contiene el ZIP en base64. Lo convertimos a binario.
      const binaryString = atob(res.zipBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = prefixedFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast(t('toast.downloadedFile', { name: prefixedFileName }), 'info');
      return;
    }

    const leftOrgSelect = document.getElementById('leftOrg');
    const selectedOption = leftOrgSelect.options[leftOrgSelect.selectedIndex];
    const orgName = selectedOption ? selectedOption.textContent : 'Org';
    
    // Fetch file content
    const res = await bg({
      type: 'fetchSource',
      orgId,
      artifactType: item.type,
      descriptor: descriptorForFetchSource(item)
    });
    if (!res.ok) {
      showToast(t('toast.fetchFailed'), 'warn');
      return;
    }
    
    const files = res.files || [];
    if (!files.length) {
      showToast(t('toast.noFileContent'), 'warn');
      return;
    }
    
    // Find the specific file if fileName is specified (for LWC bundles)
    let file = files[0];
    if (item.fileName) {
      const match = files.find(f => f.fileName === item.fileName);
      if (match) file = match;
    }
    
    // Get the display file name
    const displayFileName = getDisplayFileName(item);
    
    // Create prefixed filename with org name
    const prefixedFileName = `${orgName}_${displayFileName}`;
    
    // Create blob and download
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = prefixedFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast(t('toast.downloadedFile', { name: prefixedFileName }), 'info');
  } catch (err) {
    showToast(t('toast.downloadFailed'), 'error');
  }
}

export async function downloadAllFiles() {
  const orgId = state.leftOrgId;
  if (!orgId) {
    showToast(t('toast.selectOrgFirst'), 'warn');
    return;
  }

  if (!state.savedItems || state.savedItems.length === 0) {
    showToast(t('toast.downloadNoFiles'), 'warn');
    return;
  }

  try {
    // Get org name from dropdown
    const leftOrgSelect = document.getElementById('leftOrg');
    const selectedOption = leftOrgSelect.options[leftOrgSelect.selectedIndex];
    const orgName = selectedOption ? selectedOption.textContent : 'Org';
    
    showToast(t('toast.downloadingFiles', { count: state.savedItems.length }), 'info');
    
    let successCount = 0;
    let failCount = 0;
    
    // Download each file with a small delay to avoid overwhelming the browser
    for (const item of state.savedItems) {
      try {
        if (item.type === 'PackageXml' && item.descriptor?.source === 'localFile') {
          const entry = state.packageXmlLocalContent[item.key];
          if (!entry || entry.content == null) {
            failCount++;
            continue;
          }
          const name = entry.fileName || 'package.xml';
          const blob = new Blob([entry.content], { type: 'application/xml' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${orgName}_${name}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          successCount++;
          continue;
        }
        if (item.type === 'PackageXml' && item.descriptor?.source === 'retrieveZipFile') {
          const cache = state.packageRetrieveZipCache[item.descriptor.parentKey];
          const path = item.descriptor.relativePath;
          if (!cache || !path) {
            failCount++;
            continue;
          }
          const content = cache.leftByPath[path] ?? '';
          const base = path.includes('/') ? path.split('/').pop() : path;
          const prefixedFileName = `${orgName}_${base || 'file.txt'}`;
          const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = prefixedFileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          await new Promise((resolve) => setTimeout(resolve, 100));
          URL.revokeObjectURL(url);
          successCount++;
          continue;
        }
        // Fetch file content
        const res = await bg({
          type: 'fetchSource',
          orgId,
          artifactType: item.type,
          descriptor: descriptorForFetchSource(item)
        });
        if (!res.ok) {
          failCount++;
          continue;
        }
        
        const files = res.files || [];
        if (!files.length) {
          failCount++;
          continue;
        }
        
        // Find the specific file if fileName is specified (for LWC bundles)
        let file = files[0];
        if (item.fileName) {
          const match = files.find(f => f.fileName === item.fileName);
          if (match) file = match;
        }
        
        // Get the display file name
        const displayFileName = getDisplayFileName(item);
        
        // Create prefixed filename with org name
        const prefixedFileName = `${orgName}_${displayFileName}`;
        
        // Create blob and download
        const blob = new Blob([file.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = prefixedFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // Small delay to allow download to start before revoking URL
        await new Promise(resolve => setTimeout(resolve, 100));
        URL.revokeObjectURL(url);
        
        successCount++;
      } catch (err) {
        failCount++;
      }
    }
    
    if (successCount > 0) {
      const failText = failCount > 0 ? t('toast.failedSuffix', { count: failCount }) : '';
      showToast(t('toast.downloadedFiles', { success: successCount, failText }), 'info');
    } else {
      showToast(t('toast.downloadAllFailed'), 'error');
    }
  } catch (err) {
    showToast(t('toast.downloadFailed'), 'error');
  }
}
