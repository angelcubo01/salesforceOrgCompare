/** Formatos visuales permitidos para fechas introducidas por la persona usuaria. */
export const DATE_DISPLAY_FORMATS = Object.freeze(['dmy', 'mdy', 'ymd']);

export const DEFAULT_DATE_DISPLAY_FORMAT = 'dmy';

/** @param {unknown} value */
export function normalizeDateDisplayFormat(value) {
  const format = String(value || '').trim().toLowerCase();
  return DATE_DISPLAY_FORMATS.includes(format) ? format : DEFAULT_DATE_DISPLAY_FORMAT;
}

/** @param {unknown} format */
export function dateTimePlaceholder(format) {
  switch (normalizeDateDisplayFormat(format)) {
    case 'mdy': return 'MM/DD/YYYY HH:mm';
    case 'ymd': return 'YYYY-MM-DD HH:mm';
    default: return 'DD/MM/YYYY HH:mm';
  }
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function validLocalParts(year, month, day, hour, minute, second = 0) {
  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
    && date.getHours() === hour
    && date.getMinutes() === minute
    && date.getSeconds() === second;
}

/**
 * Lee una fecha local sin delegar el orden de día/mes al navegador.
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, second: number } | null}
 */
export function parseLocalDateTimeParts(value, format = DEFAULT_DATE_DISPLAY_FORMAT) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/);
  let year;
  let month;
  let day;
  let hour;
  let minute;
  let second;
  if (iso) {
    [, year, month, day, hour, minute, second] = iso;
  } else {
    const display = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!display) return null;
    const [, first, secondPart, displayYear, displayHour, displayMinute, displaySecond] = display;
    const normalizedFormat = normalizeDateDisplayFormat(format);
    if (normalizedFormat === 'ymd') return null;
    year = displayYear;
    month = normalizedFormat === 'mdy' ? first : secondPart;
    day = normalizedFormat === 'mdy' ? secondPart : first;
    hour = displayHour;
    minute = displayMinute;
    second = displaySecond;
  }
  const parts = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second || 0)
  };
  return validLocalParts(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second)
    ? parts
    : null;
}

/** @param {{ year: number, month: number, day: number, hour: number, minute: number, second?: number }} parts */
export function localDateTimeValueFromParts(parts) {
  if (!parts) return '';
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** @param {{ year: number, month: number, day: number, hour: number, minute: number, second?: number }} parts */
export function formatLocalDateTimeParts(parts, format = DEFAULT_DATE_DISPLAY_FORMAT, { includeSeconds = false } = {}) {
  if (!parts) return '';
  const date = normalizeDateDisplayFormat(format) === 'mdy'
    ? `${pad(parts.month)}/${pad(parts.day)}/${parts.year}`
    : normalizeDateDisplayFormat(format) === 'ymd'
      ? `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
      : `${pad(parts.day)}/${pad(parts.month)}/${parts.year}`;
  const seconds = includeSeconds ? `:${pad(parts.second || 0)}` : '';
  return `${date} ${pad(parts.hour)}:${pad(parts.minute)}${seconds}`;
}
