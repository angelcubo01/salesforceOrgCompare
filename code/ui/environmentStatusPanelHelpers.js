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
  // Trust no depende de la cookie Salesforce; todas las filas pueden desplegarse.
  return !!auth || auth === '';
}

/** @param {{ auth?: string } | null | undefined} row */
export function hasActiveSalesforceSession(row) {
  return row?.auth === 'active';
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

/** @param {number | null | undefined} milliseconds */
export function formatDuration(milliseconds) {
  const value = Number(milliseconds);
  if (!Number.isFinite(value) || value < 0) return '—';
  const minutes = Math.floor(value / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** @param {string | number | Date} value @param {'es' | 'en'} locale */
export function formatTrustDate(value, locale = 'es') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(locale === 'en' ? 'en-GB' : 'es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

/**
 * Intervals normalized to a percentage scale for the Trust activity timeline.
 * @param {Array<{ startTime?: string, plannedStartTime?: string, endTime?: string, plannedEndTime?: string }>} items
 * @param {number} rangeStart
 * @param {number} rangeEnd
 * @param {number} [now]
 */
export function buildTimelineIntervals(items, rangeStart, rangeEnd, now = Date.now()) {
  const total = Math.max(1, rangeEnd - rangeStart);
  return (Array.isArray(items) ? items : []).map((item) => {
    const start = new Date(item.startTime || item.plannedStartTime || '').getTime();
    const rawEnd = new Date(item.endTime || item.plannedEndTime || '').getTime();
    if (!Number.isFinite(start)) return null;
    const end = Number.isFinite(rawEnd) ? rawEnd : now;
    const left = Math.max(0, Math.min(100, ((Math.max(start, rangeStart) - rangeStart) / total) * 100));
    const right = Math.max(left, Math.min(100, ((Math.min(Math.max(end, start), rangeEnd) - rangeStart) / total) * 100));
    return { item, left, width: Math.max(1, right - left) };
  }).filter(Boolean);
}
