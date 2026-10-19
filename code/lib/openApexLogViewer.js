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

export function buildApexLogViewerPath(transportKey, transportId, viewerOpts = {}) {
  const params = new URLSearchParams();
  if (transportKey && transportId) params.set(String(transportKey), String(transportId));
  if (viewerOpts.orgId && viewerOpts.logId) {
    params.set('orgId', String(viewerOpts.orgId));
    params.set('logId', String(viewerOpts.logId));
  }
  const initialLine = Number(viewerOpts.initialLine);
  if (Number.isFinite(initialLine) && initialLine > 0) params.set('line', String(Math.floor(initialLine)));
  const query = params.toString();
  return `code/apex-log-viewer.html${query ? `?${query}` : ''}`;
}

/**
 * @param {string} title
 * @param {string} content
 * @param {{
 *   downloadFileName?: string,
 *   initialLine?: number,
 *   defaultTab?: string,
 *   orgId?: string,
 *   orgLabel?: string,
 *   instanceUrl?: string,
 *   logId?: string
 * }} [viewerOpts]
 */
export async function openApexLogViewerWithPayload(title, content, viewerOpts = {}) {
  const downloadFileName =
    viewerOpts.downloadFileName != null && String(viewerOpts.downloadFileName).trim()
      ? sanitizeApexViewerDownloadFileName(viewerOpts.downloadFileName)
      : undefined;
  const initialLine =
    viewerOpts.initialLine != null && Number.isFinite(Number(viewerOpts.initialLine))
      ? Math.max(1, Math.floor(Number(viewerOpts.initialLine)))
      : undefined;
  const stagePayload = {
    title,
    content,
    ...(downloadFileName ? { downloadFileName } : {}),
    ...(initialLine != null ? { initialLine } : {}),
    ...(viewerOpts.defaultTab ? { defaultTab: viewerOpts.defaultTab } : {}),
    ...(viewerOpts.orgId ? { orgId: viewerOpts.orgId } : {}),
    ...(viewerOpts.orgLabel ? { orgLabel: viewerOpts.orgLabel } : {}),
    ...(viewerOpts.instanceUrl ? { instanceUrl: viewerOpts.instanceUrl } : {}),
    ...(viewerOpts.logId ? { logId: viewerOpts.logId } : {})
  };

  const staged = await bg({ type: 'apexViewer:stage', ...stagePayload });
  if (staged.ok && staged.id) {
    window.open(
      chrome.runtime.getURL(buildApexLogViewerPath('staged', staged.id, viewerOpts)),
      '_blank'
    );
    return true;
  }

  const storageKey = randomStagingId('sfoc_av_');
  const storagePayload = { title, content, ...stagePayload };
  try {
    await chrome.storage.local.set({ [storageKey]: storagePayload });
    window.open(
      chrome.runtime.getURL(buildApexLogViewerPath('k', storageKey, viewerOpts)),
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
      chrome.runtime.getURL(buildApexLogViewerPath('idb', idbId, viewerOpts)),
      '_blank'
    );
    return true;
  } catch {
    return false;
  }
}
