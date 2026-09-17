const CLOCK_WARNING_THRESHOLD_MS = 60 * 1000;

import { getDateDisplayFormat } from './extensionSettings.js';
import {
  formatLocalDateTimeParts,
  parseLocalDateTimeParts
} from './dateDisplay.js';

export { CLOCK_WARNING_THRESHOLD_MS };

export function calculateSalesforceClockOffset(serverNowMs, requestStartedMs, responseReceivedMs) {
  const server = Number(serverNowMs);
  const started = Number(requestStartedMs);
  const received = Number(responseReceivedMs);
  if (!Number.isFinite(server) || !Number.isFinite(started) || !Number.isFinite(received)) return null;
  return Math.round(server - ((started + received) / 2));
}

export function serverNowFromOffset(offsetMs, localNowMs = Date.now()) {
  const offset = Number(offsetMs);
  const now = Number(localNowMs);
  return Number.isFinite(offset) && Number.isFinite(now) ? now + offset : now;
}

export function hasMeaningfulSalesforceClockOffset(offsetMs) {
  return Math.abs(Number(offsetMs) || 0) > CLOCK_WARNING_THRESHOLD_MS;
}

export function formatSalesforceClockOffset(offsetMs, locale = 'es') {
  const seconds = Math.round(Math.abs(Number(offsetMs) || 0) / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const amount = minutes
    ? (locale === 'en' ? minutes + ' min' : minutes + ' min')
    : seconds + ' s';
  const suffix = minutes && remainingSeconds ? ' ' + remainingSeconds + ' s' : '';
  const direction = Number(offsetMs) >= 0
    ? (locale === 'en' ? 'ahead' : 'adelantado')
    : (locale === 'en' ? 'behind' : 'retrasado');
  return amount + suffix + ' ' + direction;
}

export function toUtcIsoFromLocalDateTime(value, dateDisplayFormat = getDateDisplayFormat()) {
  const parts = parseLocalDateTimeParts(value, dateDisplayFormat);
  if (!parts) return '';
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second).toISOString();
}

export function toLocalDateTimeValue(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return String(date.getFullYear()) + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

/** Formatea una fecha para la interfaz siguiendo el ajuste global, siempre en hora local. */
export function formatDateTimeForDisplay(value, { includeSeconds = true } = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatLocalDateTimeParts({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds()
  }, getDateDisplayFormat(), { includeSeconds });
}

export function isValidUtcRange(sinceIso, untilIso) {
  const since = Date.parse(String(sinceIso || ''));
  const until = Date.parse(String(untilIso || ''));
  return Number.isFinite(since) && Number.isFinite(until) && since <= until;
}
