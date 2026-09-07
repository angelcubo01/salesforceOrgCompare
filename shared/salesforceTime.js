const CLOCK_WARNING_THRESHOLD_MS = 60 * 1000;

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

export function toUtcIsoFromLocalDateTime(value) {
  let raw = String(value || '').trim().replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/, '$1T$2');
  const display = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})$/);
  if (display) {
    const [, first, second, year, time] = display;
    raw = `${year}-${second}-${first}T${time}`;
  }
  if (!raw) return '';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function toLocalDateTimeValue(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return String(date.getFullYear()) + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

export function isValidUtcRange(sinceIso, untilIso) {
  const since = Date.parse(String(sinceIso || ''));
  const until = Date.parse(String(untilIso || ''));
  return Number.isFinite(since) && Number.isFinite(until) && since <= until;
}
