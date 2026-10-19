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

function inferApexSourceIdentity(content, viewerOpts = {}) {
  const explicitName = String(viewerOpts.resourceName || '').trim();
  const explicitType = String(viewerOpts.resourceType || '').trim();
  const declaration = String(content || '').match(/\b(class|trigger)\s+([A-Za-z_][A-Za-z0-9_]*)/i);
  const fileName = String(viewerOpts.downloadFileName || '');
  const resourceType = explicitType === 'ApexTrigger' || /\.trigger$/i.test(fileName) || declaration?.[1]?.toLowerCase() === 'trigger'
    ? 'ApexTrigger'
    : 'ApexClass';
  return {
    resourceId: String(viewerOpts.resourceId || '').trim(),
    resourceName: explicitName || declaration?.[2] || '',
    resourceType
  };
}

export function buildApexSourceViewerPath(transportKey, transportId, viewerOpts = {}, sourceIdentity = {}) {
  const params = new URLSearchParams();
  if (transportKey && transportId) params.set(String(transportKey), String(transportId));
  const orgId = String(viewerOpts.orgId || '').trim();
  const sourceId = String(sourceIdentity.resourceId || viewerOpts.resourceId || '').trim();
  const sourceName = String(sourceIdentity.resourceName || viewerOpts.resourceName || '').trim();
  const sourceType = String(sourceIdentity.resourceType || viewerOpts.resourceType || 'ApexClass').trim();
  if (orgId && (sourceId || sourceName)) {
    params.set('orgId', orgId);
    if (sourceId) params.set('sourceId', sourceId);
    else params.set('sourceName', sourceName);
    params.set('sourceType', sourceType === 'ApexTrigger' ? 'ApexTrigger' : 'ApexClass');
  }
  const initialLine = Number(viewerOpts.initialLine);
  if (Number.isFinite(initialLine) && initialLine > 0) params.set('line', String(Math.floor(initialLine)));
  const initialColumn = Number(viewerOpts.initialColumn);
  if (Number.isFinite(initialColumn) && initialColumn > 1) params.set('column', String(Math.floor(initialColumn)));
  const query = params.toString();
  return `${VIEWER_PAGE}${query ? `?${query}` : ''}`;
}

/**
 * @param {string} title
 * @param {string} content
 * @param {{
 *   downloadFileName?: string,
 *   initialLine?: number,
 *   orgId?: string,
 *   orgLabel?: string,
 *   instanceUrl?: string,
 *   resourceId?: string,
 *   resourceName?: string,
 *   resourceType?: 'ApexClass'|'ApexTrigger',
 *   initialColumn?: number
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
  const sourceIdentity = inferApexSourceIdentity(content, viewerOpts);
  const stagePayload = {
    title,
    content,
    ...(downloadFileName ? { downloadFileName } : {}),
    ...(initialLine != null ? { initialLine } : {}),
    ...(orgId ? { orgId } : {}),
    ...(orgLabel ? { orgLabel } : {}),
    ...(instanceUrl ? { instanceUrl } : {}),
    ...(sourceIdentity.resourceId ? { resourceId: sourceIdentity.resourceId } : {}),
    ...(sourceIdentity.resourceName ? { resourceName: sourceIdentity.resourceName } : {}),
    resourceType: sourceIdentity.resourceType
  };

  const staged = await bg({ type: 'apexViewer:stage', ...stagePayload });
  if (staged.ok && staged.id) {
    window.open(
      chrome.runtime.getURL(buildApexSourceViewerPath('staged', staged.id, { ...viewerOpts, initialLine }, sourceIdentity)),
      '_blank'
    );
    return true;
  }

  const storageKey = randomStagingId('sfoc_asv_');
  const storagePayload = { title, content, ...stagePayload };
  try {
    await chrome.storage.local.set({ [storageKey]: storagePayload });
    window.open(
      chrome.runtime.getURL(buildApexSourceViewerPath('k', storageKey, { ...viewerOpts, initialLine }, sourceIdentity)),
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
      chrome.runtime.getURL(buildApexSourceViewerPath('idb', idbId, { ...viewerOpts, initialLine }, sourceIdentity)),
      '_blank'
    );
    return true;
  } catch {
    return false;
  }
}
