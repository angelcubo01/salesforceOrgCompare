/**
 * Audit trail local de acciones sensibles (chrome.storage.local).
 */

export const AUDIT_TRAIL_STORAGE_KEY = 'sfocLocalAuditTrail';
export const AUDIT_TRAIL_MAX = 500;

/**
 * @typedef {{ id: string, at: string, action: string, orgId?: string, detail?: string }} AuditEntry
 */

/**
 * @param {AuditEntry[]} entries
 * @param {Omit<AuditEntry, 'id' | 'at'>} entry
 */
export function appendAuditEntry(entries, entry) {
  const list = Array.isArray(entries) ? [...entries] : [];
  const row = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    ...entry
  };
  list.unshift(row);
  if (list.length > AUDIT_TRAIL_MAX) list.length = AUDIT_TRAIL_MAX;
  return list;
}
