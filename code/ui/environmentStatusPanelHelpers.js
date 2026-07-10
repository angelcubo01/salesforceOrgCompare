/**
 * Helpers puros para el panel Environment Status (testeables sin DOM).
 */

/**
 * @param {string} orgId
 * @param {Set<string>} expanded
 */
export function toggleExpandedOrg(orgId, expanded) {
  const next = new Set(expanded);
  if (next.has(orgId)) next.delete(orgId);
  else next.add(orgId);
  return next;
}

/**
 * @param {string} auth
 */
export function canExpandSessionDetail(auth) {
  return auth === 'active';
}

/**
 * @param {string} value
 */
export function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {{ label: string, value: string }[]} rows
 */
export function renderSessionDetailGridHtml(rows) {
  if (!rows.length) return '';
  const cells = rows
    .map(
      (r) =>
        `<div class="env-status-detail-item"><dt>${escapeHtml(r.label)}</dt><dd>${escapeHtml(r.value)}</dd></div>`
    )
    .join('');
  return `<dl class="env-status-detail-grid">${cells}</dl>`;
}
