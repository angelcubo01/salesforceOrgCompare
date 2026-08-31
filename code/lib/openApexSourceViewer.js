import { bg } from '../core/bridge.js';
import { apexViewerIdbPut } from './apexViewerIdb.js';
import { randomStagingId } from '../../shared/randomId.js';

function sanitizeApexViewerDownloadFileName(name) {
  const s = String(name || '')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return s || 'file';
}

const VIEWER_PAGE = 'code/apex-source-viewer.html';

/**
 * @param {string} title
 * @param {string} content
 * @param {{
 *   downloadFileName?: string,
 *   initialLine?: number,
 *   orgId?: string,
 *   orgLabel?: string,
 *   instanceUrl?: string
 * }} [viewerOpts]
 */
export async function openApexSourceViewerWithPayload(title, content, viewerOpts = {}) {
  const downloadFileName =
    viewerOpts.downloadFileName != null && String(viewerOpts.downloadFileName).trim()
      ? sanitizeApexViewerDownloadFileName(viewerOpts.downloadFileName)
      : undefined;
  const initialLine =
    viewerOpts.initialLine != null && Number.isFinite(Number(viewerOpts.initialLine))
      ? Math.max(1, Math.floor(Number(viewerOpts.initialLine)))
      : undefined;
  const orgId = String(viewerOpts.orgId || '').trim();
  const orgLabel = String(viewerOpts.orgLabel || '').trim();
  const instanceUrl = String(viewerOpts.instanceUrl || '').trim();
  const stagePayload = {
    title,
    content,
    ...(downloadFileName ? { downloadFileName } : {}),
    ...(initialLine != null ? { initialLine } : {}),
    ...(orgId ? { orgId } : {}),
    ...(orgLabel ? { orgLabel } : {}),
    ...(instanceUrl ? { instanceUrl } : {})
  };
  const lineQs = initialLine != null ? `&line=${encodeURIComponent(String(initialLine))}` : '';

  const staged = await bg({ type: 'apexViewer:stage', ...stagePayload });
  if (staged.ok && staged.id) {
    window.open(
      chrome.runtime.getURL(`${VIEWER_PAGE}?staged=${encodeURIComponent(staged.id)}${lineQs}`),
      '_blank'
    );
    return true;
  }

  const storageKey = randomStagingId('sfoc_asv_');
  const storagePayload = { title, content, ...stagePayload };
  try {
    await chrome.storage.local.set({ [storageKey]: storagePayload });
    window.open(
      chrome.runtime.getURL(`${VIEWER_PAGE}?k=${encodeURIComponent(storageKey)}${lineQs}`),
      '_blank'
    );
    return true;
  } catch {
    /* fallback */
  }

  try {
    const idbId = randomStagingId('idb_');
    await apexViewerIdbPut(idbId, storagePayload);
    window.open(
      chrome.runtime.getURL(`${VIEWER_PAGE}?idb=${encodeURIComponent(idbId)}${lineQs}`),
      '_blank'
    );
    return true;
  } catch {
    return false;
  }
}
