/**
 * Estado / ventana temporal de TraceFlag USER_DEBUG (puro, sin red).
 * Usado por la app SFOC y por el content script sfInject (bundle ligero).
 */

/** Ventana máxima de una traza USER_DEBUG (24 h). */
export const USER_DEBUG_TRACE_MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Trazas caducadas hace menos de este tiempo siguen visibles y se pueden reactivar. */
export const USER_DEBUG_TRACE_RECENTLY_INACTIVE_MS = 30 * 60 * 1000;

/**
 * @param {unknown} value
 * @returns {number}
 */
export function parseSalesforceDateTimeMs(value) {
  if (value == null || value === '') return NaN;
  if (value instanceof Date) return value.getTime();
  const raw = String(value).trim();
  if (!raw) return NaN;
  const normalized = raw.replace(/(\.\d{3})\+(\d{2})(\d{2})$/, '$1+$2:$3');
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : NaN;
}

/**
 * @param {{ startIso?: string, expirationIso?: string, StartDate?: string, ExpirationDate?: string }} row
 */
export function resolveUserDebugTraceDates(row) {
  const startMs = parseSalesforceDateTimeMs(row?.startIso ?? row?.StartDate);
  const expMs = parseSalesforceDateTimeMs(row?.expirationIso ?? row?.ExpirationDate);
  return {
    startMs,
    expMs,
    startIso: Number.isFinite(startMs) ? new Date(startMs).toISOString() : '',
    expirationIso: Number.isFinite(expMs) ? new Date(expMs).toISOString() : ''
  };
}

/**
 * @param {{ startIso?: string, expirationIso?: string, StartDate?: string, ExpirationDate?: string }} row
 * @param {number} [nowMs]
 */
export function isUserDebugTraceActive(row, nowMs = Date.now()) {
  const { startMs, expMs } = resolveUserDebugTraceDates(row);
  if (!Number.isFinite(startMs) || !Number.isFinite(expMs)) return false;
  return startMs <= nowMs && nowMs < expMs;
}

/**
 * Traza caducada recientemente (últimos 30 min), ya iniciada.
 * @param {{ startIso?: string, expirationIso?: string, StartDate?: string, ExpirationDate?: string }} row
 * @param {number} [nowMs]
 */
export function isUserDebugTraceRecentlyInactive(row, nowMs = Date.now()) {
  if (isUserDebugTraceActive(row, nowMs)) return false;
  const { startMs, expMs } = resolveUserDebugTraceDates(row);
  if (!Number.isFinite(startMs) || !Number.isFinite(expMs)) return false;
  if (startMs > nowMs) return false;
  if (expMs > nowMs) return false;
  return nowMs - expMs <= USER_DEBUG_TRACE_RECENTLY_INACTIVE_MS;
}

/**
 * @param {{ startIso?: string, expirationIso?: string, StartDate?: string, ExpirationDate?: string }} row
 * @param {number} [nowMs]
 */
export function isUserDebugTraceVisibleByDefault(row, nowMs = Date.now()) {
  return isUserDebugTraceActive(row, nowMs) || isUserDebugTraceRecentlyInactive(row, nowMs);
}

/**
 * Calcula nueva caducidad sumando `addMs` a la actual (activa) o desde ahora (reactivación).
 * @returns {{ expirationIso: string, cappedAtMax: boolean }}
 */
export function computeTraceExtension({ startIso, expirationIso, addMs, nowMs = Date.now() }) {
  const startMs = parseSalesforceDateTimeMs(startIso);
  const expMs = parseSalesforceDateTimeMs(expirationIso);
  const add = Math.max(0, Number(addMs) || 0);
  if (!Number.isFinite(startMs) || !Number.isFinite(expMs)) {
    throw new Error('Invalid date range');
  }
  const maxExpMs = startMs + USER_DEBUG_TRACE_MAX_WINDOW_MS;
  const active = startMs <= nowMs && nowMs < expMs;
  const requestedMs = active ? expMs + add : nowMs + add;
  const nextMs = Math.min(requestedMs, maxExpMs);
  if (active && nextMs <= expMs) {
    throw new Error('Trace window cannot exceed 24 hours');
  }
  if (!active && nextMs <= nowMs) {
    throw new Error('Cannot reactivate trace');
  }
  return {
    expirationIso: new Date(nextMs).toISOString(),
    cappedAtMax: requestedMs > maxExpMs
  };
}

/**
 * @param {{ startIso?: string, expirationIso?: string, StartDate?: string, ExpirationDate?: string }} row
 * @param {number} [nowMs]
 */
export function buildTraceExtensionPlan(row, addMs = 15 * 60 * 1000, nowMs = Date.now()) {
  const { startIso, expirationIso } = resolveUserDebugTraceDates(row);
  if (!startIso || !expirationIso) {
    throw new Error('Invalid trace dates');
  }
  const active = isUserDebugTraceActive(row, nowMs);
  const recentlyInactive = isUserDebugTraceRecentlyInactive(row, nowMs);
  if (!active && !recentlyInactive) {
    throw new Error('Trace is not active');
  }
  if (active) {
    const result = computeTraceExtension({ startIso, expirationIso, addMs, nowMs });
    return { ...result, startIso: null, reactivated: false };
  }
  const nowIso = new Date(nowMs).toISOString();
  const result = computeTraceExtension({
    startIso: nowIso,
    expirationIso: nowIso,
    addMs,
    nowMs
  });
  return { ...result, startIso: nowIso, reactivated: true };
}

/**
 * @param {{ startIso?: string, expirationIso?: string, StartDate?: string, ExpirationDate?: string }} row
 * @param {number} [nowMs]
 */
export function canExtendOrReactivateUserDebugTrace(row, nowMs = Date.now()) {
  if (!isUserDebugTraceActive(row, nowMs) && !isUserDebugTraceRecentlyInactive(row, nowMs)) {
    return false;
  }
  const { startMs, expMs } = resolveUserDebugTraceDates(row);
  if (!Number.isFinite(startMs) || !Number.isFinite(expMs)) return false;
  if (isUserDebugTraceActive(row, nowMs) && expMs >= startMs + USER_DEBUG_TRACE_MAX_WINDOW_MS) {
    return false;
  }
  try {
    buildTraceExtensionPlan(row, 15 * 60 * 1000, nowMs);
    return true;
  } catch {
    return false;
  }
}

/**
 * Valida ventana temporal de una traza USER_DEBUG.
 * @returns {'INVALID_RANGE'|'MAX_WINDOW'|null}
 */
export function validateUserDebugTraceDates({ startIso, expirationIso }) {
  if (!startIso || !expirationIso) return 'INVALID_RANGE';
  const startMs = new Date(startIso).getTime();
  const expMs = new Date(expirationIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(expMs) || expMs <= startMs) {
    return 'INVALID_RANGE';
  }
  if (expMs - startMs > USER_DEBUG_TRACE_MAX_WINDOW_MS) {
    return 'MAX_WINDOW';
  }
  return null;
}
