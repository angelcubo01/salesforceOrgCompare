import { randomStagingId } from '../shared/randomId.js';

/** Contenido temporal para visores (log/código) sin límite de cuota de chrome.storage.local. */
const STAGING = new Map();
const TTL_MS = 15 * 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [k, v] of STAGING) {
    if (now - v.at > TTL_MS) STAGING.delete(k);
  }
}

/**
 * @param {string} title
 * @param {string} content
 * @param {{
 *   initialLine?: number,
 *   downloadFileName?: string,
 *   defaultTab?: string,
 *   orgId?: string,
 *   instanceUrl?: string,
 *   logId?: string
 * }} [options]
 */
export function stageApexViewerPayload(title, content, options = {}) {
  prune();
  const id = randomStagingId('v_');
  const il = options.initialLine;
  const initialLine =
    il != null && Number.isFinite(Number(il)) ? Math.max(1, Math.floor(Number(il))) : undefined;
  const df =
    options.downloadFileName != null && String(options.downloadFileName).trim()
      ? String(options.downloadFileName).trim()
      : undefined;
  STAGING.set(id, {
    title: title != null ? String(title) : '',
    content: content != null ? String(content) : '',
    ...(initialLine != null ? { initialLine } : {}),
    ...(df ? { downloadFileName: df } : {}),
    ...(options.defaultTab ? { defaultTab: String(options.defaultTab) } : {}),
    ...(options.orgId ? { orgId: String(options.orgId) } : {}),
    ...(options.instanceUrl ? { instanceUrl: String(options.instanceUrl) } : {}),
    ...(options.logId ? { logId: String(options.logId) } : {}),
    at: Date.now()
  });
  return id;
}

export function takeApexViewerPayload(id) {
  prune();
  const key = String(id || '');
  const v = STAGING.get(key);
  if (v) STAGING.delete(key);
  return v
    ? {
        title: v.title,
        content: v.content,
        ...(v.initialLine != null ? { initialLine: v.initialLine } : {}),
        ...(v.downloadFileName ? { downloadFileName: v.downloadFileName } : {}),
        ...(v.defaultTab ? { defaultTab: v.defaultTab } : {}),
        ...(v.orgId ? { orgId: v.orgId } : {}),
        ...(v.instanceUrl ? { instanceUrl: v.instanceUrl } : {}),
        ...(v.logId ? { logId: v.logId } : {})
      }
    : null;
}
