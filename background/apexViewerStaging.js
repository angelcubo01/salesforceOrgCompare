/** Contenido temporal para visores (log/código) sin límite de cuota de chrome.storage.local. */
const STAGING = new Map();
const TTL_MS = 15 * 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [k, v] of STAGING) {
    if (now - v.at > TTL_MS) STAGING.delete(k);
  }
}

export function stageApexViewerPayload(title, content) {
  prune();
  const id = `v_${Date.now()}_${Math.random().toString(36).slice(2, 16)}`;
  STAGING.set(id, {
    title: title != null ? String(title) : '',
    content: content != null ? String(content) : '',
    at: Date.now()
  });
  return id;
}

export function takeApexViewerPayload(id) {
  prune();
  const key = String(id || '');
  const v = STAGING.get(key);
  if (v) STAGING.delete(key);
  return v ? { title: v.title, content: v.content } : null;
}
